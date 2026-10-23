"""Test các tính năng mới theo SPEC-WEB: verify-password, thanh toán hóa đơn
từng phần + phiếu thu tự sinh, phiếu thu/chi, chức vụ & phân công, điện nước
nhà + phiếu chi tự sinh, thông báo tổng hợp, ensure_columns trên DB cũ."""
import os
import sqlite3
import tempfile

from conftest import login_headers, make_contract, make_house, make_room

ADMIN = {"phone": "0901234567", "password": "admin123"}


# ---------- Xác thực mật khẩu trước khi xóa ----------
def test_verify_password_ok_and_wrong(client, raw_client):
    headers = login_headers(raw_client, ADMIN["phone"], ADMIN["password"])
    r = raw_client.post("/api/auth/verify-password", headers=headers,
                        json={"password": "admin123"})
    assert r.status_code == 200 and r.json()["ok"] is True
    r = raw_client.post("/api/auth/verify-password", headers=headers,
                        json={"password": "sai-mat-khau"})
    assert r.status_code == 401
    # Chưa đăng nhập -> 401
    r = raw_client.post("/api/auth/verify-password", json={"password": "admin123"})
    assert r.status_code == 401


# ---------- Thanh toán hóa đơn từng phần ----------
def test_invoice_payment_flow_partial_then_paid(client):
    house = make_house(client, "11 Đường Thanh Toán")
    room = make_room(client, house["id"])
    contract = make_contract(client, house["id"], room["id"], phone="0900001010")
    client.post("/api/meter-readings", json={
        "houseId": house["id"], "roomId": room["id"], "type": "dien",
        "prev": 20, "current": 30, "date": "2026-11-05"})
    inv = client.post("/api/invoices/monthly",
                      json={"roomId": room["id"], "month": "2026-11"}).json()
    assert inv["total"] == 3190000 and inv["status"] == "unpaid"
    assert inv["paidAmount"] == 0 and inv["code"]  # mã hóa đơn tự sinh

    # Trả 1.000.000 -> Thanh toán thiếu (partial)
    r = client.post(f"/api/invoices/{inv['id']}/payments", json={
        "date": "2026-11-06", "amount": 1000000, "receiver": "Nguyễn Văn A"})
    assert r.status_code == 201, r.text
    after = client.get(f"/api/invoices/{inv['id']}").json()
    assert after["paidAmount"] == 1000000 and after["status"] == "partial"

    # Phiếu thu tự tạo khớp số tiền + hóa đơn + mã hợp đồng
    receipts = [x for x in client.get("/api/receipts").json()
                if x.get("invoiceId") == inv["id"]]
    assert len(receipts) == 1
    assert receipts[0]["amount"] == 1000000
    assert receipts[0]["code"].startswith("T")
    assert receipts[0]["contractCode"] == contract["code"]
    assert receipts[0]["collectDate"] == "2026-11-06"

    # Trả nốt phần còn lại -> Thanh toán hết (paid)
    r = client.post(f"/api/invoices/{inv['id']}/payments", json={
        "date": "2026-11-07", "amount": 2190000, "receiver": "Nguyễn Văn A"})
    assert r.status_code == 201
    after = client.get(f"/api/invoices/{inv['id']}").json()
    assert after["paidAmount"] == 3190000 and after["status"] == "paid"

    # Lịch sử thanh toán của hóa đơn có đủ 2 lần
    pays = client.get(f"/api/invoices/{inv['id']}/payments").json()
    assert len(pays) == 2 and sum(p["amount"] for p in pays) == 3190000
    # Màn lịch sử thanh toán chung cũng thấy
    all_pays = client.get("/api/invoice-payments").json()
    assert any(p["invoiceId"] == inv["id"] for p in all_pays)

    # Số tiền <= 0 bị từ chối
    r = client.post(f"/api/invoices/{inv['id']}/payments", json={"amount": 0})
    assert r.status_code == 400


def test_invoice_discount_makes_paid(client):
    """Giảm giá + đã trả khớp -> còn lại 0 -> paid."""
    house = make_house(client, "12 Đường Giảm Giá")
    room = make_room(client, house["id"])
    inv = client.post("/api/invoices", json={
        "kind": "other", "houseId": house["id"], "roomId": room["id"],
        "reason": "Thu phí", "createdDate": "2026-11-01",
        "lines": [{"label": "Phí", "unitPrice": 500000, "unit": "phòng",
                   "qty": 1, "amount": 500000}]}).json()
    assert inv["total"] == 500000 and inv["status"] == "unpaid"
    r = client.put(f"/api/invoices/{inv['id']}", json={"discount": 100000})
    assert r.status_code == 200 and r.json()["discount"] == 100000
    client.post(f"/api/invoices/{inv['id']}/payments",
                json={"amount": 400000, "receiver": "A"})
    after = client.get(f"/api/invoices/{inv['id']}").json()
    assert after["status"] == "paid" and after["paidAmount"] == 400000


