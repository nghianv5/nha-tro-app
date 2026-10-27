"""Chặn trùng key tự nhiên khi tạo/sửa (đợt 25).

Nguyên nhân: bấm nút Lưu liên tục (hoặc nhập trùng) tạo ra 2 bản ghi giống
nhau vì trước đây không có lớp kiểm tra nào. Lớp chặn chính nằm ở backend,
qua hook before_create/before_update của router CRUD: trả 400 + thông báo rõ
bản ghi xung đột để frontend hiện qua errToast. Frontend chỉ khóa nút Lưu
trong lúc request đang chạy để bấm đúp không tạo 2 request.

KHÔNG thêm unique constraint ở DB (tránh migration vỡ trên data cũ đã có
trùng) và KHÔNG tự xóa/gộp data trùng đã tồn tại — chỉ chặn phát sinh mới.
Vì vậy quy tắc sửa là: sửa mà key KHÔNG đổi (sau chuẩn hóa) thì luôn được,
kể cả khi DB cũ đã có bản ghi khác trùng key đó; chỉ khi key đổi sang giá
trị của bản ghi khác thì mới chặn.

Chuẩn hóa key trước khi so (so sánh trong Python để không phụ thuộc
collation của SQLite/PostgreSQL, và để so được cả tiếng Việt có dấu):
- text (địa chỉ, tên): trim + gộp khoảng trắng thừa + không phân biệt hoa/thường
- SĐT: bỏ khoảng trắng/gạch ngang/chấm/ngoặc + đổi đầu +84 thành 0
- biển số xe: bỏ khoảng trắng/gạch ngang/chấm + viết hoa
"""
import re

from fastapi import HTTPException

from . import models


def norm_text(v):
    return re.sub(r"\s+", " ", (v or "").strip()).casefold()


def norm_phone(v):
    s = re.sub(r"[\s\-().]", "", (v or "").strip())
    if s.startswith("+84"):
        s = "0" + s[3:]
    return s


def norm_plate(v):
    return re.sub(r"[\s\-.]", "", (v or "").strip()).upper()


def _changed(old, new, norm_fn):
    """Key có đổi thật không (sau chuẩn hóa)? Không đổi -> sửa luôn được."""
    return norm_fn(old) != norm_fn(new)


def _find_dup(db, model, field, norm_fn, raw, exclude_id):
    """Bản ghi đầu tiên có key chuẩn hóa bằng raw (bỏ qua exclude_id).
    Key rỗng không tính là trùng (trường không bắt buộc để trống)."""
    n = norm_fn(raw)
    if not n:
        return None
    for obj in db.query(model).all():
        if exclude_id is not None and obj.id == exclude_id:
            continue
        if norm_fn(getattr(obj, field, None)) == n:
            return obj
    return None


def _guard_unique(db, model, field, norm_fn, raw, exclude_id, msg_fn):
    dup = _find_dup(db, model, field, norm_fn, raw, exclude_id)
    if dup:
        raise HTTPException(400, msg_fn(dup))


# ----- 1. Nhà: địa chỉ nhà làm key (đúng yêu cầu người dùng) -----

def _house_msg(dup):
    return (f"Địa chỉ “{dup.address}” đã tồn tại (nhà “{dup.name or dup.address}”). "
            "Vui lòng mở nhà đó để sửa thay vì thêm nhà mới.")


def guard_house_create(db, data):
    _guard_unique(db, models.House, "address", norm_text, data.get("address"),
                  None, _house_msg)


def guard_house_update(db, obj, data):
    if "address" in data and _changed(obj.address, data["address"], norm_text):
        _guard_unique(db, models.House, "address", norm_text, data["address"],
                      obj.id, _house_msg)


# ----- 2. Chủ nhà: SĐT (cả tạo từ màn quản lý chủ nhà lẫn nhập mới inline
# trong form nhà — đều đi qua cùng API /landlords nên cùng được chặn;
# thông báo hướng dẫn chọn từ danh sách thay vì nhập mới, không tự gộp) -----

def _landlord_msg(dup):
    return (f"SĐT {dup.phone} đã thuộc về chủ nhà “{dup.name}”. "
            "Vui lòng chọn chủ nhà đó từ danh sách thay vì nhập mới.")


def guard_landlord_create(db, data):
    _guard_unique(db, models.Landlord, "phone", norm_phone, data.get("phone"),
                  None, _landlord_msg)


def guard_landlord_update(db, obj, data):
    if "phone" in data and _changed(obj.phone, data["phone"], norm_phone):
        _guard_unique(db, models.Landlord, "phone", norm_phone, data["phone"],
                      obj.id, _landlord_msg)


# ----- 3. Khách thuê: SĐT -----

def _customer_msg(dup):
    return (f"SĐT {dup.phone} đã thuộc về khách thuê “{dup.name}”. "
            "Vui lòng chọn khách đó thay vì nhập mới.")


def guard_customer_create(db, data):
    _guard_unique(db, models.Customer, "phone", norm_phone, data.get("phone"),
                  None, _customer_msg)


def guard_customer_update(db, obj, data):
    if "phone" in data and _changed(obj.phone, data["phone"], norm_phone):
        _guard_unique(db, models.Customer, "phone", norm_phone, data["phone"],
                      obj.id, _customer_msg)


# ----- 4. Phòng: tên phòng trong cùng một nhà (khác nhà trùng tên thì được) -----

def _check_room(db, name, house_id, exclude_id):
    n = norm_text(name)
    if not n or not house_id:
        return
    for r in db.query(models.Room).filter(models.Room.houseId == house_id).all():
        if r.id != exclude_id and norm_text(r.name) == n:
            house = db.get(models.House, house_id)
            hname = (house.name or house.address) if house else house_id
            raise HTTPException(
                400, f"Phòng “{r.name}” đã tồn tại trong nhà “{hname}”. "
                     "Vui lòng đặt tên khác.")


