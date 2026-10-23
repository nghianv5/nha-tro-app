"""Router CRUD generic: sinh đủ GET list/one, POST, PUT, DELETE cho 1 model.

Filter cơ bản qua query params (chỉ áp dụng khi model có thuộc tính tương ứng):
houseId, roomId, status, kind, type, month, customerId, landlordId.

Tham số bảo mật (tùy chọn):
- dependencies: dependency áp cho TOÀN BỘ router (vd yêu cầu đăng nhập).
- write_dependencies: dependency thêm cho POST/PUT/DELETE (vd chỉ admin).
- create_mapper: hàm biến đổi dict dữ liệu trước khi tạo bản ghi
  (vd accounts: tách 'password' -> băm thành 'passwordHash').
"""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db

FILTER_PARAMS = ["houseId", "roomId", "status", "kind", "type", "month",
                 "customerId", "landlordId", "accountId", "positionId"]


def make_crud_router(model, out_schema, create_schema, update_schema, prefix,
                     dependencies=None, write_dependencies=None, create_mapper=None,
                     create_enrich=None):
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
        for key, value in payload.model_dump(exclude_unset=True).items():
            setattr(obj, key, value)
        db.commit()
        db.refresh(obj)
        return obj

    @router.delete("/{item_id}", dependencies=write_deps)
    def delete_item(item_id: str, db: Session = Depends(get_db)):
        obj = db.get(model, item_id)
        if not obj:
            raise HTTPException(404, "Không tìm thấy bản ghi")
        db.delete(obj)
        db.commit()
        return {"ok": True, "id": item_id}

    return router
