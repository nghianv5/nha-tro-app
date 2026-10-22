"""Cấu hình pytest: dùng SQLite file tạm, đặt DATABASE_URL trước khi import app."""
import os
import sys
import tempfile

_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, _ROOT)

_TMP = tempfile.mkdtemp(prefix="nhatro-test-")
_DB_FILE = os.path.join(_TMP, "test.db")
os.environ["DATABASE_URL"] = "sqlite:///" + _DB_FILE

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from backend.main import app  # noqa: E402

ADMIN_PHONE, ADMIN_PASSWORD = "0901234567", "admin123"
STAFF_PHONE, STAFF_PASSWORD = "0901234568", "123456"


def login_headers(c, phone, password):
    """Đăng nhập qua API thật, trả về header Authorization."""
    r = c.post("/api/auth/login", json={"phone": phone, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": "Bearer " + r.json()["access_token"]}


@pytest.fixture(scope="session")
def client():
    # Import app đã tự tạo bảng + seed dữ liệu mẫu (DB trống).
    # Client mặc định đăng nhập bằng tài khoản admin mẫu.
    c = TestClient(app)
    c.headers.update(login_headers(c, ADMIN_PHONE, ADMIN_PASSWORD))
    return c


@pytest.fixture(scope="session")
def raw_client():
    """Client KHÔNG gắn token — dùng để test các trường hợp chưa đăng nhập."""
    return TestClient(app)


@pytest.fixture(scope="session")
def staff_client():
    """Client đăng nhập bằng tài khoản nhân viên mẫu."""
    c = TestClient(app)
    c.headers.update(login_headers(c, STAFF_PHONE, STAFF_PASSWORD))
    return c


def make_house(client, address="1 Đường Test"):
    r = client.post("/api/houses", json={
        "address": address, "province": "Hà Nội", "district": "Thanh Xuân",
        "ward": "Khương Đình", "floors": 3, "floorArea": 50, "bedrooms": 6,
        "bathrooms": 3, "type": "own"})
    assert r.status_code == 201, r.text
    return r.json()


def make_room(client, house_id, name="Phòng T1", price=3000000):
    r = client.post("/api/rooms", json={
        "houseId": house_id, "name": name, "floor": 1, "area": 30,
        "type": "Khép kín", "toilet": "Khép kín", "withOwner": False,
        "price": price, "minDeposit": price, "maxPeople": 3, "payMonths": 1,
        "payFromDay": 1, "payToDay": 3, "amenities": [],
        "services": {"dien": 3000, "dienChung": 30000, "internet": 0, "extra": []}})
    assert r.status_code == 201, r.text
    return r.json()


def design_services():
    """Dịch vụ đúng ví dụ thiết kế: điện 3.000đ/số, nước 80.000đ/người,
    điện chung 30.000đ/người, vệ sinh 20.000đ/người, xe máy 1 × 30.000đ."""
    return {"dien": {"price": 3000, "unit": "so"},
            "nuoc": {"price": 80000, "unit": "nguoi"},
            "dienChung": {"price": 30000}, "vesinh": {"price": 20000},
            "internet": {"price": 0},
            "xeMay": {"count": 1, "fee": 30000},
            "oTo": {"count": 0, "fee": 100000}, "xeDap": {"count": 0, "fee": 10000}}


def make_contract(client, house_id, room_id, phone="0900000001", people=1,
                  start="2026-09-01", end="2027-08-31"):
    rc = client.post("/api/customers", json={
        "name": "Khách Test", "phone": phone, "gender": "Nam",
        "dob": "1995-01-01", "email": "", "idCard": ""})
    assert rc.status_code == 201, rc.text
    customer = rc.json()
    r = client.post("/api/contracts", json={
        "houseId": house_id, "roomId": room_id, "customerId": customer["id"],
        "signDate": start, "startDate": start, "endDate": end,
        "price": 3000000, "deposit": 3000000, "people": people, "payMonths": 1,
        "payFromDay": 1, "payToDay": 3, "services": design_services(),
        "status": "active"})
    assert r.status_code == 201, r.text
    return r.json()
