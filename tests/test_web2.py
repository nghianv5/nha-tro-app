"""Test các bổ sung theo SPEC-WEB-2: batch tạo hóa đơn tháng + báo lỗi từng
phòng, mark-sent, cọc kèm customer + serviceConfig, nhà kèm tài khoản điện
nước (house_utilities), cấu hình dịch vụ của HĐ ảnh hưởng hóa đơn tháng,
hồ sơ khách đầy đủ, rentalMode/subRooms, mã tài sản tự sinh, thông báo có giờ,
ensure_columns cho các cột đợt 2."""
import os
import re
import sqlite3
import tempfile
from datetime import date

from conftest import make_contract, make_house, make_room


# ---------- F: Tạo hóa đơn tháng hàng loạt ----------
def test_monthly_batch_creates_and_reports_errors(client):
    house = make_house(client, "21 Đường Batch")
    room1 = make_room(client, house["id"], name="Phòng B1")
    room2 = make_room(client, house["id"], name="Phòng B2")
    make_contract(client, house["id"], room1["id"], phone="0900002101")
    make_contract(client, house["id"], room2["id"], phone="0900002102")
    month = "2027-03"
    # Phòng B1 có chốt số điện trong tháng; B2 thì chưa
    r = client.post("/api/meter-readings", json={
        "houseId": house["id"], "roomId": room1["id"], "type": "dien",
        "prev": 0, "current": 10, "date": "2027-03-05"})
    assert r.status_code == 201

    r = client.post("/api/invoices/monthly-batch", json={"month": month})
    assert r.status_code == 200, r.text
    results = {x["roomId"]: x for x in r.json()["results"]}
    # B1 tạo thành công, tổng đúng ví dụ thiết kế 3.190.000đ
    assert results[room1["id"]]["ok"] is True
    inv = client.get(f"/api/invoices/{results[room1['id']]['invoiceId']}").json()
    assert inv["total"] == 3190000 and inv["month"] == month
    # B2 lỗi cụ thể: chưa chốt số điện
    assert results[room2["id"]]["ok"] is False
    assert results[room2["id"]]["error"] == "Chưa chốt số điện tháng này"

    # Chạy lại batch: B1 báo đã có hóa đơn, B2 vẫn lỗi chốt số
    r = client.post("/api/invoices/monthly-batch", json={"month": month})
    results = {x["roomId"]: x for x in r.json()["results"]}
    assert results[room1["id"]]["ok"] is False
    assert results[room1["id"]]["error"] == "Đã có hóa đơn tháng"
    assert results[room2["id"]]["error"] == "Chưa chốt số điện tháng này"

    # Bổ sung chốt số cho B2 -> batch tạo được
    client.post("/api/meter-readings", json={
        "houseId": house["id"], "roomId": room2["id"], "type": "dien",
        "prev": 5, "current": 15, "date": "2027-03-06"})
    r = client.post("/api/invoices/monthly-batch", json={"month": month})
    results = {x["roomId"]: x for x in r.json()["results"]}
    assert results[room2["id"]]["ok"] is True
    assert r.json()["created"] >= 1


