"""Router xác thực: đăng nhập JWT, thông tin người dùng, đổi/đặt lại mật khẩu."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..security import (create_access_token, get_current_user, hash_password,
                        require_admin, verify_password)

router = APIRouter(tags=["auth"])

MIN_PASSWORD_LEN = 6


def _check_new_password(password: str):
    if not password or len(password) < MIN_PASSWORD_LEN:
        raise HTTPException(400, "Mật khẩu mới phải có ít nhất %d ký tự." % MIN_PASSWORD_LEN)


@router.post("/auth/login", response_model=schemas.TokenResponse)
def login(payload: schemas.LoginRequest, db: Session = Depends(get_db)):
    """Đăng nhập bằng số điện thoại + mật khẩu -> JWT + thông tin user."""
    user = (db.query(models.Account)
            .filter(models.Account.phone == (payload.phone or "").strip()).first())
    if user is None or not verify_password(payload.password, user.passwordHash):
        raise HTTPException(401, "Số điện thoại hoặc mật khẩu không đúng. Vui lòng kiểm tra lại.")
    return {
        "access_token": create_access_token(user.id),
        "token_type": "bearer",
        "user": schemas.UserOut.model_validate(user),
    }


@router.get("/auth/me", response_model=schemas.UserOut)
def me(user: models.Account = Depends(get_current_user)):
    """Trả về thông tin tài khoản từ token hiện tại."""
    return user


@router.post("/auth/change-password")
def change_password(payload: schemas.ChangePasswordRequest,
                    user: models.Account = Depends(get_current_user),
                    db: Session = Depends(get_db)):
    """Đổi mật khẩu của chính người đang đăng nhập."""
    if not verify_password(payload.old_password, user.passwordHash):
        raise HTTPException(400, "Mật khẩu cũ không đúng.")
    _check_new_password(payload.new_password)
    user.passwordHash = hash_password(payload.new_password)
    db.commit()
    return {"ok": True, "message": "Đã đổi mật khẩu thành công."}


@router.post("/accounts/{account_id}/reset-password", dependencies=[Depends(require_admin)])
def reset_password(account_id: str, payload: schemas.ResetPasswordRequest,
                   db: Session = Depends(get_db)):
    """Admin đặt lại mật khẩu cho một tài khoản bất kỳ."""
    account = db.get(models.Account, account_id)
    if not account:
        raise HTTPException(404, "Không tìm thấy tài khoản")
    _check_new_password(payload.new_password)
    account.passwordHash = hash_password(payload.new_password)
    db.commit()
    return {"ok": True, "message": "Đã đặt lại mật khẩu cho tài khoản %s." % account.name}