# ---------- Phiếu thu / phiếu chi ----------
def test_receipts_expenses_crud_and_totals(client):
    house = make_house(client, "13 Đường Thu Chi")
    room = make_room(client, house["id"])
    r = client.post("/api/receipts", json={
        "houseId": house["id"], "roomId": room["id"], "title": "Thu khác",
        "amount": 700000, "createdDate": "2026-11-02", "collectDate": "2026-11-03",
        "collector": "Trần Văn Nam", "payer": "Nguyễn Văn Cường"})
    assert r.status_code == 201, r.text
    rec = r.json()
    assert rec["code"].startswith("T")  # mã phiếu thu tự sinh
    mine = [x for x in client.get("/api/receipts", params={"houseId": house["id"]}).json()]
    assert sum(x["amount"] for x in mine) == 700000

    r = client.post("/api/expenses", json={
        "houseId": house["id"], "roomId": room["id"], "title": "Mua bóng đèn",
        "amount": 200000, "date": "2026-11-02", "payDate": "2026-11-04",
        "spender": "Trần Văn Nam", "receiverName": "Cửa hàng X",
        "receiverPhone": "0909000111"})
    assert r.status_code == 201, r.text
    exp = r.json()
    assert exp["code"].startswith("CHI")  # mã phiếu chi tự sinh
    assert exp["payDate"] == "2026-11-04"
    assert client.delete(f"/api/expenses/{exp['id']}").status_code == 200
    assert client.delete(f"/api/receipts/{rec['id']}").status_code == 200


def test_seed_receipt_expense_samples(client):
    receipts = client.get("/api/receipts").json()
    sample = [x for x in receipts if x["code"] == "T1012020091"]
    assert sample and sample[0]["amount"] == 1000000
    expenses = client.get("/api/expenses").json()
    sample = [x for x in expenses if x["code"] == "CHI1012020091"]
    assert sample and sample[0]["title"] == "Mua giường phòng 201"


# ---------- Chức vụ + phân chức vụ theo nhà ----------
def test_positions_and_assignments(client):
    positions = client.get("/api/positions").json()
    names = [p["name"] for p in positions]
    for expected in ("admin", "Quản lý", "Nhà đầu tư", "Kỹ thuật", "Bảo vệ", "Vệ sinh"):
        assert expected in names
    quanly = next(p for p in positions if p["name"] == "Quản lý")
    assert quanly["permissions"]["thongKe"] is True
    assert quanly["permissions"]["nha"]["add"] is True

    # Tạo chức vụ mới + sửa quyền
    r = client.post("/api/positions", json={"name": "Lễ tân", "permissions": {"thongKe": False}})
    assert r.status_code == 201
    pos = r.json()
    r = client.put(f"/api/positions/{pos['id']}",
                   json={"permissions": {"thongKe": True, "nha": {"add": True, "edit": False, "delete": False}}})
    assert r.json()["permissions"]["nha"]["add"] is True

    # Gán chức vụ theo nhà (seed: Lê Đại Phát — Quản lý @ 372 Xã Đàn)
    assignments = client.get("/api/staff-assignments").json()
    assert len(assignments) >= 2
    accounts = client.get("/api/accounts").json()
    phat = next(a for a in accounts if a["name"] == "Lê Đại Phát")
    mine = [a for a in assignments if a["accountId"] == phat["id"]]
    assert mine and mine[0]["positionId"] == quanly["id"]

    # Tạo + xóa 1 phân công mới
    house = make_house(client, "14 Đường Phân Công")
    r = client.post("/api/staff-assignments", json={
        "accountId": phat["id"], "houseId": house["id"], "positionId": pos["id"]})
    assert r.status_code == 201
    assert client.delete(f"/api/staff-assignments/{r.json()['id']}").status_code == 200
    assert client.delete(f"/api/positions/{pos['id']}").status_code == 200


# ---------- Điện nước nhà ----------
def test_house_utilities_pay_creates_expense(client):
    house = make_house(client, "15 Đường Điện Nước")
    r = client.post("/api/house-utilities", json={
        "houseId": house["id"], "type": "dien", "customerCode": "PD999",
        "accountHolder": "Nguyễn Văn An", "username": "PD999", "password": "pw999",
        "month": "2026-11", "amount": 1500000, "status": "unpaid"})
    assert r.status_code == 201, r.text
    util = r.json()
    before = client.get("/api/expenses", params={"houseId": house["id"]}).json()

    r = client.post(f"/api/house-utilities/{util['id']}/pay")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["ok"] is True and body["utility"]["status"] == "paid"
    after = client.get("/api/expenses", params={"houseId": house["id"]}).json()
    assert len(after) == len(before) + 1
    created = [e for e in after if e["id"] == body["expenseId"]]
    assert created and created[0]["amount"] == 1500000
    assert "Thanh toán điện" in created[0]["title"]
    # Thanh toán lần 2 -> 400
    assert client.post(f"/api/house-utilities/{util['id']}/pay").status_code == 400


