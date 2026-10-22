"""Test hệ thống đăng nhập JWT: login, bảo vệ API, đổi/đặt lại mật khẩu, phân quyền admin."""
from conftest import (ADMIN_PASSWORD, ADMIN_PHONE, STAFF_PASSWORD, STAFF_PHONE,
                      login_headers)


def _make_account(client, phone, password, role="staff", name="Tài Khoản Test"):
    r = client.post("/api/accounts", json={
        "name": name, "phone": phone, "role": role, "password": password,
        "modules": ["incidents"], "houseIds": []})
    assert r.status_code == 201, r.text
    acc = r.json()
    # Response tạo tài khoản tuyệt đối không chứa mật khẩu / chuỗi băm
    assert "password" not in acc and "passwordHash" not in acc
    return acc


def test_login_success_returns_token_and_user(raw_client):
    r = raw_client.post("/api/auth/login",
                        json={"phone": ADMIN_PHONE, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["access_token"]
    assert data["token_type"] == "bearer"
    user = data["user"]
    assert user["phone"] == ADMIN_PHONE
    assert user["name"] == "Nguyễn Văn A"
    assert user["role"] == "admin"
    assert user["modules"] == ["all"]
    assert len(user["houseIds"]) >= 7
    # Không lộ mật khẩu / chuỗi băm ở bất cứ đâu trong response
    assert "password" not in r.text and "passwordHash" not in r.text


def test_login_wrong_password_401(raw_client):
    r = raw_client.post("/api/auth/login",
                        json={"phone": ADMIN_PHONE, "password": "mat-khau-sai"})
    assert r.status_code == 401
    assert "không đúng" in r.json()["detail"]


def test_login_unknown_phone_401(raw_client):
    r = raw_client.post("/api/auth/login",
                        json={"phone": "0999999999", "password": "bat-ky-gi"})
    assert r.status_code == 401


def test_api_requires_login(raw_client):
    # Toàn bộ API (trừ login + frontend tĩnh) đều chặn khi chưa đăng nhập
    for path in ("/api/houses", "/api/dashboard", "/api/accounts",
                 "/api/invoices", "/api/analytics/summary", "/api/health"):
        r = raw_client.get(path)
        assert r.status_code == 401, (path, r.status_code, r.text)
    # Token rác cũng bị chặn
    r = raw_client.get("/api/houses", headers={"Authorization": "Bearer token-rac"})
    assert r.status_code == 401


def test_me_returns_current_user(raw_client):
    headers = login_headers(raw_client, STAFF_PHONE, STAFF_PASSWORD)
    r = raw_client.get("/api/auth/me", headers=headers)
    assert r.status_code == 200
    me = r.json()
    assert me["phone"] == STAFF_PHONE
    assert me["role"] == "staff"
    assert "passwordHash" not in r.text


def test_change_password_flow(client, raw_client):
    acc = _make_account(client, "0907777771", "oldpass1")
    headers = login_headers(raw_client, "0907777771", "oldpass1")
    # Mật khẩu cũ sai -> 400
    r = raw_client.post("/api/auth/change-password", headers=headers,
                        json={"old_password": "sai-roi", "new_password": "newpass2"})
    assert r.status_code == 400
    # Đổi đúng
    r = raw_client.post("/api/auth/change-password", headers=headers,
                        json={"old_password": "oldpass1", "new_password": "newpass2"})
    assert r.status_code == 200 and r.json()["ok"] is True
    # Đăng nhập bằng mật khẩu mới OK, mật khẩu cũ bị 401
    login_headers(raw_client, "0907777771", "newpass2")
    r = raw_client.post("/api/auth/login",
                        json={"phone": "0907777771", "password": "oldpass1"})
    assert r.status_code == 401
    # Dọn dẹp
    assert client.delete("/api/accounts/" + acc["id"]).status_code == 200


def test_staff_cannot_manage_accounts(client, staff_client):
    # Staff đọc danh sách tài khoản được (chỉ cần đăng nhập)
    assert staff_client.get("/api/accounts").status_code == 200
    # Nhưng tạo / sửa / xóa / đặt lại mật khẩu -> 403
    r = staff_client.post("/api/accounts", json={"name": "Lẻ", "phone": "0907777772"})
    assert r.status_code == 403
    acc = _make_account(client, "0907777773", "abc12345")
    r = staff_client.put("/api/accounts/" + acc["id"], json={"name": "Đổi tên"})
    assert r.status_code == 403
    r = staff_client.delete("/api/accounts/" + acc["id"])
    assert r.status_code == 403
    r = staff_client.post("/api/accounts/%s/reset-password" % acc["id"],
                          json={"new_password": "hackpass1"})
    assert r.status_code == 403
    assert client.delete("/api/accounts/" + acc["id"]).status_code == 200


def test_admin_reset_password(client, raw_client):
    acc = _make_account(client, "0907777774", "firstpass1")
    r = client.post("/api/accounts/%s/reset-password" % acc["id"],
                    json={"new_password": "secondpass2"})
    assert r.status_code == 200 and r.json()["ok"] is True
    # Staff đăng nhập bằng mật khẩu mới OK, mật khẩu cũ 401
    login_headers(raw_client, "0907777774", "secondpass2")
    r = raw_client.post("/api/auth/login",
                        json={"phone": "0907777774", "password": "firstpass1"})
    assert r.status_code == 401
    assert client.delete("/api/accounts/" + acc["id"]).status_code == 200


def test_staff_login_and_business_api(staff_client):
    # Staff đăng nhập rồi vẫn dùng được API nghiệp vụ thông thường
    assert staff_client.get("/api/dashboard").status_code == 200
    assert staff_client.get("/api/houses").status_code == 200
