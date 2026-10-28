"""Đợt 26 — Chặn số nguyên vượt int32 của PostgreSQL trước khi ghi.
Đợt 27 — Giá phòng đổi sang nhập trực tiếp bằng vnđ (xem README đợt 27):
gõ "5.700.000" giờ là giá trị hợp lệ, lưu đúng 5.700.000đ. Guard int32
vẫn giữ cho mọi trường tiền — chỉ chặn giá trị thật sự vượt int32
(~2,147 tỷ) bằng 400 + thông báo chung, không còn gợi ý đơn vị triệu
cho giá phòng nữa (giá phòng không còn là ô triệu).

Bối cảnh gốc (log thật từ Render, đợt 26): gõ "5.700.000" (đồng) vào ô
"Giá phòng (triệu vnđ)" -> parser triệu hiểu thành 5.700.000 triệu ->
x1.000.000 = 5,7 nghìn tỷ, vượt int32 -> INSERT nổ 500, phòng không
được lưu. SQLite không bắt được (int 64-bit) nên guard phải nằm ở tầng
ứng dụng, chạy vô điều kiện trong router CRUD generic cho mọi màn cùng
hưởng.

- Giá phòng khổng lồ (5,7 nghìn tỷ) -> 400 + thông báo chung "quá lớn"
  + KHÔNG có bản ghi nào tạo ra.
- Sửa sang giá khổng lồ -> 400, giá cũ còn nguyên.
- Giá vnđ bình thường 5.700.000đ vẫn lưu đúng 5.700.000đ.
- Một màn khác (giá dịch vụ) cũng được guard chung chặn 400.
"""
from conftest import make_house


def _rooms_of(client, house_id):
    r = client.get("/api/rooms", params={"houseId": house_id})
    assert r.status_code == 200, r.text
    return r.json()


def test_room_price_huge_blocked_generic(client):
    h = make_house(client, "999 Đường Tràn Số A")
    before = _rooms_of(client, h["id"])
    # Vượt int32 thật sự (5,7 nghìn tỷ) -> 400 chung, không gợi ý triệu nữa
    r = client.post("/api/rooms", json={
        "houseId": h["id"], "name": "Phòng Tràn Số", "floor": 1,
        "price": 5700000000000, "minDeposit": 5700000, "payMonths": 1,
        "payDay": 1, "amenities": [], "services": {}})
    assert r.status_code == 400, r.text
    detail = r.json()["detail"]
    assert "quá lớn" in detail
    after = _rooms_of(client, h["id"])
    assert len(after) == len(before)
    assert all(x["name"] != "Phòng Tràn Số" for x in after)


def test_room_price_huge_update_blocked_old_value_kept(client):
    h = make_house(client, "999 Đường Tràn Số B")
    r = client.post("/api/rooms", json={
        "houseId": h["id"], "name": "Phòng Tràn Số B", "floor": 1,
        "price": 3000000, "minDeposit": 3000000, "payMonths": 1,
        "payDay": 1, "amenities": [], "services": {}})
    assert r.status_code == 201, r.text
    rid = r.json()["id"]
    u = client.put(f"/api/rooms/{rid}", json={"price": 3000000000000})
    assert u.status_code == 400, u.text
    assert "quá lớn" in u.json()["detail"]
    cur = client.get(f"/api/rooms/{rid}")
    assert cur.status_code == 200 and cur.json()["price"] == 3000000


def test_room_price_vnd_saved_as_is(client):
    # Đợt 27: nhập 5.700.000đ là hợp lệ, lưu đúng 5.700.000đ (không nhân gì thêm)
    h = make_house(client, "999 Đường Tràn Số C")
    r = client.post("/api/rooms", json={
        "houseId": h["id"], "name": "Phòng Tràn Số C", "floor": 1,
        "price": 5700000, "minDeposit": 5700000, "payMonths": 1,
        "payDay": 15, "amenities": [], "services": {}})
    assert r.status_code == 201, r.text
    assert r.json()["price"] == 5700000
    assert r.json()["payDay"] == 15


def test_other_money_field_also_guarded(client):
    r = client.post("/api/services", json={
        "name": "Dịch vụ Tràn Số", "price": 5000000000})
    assert r.status_code == 400, r.text
    assert "quá lớn" in r.json()["detail"]
