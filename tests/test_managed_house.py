"""Test "Quản lý thay chủ" ở form nhà: cờ managedForOwner lưu/đọc lại đúng
qua API và ensure_columns thêm cột managed_for_owner cho DB cũ."""
import os
import sqlite3
import tempfile

from conftest import make_house


def test_house_managed_for_owner_roundtrip(client):
    # Tạo nhà với cờ bật -> đọc lại đúng True
    house = make_house(client, "77 Đường Quản Lý")
    r = client.put(f"/api/houses/{house['id']}", json={"managedForOwner": True})
    assert r.status_code == 200, r.text
    assert r.json()["managedForOwner"] is True

    got = client.get(f"/api/houses/{house['id']}").json()
    assert got["managedForOwner"] is True

    # Tắt cờ -> đọc lại đúng False (bỏ chọn trở về hành vi cũ)
    r = client.put(f"/api/houses/{house['id']}", json={"managedForOwner": False})
    assert r.status_code == 200, r.text
    assert r.json()["managedForOwner"] is False

    # Nhà tạo mới không gửi cờ -> mặc định False
    house2 = make_house(client, "78 Đường Thường")
    got2 = client.get(f"/api/houses/{house2['id']}").json()
    assert got2["managedForOwner"] is False


def test_ensure_columns_managed_for_owner_on_legacy_db():
    from sqlalchemy import create_engine, inspect

    from backend.database import ensure_columns

    tmp = tempfile.mkdtemp(prefix="nhatro-legacy-managed-")
    path = os.path.join(tmp, "legacy-managed.db")
    con = sqlite3.connect(path)
    con.execute("CREATE TABLE houses (id VARCHAR PRIMARY KEY, created_at DATETIME)")
    con.commit()
    con.close()

    eng = create_engine("sqlite:///" + path)
    ensure_columns(eng)
    ensure_columns(eng)  # idempotent
    insp = inspect(eng)
    cols = {c["name"] for c in insp.get_columns("houses")}
    assert "managed_for_owner" in cols
    eng.dispose()
