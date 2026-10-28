"""Đợt 29 — API cọc phải trả created_at để frontend chọn cọc mới nhất của
phòng khi tạo hợp đồng (rule: cọc mới nhất theo created_at).

- GET /api/deposits trả created_at dạng chuỗi ISO không rỗng cho mọi bản ghi.
- Thứ tự list theo created_at tăng dần (router CRUD sắp xếp theo
  created_at, id), nên bản ghi cuối của một phòng chính là cọc mới nhất
  của phòng đó — đúng thứ tự mà latestDepositOfRoom ở frontend dựa vào
  khi created_at bị thiếu.
"""


def test_deposits_expose_created_at(client):
    r = client.get("/api/deposits")
    assert r.status_code == 200, r.text
    items = r.json()
    assert len(items) >= 1  # dữ liệu mẫu có cọc
    for it in items:
        assert it.get("created_at"), "thiếu created_at ở cọc %s" % it.get("id")


def test_deposits_ordered_by_created_at(client):
    r = client.get("/api/deposits")
    assert r.status_code == 200, r.text
    stamps = [it["created_at"] for it in r.json()]
    assert stamps == sorted(stamps)
