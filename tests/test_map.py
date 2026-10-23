"""Đợt 7 — Vị trí trên bản đồ (Leaflet + OpenStreetMap): tọa độ latitude/
longitude của nhà khứ hồi qua API, ensure_columns trên DB cũ, và các file
Leaflet đóng gói tĩnh được phục vụ đúng."""
import os
import sqlite3
import tempfile

from conftest import make_house

LAT, LNG = 21.0175123, 105.8321456  # ~372 Xã Đàn, Đống Đa, Hà Nội


def test_house_latlng_roundtrip(client):
    r = client.post("/api/houses", json={
        "address": "372 Xã Đàn", "province": "Hà Nội", "district": "Đống Đa",
        "ward": "Phương Liên", "floors": 4, "floorArea": 65, "bedrooms": 13,
        "bathrooms": 5, "type": "own", "latitude": LAT, "longitude": LNG})
    assert r.status_code == 201, r.text
    house = r.json()
    assert house["latitude"] == LAT
    assert house["longitude"] == LNG
    # GET lại vẫn đúng tọa độ
    g = client.get("/api/houses/" + house["id"])
    assert g.status_code == 200
    assert g.json()["latitude"] == LAT
    assert g.json()["longitude"] == LNG
    # Sửa: di chuyển ghim -> tọa độ mới
    r2 = client.put("/api/houses/" + house["id"], json={
        "latitude": 21.0205, "longitude": 105.8265})
    assert r2.status_code == 200, r2.text
    assert r2.json()["latitude"] == 21.0205
    assert r2.json()["longitude"] == 105.8265
    # Sửa: xóa tọa độ (gửi null tường minh) -> về None
    r3 = client.put("/api/houses/" + house["id"], json={
        "latitude": None, "longitude": None})
    assert r3.status_code == 200, r3.text
    assert r3.json()["latitude"] is None
    assert r3.json()["longitude"] is None


def test_house_without_coords_has_null(client):
    house = make_house(client, "5 Đường Chưa Có Tọa Độ")
    assert house["latitude"] is None
    assert house["longitude"] is None


def test_ensure_columns_latlng_on_legacy_db():
    from sqlalchemy import create_engine, inspect

    from backend.database import ensure_columns

    tmp = tempfile.mkdtemp(prefix="nhatro-legacy-map-")
    path = os.path.join(tmp, "legacy-map.db")
    con = sqlite3.connect(path)
    # DB cũ: houses chưa có red_book_images / latitude / longitude
    con.execute("CREATE TABLE houses (id VARCHAR PRIMARY KEY, address VARCHAR,"
                " name VARCHAR, created_at DATETIME)")
    con.execute("INSERT INTO houses (id, address, name) VALUES"
                " ('legacy1', '372 Xã Đàn', 'Nhà Xã Đàn')")
    con.commit()
    con.close()

    eng = create_engine("sqlite:///" + path)
    ensure_columns(eng)
    ensure_columns(eng)  # idempotent — chạy lần 2 không lỗi
    insp = inspect(eng)
    cols = {c["name"] for c in insp.get_columns("houses")}
    assert "latitude" in cols
    assert "longitude" in cols
    # Dữ liệu cũ còn nguyên, tọa độ mặc định NULL
    con = sqlite3.connect(path)
    row = con.execute("SELECT address, name, latitude, longitude FROM houses"
                      " WHERE id='legacy1'").fetchone()
    con.close()
    assert row[0] == "372 Xã Đàn" and row[1] == "Nhà Xã Đàn"
    assert row[2] is None and row[3] is None
    eng.dispose()


def test_leaflet_assets_served(raw_client):
    r = raw_client.get("/leaflet/leaflet.js")
    assert r.status_code == 200, r.text
    assert "Leaflet" in r.text
    r = raw_client.get("/leaflet/leaflet.css")
    assert r.status_code == 200, r.text
    assert "leaflet-container" in r.text
    r = raw_client.get("/leaflet/images/marker-icon.png")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("image/png")
    r = raw_client.get("/leaflet/images/marker-shadow.png")
    assert r.status_code == 200
