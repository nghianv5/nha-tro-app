"""FastAPI app — Quản lý nhà trọ.

- REST API tại /api/... (toàn bộ yêu cầu đăng nhập JWT, trừ POST /api/auth/login)
- Serve frontend tĩnh (frontend/) tại /
Chạy:  uvicorn backend.main:app --reload --port 8000
"""
import os
import re
from datetime import datetime

from fastapi import Depends, FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles

from . import models, schemas
from .database import SessionLocal, engine, ensure_columns
from .dupcheck import (guard_account_create, guard_account_update,
                       guard_contract_create, guard_contract_update,
                       guard_customer_create, guard_customer_update,
                       guard_house_create, guard_house_update,
                       guard_landlord_create, guard_landlord_update,
                       guard_lc_create, guard_lc_update, guard_room_create,
                       guard_room_update, guard_service_create,
                       guard_service_update, guard_unit_create,
                       guard_unit_update, guard_vehicle_create,
                       guard_vehicle_update)
from .routers import auth, business, upload as upload_router_mod
from .routers.crud import make_crud_router
from .security import get_current_user, hash_password, require_admin
from .seed import ensure_default_admin, seed_db

models.Base.metadata.create_all(bind=engine)
# DB cũ (vd trên Render): tự bổ sung các cột mới của SPEC-WEB, không cần xóa DB
ensure_columns(engine)

# Chuẩn hoá hóa đơn cũ: hóa đơn đã 'paid' trước đây chưa có paidAmount ->
# gán paidAmount = total - discount; đồng bộ lại trạng thái suy ra cho mọi HĐ.
_session = SessionLocal()
try:
    _changed = False
    for _inv in _session.query(models.Invoice).all():
        if _inv.status == "paid" and (_inv.paidAmount or 0) < (_inv.total or 0) - (_inv.discount or 0):
            _inv.paidAmount = max(0, (_inv.total or 0) - (_inv.discount or 0))
            _changed = True
        _derived = business.invoice_status(_inv)
        if _inv.status != _derived:
            _inv.status = _derived
            _changed = True
    if _changed:
        _session.commit()
finally:
    _session.close()

# Khởi động KHÔNG tự nạp dữ liệu mẫu: DB chỉ thay đổi do thao tác của
# người dùng trong app. Chỉ đảm bảo có tài khoản đăng nhập (tạo admin mặc
# định khi bảng accounts trống). Muốn có dữ liệu mẫu: đặt
# SEED_SAMPLE_DATA=true (chỉ nạp khi DB trống) hoặc chạy tay
# `python -m backend.seed`.
_session = SessionLocal()
try:
    if os.environ.get("SEED_SAMPLE_DATA", "").strip().lower() == "true":
        seed_db(_session)
    else:
        ensure_default_admin(_session)
finally:
    _session.close()

app = FastAPI(title="Quản lý nhà trọ", version="1.1.0")
API = "/api"

# Mọi API (trừ đăng nhập) đều yêu cầu JWT hợp lệ
_LOGIN_REQUIRED = [Depends(get_current_user)]
_ADMIN_REQUIRED = [Depends(require_admin)]


def _account_create_mapper(data):
    """Tách 'password' khỏi dữ liệu tạo tài khoản -> băm lưu vào passwordHash."""
    password = data.pop("password", None)
    data["passwordHash"] = hash_password(password) if password else None
    return data


# ----- Tự sinh mã theo format thiết kế (SPEC-WEB mục 2) khi tạo mới -----
def _room_part(db, room_id):
    room = db.get(models.Room, room_id) if room_id else None
    if not room:
        return ""
    digits = re.sub(r"\D", "", room.name or "")
    return digits or re.sub(r"\s+", "", room.name or "")


def _enrich_deposit(db, data):
    if not data.get("code"):
        data["code"] = _room_part(db, data.get("roomId")) + datetime.now().strftime("%Y%m%d%H%M%S")
    if not data.get("rentPrice"):
        room = db.get(models.Room, data.get("roomId"))
        if room:
            data["rentPrice"] = room.price or 0


def _enrich_contract(db, data):
    if not data.get("code"):
        when = data.get("signDate") or datetime.now().date()
        data["code"] = "HD" + _room_part(db, data.get("roomId")) + when.strftime("%Y%m%d")


