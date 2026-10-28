"""Đợt 26 — Màn phòng: bỏ cặp "Thanh toán từ ngày - đến ngày", chỉ còn
1 ô "Thời gian đóng tiền" lưu vào rooms.payDay.

- Tạo phòng mới chỉ gửi payDay (không còn payFromDay/payToDay) -> 201,
  payDay lưu đúng.
- payDay ngoài 1-31 thì KẸP về khoảng hợp lệ (0 -> 1, 45 -> 31), cả khi
  tạo và khi sửa — cùng một quy tắc ở schema backend và form frontend.
- Tương thích dữ liệu cũ: payload kiểu cũ (chỉ có payFromDay/payToDay)
  vẫn tạo được, 2 trường cũ giữ nguyên; sửa chỉ payDay không ghi đè
  2 trường cũ (không migration xóa cột, không mất dữ liệu).

Tiền tố địa chỉ/tên phòng riêng ("Đường Đóng Tiền", "Phòng Đóng Tiền")
để không va chạm dữ liệu mẫu và các test khác dùng chung DB session này.
"""
from conftest import make_house


def _post_room(client, house_id, name, **extra):
    body = {"houseId": house_id, "name": name, "floor": 1, "area": 30,
            "type": "Khép kín", "toilet": "Khép kín", "withOwner": False,
            "price": 3000000, "minDeposit": 3000000, "maxPeople": 3,
            "payMonths": 1, "amenities": [], "services": {}}
    body.update(extra)
    return client.post("/api/rooms", json=body)


def test_create_room_with_only_payday(client):
    h = make_house(client, "999 Đường Đóng Tiền A")
    r = _post_room(client, h["id"], "Phòng Đóng Tiền A", payDay=15)
    assert r.status_code == 201, r.text
    data = r.json()
    assert data["payDay"] == 15
    # Payload mới không gửi 2 trường cũ -> chúng nhận giá trị mặc định,
    # không phải là nguồn hiển thị nữa.
    assert data["payFromDay"] == 1 and data["payToDay"] == 3


def test_payday_clamped_to_1_31_on_create_and_update(client):
    h = make_house(client, "999 Đường Đóng Tiền B")
    r = _post_room(client, h["id"], "Phòng Đóng Tiền B1", payDay=0)
    assert r.status_code == 201, r.text
    assert r.json()["payDay"] == 1
    r = _post_room(client, h["id"], "Phòng Đóng Tiền B2", payDay=45)
    assert r.status_code == 201, r.text
    assert r.json()["payDay"] == 31
    rid = r.json()["id"]
    u = client.put(f"/api/rooms/{rid}", json={"payDay": 99})
    assert u.status_code == 200, u.text
    assert u.json()["payDay"] == 31
    u = client.put(f"/api/rooms/{rid}", json={"payDay": -5})
    assert u.status_code == 200, u.text
    assert u.json()["payDay"] == 1


def test_legacy_payload_preserved_and_payday_update_keeps_old_fields(client):
    h = make_house(client, "999 Đường Đóng Tiền C")
    # Phòng cũ: chỉ có khoảng từ-đến, không có payDay
    r = _post_room(client, h["id"], "Phòng Đóng Tiền C",
                   payFromDay=7, payToDay=9)
    assert r.status_code == 201, r.text
    data = r.json()
    assert data["payFromDay"] == 7 and data["payToDay"] == 9
    # Sửa chỉ payDay: 2 trường cũ không bị ghi đè/xóa
    u = client.put(f"/api/rooms/{data['id']}", json={"payDay": 20})
    assert u.status_code == 200, u.text
    upd = u.json()
    assert upd["payDay"] == 20
    assert upd["payFromDay"] == 7 and upd["payToDay"] == 9
