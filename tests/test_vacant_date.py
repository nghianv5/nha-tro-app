"""Đợt 32 — "Phòng trống từ ngày" là mốc ngày cụ thể, không còn là số ngày.

- POST cọc kèm vacantDate → lưu đúng ngày, GET trả lại ngày đó.
- Cọc mẫu cũ chỉ có vacantDays (số ngày) thì vacantDate null — cột mới
  không tự suy ngày từ số ngày, và cột vacant_days cũ vẫn còn nguyên.
- PUT cập nhật vacantDate không làm mất vacantDays cũ (update từng phần).
- Bỏ ngày (null) thì lưu được, GET trả null.
"""
from conftest import make_house, make_room


def _make_deposit(client, house_id, room_id, **extra):
    payload = {"houseId": house_id, "roomId": room_id, "customerName": "Khách Trống",
               "phone": "0912000111", "amount": 1000000}
    payload.update(extra)
    r = client.post("/api/deposits", json=payload)
    assert r.status_code == 201, r.text
    return r.json()


def test_create_deposit_with_vacant_date(client):
    house = make_house(client, "77 Đường Trống Ngày")
    room = make_room(client, house["id"], "P-VD")
    dep = _make_deposit(client, house["id"], room["id"], vacantDate="2026-11-05")
    assert dep["vacantDate"] == "2026-11-05"
    got = client.get("/api/deposits", params={"roomId": room["id"]}).json()
    assert len(got) == 1 and got[0]["vacantDate"] == "2026-11-05"


def test_seed_deposit_has_null_vacant_date(client):
    # Cọc mẫu trong seed.py: phone 0912345678, vacantDays=5, không có ngày.
    items = client.get("/api/deposits").json()
    seed = [d for d in items
            if d.get("phone") == "0912345678" and d.get("vacantDays") == 5]
    assert seed, "không tìm thấy cọc mẫu cũ (vacantDays=5)"
    assert seed[0].get("vacantDate") is None, \
        "cọc cũ không được tự suy ngày từ số ngày"


def test_update_vacant_date_keeps_old_days(client):
    house = make_house(client, "78 Đường Trống Ngày")
    room = make_room(client, house["id"], "P-VD2")
    dep = _make_deposit(client, house["id"], room["id"], vacantDays=5)
    assert dep["vacantDays"] == 5 and dep["vacantDate"] is None
    r = client.put("/api/deposits/%s" % dep["id"], json={"vacantDate": "2026-12-01"})
    assert r.status_code == 200, r.text
    got = client.get("/api/deposits", params={"roomId": room["id"]}).json()
    assert got[0]["vacantDate"] == "2026-12-01"
    assert got[0]["vacantDays"] == 5, "cập nhật ngày không được xóa số ngày cũ"


def test_clear_vacant_date(client):
    house = make_house(client, "79 Đường Trống Ngày")
    room = make_room(client, house["id"], "P-VD3")
    dep = _make_deposit(client, house["id"], room["id"], vacantDate="2026-11-10")
    r = client.put("/api/deposits/%s" % dep["id"], json={"vacantDate": None})
    assert r.status_code == 200, r.text
    got = client.get("/api/deposits", params={"roomId": room["id"]}).json()
    assert got[0]["vacantDate"] is None
