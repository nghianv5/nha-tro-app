"""Router CRUD generic: sinh đủ GET list/one, POST, PUT, DELETE cho 1 model.

Filter cơ bản qua query params (chỉ áp dụng khi model có thuộc tính tương ứng):
houseId, roomId, status, kind, type, month, customerId, landlordId.

Tham số bảo mật (tùy chọn):
- dependencies: dependency áp cho TOÀN BỘ router (vd yêu cầu đăng nhập).
- write_dependencies: dependency thêm cho POST/PUT/DELETE (vd chỉ admin).
- create_mapper: hàm biến đổi dict dữ liệu trước khi tạo bản ghi
  (vd accounts: tách 'password' -> băm thành 'passwordHash').
- before_delete: hook chạy TRƯỚC khi xóa bản ghi, trong cùng transaction
  (vd xóa nhà: xóa kèm dữ liệu liên quan để không vi phạm FK trên PostgreSQL).
- before_create(db, data): hook chạy TRƯỚC khi tạo bản ghi, có quyền truy
  cập DB (vd chặn trùng key tự nhiên — xem backend/dupcheck.py). Raise
  HTTPException để hủy thao tác.
- before_update(db, obj, data): hook chạy TRƯỚC khi sửa bản ghi, nhận bản
  ghi cũ và dict field mới (exclude_unset). Raise HTTPException để hủy.
"""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..intrange import check_int32

FILTER_PARAMS = ["houseId", "roomId", "status", "kind", "type", "month",
                 "customerId", "landlordId", "accountId", "positionId"]


def make_crud_router(model, out_schema, create_schema, update_schema, prefix,
                     dependencies=None, write_dependencies=None, create_mapper=None,
                     create_enrich=None, before_delete=None,
                     before_create=None, before_update=None):
    """create_enrich(db, data): hook tùy chọn chạy TRƯỚC khi tạo bản ghi, có
    quyền truy cập DB (vd tự sinh mã HĐ cọc/phiếu thu từ tên phòng)."""
    router = APIRouter(prefix=prefix, tags=[prefix.strip("/")],
                       dependencies=dependencies or [])
    write_deps = write_dependencies or []

    @router.get("", response_model=List[out_schema])
    def list_items(
        db: Session = Depends(get_db),
        houseId: Optional[str] = Query(None),
        roomId: Optional[str] = Query(None),
        status: Optional[str] = Query(None),
        kind: Optional[str] = Query(None),
        type: Optional[str] = Query(None),
        month: Optional[str] = Query(None),
        customerId: Optional[str] = Query(None),
        landlordId: Optional[str] = Query(None),
        accountId: Optional[str] = Query(None),
        positionId: Optional[str] = Query(None),
    ):
        q = db.query(model)
        given = {"houseId": houseId, "roomId": roomId, "status": status,
                 "kind": kind, "type": type, "month": month,
                 "customerId": customerId, "landlordId": landlordId,
                 "accountId": accountId, "positionId": positionId}
        for key, value in given.items():
            if value is not None and hasattr(model, key):
                q = q.filter(getattr(model, key) == value)
        return q.order_by(model.created_at, model.id).all()

    @router.get("/{item_id}", response_model=out_schema)
    def get_item(item_id: str, db: Session = Depends(get_db)):
        obj = db.get(model, item_id)
        if not obj:
            raise HTTPException(404, "Không tìm thấy bản ghi")
        return obj

    @router.post("", response_model=out_schema, status_code=201, dependencies=write_deps)
    def create_item(payload: create_schema, db: Session = Depends(get_db)):
        data = payload.model_dump(exclude_unset=True)
        if create_mapper is not None:
            data = create_mapper(data)
        if create_enrich is not None:
            create_enrich(db, data)
        # Đợt 26: chặn số vượt int32 trước khi ghi (tránh Postgres nổ 500);
        # chạy cho mọi router CRUD nên mọi màn cùng được hưởng.
        check_int32(model.__name__, data)
        if before_create is not None:
            before_create(db, data)
        obj = model(**data)
        db.add(obj)
        db.commit()
        db.refresh(obj)
        return obj

    @router.put("/{item_id}", response_model=out_schema, dependencies=write_deps)
    def update_item(item_id: str, payload: update_schema, db: Session = Depends(get_db)):
        obj = db.get(model, item_id)
        if not obj:
            raise HTTPException(404, "Không tìm thấy bản ghi")
        data = payload.model_dump(exclude_unset=True)
        check_int32(model.__name__, data)
        if before_update is not None:
            before_update(db, obj, data)
        for key, value in data.items():
            setattr(obj, key, value)
        db.commit()
        db.refresh(obj)
        return obj

    @router.delete("/{item_id}", dependencies=write_deps)
    def delete_item(item_id: str, db: Session = Depends(get_db)):
        obj = db.get(model, item_id)
        if not obj:
            raise HTTPException(404, "Không tìm thấy bản ghi")
        if before_delete is not None:
            before_delete(db, obj)
        db.delete(obj)
        db.commit()
        return {"ok": True, "id": item_id}

    return router
