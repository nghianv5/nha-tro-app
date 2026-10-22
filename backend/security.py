"""Bảo mật: băm mật khẩu (bcrypt qua passlib), JWT (python-jose) và
các dependency FastAPI để bảo vệ API.

Biến môi trường:
- SECRET_KEY: khóa ký JWT (MẶC ĐỊNH CHỈ DÙNG DEV — phải đổi khi chạy thật).
- ACCESS_TOKEN_EXPIRE_DAYS: số ngày hết hạn token (mặc định 7).
"""
import os
from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from . import models
from .database import get_db

SECRET_KEY = os.getenv("SECRET_KEY", "nhatro-dev-secret-key-hay-doi-khi-chay-that")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_DAYS = int(os.getenv("ACCESS_TOKEN_EXPIRE_DAYS", "7"))

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

_bearer = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    """Băm mật khẩu bằng bcrypt."""
    return pwd_context.hash(password or "")


def verify_password(plain: str, hashed) -> bool:
    """Kiểm tra mật khẩu so với chuỗi băm đã lưu."""
    if not hashed:
        return False
    try:
        return pwd_context.verify(plain or "", hashed)
    except (ValueError, TypeError):
        return False


def create_access_token(account_id: str) -> str:
    """Tạo JWT chứa sub = id tài khoản, hết hạn sau ACCESS_TOKEN_EXPIRE_DAYS ngày."""
    expire = datetime.now(timezone.utc) + timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS)
    return jwt.encode({"sub": str(account_id), "exp": expire}, SECRET_KEY, algorithm=ALGORITHM)


def _decode_account_id(token: str):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload.get("sub")
    except JWTError:
        return None


def get_current_user(
    creds: HTTPAuthorizationCredentials = Depends(_bearer),
    db: Session = Depends(get_db),
) -> models.Account:
    """Dependency: yêu cầu JWT hợp lệ, trả về tài khoản đang đăng nhập."""
    if creds is None or not creds.credentials:
        raise HTTPException(401, "Chưa đăng nhập. Vui lòng đăng nhập để tiếp tục.")
    account_id = _decode_account_id(creds.credentials)
    user = db.get(models.Account, account_id) if account_id else None
    if user is None:
        raise HTTPException(401, "Phiên đăng nhập đã hết hạn hoặc không hợp lệ. Vui lòng đăng nhập lại.")
    return user


def require_admin(user: models.Account = Depends(get_current_user)) -> models.Account:
    """Dependency: chỉ tài khoản role 'admin' mới được gọi."""
    if user.role != "admin":
        raise HTTPException(403, "Chỉ quản trị viên (admin) mới có quyền thực hiện thao tác này.")
    return user
