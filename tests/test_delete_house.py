"""Test đợt 11: sửa lỗi nút Xóa nhà.

Nguyên nhân: delete_item (CRUD generic) chỉ db.delete(house) — trên PostgreSQL
(Render) commit vi phạm FK houses.id -> 500, nhà vẫn còn, người dùng chỉ thấy
toast lỗi thoáng qua. Trên SQLite test (không bật FK pragma) lỗi không lộ ra.
Sửa: before_delete cascade xóa kèm dữ liệu liên quan của nhà.

Kiểm: (1) xóa nhà có đầy đủ dữ liệu liên quan -> 200, nhà + dữ liệu liên quan
biến mất, chủ nhà/khách thuê còn nguyên; (2) cùng kịch bản nhưng bật FK pragma
(mô phỏng PostgreSQL) -> vẫn 200, không còn 500.
"""
from datetime import date as _date

from sqlalchemy import event

from conftest import login_headers, make_contract, make_house, make_room


def _build_full_house(client, address):
    """Nhà có đủ dữ liệu liên quan: phòng + HĐ thuê + hóa đơn (+ dòng) +
    mã điện/nước + tài sản + HĐ chủ nhà + cọc + chốt chỉ số + phiếu thu."""
    from backend.database import SessionLocal
    from backend import models

    house = make_house(client, address)
    hid = house["id"]
    room = make_room(client, hid, "Phòng Xóa Test")
    contract = make_contract(client, hid, room["id"], phone="0900009911")
    inv = client.post("/api/invoices", json={
        "kind": "monthly", "houseId": hid, "roomId": room["id"],
        "month": "2026-10", "roomFee": 3000000, "total": 3190000,
        "status": "unpaid"}).json()
    assert inv["id"], inv
    ll = client.post("/api/landlords", json={
        "name": "Chủ Xóa Test", "phone": "0900009922"}).json()
    lc = client.post("/api/landlord-contracts", json={
        "landlordId": ll["id"], "houseId": hid, "rentPrice": 5000000,
        "deposit": 5000000, "startDate": "2026-08-01",
        "endDate": "2027-07-31", "payMonths": 3,
        "firstPayDate": "2026-08-15"}).json()
    assert lc["id"], lc
    util = client.post("/api/house-utilities", json={
        "houseId": hid, "type": "dien", "customerCode": "EVNDEL",
        "accountHolder": "Chủ Xóa Test", "username": "u",
        "password": "p", "month": "2026-10"}).json()
    assert util["id"], util
    asset = client.post("/api/assets", json={
        "houseId": hid, "roomId": room["id"], "type": "Tivi",
        "status": "Tốt"}).json()
    assert asset["id"], asset
    dep = client.post("/api/deposits", json={
        "houseId": hid, "roomId": room["id"], "customerName": "Cọc Test",
        "phone": "0900009933", "amount": 1000000,
        "rentPrice": 3000000, "date": "2026-10-15"}).json()
    assert dep["id"], dep
    mr = client.post("/api/meter-readings", json={
        "houseId": hid, "roomId": room["id"], "type": "dien",
        "prev": 10, "current": 20, "date": "2026-10-05"}).json()
    assert mr["id"], mr
    # Dòng hóa đơn + lịch sử thanh toán + phiếu thu gắn hóa đơn (FK tới invoices.id)
    db = SessionLocal()
    try:
        db.add(models.InvoiceLine(invoiceId=inv["id"], label="Điện",
                                  unitPrice=3000, unit="so", qty=10, amount=30000))
        db.add(models.InvoicePayment(invoiceId=inv["id"], date=_date(2026, 10, 2),
                                     amount=3190000, receiver="Thu"))
        db.add(models.Receipt(houseId=hid, roomId=room["id"], invoiceId=inv["id"],
                              title="Thu test", amount=3190000))
        db.commit()
    finally:
        db.close()
    return {"house": house, "room": room, "contract": contract,
            "invoice": inv, "landlord": ll, "customer_id": contract["customerId"]}


def _assert_house_gone(client, hid):
    assert client.get(f"/api/houses/{hid}").status_code == 404
    for coll in ("rooms", "contracts", "invoices", "house-utilities", "assets",
                 "landlord-contracts", "deposits", "meter-readings"):
        items = client.get(f"/api/{coll}", params={"houseId": hid}).json()
        assert items == [], f"{coll} còn sót sau khi xóa nhà: {items}"


def test_delete_house_cascades_all_dependents(client):
    data = _build_full_house(client, "99 Đường Xóa Nhà")
    hid = data["house"]["id"]
    r = client.delete(f"/api/houses/{hid}")
    assert r.status_code == 200, r.text
    _assert_house_gone(client, hid)
    # Chủ nhà + khách thuê KHÔNG bị xóa theo nhà
    assert client.get(f"/api/landlords/{data['landlord']['id']}").status_code == 200
    assert client.get(f"/api/customers/{data['customer_id']}").status_code == 200


def test_delete_house_under_fk_enforcement_like_postgres():
    """Bật FK pragma (như PostgreSQL) rồi xóa nhà có dữ liệu liên quan:
    trước khi sửa, commit vi phạm FK -> 500; sau khi sửa phải 200."""
    from fastapi.testclient import TestClient

    from backend.database import engine
    from backend.main import app

    def _fk_on(dbapi_conn, _record):
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA foreign_keys=ON")
        cur.close()

    event.listen(engine, "connect", _fk_on)
    engine.dispose()  # ép các kết nối mới nhận listener
    try:
        c = TestClient(app, raise_server_exceptions=False)
        c.headers.update(login_headers(c, "0901234567", "admin123"))
        data = _build_full_house(c, "98 Đường Xóa Nhà FK")
        hid = data["house"]["id"]
        r = c.delete(f"/api/houses/{hid}")
        assert r.status_code == 200, r.text
        assert c.get(f"/api/houses/{hid}").status_code == 404
        rooms = c.get("/api/rooms", params={"houseId": hid}).json()
        assert rooms == [], rooms
        contracts = c.get("/api/contracts", params={"houseId": hid}).json()
        assert contracts == [], contracts
    finally:
        event.remove(engine, "connect", _fk_on)
        engine.dispose()
