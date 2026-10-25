"""Đợt 6 — Upload ảnh (POST /api/upload), trường ảnh của tài sản/chủ nhà/nhà
và file dữ liệu hành chính tĩnh vn-admin.js."""
import base64

from conftest import make_house

# PNG 1x1 trong suốt (bytes thật, đúng chữ ký PNG)
PNG_BYTES = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==")
# GIF 1x1 (bytes thật, đúng chữ ký GIF89a)
GIF_BYTES = base64.b64decode(
    "R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==")


def test_upload_requires_login(raw_client):
    r = raw_client.post("/api/upload",
                        files={"file": ("a.png", PNG_BYTES, "image/png")})
    assert r.status_code == 401, r.text


def test_upload_rejects_non_image(client):
    r = client.post("/api/upload",
                    files={"file": ("a.txt", b"xin chao", "text/plain")})
    assert r.status_code == 400, r.text


def test_upload_rejects_fake_image_content(client):
    # Đuôi .png nhưng nội dung không phải ảnh -> bị chặn bởi magic bytes
    r = client.post("/api/upload",
                    files={"file": ("fake.png", b"day khong phai anh",
                                    "image/png")})
    assert r.status_code == 400, r.text


def test_upload_rejects_oversize(client):
    big = PNG_BYTES + b"\x00" * (5 * 1024 * 1024)
    r = client.post("/api/upload",
                    files={"file": ("big.png", big, "image/png")})
    assert r.status_code == 400, r.text


def test_upload_png_ok_and_url_served(client, raw_client):
    r = client.post("/api/upload",
                    files={"file": ("anh-phong.png", PNG_BYTES, "image/png")})
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["url"].startswith("/uploads/") and data["url"].endswith(".png")
    assert data["size"] == len(PNG_BYTES)
    # URL ảnh truy cập được (tĩnh, không cần token), đúng content-type + bytes
    g = raw_client.get(data["url"])
    assert g.status_code == 200, g.text
    assert g.headers["content-type"].startswith("image/png")
    assert g.content == PNG_BYTES


def test_upload_gif_ok(client):
    r = client.post("/api/upload",
                    files={"file": ("a.gif", GIF_BYTES, "image/gif")})
    assert r.status_code == 200, r.text
    assert r.json()["url"].endswith(".gif")


def test_asset_image_url_roundtrip(client):
    house = make_house(client, "9 Đường Ảnh Tài Sản")
    r = client.post("/api/assets", json={
        "houseId": house["id"], "roomId": None, "owner": "landlord",
        "type": "Điều hòa", "status": "Tốt", "note": "",
        "imageUrl": "/uploads/abc123.png"})
    assert r.status_code == 201, r.text
    asset = r.json()
    assert asset["imageUrl"] == "/uploads/abc123.png"
    # Sửa: thay ảnh khác
    r2 = client.put("/api/assets/" + asset["id"], json={
        "imageUrl": "/uploads/xyz789.jpg"})
    assert r2.status_code == 200, r2.text
    assert r2.json()["imageUrl"] == "/uploads/xyz789.jpg"
    # Bỏ ảnh
    r3 = client.put("/api/assets/" + asset["id"], json={"imageUrl": ""})
    assert r3.status_code == 200, r3.text
    assert r3.json()["imageUrl"] == ""


def test_landlord_id_card_images_roundtrip(client):
    r = client.post("/api/landlords", json={
        "name": "Chủ Nhà Ảnh CMND", "phone": "0901112233",
        "idCardImage1": "/uploads/cmnd-truoc.png",
        "idCardImage2": "/uploads/cmnd-sau.png"})
    assert r.status_code == 201, r.text
    ll = r.json()
    assert ll["idCardImage1"] == "/uploads/cmnd-truoc.png"
    assert ll["idCardImage2"] == "/uploads/cmnd-sau.png"
    g = client.get("/api/landlords/" + ll["id"])
    assert g.status_code == 200
    assert g.json()["idCardImage1"] == "/uploads/cmnd-truoc.png"


def test_house_red_book_images_roundtrip(client):
    r = client.post("/api/houses", json={
        "address": "77 Đường Sổ Đỏ", "province": "Hà Nội",
        "district": "Đống Đa", "ward": "Phương Liên - Trung Tự",
        "floors": 3, "floorArea": 50, "bedrooms": 4, "bathrooms": 2,
        "type": "own",
        "redBookImages": ["/uploads/so-do-1.png", "/uploads/so-do-2.png"]})
    assert r.status_code == 201, r.text
    house = r.json()
    assert house["redBookImages"] == ["/uploads/so-do-1.png",
                                      "/uploads/so-do-2.png"]
    r2 = client.put("/api/houses/" + house["id"], json={
        "redBookImages": ["/uploads/so-do-2.png"]})
    assert r2.status_code == 200, r2.text
    assert r2.json()["redBookImages"] == ["/uploads/so-do-2.png"]


def test_vn_admin_js_served_with_63_provinces(raw_client):
    r = raw_client.get("/vn-admin.js")
    assert r.status_code == 200, r.text
    text = r.text
    assert "VN_ADMIN" in text
    # Dữ liệu đóng gói tĩnh phải có đủ các tỉnh mẫu ở 3 miền
    for name in ["Hà Nội", "Đà Nẵng", "Hồ Chí Minh", "Cần Thơ", "Hải Phòng"]:
        assert name in text, name