def guard_room_create(db, data):
    _check_room(db, data.get("name"), data.get("houseId"), None)


def guard_room_update(db, obj, data):
    new_name = data.get("name", obj.name)
    new_house = data.get("houseId", obj.houseId)
    if norm_text(new_name) == norm_text(obj.name) and new_house == obj.houseId:
        return  # giữ nguyên tên + nhà -> luôn được
    _check_room(db, new_name, new_house, obj.id)


# ----- 5. Dịch vụ: tên dịch vụ -----

def guard_service_create(db, data):
    _guard_unique(db, models.Service, "name", norm_text, data.get("name"), None,
                  lambda d: f"Tên dịch vụ “{d.name}” đã tồn tại.")


def guard_service_update(db, obj, data):
    if "name" in data and _changed(obj.name, data["name"], norm_text):
        _guard_unique(db, models.Service, "name", norm_text, data["name"],
                      obj.id, lambda d: f"Tên dịch vụ “{d.name}” đã tồn tại.")


# ----- 6. Đơn vị tính: tên đơn vị -----

def guard_unit_create(db, data):
    _guard_unique(db, models.Unit, "name", norm_text, data.get("name"), None,
                  lambda d: f"Đơn vị tính “{d.name}” đã tồn tại.")


def guard_unit_update(db, obj, data):
    if "name" in data and _changed(obj.name, data["name"], norm_text):
        _guard_unique(db, models.Unit, "name", norm_text, data["name"],
                      obj.id, lambda d: f"Đơn vị tính “{d.name}” đã tồn tại.")


# ----- 7. Xe: biển số xe -----

def guard_vehicle_create(db, data):
    _guard_unique(db, models.Vehicle, "plate", norm_plate, data.get("plate"),
                  None, lambda d: f"Biển số xe “{d.plate}” đã tồn tại.")


def guard_vehicle_update(db, obj, data):
    if "plate" in data and _changed(obj.plate, data["plate"], norm_plate):
        _guard_unique(db, models.Vehicle, "plate", norm_plate, data["plate"],
                      obj.id, lambda d: f"Biển số xe “{d.plate}” đã tồn tại.")


# ----- 8. Nhân viên/tài khoản: SĐT (SĐT là tài khoản đăng nhập) -----

def guard_account_create(db, data):
    _guard_unique(db, models.Account, "phone", norm_phone, data.get("phone"),
                  None, lambda d: (f"SĐT {d.phone} đã được dùng cho tài khoản "
                                   f"“{d.name}”. SĐT là tài khoản đăng nhập nên "
                                   "không thể trùng."))


def guard_account_update(db, obj, data):
    if "phone" in data and _changed(obj.phone, data["phone"], norm_phone):
        _guard_unique(db, models.Account, "phone", norm_phone, data["phone"],
                      obj.id, lambda d: (f"SĐT {d.phone} đã được dùng cho tài khoản "
                                         f"“{d.name}”. SĐT là tài khoản đăng nhập "
                                         "nên không thể trùng."))


# ----- 9. Một nhà / một phòng chỉ có một HĐ đang hoạt động -----
# (HĐ đã thanh lý không tính; sửa mà giữ nguyên HĐ đang hoạt động của chính
# nó thì luôn được, kể cả khi DB cũ đã có HĐ đang hoạt động khác trùng.)

def _check_active_lc(db, house_id, exclude_id):
    if not house_id:
        return
    for lc in db.query(models.LandlordContract).filter(
            models.LandlordContract.houseId == house_id,
            models.LandlordContract.status == "active").all():
        if lc.id != exclude_id:
            house = db.get(models.House, house_id)
            hname = (house.name or house.address) if house else house_id
            raise HTTPException(
                400, f"Nhà “{hname}” đã có hợp đồng chủ nhà đang hoạt động "
                     f"(mã {lc.code or '—'}). Hãy thanh lý hợp đồng cũ trước "
                     "khi tạo hợp đồng mới.")


def guard_lc_create(db, data):
    if (data.get("status") or "active") == "active":
        _check_active_lc(db, data.get("houseId"), None)


def guard_lc_update(db, obj, data):
    new_status = data.get("status", obj.status) or "active"
    new_house = data.get("houseId", obj.houseId)
    if obj.status == "active" and new_status == "active" and new_house == obj.houseId:
        return  # giữ nguyên HĐ đang hoạt động của chính nó -> luôn được
    if new_status == "active":
        _check_active_lc(db, new_house, obj.id)


def _check_active_contract(db, room_id, exclude_id):
    if not room_id:
        return
    for ct in db.query(models.Contract).filter(
            models.Contract.roomId == room_id,
            models.Contract.status == "active").all():
        if ct.id != exclude_id:
            room = db.get(models.Room, room_id)
            rname = room.name if room else room_id
            raise HTTPException(
                400, f"Phòng “{rname}” đã có hợp đồng thuê đang hoạt động "
                     f"(mã {ct.code or '—'}). Hãy thanh lý hợp đồng cũ trước "
                     "khi tạo hợp đồng mới.")


def guard_contract_create(db, data):
    if (data.get("status") or "active") == "active":
        _check_active_contract(db, data.get("roomId"), None)


def guard_contract_update(db, obj, data):
    new_status = data.get("status", obj.status) or "active"
    new_room = data.get("roomId", obj.roomId)
    if obj.status == "active" and new_status == "active" and new_room == obj.roomId:
        return  # giữ nguyên HĐ đang hoạt động của chính nó -> luôn được
    if new_status == "active":
        _check_active_contract(db, new_room, obj.id)
