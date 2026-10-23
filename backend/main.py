"""FastAPI app — Quản lý nhà trọ.

- REST API tại /api/... (toàn bộ yêu cầu đăng nhập JWT, trừ POST /api/auth/login)
- Serve frontend tĩnh (frontend/) tại /
Chạy:  uvicorn backend.main:app --reload --port 8000
"""
import os
import re
from datetime import datetime

from fastapi import Depends, FastAPI
from fastapi.staticfiles import StaticFiles

from . import models, schemas
from .database import SessionLocal, engine, ensure_columns
from .routers import auth, business
from .routers.crud import make_crud_router
from .security import get_current_user, hash_password, require_admin
from .seed import seed_db

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

# Tự nạp dữ liệu mẫu khi DB trống (lần chạy đầu)
_session = SessionLocal()
try:
    seed_db(_session)
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


# ----- Router xác thực (login công khai, còn lại tự bảo vệ trong router) -----
app.include_router(auth.router, prefix=API)

# ----- Router CRUD cho từng module -----
app.include_router(make_crud_router(models.House, schemas.HouseOut, schemas.HouseCreate, schemas.HouseUpdate, API + "/houses", dependencies=_LOGIN_REQUIRED), prefix="")
app.include_router(make_crud_router(models.Room, schemas.RoomOut, schemas.RoomCreate, schemas.RoomUpdate, API + "/rooms", dependencies=_LOGIN_REQUIRED), prefix="")
app.include_router(make_crud_router(models.Customer, schemas.CustomerOut, schemas.CustomerCreate, schemas.CustomerUpdate, API + "/customers", dependencies=_LOGIN_REQUIRED), prefix="")
app.include_router(make_crud_router(models.MeterReading, schemas.MeterReadingOut, schemas.MeterReadingCreate, schemas.MeterReadingUpdate, API + "/meter-readings", dependencies=_LOGIN_REQUIRED), prefix="")
app.include_router(make_crud_router(models.Vehicle, schemas.VehicleOut, schemas.VehicleCreate, schemas.VehicleUpdate, API + "/vehicles", dependencies=_LOGIN_REQUIRED), prefix="")
app.include_router(make_crud_router(models.Asset, schemas.AssetOut, schemas.AssetCreate, schemas.AssetUpdate, API + "/assets", dependencies=_LOGIN_REQUIRED), prefix="")
app.include_router(make_crud_router(models.Service, schemas.ServiceOut, schemas.ServiceCreate, schemas.ServiceUpdate, API + "/services", dependencies=_LOGIN_REQUIRED), prefix="")
app.include_router(make_crud_router(models.Unit, schemas.UnitOut, schemas.UnitCreate, schemas.UnitUpdate, API + "/units", dependencies=_LOGIN_REQUIRED), prefix="")
app.include_router(make_crud_router(models.Expense, schemas.ExpenseOut, schemas.ExpenseCreate, schemas.ExpenseUpdate, API + "/expenses", dependencies=_LOGIN_REQUIRED, create_enrich=_enrich_expense), prefix="")
app.include_router(make_crud_router(models.Incident, schemas.IncidentOut, schemas.IncidentCreate, schemas.IncidentUpdate, API + "/incidents", dependencies=_LOGIN_REQUIRED), prefix="")
app.include_router(make_crud_router(models.Deposit, schemas.DepositOut, schemas.DepositCreate, schemas.DepositUpdate, API + "/deposits", dependencies=_LOGIN_REQUIRED, create_enrich=_enrich_deposit), prefix="")
app.include_router(make_crud_router(models.Contract, schemas.ContractOut, schemas.ContractCreate, schemas.ContractUpdate, API + "/contracts", dependencies=_LOGIN_REQUIRED, create_enrich=_enrich_contract), prefix="")
app.include_router(make_crud_router(models.Landlord, schemas.LandlordOut, schemas.LandlordCreate, schemas.LandlordUpdate, API + "/landlords", dependencies=_LOGIN_REQUIRED), prefix="")
app.include_router(make_crud_router(models.LandlordContract, schemas.LandlordContractOut, schemas.LandlordContractCreate, schemas.LandlordContractUpdate, API + "/landlord-contracts", dependencies=_LOGIN_REQUIRED, create_enrich=_enrich_landlord_contract), prefix="")
app.include_router(make_crud_router(models.HousePayment, schemas.HousePaymentOut, schemas.HousePaymentCreate, schemas.HousePaymentUpdate, API + "/house-payments", dependencies=_LOGIN_REQUIRED), prefix="")
# Module mới theo SPEC-WEB: phiếu thu, chức vụ, phân chức vụ theo nhà, điện nước nhà
app.include_router(make_crud_router(models.Receipt, schemas.ReceiptOut, schemas.ReceiptCreate, schemas.ReceiptUpdate, API + "/receipts", dependencies=_LOGIN_REQUIRED, create_enrich=_enrich_receipt), prefix="")
app.include_router(make_crud_router(models.Position, schemas.PositionOut, schemas.PositionCreate, schemas.PositionUpdate, API + "/positions", dependencies=_LOGIN_REQUIRED), prefix="")
app.include_router(make_crud_router(models.StaffAssignment, schemas.StaffAssignmentOut, schemas.StaffAssignmentCreate, schemas.StaffAssignmentUpdate, API + "/staff-assignments", dependencies=_LOGIN_REQUIRED), prefix="")
app.include_router(make_crud_router(models.HouseUtility, schemas.HouseUtilityOut, schemas.HouseUtilityCreate, schemas.HouseUtilityUpdate, API + "/house-utilities", dependencies=_LOGIN_REQUIRED), prefix="")
# Tài khoản: đọc chỉ cần đăng nhập; tạo/sửa/xóa chỉ admin
app.include_router(make_crud_router(models.Account, schemas.AccountOut, schemas.AccountCreate, schemas.AccountUpdate, API + "/accounts",
                                    dependencies=_LOGIN_REQUIRED, write_dependencies=_ADMIN_REQUIRED,
                                    create_mapper=_account_create_mapper), prefix="")

# ----- Router nghiệp vụ (đã tự gắn yêu cầu đăng nhập trong business.py) -----
app.include_router(business.router, prefix=API)
app.include_router(business.inv_router, prefix=API)
app.include_router(business.lm_router, prefix=API)
app.include_router(business.util_router, prefix=API)


@app.get("/api/health", dependencies=_LOGIN_REQUIRED)
def health():
    return {"ok": True, "app": "nha-tro"}


# ----- Serve frontend -----
_FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "..", "frontend")
if os.path.isdir(_FRONTEND_DIR):
    app.mount("/", StaticFiles(directory=_FRONTEND_DIR, html=True), name="frontend")
