"""Đợt 25 — Chặn trùng key tự nhiên (lớp chặn chính ở backend, hook
before_create/before_update; không thêm unique constraint ở DB, không tự
xóa/gộp data trùng đã tồn tại).

Key từng màn: nhà = địa chỉ; chủ nhà / khách thuê / tài khoản = SĐT;
phòng = tên trong cùng một nhà; dịch vụ / đơn vị tính = tên; xe = biển số;
một nhà chỉ có một HĐ chủ nhà đang hoạt động, một phòng chỉ có một HĐ thuê
đang hoạt động (HĐ đã thanh lý không tính).

Quy tắc kiểm chung mỗi key: tạo trùng -> 400 + bản ghi cũ còn nguyên;
sửa sang key của bản ghi khác -> 400; sửa giữ nguyên key của chính nó
-> 200 (kể cả khi gửi lại đúng key cũ). Chuẩn hóa: text trim + gộp khoảng
trắng + không phân biệt hoa/thường; SĐT bỏ khoảng trắng/gạch/chấm + đổi
đầu +84 thành 0; biển số bỏ khoảng trắng/gạch/chấm + viết hoa.

Giá trị test dùng tiền tố riêng (địa chỉ "Đường Chống Trùng", SĐT
09000925xx) để không va chạm dữ liệu mẫu và các test khác dùng chung DB
session này.
"""
from conftest import make_contract, make_house, make_room


def _post_house(client, address):
    return client.post("/api/houses", json={
        "address": address, "province": "Hà Nội", "district": "Thanh Xuân",
        "ward": "Khương Đình"})


def test_house_address_dup_blocked_and_normalized(client):
    r = _post_house(client, "  123 Đường Chống Trùng ")
    assert r.status_code == 201, r.text
    first = r.json()
    # Trùng sau chuẩn hóa: thừa khoảng trắng + khác hoa/thường -> vẫn chặn
    r2 = _post_house(client, "123   đường chống trùng")
    assert r2.status_code == 400, r2.text
    assert "đã tồn tại" in r2.json()["detail"]
    # Bản ghi cũ còn nguyên
    assert client.get(f"/api/houses/{first['id']}").status_code == 200
    # Sửa giữ nguyên địa chỉ của chính nó -> được
    r3 = client.put(f"/api/houses/{first['id']}",
                    json={"floors": 9})
    assert r3.status_code == 200, r3.text
    # Sửa sang địa chỉ của nhà khác -> chặn
    other = _post_house(client, "124 Đường Chống Trùng").json()
    r4 = client.put(f"/api/houses/{other['id']}",
                    json={"address": "123 Đường Chống Trùng"})
    assert r4.status_code == 400, r4.text
    assert client.get(f"/api/houses/{other['id']}").json()["address"] == \
        "124 Đường Chống Trùng"


def test_landlord_phone_dup_blocked_and_normalized(client):
    r = client.post("/api/landlords", json={
        "name": "Chủ Chống Trùng 1", "phone": "0901 234 567"})
    assert r.status_code == 201, r.text
    ll = r.json()
    # +84 + khoảng trắng -> cùng SĐT chuẩn hóa -> chặn, báo tên chủ nhà đó
    # và hướng dẫn chọn từ danh sách thay vì nhập mới
    r2 = client.post("/api/landlords", json={
        "name": "Chủ Chống Trùng 2", "phone": "+84 901 234 567"})
    assert r2.status_code == 400, r2.text
    detail = r2.json()["detail"]
    assert "Chủ Chống Trùng 1" in detail and "danh sách" in detail
    assert client.get(f"/api/landlords/{ll['id']}").status_code == 200
    # Sửa giữ nguyên SĐT mình -> được; sửa sang SĐT người khác -> chặn
    assert client.put(f"/api/landlords/{ll['id']}",
                      json={"email": "a@x.com"}).status_code == 200
    ll2 = client.post("/api/landlords", json={
        "name": "Chủ Chống Trùng 3", "phone": "0900092502"}).json()
    r3 = client.put(f"/api/landlords/{ll2['id']}",
                    json={"phone": "0901234567"})
    assert r3.status_code == 400, r3.text