def _enrich_receipt(db, data):
    if not data.get("code"):
        data["code"] = "T" + _room_part(db, data.get("roomId")) + datetime.now().strftime("%Y%m%d%H%M%S")
    if not data.get("createdDate"):
        data["createdDate"] = datetime.now().date()
    if not data.get("collectDate"):
        data["collectDate"] = data["createdDate"]


def _enrich_expense(db, data):
    if not data.get("code"):
        data["code"] = "CHI" + datetime.now().strftime("%Y%m%d%H%M%S")
    if not data.get("payDate"):
        data["payDate"] = data.get("date")


def _enrich_landlord_contract(db, data):
    if not data.get("code"):
        house = db.get(models.House, data.get("houseId"))
        part = re.sub(r"\D", "", (house.address if house else "") or "")[:10]
        when = data.get("startDate") or datetime.now().date()
        data["code"] = "HD" + part + when.strftime("%Y%m%d")
    # payDay (dùng tính "Ngày TT tiếp theo") đồng bộ từ payFromDay mới (SPEC-WEB-2 A)
    if data.get("payFromDay"):
        data["payDay"] = data["payFromDay"]
    # Đợt 8: có payDate (Thời gian thanh toán — ngày cụ thể) thì payDay suy từ
    # ngày trong tháng của payDate để các hiển thị cũ theo payDay vẫn khớp.
    if data.get("payDate") is not None:
        data["payDay"] = data["payDate"].day


def _enrich_asset(db, data):
    # Mã tài sản tự sinh dạng 8 số: 00000001, 00000002... (SPEC-WEB-2 A)
    if not data.get("code"):
        mx = 0
        for a in db.query(models.Asset).all():
            try:
                mx = max(mx, int(a.code))
            except (TypeError, ValueError):
                continue
        data["code"] = "%08d" % (mx + 1)


def _delete_house_cascade(db, house):
    """Xóa nhà kèm toàn bộ dữ liệu thuộc về nhà đó — sửa lỗi nút Xóa nhà
    (đợt 11): trước đây delete_item chỉ db.delete(house) nên trên PostgreSQL
    commit vi phạm FK houses.id -> 500, nhà vẫn còn, người dùng chỉ thấy
    toast lỗi thoáng qua. Chạy trong cùng transaction với delete_item
    (1 commit duy nhất). Chủ nhà/khách thuê KHÔNG bị xóa (có thể liên quan
    nhiều nhà); chỉ dọn houseIds khỏi hồ sơ tài khoản nếu có."""
    hid = house.id
    room_ids = [r[0] for r in db.query(models.Room.id)
                .filter(models.Room.houseId == hid).all()]
    inv_ids = [i[0] for i in db.query(models.Invoice.id)
               .filter(models.Invoice.houseId == hid).all()]
    # Dòng con của hóa đơn (FK tới invoices.id) + phiếu thu gắn hóa đơn
    if inv_ids:
        db.query(models.InvoiceLine).filter(
            models.InvoiceLine.invoiceId.in_(inv_ids)).delete(synchronize_session=False)
        db.query(models.InvoicePayment).filter(
            models.InvoicePayment.invoiceId.in_(inv_ids)).delete(synchronize_session=False)
        db.query(models.Receipt).filter(
            models.Receipt.invoiceId.in_(inv_ids)).delete(synchronize_session=False)
    # Các bảng con trực tiếp của nhà (FK tới houses.id)
    for model in (models.Invoice, models.Receipt, models.MeterReading,
                  models.LandlordMeterReading, models.Contract, models.Deposit,
                  models.Vehicle, models.Asset, models.Expense, models.Incident,
                  models.LandlordContract, models.HousePayment,
                  models.StaffAssignment, models.HouseUtility):
        db.query(model).filter(model.houseId == hid).delete(synchronize_session=False)
    if room_ids:
        # Các bản ghi chỉ gắn roomId (houseId nullable) cũng thuộc về nhà này
        for model in (models.Receipt, models.Vehicle, models.Asset,
                      models.Expense, models.Incident):
            db.query(model).filter(model.roomId.in_(room_ids)).delete(synchronize_session=False)
    db.query(models.Room).filter(models.Room.houseId == hid).delete(synchronize_session=False)
    for acc in db.query(models.Account).all():
        ids = acc.houseIds or []
        if hid in ids:
            acc.houseIds = [x for x in ids if x != hid]


