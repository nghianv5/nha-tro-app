"""Upload ảnh (đợt 6) — POST /api/upload (multipart, yêu cầu đăng nhập JWT).

- Chỉ nhận ảnh png/jpg/jpeg/gif/webp, tối đa 5MB; kiểm tra cả chữ ký file
  (magic bytes) chứ không chỉ đuôi file / Content-Type khai báo.
- File lưu vào thư mục uploads/ ở gốc project (đổi bằng biến môi trường
  UPLOAD_DIR), tên file là UUID để tránh trùng/ghi đè, phục vụ tĩnh qua
  mount /uploads/... trong main.py.
- LƯU Ý vận hành: trên Render, đĩa của web service KHÔNG bền vững qua
  lần deploy/rebuild (trừ khi gắn Persistent Disk và trỏ UPLOAD_DIR vào
  đó) — ảnh đã tải có thể mất khi deploy lại.
"""
import os
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from ..security import get_current_user

UPLOAD_DIR = os.environ.get("UPLOAD_DIR") or os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "..", "..", "uploads")
UPLOAD_DIR = os.path.normpath(UPLOAD_DIR)

MAX_UPLOAD_SIZE = 5 * 1024 * 1024  # 5MB
ALLOWED_EXTS = {".png", ".jpg", ".jpeg", ".gif", ".webp"}


def _looks_like_image(data: bytes, ext: str) -> bool:
    """Kiểm tra chữ ký đầu file (magic bytes) theo định dạng khai báo."""
    if ext == ".png":
        return data.startswith(b"\x89PNG\r\n\x1a\n")
    if ext in (".jpg", ".jpeg"):
        return data.startswith(b"\xff\xd8\xff")
    if ext == ".gif":
        return data.startswith(b"GIF87a") or data.startswith(b"GIF89a")
    if ext == ".webp":
        return len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP"
    return False


router = APIRouter(prefix="/upload", tags=["upload"],
                   dependencies=[Depends(get_current_user)])


@router.post("")
async def upload_image(file: UploadFile = File(...)):
    """Nhận 1 file ảnh, lưu vào uploads/, trả về {"url": "/uploads/<file>"}."""
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_EXTS:
        raise HTTPException(
            400, "Chỉ hỗ trợ file ảnh PNG, JPG, JPEG, GIF hoặc WEBP.")
    data = await file.read()
    if not data:
        raise HTTPException(400, "File rỗng, vui lòng chọn file ảnh khác.")
    if len(data) > MAX_UPLOAD_SIZE:
        raise HTTPException(400, "Ảnh quá lớn — tối đa 5MB.")
    if not _looks_like_image(data, ext):
        raise HTTPException(
            400, "Nội dung file không đúng định dạng ảnh khai báo.")
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    name = uuid.uuid4().hex + ext
    with open(os.path.join(UPLOAD_DIR, name), "wb") as fh:
        fh.write(data)
    return {"url": "/uploads/" + name, "filename": name, "size": len(data)}