def test_monthly_batch_range_two_months(client):
    """Đợt 5: monthly-batch với toMonth tạo hóa đơn cho CẢ KHOẢNG 2 tháng,
    mỗi kết quả kèm trường month; tháng chưa chốt điện báo lỗi riêng."""
    house = make_house(client, "24 Đường Batch Khoảng")
    room = make_room(client, house["id"], name="Phòng R1")
    make_contract(client, house["id"], room["id"], phone="0900002401")
    # Chốt số điện cho cả 2 tháng của khoảng
    for d, prev, curr in (("2027-05-05", 0, 10), ("2027-06-05", 10, 25)):
        r = client.post("/api/meter-readings", json={
            "houseId": house["id"], "roomId": room["id"], "type": "dien",
            "prev": prev, "current": curr, "date": d})
        assert r.status_code == 201

    r = client.post("/api/invoices/monthly-batch",
                    json={"month": "2027-05", "toMonth": "2027-06"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["month"] == "2027-05" and body["toMonth"] == "2027-06"
    mine = [x for x in body["results"] if x["roomId"] == room["id"]]
    assert len(mine) == 2 and all(x["ok"] for x in mine)
    assert {x["month"] for x in mine} == {"2027-05", "2027-06"}
    invs = client.get("/api/invoices", params={"roomId": room["id"], "kind": "monthly"}).json()
    months = {i["month"] for i in invs}
    assert {"2027-05", "2027-06"} <= months

    # Chạy lại cùng khoảng: cả 2 tháng đều báo "Đã có hóa đơn tháng"
    r = client.post("/api/invoices/monthly-batch",
                    json={"month": "2027-05", "toMonth": "2027-06"})
    mine = [x for x in r.json()["results"] if x["roomId"] == room["id"]]
    assert len(mine) == 2
    assert all((not x["ok"]) and x["error"] == "Đã có hóa đơn tháng" for x in mine)

    # Khoảng ngược (toMonth < month) -> 400
    r = client.post("/api/invoices/monthly-batch",
                    json={"month": "2027-06", "toMonth": "2027-05"})
    assert r.status_code == 400


# ---------- F: Đánh dấu đã gửi ----------
def test_mark_sent_flow(client):
    house = make_house(client, "22 Đường Gửi HĐ")
    room = make_room(client, house["id"])
    inv = client.post("/api/invoices", json={
        "kind": "other", "houseId": house["id"], "roomId": room["id"],
        "reason": "Làm hỏng cửa", "createdDate": "2027-01-10",
        "lines": [{"label": "Làm hỏng cửa", "unitPrice": 500000, "unit": "phòng",
                   "qty": 1, "amount": 500000}]}).json()
    assert inv["sent"] is False and inv["sentDate"] is None

    r = client.post("/api/invoices/mark-sent", json={"invoiceIds": [inv["id"]]})
    assert r.status_code == 200 and r.json()["count"] == 1
    after = client.get(f"/api/invoices/{inv['id']}").json()
    assert after["sent"] is True
    assert after["sentDate"] == date.today().isoformat()
    # Gửi lại -> không cập nhật thêm
    r = client.post("/api/invoices/mark-sent", json={"invoiceIds": [inv["id"]]})
    assert r.json()["count"] == 0


def test_seed_sample_invoice_is_sent(client):
    """Hóa đơn mẫu 3.190.000đ có sent=true để dữ liệu mẫu có cả 2 trạng thái."""
    invoices = client.get("/api/invoices").json()
    sample = [i for i in invoices if i["code"] == "10120261001090000"]
    assert sample and sample[0]["sent"] is True and sample[0]["total"] == 3190000
    assert any(i["sent"] is False for i in invoices)


# ---------- D: Cọc kèm customer + serviceConfig ----------
def test_deposit_with_customer_and_service_config(client):
    house = make_house(client, "23 Đường Cọc Mới")
    room = make_room(client, house["id"])
    cust = client.post("/api/customers", json={
        "name": "Khách Cọc", "phone": "0900002300", "gender": "Nữ"}).json()
    cfg = {"dien": {"price": 3500, "unit": "so"},
           "nuoc": {"price": 25000, "unit": "so"},
           "xeMay": {"count": 2, "fee": 40000},
           "oTo": {"count": 0, "fee": 0}, "xeDap": {"count": 1, "fee": 10000}}
    r = client.post("/api/deposits", json={
        "houseId": house["id"], "roomId": room["id"], "customerId": cust["id"],
        "customerName": "Khách Cọc", "phone": "0900002300", "amount": 2000000,
        "rentPrice": 3000000, "payMonths": 3, "payDayFrom": 1, "payDayTo": 5,
        "serviceConfig": cfg, "date": "2027-01-05", "moveInDate": "2027-02-01",
        "moveOutDate": "2028-01-31", "contractDate": "2027-01-20",
        "expiryDate": "2027-02-15"})
    assert r.status_code == 201, r.text
    dep = r.json()
    assert dep["customerId"] == cust["id"]
    assert dep["payMonths"] == 3 and dep["payDayFrom"] == 1 and dep["payDayTo"] == 5
    assert dep["serviceConfig"] == cfg
    # Lọc theo customerId qua CRUD
    mine = client.get("/api/deposits", params={"customerId": cust["id"]}).json()
    assert len(mine) == 1 and mine[0]["id"] == dep["id"]


# ---------- A: Tạo nhà (rentalMode) + 2 tài khoản điện/nước ----------
def test_house_rental_mode_and_utility_accounts(client):
    r = client.post("/api/houses", json={
        "address": "24 Đường Thuê Mới", "name": "Nhà Web2", "province": "Hà Nội",
        "district": "Đống Đa", "ward": "Phương Liên", "floors": 4, "floorArea": 60,
        "bedrooms": 8, "bathrooms": 4, "type": "rented",
        "businessType": "Nhà nguyên căn", "rentalMode": "Bao người"})
    assert r.status_code == 201, r.text
    house = r.json()
    assert house["rentalMode"] == "Bao người"
    assert house["businessType"] == "Nhà nguyên căn"

    # Flow form nhà: lưu nhà xong tạo luôn 2 bản ghi house_utilities
    for typ, code in (("dien", "PD-WEB2-DIEN"), ("nuoc", "PD-WEB2-NUOC")):
        rr = client.post("/api/house-utilities", json={
            "houseId": house["id"], "type": typ, "customerCode": code,
            "accountHolder": "Nguyễn Văn An", "username": "user-" + code,
            "password": "pw", "month": date.today().strftime("%Y-%m"),
            "amount": 0, "status": "unpaid"})
        assert rr.status_code == 201, rr.text
    utils = client.get("/api/house-utilities", params={"houseId": house["id"]}).json()
    assert len(utils) == 2
    assert {u["type"] for u in utils} == {"dien", "nuoc"}
    assert all(u["status"] == "unpaid" and u["amount"] == 0 for u in utils)


# ---------- B: subRooms của phòng ----------
def test_room_subrooms(client):
    house = make_house(client, "25 Đường Phòng Con")
    r = client.post("/api/rooms", json={
        "houseId": house["id"], "name": "Phòng SR", "floor": 2, "area": 45,
        "type": "Chung cư mini", "toilet": "Khép kín", "price": 5000000,
        "minDeposit": 5000000, "maxPeople": 5, "subRooms": 2})
    assert r.status_code == 201, r.text
    assert r.json()["subRooms"] == 2
    r = client.put(f"/api/rooms/{r.json()['id']}", json={"subRooms": 3})
    assert r.json()["subRooms"] == 3


# ---------- E: Cấu hình dịch vụ của HĐ quyết định hóa đơn tháng ----------
def test_contract_service_config_drives_monthly_invoice(client):
    house = make_house(client, "26 Đường Cấu Hình DV")
    room = make_room(client, house["id"])
    cust = client.post("/api/customers", json={
        "name": "Khách DV", "phone": "0900002600", "gender": "Nam"}).json()
    services = {"dien": {"price": 5000, "unit": "so"},
                "nuoc": {"price": 90000, "unit": "nguoi"},
                "dienChung": {"price": 10000}, "vesinh": {"price": 0},
                "internet": {"price": 0},
                "xeMay": {"count": 2, "fee": 50000},
                "oTo": {"count": 0, "fee": 0}, "xeDap": {"count": 0, "fee": 0}}
    r = client.post("/api/contracts", json={
        "houseId": house["id"], "roomId": room["id"], "customerId": cust["id"],
        "signDate": "2027-04-01", "startDate": "2027-04-01", "endDate": "2028-03-31",
        "price": 2000000, "deposit": 2000000, "people": 2, "payMonths": 1,
        "payFromDay": 1, "payToDay": 3, "services": services, "status": "active"})
    assert r.status_code == 201, r.text
    client.post("/api/meter-readings", json={
        "houseId": house["id"], "roomId": room["id"], "type": "dien",
        "prev": 100, "current": 112, "date": "2027-05-04"})
    inv = client.post("/api/invoices/monthly",
                      json={"roomId": room["id"], "month": "2027-05"}).json()
    by_label = {l["label"]: l for l in inv["lines"]}
    assert by_label["Điện"]["unitPrice"] == 5000 and by_label["Điện"]["amount"] == 60000
    assert by_label["Nước"]["amount"] == 180000          # 2 người × 90.000 theo HĐ
    assert by_label["Điện chung"]["amount"] == 20000     # 2 người × 10.000 theo HĐ
    assert by_label["Xe máy"]["amount"] == 100000        # 2 xe × 50.000 theo HĐ
    assert inv["total"] == 2000000 + 60000 + 180000 + 20000 + 100000


# ---------- C: Hồ sơ khách đầy đủ ----------
def test_customer_full_profile_fields(client):
    payload = {"name": "Khách Đầy Đủ", "phone": "0900002700", "gender": "Nữ",
               "dob": "1998-07-15", "email": "dd@gmail.com", "idCard": "001198000777",
               "job": "kế toán", "maritalStatus": "Đã kết hôn",
               "permanentAddress": "Lục Ngạn, Bắc Giang",
               "currentAddress": "372 Xã Đàn, Hà Nội", "note": "Khách quen"}
    r = client.post("/api/customers", json=payload)
    assert r.status_code == 201, r.text
    cust = r.json()
    for key in ("job", "maritalStatus", "permanentAddress", "currentAddress", "note"):
        assert cust[key] == payload[key]
    got = client.get(f"/api/customers/{cust['id']}").json()
    assert got["job"] == "kế toán" and got["currentAddress"] == "372 Xã Đàn, Hà Nội"


# ---------- A: HĐ chủ nhà có kỳ thanh toán mới + payDay đồng bộ ----------
def test_landlord_contract_pay_fields(client):
    ll = client.post("/api/landlords", json={"name": "Chủ Web2", "phone": "0900002800"}).json()
    house = make_house(client, "28 Đường HĐ Chủ")
    r = client.post("/api/landlord-contracts", json={
        "landlordId": ll["id"], "houseId": house["id"], "rentPrice": 12000000,
        "deposit": 12000000, "startDate": "2027-01-01", "endDate": "2027-12-31",
        "payMonths": 3, "payFromDay": 2, "payToDay": 6})
    assert r.status_code == 201, r.text
    lc = r.json()
    assert lc["payMonths"] == 3 and lc["payFromDay"] == 2 and lc["payToDay"] == 6
    assert lc["payDay"] == 2  # enrich đồng bộ payDay = payFromDay


# ---------- A: Mã tài sản tự sinh 8 số + owner/note ----------
def test_asset_code_autogen_and_owner_fields(client):
    house = make_house(client, "29 Đường Tài Sản")
    r = client.post("/api/assets", json={
        "houseId": house["id"], "roomId": None, "owner": "landlord",
        "type": "Tủ lạnh", "status": "Như mới", "note": "Tài sản của chủ nhà"})
    assert r.status_code == 201, r.text
    a1 = r.json()
    assert re.fullmatch(r"\d{8}", a1["code"]), a1["code"]
    assert a1["owner"] == "landlord" and a1["note"] == "Tài sản của chủ nhà"
    r = client.post("/api/assets", json={
        "houseId": house["id"], "type": "Máy giặt", "status": "Tốt"})
    a2 = r.json()
    assert int(a2["code"]) == int(a1["code"]) + 1  # tăng dần, không trùng


# ---------- J: Thông báo có ngày GIỜ ----------
def test_notifications_include_datetime(client):
    r = client.get("/api/notifications")
    assert r.status_code == 200
    items = r.json()["items"]
    assert items, "Seed phải có ít nhất 1 thông báo"
    for it in items:
        assert "T" in it["time"], it["time"]  # ISO datetime có giờ, không chỉ ngày


# ---------- ensure_columns cho các cột đợt 2 trên DB cũ mô phỏng ----------
def test_ensure_columns_web2_on_legacy_db():
    from sqlalchemy import create_engine, inspect

    from backend.database import ensure_columns

    tmp = tempfile.mkdtemp(prefix="nhatro-legacy2-")
    path = os.path.join(tmp, "legacy2.db")
    con = sqlite3.connect(path)
    con.execute("CREATE TABLE houses (id VARCHAR PRIMARY KEY, created_at DATETIME)")
    con.execute("CREATE TABLE rooms (id VARCHAR PRIMARY KEY, created_at DATETIME)")
    con.execute("CREATE TABLE customers (id VARCHAR PRIMARY KEY, name VARCHAR, created_at DATETIME)")
    con.execute("CREATE TABLE deposits (id VARCHAR PRIMARY KEY, created_at DATETIME)")
    con.execute("CREATE TABLE assets (id VARCHAR PRIMARY KEY, created_at DATETIME)")
    con.execute("CREATE TABLE invoices (id VARCHAR PRIMARY KEY, created_at DATETIME)")
    con.execute("CREATE TABLE landlord_contracts (id VARCHAR PRIMARY KEY, created_at DATETIME)")
    con.commit()
    con.close()

    eng = create_engine("sqlite:///" + path)
    ensure_columns(eng)
    ensure_columns(eng)  # idempotent
    insp = inspect(eng)

    def cols(t):
        return {c["name"] for c in insp.get_columns(t)}

    assert "rental_mode" in cols("houses")
    assert "sub_rooms" in cols("rooms")
    assert {"job", "marital_status", "permanent_address", "current_address", "note"} <= cols("customers")
    assert {"customer_id", "pay_months", "pay_day_from", "pay_day_to", "service_config"} <= cols("deposits")
    assert {"owner", "note"} <= cols("assets")
    assert {"sent", "sent_date"} <= cols("invoices")
    assert {"pay_months", "pay_from_day", "pay_to_day"} <= cols("landlord_contracts")
    eng.dispose()