def _guard_landlord_delete(db, landlord):
    """Chặn xóa chủ nhà còn dữ liệu liên quan (màn Quản lý chủ nhà):
    houses.landlordId, landlordContracts.landlordId và housePayments.landlordId
    đều FK tới landlords.id — xóa bừa sẽ vi phạm FK trên PostgreSQL (bài học
    đợt 11 với nút xóa nhà: 500, bản ghi còn nguyên, người dùng chỉ thấy toast
    lỗi thoáng qua). KHÔNG tự xóa kèm như xóa nhà: chủ nhà/hợp đồng là dữ liệu
    độc lập, người dùng phải tự xử lý liên quan trước rồi xóa lại. Hook này
    chạy trước db.delete trong cùng transaction của delete_item nên raise
    HTTPException sẽ hủy toàn bộ thao tác xóa."""
    n_houses = db.query(models.House).filter(models.House.landlordId == landlord.id).count()
    n_contracts = db.query(models.LandlordContract).filter(models.LandlordContract.landlordId == landlord.id).count()
    n_payments = db.query(models.HousePayment).filter(models.HousePayment.landlordId == landlord.id).count()
    if n_houses or n_contracts or n_payments:
        parts = []
        if n_houses:
            parts.append(f"{n_houses} nhà")
        if n_contracts:
            parts.append(f"{n_contracts} hợp đồng chủ nhà")
        if n_payments:
            parts.append(f"{n_payments} lần thanh toán tiền nhà")
        raise HTTPException(400, f"Không thể xóa chủ nhà {landlord.name} vì còn {' / '.join(parts)} liên quan. Hãy xử lý các liên quan trước rồi xóa lại.")


# ----- Router xác thực (login công khai, còn lại tự bảo vệ trong router) -----
app.include_router(auth.router, prefix=API)

