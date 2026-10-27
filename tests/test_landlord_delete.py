"""Test màn Quản lý chủ nhà: chặn xóa chủ nhà còn dữ liệu liên quan.

Bài học đợt 11 (nút xóa nhà): xóa bừa bản ghi có FK trỏ tới sẽ gây 500
trên PostgreSQL. Với chủ nhà, quy tắc ngược với xóa nhà: KHÔNG tự xóa kèm
(nhà/hợp đồng là dữ liệu độc lập) mà chặn xóa và báo rõ lý do.
FK tham chiếu tới landlords.id: houses.landlordId, landlordContracts.landlordId,
housePayments.landlordId.

Kiểm: (1) chủ nhà còn nhà -> 400, chủ nhà còn nguyên; (2) chủ nhà còn HĐ
chủ nhà -> 400; (3) chủ nhà còn thanh toán tiền nhà -> 400; (4) chủ nhà
không còn liên quan -> 200, bản ghi biến mất; (5) kịch bản (1) với FK pragma
bật (mô phỏng PostgreSQL) -> 400 rõ ràng, không 500.
"""
from sqlalchemy import event

from conftest import make_house


def _make_landlord(client, name, phone):
    r = client.post("/api/landlords", json={"name": name, "phone": phone})
    assert r.status_code == 201, r.text
    return r.json()


def _make_landlord_contract(client, landlord_id, house_id):
    r = client.post("/api/landlord-contracts", json={
        "landlordId": landlord_id, "houseId": house_id, "rentPrice": 5000000,
        "deposit": 5000000, "startDate": "2026-08-01",
        "endDate": "2027-07-31", "payMonths": 3,
        "firstPayDate": "2026-08-15"})
    assert r.status_code == 201, r.text
    return r.json()


def test_delete_landlord_with_house_blocked(client):
    ll = _make_landlord(client, "Chủ Còn Nhà", "0900011001")
    house = make_house(client, "1 Đường Chủ Còn Nhà")
    r = client.put(f"/api/houses/{house['id']}", json={"landlordId": ll["id"]})
    assert r.status_code == 200, r.text
    r = client.delete(f"/api/landlords/{ll['id']}")
    assert r.status_code == 400, r.text
    assert "nhà" in r.json()["detail"]
    assert client.get(f"/api/landlords/{ll['id']}").status_code == 200


def test_delete_landlord_with_contract_blocked(client):
    ll = _make_landlord(client, "Chủ Còn HĐ", "0900011002")
    house = make_house(client, "2 Đường Chủ Còn HĐ")
    _make_landlord_contract(client, ll["id"], house["id"])
    r = client.delete(f"/api/landlords/{ll['id']}")
    assert r.status_code == 400, r.text
    assert "hợp đồng" in r.json()["detail"]
    assert client.get(f"/api/landlords/{ll['id']}").status_code == 200


def test_delete_landlord_with_house_payment_blocked(client):
    ll = _make_landlord(client, "Chủ Còn Thanh Toán", "0900011003")
    house = make_house(client, "3 Đường Chủ Còn Thanh Toán")
    r = client.post("/api/house-payments", json={
        "houseId": house["id"], "landlordId": ll["id"],
        "amount": 5000000, "date": "2026-10-15", "status": "paid"})
    assert r.status_code == 201, r.text
    r = client.delete(f"/api/landlords/{ll['id']}")
    assert r.status_code == 400, r.text
    assert client.get(f"/api/landlords/{ll['id']}").status_code == 200


def test_delete_landlord_without_relations_ok(client):
    ll = _make_landlord(client, "Chủ Tự Do", "0900011004")
    r = client.delete(f"/api/landlords/{ll['id']}")
    assert r.status_code == 200, r.text
    assert client.get(f"/api/landlords/{ll['id']}").status_code == 404


def test_delete_landlord_blocked_under_fk_enforcement_like_postgres(client):
    """Bật FK pragma (như PostgreSQL): chặn ở tầng guard phải trả 400 rõ
    ràng, không để lọt xuống lỗi FK 500."""
    from fastapi.testclient import TestClient

    from backend.database import engine
    from backend.main import app
    from conftest import login_headers

    def _fk_on(dbapi_conn, _record):
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA foreign_keys=ON")
        cur.close()

    event.listen(engine, "connect", _fk_on)
    engine.dispose()  # ép các kết nối mới nhận listener
    try:
        c = TestClient(app, raise_server_exceptions=False)
        c.headers.update(login_headers(c, "0901234567", "admin123"))
        ll = _make_landlord(c, "Chủ FK", "0900011005")
        house = make_house(c, "4 Đường Chủ FK")
        r = c.put(f"/api/houses/{house['id']}", json={"landlordId": ll["id"]})
        assert r.status_code == 200, r.text
        r = c.delete(f"/api/landlords/{ll['id']}")
        assert r.status_code == 400, r.text
        assert c.get(f"/api/landlords/{ll['id']}").status_code == 200
    finally:
        event.remove(engine, "connect", _fk_on)
        engine.dispose()