def test_house_utilities_pay_with_amount(client):
    """Pay kèm {amount}: cập nhật số tiền của bản ghi trước, phiếu chi khớp số tiền mới."""
    house = make_house(client, "17 Đường Trả Kèm Tiền")
    r = client.post("/api/house-utilities", json={
        "houseId": house["id"], "type": "nuoc", "customerCode": "PN888",
        "accountHolder": "Nguyễn Văn An", "username": "PN888", "password": "pw888",
        "month": "2026-11", "amount": 0, "status": "unpaid"})
    assert r.status_code == 201, r.text
    util = r.json()

    r = client.post(f"/api/house-utilities/{util['id']}/pay", json={"amount": 2750000})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["ok"] is True
    assert body["utility"]["status"] == "paid"
    assert body["utility"]["amount"] == 2750000  # amount đã được cập nhật theo số tiền gửi kèm
    exps = client.get("/api/expenses", params={"houseId": house["id"]}).json()
    created = [e for e in exps if e["id"] == body["expenseId"]]
    assert created and created[0]["amount"] == 2750000  # phiếu chi khớp số tiền mới
    assert "Thanh toán nước" in created[0]["title"]


def test_seed_house_utility_sample(client):
    utils = client.get("/api/house-utilities").json()
    sample = [u for u in utils if u["customerCode"] == "10120200915"]
    assert sample and sample[0]["amount"] == 3200000 and sample[0]["status"] == "unpaid"


# ---------- Thông báo tổng hợp ----------
def test_notifications(client):
    house = make_house(client, "16 Đường Thông Báo")
    room = make_room(client, house["id"])
    client.post("/api/incidents", json={
        "houseId": house["id"], "roomId": room["id"], "type": "Hỏng điện",
        "note": "Hỏng điều hòa", "status": "Chưa sửa", "date": "2026-11-20"})
    inv = client.post("/api/invoices", json={
        "kind": "other", "houseId": house["id"], "roomId": room["id"],
        "reason": "Phí TB", "createdDate": "2026-11-01",
        "lines": [{"label": "Phí TB", "unitPrice": 100000, "unit": "phòng",
                   "qty": 1, "amount": 100000}]}).json()
    r = client.get("/api/notifications")
    assert r.status_code == 200
    data = r.json()
    types = {i["type"] for i in data["items"]}
    assert "incident" in types and "invoice" in types
    assert any(i["refId"] == inv["id"] for i in data["items"])
    assert any("Hỏng điều hòa" in i["content"] for i in data["items"])
    # Mới nhất trước
    times = [i["time"] for i in data["items"]]
    assert times == sorted(times, reverse=True)


# ---------- ensure_columns trên DB cũ mô phỏng ----------
def test_ensure_columns_on_legacy_db():
    from sqlalchemy import create_engine, inspect

    from backend.database import NEW_COLUMNS, ensure_columns

    tmp = tempfile.mkdtemp(prefix="nhatro-legacy-")
    path = os.path.join(tmp, "legacy.db")
    con = sqlite3.connect(path)
    # DB "cũ": chỉ có các cột gốc của houses/invoices/accounts
    con.execute("CREATE TABLE houses (id VARCHAR PRIMARY KEY, address VARCHAR, "
                "floor_area INTEGER, landlord_id VARCHAR, created_at DATETIME)")
    con.execute("CREATE TABLE invoices (id VARCHAR PRIMARY KEY, total INTEGER, "
                "status VARCHAR, created_at DATETIME)")
    con.execute("CREATE TABLE accounts (id VARCHAR PRIMARY KEY, name VARCHAR, "
                "created_at DATETIME)")
    con.commit()
    con.close()

    eng = create_engine("sqlite:///" + path)
    ensure_columns(eng)
    ensure_columns(eng)  # idempotent — chạy lần 2 không lỗi
    insp = inspect(eng)
    house_cols = {c["name"] for c in insp.get_columns("houses")}
    for col in NEW_COLUMNS["houses"]:
        assert col in house_cols
    inv_cols = {c["name"] for c in insp.get_columns("invoices")}
    assert {"code", "discount", "paid_amount"} <= inv_cols
    acc_cols = {c["name"] for c in insp.get_columns("accounts")}
    for col in NEW_COLUMNS["accounts"]:
        assert col in acc_cols
    eng.dispose()