def test_customer_phone_dup_blocked(client):
    r = client.post("/api/customers", json={
        "name": "Khách Chống Trùng 1", "phone": "0900092521"})
    assert r.status_code == 201, r.text
    cust = r.json()
    r2 = client.post("/api/customers", json={
        "name": "Khách Chống Trùng 2", "phone": "0900-092-521"})
    assert r2.status_code == 400, r2.text
    assert "Khách Chống Trùng 1" in r2.json()["detail"]
    assert client.put(f"/api/customers/{cust['id']}",
                      json={"email": "b@x.com"}).status_code == 200
    cust2 = client.post("/api/customers", json={
        "name": "Khách Chống Trùng 3", "phone": "0900092522"}).json()
    assert client.put(f"/api/customers/{cust2['id']}",
                      json={"phone": "0900092521"}).status_code == 400


def test_room_name_dup_scoped_to_house(client):
    h1 = make_house(client, "125 Đường Chống Trùng")
    h2 = make_house(client, "126 Đường Chống Trùng")
    r1 = make_room(client, h1["id"], "Phòng Chống Trùng")
    # Cùng tên, cùng nhà -> chặn
    r = client.post("/api/rooms", json={
        "houseId": h1["id"], "name": "  phòng chống trùng "})
    assert r.status_code == 400, r.text
    assert "đã tồn tại trong nhà" in r.json()["detail"]
    # Cùng tên, khác nhà -> được
    r2 = client.post("/api/rooms", json={
        "houseId": h2["id"], "name": "Phòng Chống Trùng"})
    assert r2.status_code == 201, r2.text
    # Sửa giữ nguyên tên mình -> được; sửa sang tên phòng khác cùng nhà -> chặn
    assert client.put(f"/api/rooms/{r1['id']}",
                      json={"price": 3100000}).status_code == 200
    r3 = make_room(client, h1["id"], "Phòng Chống Trùng B")
    assert client.put(f"/api/rooms/{r3['id']}",
                      json={"name": "Phòng Chống Trùng"}).status_code == 400


def test_service_and_unit_name_dup_blocked(client):
    s = client.post("/api/services", json={
        "name": "Dịch Vụ Chống Trùng", "price": 1000}).json()
    assert s["id"]
    r = client.post("/api/services", json={
        "name": "  dịch vụ   chống trùng ", "price": 2000})
    assert r.status_code == 400, r.text
    assert client.put(f"/api/services/{s['id']}",
                      json={"price": 1500}).status_code == 200
    u = client.post("/api/units", json={"name": "Đơn Vị Chống Trùng"}).json()
    assert u["id"]
    assert client.post("/api/units", json={
        "name": "đơn vị chống trùng"}).status_code == 400


def test_vehicle_plate_dup_blocked_and_normalized(client):
    house = make_house(client, "127 Đường Chống Trùng")
    v = client.post("/api/vehicles", json={
        "houseId": house["id"], "type": "Xe máy", "plate": "51A-123.45"})
    assert v.status_code == 201, v.text
    veh = v.json()
    r = client.post("/api/vehicles", json={
        "houseId": house["id"], "type": "Xe máy", "plate": "51a12345"})
    assert r.status_code == 400, r.text
    assert "Biển số" in r.json()["detail"]
    assert client.put(f"/api/vehicles/{veh['id']}",
                      json={"fee": 50000}).status_code == 200
    v2 = client.post("/api/vehicles", json={
        "houseId": house["id"], "type": "Xe máy", "plate": "51B-99999"})
    assert v2.status_code == 201, v2.text
    assert client.put(f"/api/vehicles/{v2.json()['id']}",
                      json={"plate": "51A12345"}).status_code == 400