# ----- Router CRUD cho từng module -----
app.include_router(make_crud_router(models.House, schemas.HouseOut, schemas.HouseCreate, schemas.HouseUpdate, API + "/houses", dependencies=_LOGIN_REQUIRED, before_delete=_delete_house_cascade, before_create=guard_house_create, before_update=guard_house_update), prefix="")
app.include_router(make_crud_router(models.Room, schemas.RoomOut, schemas.RoomCreate, schemas.RoomUpdate, API + "/rooms", dependencies=_LOGIN_REQUIRED, before_create=guard_room_create, before_update=guard_room_update), prefix="")
app.include_router(make_crud_router(models.Customer, schemas.CustomerOut, schemas.CustomerCreate, schemas.CustomerUpdate, API + "/customers", dependencies=_LOGIN_REQUIRED, before_create=guard_customer_create, before_update=guard_customer_update), prefix="")
app.include_router(make_crud_router(models.MeterReading, schemas.MeterReadingOut, schemas.MeterReadingCreate, schemas.MeterReadingUpdate, API + "/meter-readings", dependencies=_LOGIN_REQUIRED), prefix="")
app.include_router(make_crud_router(models.Vehicle, schemas.VehicleOut, schemas.VehicleCreate, schemas.VehicleUpdate, API + "/vehicles", dependencies=_LOGIN_REQUIRED, before_create=guard_vehicle_create, before_update=guard_vehicle_update), prefix="")
app.include_router(make_crud_router(models.Asset, schemas.AssetOut, schemas.AssetCreate, schemas.AssetUpdate, API + "/assets", dependencies=_LOGIN_REQUIRED, create_enrich=_enrich_asset), prefix="")
app.include_router(make_crud_router(models.Service, schemas.ServiceOut, schemas.ServiceCreate, schemas.ServiceUpdate, API + "/services", dependencies=_LOGIN_REQUIRED, before_create=guard_service_create, before_update=guard_service_update), prefix="")
app.include_router(make_crud_router(models.Unit, schemas.UnitOut, schemas.UnitCreate, schemas.UnitUpdate, API + "/units", dependencies=_LOGIN_REQUIRED, before_create=guard_unit_create, before_update=guard_unit_update), prefix="")
app.include_router(make_crud_router(models.Expense, schemas.ExpenseOut, schemas.ExpenseCreate, schemas.ExpenseUpdate, API + "/expenses", dependencies=_LOGIN_REQUIRED, create_enrich=_enrich_expense), prefix="")
app.include_router(make_crud_router(models.Incident, schemas.IncidentOut, schemas.IncidentCreate, schemas.IncidentUpdate, API + "/incidents", dependencies=_LOGIN_REQUIRED), prefix="")
app.include_router(make_crud_router(models.Deposit, schemas.DepositOut, schemas.DepositCreate, schemas.DepositUpdate, API + "/deposits", dependencies=_LOGIN_REQUIRED, create_enrich=_enrich_deposit), prefix="")
app.include_router(make_crud_router(models.Contract, schemas.ContractOut, schemas.ContractCreate, schemas.ContractUpdate, API + "/contracts", dependencies=_LOGIN_REQUIRED, create_enrich=_enrich_contract, before_create=guard_contract_create, before_update=guard_contract_update), prefix="")
app.include_router(make_crud_router(models.Landlord, schemas.LandlordOut, schemas.LandlordCreate, schemas.LandlordUpdate, API + "/landlords", dependencies=_LOGIN_REQUIRED, before_delete=_guard_landlord_delete, before_create=guard_landlord_create, before_update=guard_landlord_update), prefix="")
app.include_router(make_crud_router(models.LandlordContract, schemas.LandlordContractOut, schemas.LandlordContractCreate, schemas.LandlordContractUpdate, API + "/landlord-contracts", dependencies=_LOGIN_REQUIRED, create_enrich=_enrich_landlord_contract, before_create=guard_lc_create, before_update=guard_lc_update), prefix="")
app.include_router(make_crud_router(models.HousePayment, schemas.HousePaymentOut, schemas.HousePaymentCreate, schemas.HousePaymentUpdate, API + "/house-payments", dependencies=_LOGIN_REQUIRED), prefix="")
# Module mới theo SPEC-WEB: phiếu thu, chức vụ, phân chức vụ theo nhà, điện nước nhà
app.include_router(make_crud_router(models.Receipt, schemas.ReceiptOut, schemas.ReceiptCreate, schemas.ReceiptUpdate, API + "/receipts", dependencies=_LOGIN_REQUIRED, create_enrich=_enrich_receipt), prefix="")
app.include_router(make_crud_router(models.Position, schemas.PositionOut, schemas.PositionCreate, schemas.PositionUpdate, API + "/positions", dependencies=_LOGIN_REQUIRED), prefix="")
app.include_router(make_crud_router(models.StaffAssignment, schemas.StaffAssignmentOut, schemas.StaffAssignmentCreate, schemas.StaffAssignmentUpdate, API + "/staff-assignments", dependencies=_LOGIN_REQUIRED), prefix="")
app.include_router(make_crud_router(models.HouseUtility, schemas.HouseUtilityOut, schemas.HouseUtilityCreate, schemas.HouseUtilityUpdate, API + "/house-utilities", dependencies=_LOGIN_REQUIRED), prefix="")
# Tài khoản: đọc chỉ cần đăng nhập; tạo/sửa/xóa chỉ admin
app.include_router(make_crud_router(models.Account, schemas.AccountOut, schemas.AccountCreate, schemas.AccountUpdate, API + "/accounts",
                                    dependencies=_LOGIN_REQUIRED, write_dependencies=_ADMIN_REQUIRED,
                                    create_mapper=_account_create_mapper,
                                    before_create=guard_account_create, before_update=guard_account_update), prefix="")

# ----- Router nghiệp vụ (đã tự gắn yêu cầu đăng nhập trong business.py) -----
app.include_router(business.router, prefix=API)
app.include_router(business.inv_router, prefix=API)
app.include_router(business.lm_router, prefix=API)
app.include_router(business.util_router, prefix=API)

# ----- Upload ảnh (đợt 6): POST /api/upload + phục vụ tĩnh /uploads/... -----
app.include_router(upload_router_mod.router, prefix=API)
os.makedirs(upload_router_mod.UPLOAD_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=upload_router_mod.UPLOAD_DIR),
          name="uploads")


@app.get("/api/health", dependencies=_LOGIN_REQUIRED)
def health():
    return {"ok": True, "app": "nha-tro"}


# ----- Serve frontend -----
_FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "..", "frontend")
if os.path.isdir(_FRONTEND_DIR):
    app.mount("/", StaticFiles(directory=_FRONTEND_DIR, html=True), name="frontend")
