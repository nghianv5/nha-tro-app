"""FastAPI app — Quản lý nhà trọ.

- REST API tại /api/... (toàn bộ yêu cầu đăng nhập JWT, trừ POST /api/auth/login)
- Serve frontend tĩnh (frontend/) tại /
Chạy:  uvicorn backend.main:app --reload --port 8000
"""
import os

from fastapi import Depends, FastAPI
from fastapi.staticfiles import StaticFiles

from . import models, schemas
from .database import SessionLocal, engine
from .routers import auth, business
from .routers.crud import make_crud_router
from .security import get_current_user, hash_password, require_admin
from .seed import seed_db

models.Base.metadata.create_all(bind=engine)

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


# ----- Router xác thực (login công khai, còn lại tự bảo vệ trong router) -----
app.include_router(auth.router, prefix=API)

# ----- Router CRUD cho từng module -----
app.include_router(make_crud_router(models.House, schemas.HouseOut, schemas.HouseCreate, schemas.HouseUpdate, API + "/houses", dependencies=_LOGIN_REQUIRED), prefix="")
app.include_router(make_crud_router(models.Room, schemas.RoomOut, schemas.RoomCreate, schemas.RoomUpdate, API + "/rooms", dependencies=_LOGIN_REQUIRED), prefix="")
app.include_router(make_crud_router(models.Customer, schemas.CustomerOut, schemas.CustomerCreate, schemas.CustomerUpdate, API + "/customers", dependencies=_LOGIN_REQUIRED), prefix="")
app.include_router(make_crud_router(models.Contract, schemas.ContractOut, schemas.ContractCreate, schemas.ContractUpdate, API + "/contracts", dependencies=_LOGIN_REQUIRED), prefix="")
app.include_router(make_crud_router(models.MeterReading, schemas.MeterReadingOut, schemas.MeterReadingCreate, schemas.MeterReadingUpdate, API + "/meter-readings", dependencies=_LOGIN_REQUIRED), prefix="")
app.include_router(make_crud_router(models.Vehicle, schemas.VehicleOut, schemas.VehicleCreate, schemas.VehicleUpdate, API + "/vehicles", dependencies=_LOGIN_REQUIRED), prefix="")
app.include_router(make_crud_router(models.Asset, schemas.AssetOut, schemas.AssetCreate, schemas.AssetUpdate, API + "/assets", dependencies=_LOGIN_REQUIRED), prefix="")
app.include_router(make_crud_router(models.Service, schemas.ServiceOut, schemas.ServiceCreate, schemas.ServiceUpdate, API + "/services", dependencies=_LOGIN_REQUIRED), prefix="")
app.include_router(make_crud_router(models.Unit, schemas.UnitOut, schemas.UnitCreate, schemas.UnitUpdate, API + "/units", dependencies=_LOGIN_REQUIRED), prefix="")
app.include_router(make_crud_router(models.Expense, schemas.ExpenseOut, schemas.ExpenseCreate, schemas.ExpenseUpdate, API + "/expenses", dependencies=_LOGIN_REQUIRED), prefix="")
app.include_router(make_crud_router(models.Incident, schemas.IncidentOut, schemas.IncidentCreate, schemas.IncidentUpdate, API + "/incidents", dependencies=_LOGIN_REQUIRED), prefix="")
app.include_router(make_crud_router(models.Deposit, schemas.DepositOut, schemas.DepositCreate, schemas.DepositUpdate, API + "/deposits", dependencies=_LOGIN_REQUIRED), prefix="")
app.include_router(make_crud_router(models.Landlord, schemas.LandlordOut, schemas.LandlordCreate, schemas.LandlordUpdate, API + "/landlords", dependencies=_LOGIN_REQUIRED), prefix="")
app.include_router(make_crud_router(models.LandlordContract, schemas.LandlordContractOut, schemas.LandlordContractCreate, schemas.LandlordContractUpdate, API + "/landlord-contracts", dependencies=_LOGIN_REQUIRED), prefix="")
app.include_router(make_crud_router(models.HousePayment, schemas.HousePaymentOut, schemas.HousePaymentCreate, schemas.HousePaymentUpdate, API + "/house-payments", dependencies=_LOGIN_REQUIRED), prefix="")
# Tài khoản: đọc chỉ cần đăng nhập; tạo/sửa/xóa chỉ admin
app.include_router(make_crud_router(models.Account, schemas.AccountOut, schemas.AccountCreate, schemas.AccountUpdate, API + "/accounts",
                                    dependencies=_LOGIN_REQUIRED, write_dependencies=_ADMIN_REQUIRED,
                                    create_mapper=_account_create_mapper), prefix="")

# ----- Router nghiệp vụ (đã tự gắn yêu cầu đăng nhập trong business.py) -----
app.include_router(business.router, prefix=API)
app.include_router(business.inv_router, prefix=API)
app.include_router(business.lm_router, prefix=API)


@app.get("/api/health", dependencies=_LOGIN_REQUIRED)
def health():
    return {"ok": True, "app": "nha-tro"}


# ----- Serve frontend -----
_FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "..", "frontend")
if os.path.isdir(_FRONTEND_DIR):
    app.mount("/", StaticFiles(directory=_FRONTEND_DIR, html=True), name="frontend")