def test_account_phone_dup_blocked(client):
    r = client.post("/api/accounts", json={
        "name": "NV Chống Trùng 1", "phone": "0900092531",
        "role": "staff", "password": "123456"})
    assert r.status_code == 201, r.text
    acc = r.json()
    r2 = client.post("/api/accounts", json={
        "name": "NV Chống Trùng 2", "phone": "+84 900 092 531",
        "role": "staff", "password": "123456"})
    assert r2.status_code == 400, r2.text
    assert "đăng nhập" in r2.json()["detail"]
    assert client.put(f"/api/accounts/{acc['id']}",
                      json={"email": "nv@x.com"}).status_code == 200
    acc2 = client.post("/api/accounts", json={
        "name": "NV Chống Trùng 3", "phone": "0900092532",
        "role": "staff", "password": "123456"}).json()
    assert client.put(f"/api/accounts/{acc2['id']}",
                      json={"phone": "0900092531"}).status_code == 400


def test_second_active_landlord_contract_blocked_then_allowed_after_liquidate(client):
    ll = client.post("/api/landlords", json={
        "name": "Chủ HĐ Chống Trùng", "phone": "0900092541"}).json()
    house = make_house(client, "128 Đường Chống Trùng")
    lc1 = client.post("/api/landlord-contracts", json={
        "landlordId": ll["id"], "houseId": house["id"], "rentPrice": 5000000,
        "deposit": 5000000, "startDate": "2026-08-01",
        "endDate": "2027-07-31", "payMonths": 1}).json()
    assert lc1["id"], lc1
    # HĐ đang hoạt động thứ hai cho cùng nhà -> chặn
    r = client.post("/api/landlord-contracts", json={
        "landlordId": ll["id"], "houseId": house["id"], "rentPrice": 6000000,
        "deposit": 6000000, "startDate": "2026-09-01",
        "endDate": "2027-08-31", "payMonths": 1})
    assert r.status_code == 400, r.text
    assert "đang hoạt động" in r.json()["detail"]
    # Sửa HĐ cũ (giữ nguyên đang hoạt động) -> được
    assert client.put(f"/api/landlord-contracts/{lc1['id']}",
                      json={"rentPrice": 5500000}).status_code == 200
    # Thanh lý HĐ cũ rồi tạo mới -> được
    assert client.put(f"/api/landlord-contracts/{lc1['id']}",
                      json={"status": "liquidated"}).status_code == 200
    r2 = client.post("/api/landlord-contracts", json={
        "landlordId": ll["id"], "houseId": house["id"], "rentPrice": 6000000,
        "deposit": 6000000, "startDate": "2026-09-01",
        "endDate": "2027-08-31", "payMonths": 1})
    assert r2.status_code == 201, r2.text


def test_second_active_tenant_contract_blocked_then_allowed_after_liquidate(client):
    house = make_house(client, "129 Đường Chống Trùng")
    room = make_room(client, house["id"], "Phòng HĐ Chống Trùng")
    ct1 = make_contract(client, house["id"], room["id"],
                        phone="0900092551")
    # HĐ thuê đang hoạt động thứ hai cho cùng phòng -> chặn
    cust2 = client.post("/api/customers", json={
        "name": "Khách HĐ 2", "phone": "0900092552"}).json()
    r = client.post("/api/contracts", json={
        "houseId": house["id"], "roomId": room["id"],
        "customerId": cust2["id"], "startDate": "2026-09-01",
        "endDate": "2027-08-31", "price": 3000000, "deposit": 3000000,
        "status": "active"})
    assert r.status_code == 400, r.text
    assert "đang hoạt động" in r.json()["detail"]
    # Sửa HĐ cũ (giữ nguyên đang hoạt động) -> được
    assert client.put(f"/api/contracts/{ct1['id']}",
                      json={"price": 3100000}).status_code == 200
    # Thanh lý HĐ cũ rồi tạo mới -> được
    assert client.put(f"/api/contracts/{ct1['id']}",
                      json={"status": "liquidated"}).status_code == 200
    r2 = client.post("/api/contracts", json={
        "houseId": house["id"], "roomId": room["id"],
        "customerId": cust2["id"], "startDate": "2026-09-01",
        "endDate": "2027-08-31", "price": 3000000, "deposit": 3000000,
        "status": "active"})
    assert r2.status_code == 201, r2.text
