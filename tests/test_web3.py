"""Test đợt 8: "Thời gian thanh toán" của HĐ chủ nhà là 1 ngày cụ thể
(payDate) — tạo/cập nhật/đọc lại payDate qua API, payDay suy từ payDate,
ensure_columns thêm cột pay_date cho DB cũ."""
import os
import sqlite3
import tempfile

from conftest import make_house


# ---------- Đợt 8: payDate tạo + đọc lại đúng, payDay = ngày trong tháng ----------
def test_landlord_contract_pay_date_roundtrip(client):
    ll = client.post("/api/landlords", json={"name": "Chủ Đợt 8", "phone": "0900008800"}).json()
    house = make_house(client, "88 Đường Thanh Toán")
    r = client.post("/api/landlord-contracts", json={
        "landlordId": ll["id"], "houseId": house["id"], "rentPrice": 5000000,
        "deposit": 5000000, "startDate": "2026-08-01", "endDate": "2027-07-31",
        "payMonths": 3, "payDate": "2026-08-15"})
    assert r.status_code == 201, r.text
    lc = r.json()
    assert lc["payDate"] == "2026-08-15"
    assert lc["payDay"] == 15  # enrich suy payDay từ ngày trong tháng của payDate

    got = client.get(f"/api/landlord-contracts/{lc['id']}").json()
    assert got["payDate"] == "2026-08-15"

    # Cập nhật payDate -> đọc lại đúng giá trị mới
    r = client.put(f"/api/landlord-contracts/{lc['id']}", json={"payDate": "2026-09-20"})
    assert r.status_code == 200, r.text
    assert r.json()["payDate"] == "2026-09-20"
    got = client.get(f"/api/landlord-contracts/{lc['id']}").json()
    assert got["payDate"] == "2026-09-20"

    # Danh sách cũng trả về payDate
    items = client.get("/api/landlord-contracts").json()
    mine = [x for x in items if x["id"] == lc["id"]]
    assert mine and mine[0]["payDate"] == "2026-09-20"


# ---------- Đợt 9: firstPayDate (Ngày thanh toán kỳ đầu, nhập tay) tạo/cập nhật/đọc lại ----------
def test_landlord_contract_first_pay_date_roundtrip(client):
    ll = client.post("/api/landlords", json={"name": "Chủ Kỳ Đầu", "phone": "0900009900"}).json()
    house = make_house(client, "99 Đường Kỳ Đầu")
    r = client.post("/api/landlord-contracts", json={
        "landlordId": ll["id"], "houseId": house["id"], "rentPrice": 5000000,
        "deposit": 5000000, "startDate": "2026-08-01", "endDate": "2027-07-31",
        "payMonths": 3, "payDate": "2026-08-15", "firstPayDate": "2026-08-15"})
    assert r.status_code == 201, r.text
    lc = r.json()
    assert lc["firstPayDate"] == "2026-08-15"

    got = client.get(f"/api/landlord-contracts/{lc['id']}").json()
    assert got["firstPayDate"] == "2026-08-15"

    # Cập nhật firstPayDate -> đọc lại đúng giá trị mới (ngày đã lưu là chính thức)
    r = client.put(f"/api/landlord-contracts/{lc['id']}", json={"firstPayDate": "2026-12-20"})
    assert r.status_code == 200, r.text
    assert r.json()["firstPayDate"] == "2026-12-20"
    got = client.get(f"/api/landlord-contracts/{lc['id']}").json()
    assert got["firstPayDate"] == "2026-12-20"

    # Cập nhật trường khác (không gửi firstPayDate) -> firstPayDate KHÔNG bị xóa
    r = client.put(f"/api/landlord-contracts/{lc['id']}", json={"rentPrice": 6000000})
    assert r.status_code == 200, r.text
    assert r.json()["firstPayDate"] == "2026-12-20"

    # Danh sách cũng trả về firstPayDate
    items = client.get("/api/landlord-contracts").json()
    mine = [x for x in items if x["id"] == lc["id"]]
    assert mine and mine[0]["firstPayDate"] == "2026-12-20"


# ---------- Đợt 8: ensure_columns thêm pay_date trên DB cũ ----------
def test_ensure_columns_pay_date_on_legacy_db():
    from sqlalchemy import create_engine, inspect

    from backend.database import ensure_columns

    tmp = tempfile.mkdtemp(prefix="nhatro-legacy8-")
    path = os.path.join(tmp, "legacy8.db")
    con = sqlite3.connect(path)
    con.execute("CREATE TABLE landlord_contracts (id VARCHAR PRIMARY KEY, created_at DATETIME)")
    con.commit()
    con.close()

    eng = create_engine("sqlite:///" + path)
    ensure_columns(eng)
    ensure_columns(eng)  # idempotent
    insp = inspect(eng)
    cols = {c["name"] for c in insp.get_columns("landlord_contracts")}
    assert "pay_date" in cols
    assert "first_pay_date" in cols  # Đợt 9: thêm cùng đợt kiểm này
    eng.dispose()
