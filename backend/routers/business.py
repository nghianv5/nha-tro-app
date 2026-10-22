"""Endpoints nghiệp vụ: dashboard, phân tích, hóa đơn, thanh lý, seed."""
from datetime import date, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from .. import calc, models, schemas
from ..database import get_db
from ..security import get_current_user

# Mọi endpoint nghiệp vụ đều yêu cầu đăng nhập (JWT hợp lệ)
_AUTH = [Depends(get_current_user)]

router = APIRouter(tags=["business"], dependencies=_AUTH)


def _today():
    return date.today()


def _month_of(d, fallback=None):
    if d:
        return d.strftime("%Y-%m")
    return fallback


# ================================================================
# Dashboard (màn Home)
# ================================================================
@router.get("/dashboard")
def dashboard(db: Session = Depends(get_db)):
    today = _today()
    cur_month = today.strftime("%Y-%m")
    contracts = db.query(models.Contract).filter(models.Contract.status == "active").all()
    rented_room_ids = {c.roomId for c in contracts}
    deposit_room_ids = {d.roomId for d in db.query(models.Deposit).all()}
    rooms = db.query(models.Room).all()
    empty_rooms = [r for r in rooms if r.id not in rented_room_ids and r.id not in deposit_room_ids]
    unpaid = db.query(models.Invoice).filter(models.Invoice.status == "unpaid").all()
    overdue = [i for i in unpaid if (i.month and i.month < cur_month) or
               (not i.month and i.createdDate and i.createdDate < today.replace(day=1))]
    expiring = [c for c in contracts if c.endDate and today <= c.endDate <= today + timedelta(days=30)]
    readings_this_month = {r.roomId for r in db.query(models.MeterReading).all()
                           if r.type == "dien" and r.date and r.date.strftime("%Y-%m") == cur_month}
    not_metered = [rid for rid in rented_room_ids if rid not in readings_this_month]
    open_incidents = db.query(models.Incident).filter(models.Incident.status != "Đã sửa").count()
    return {
        "upcomingPayments": sum(i.total for i in unpaid),
        "expiringContracts": len(expiring),
        "emptyRooms": len(empty_rooms),
        "deposits": db.query(models.Deposit).count(),
        "openIncidents": open_incidents,
        "unpaidInvoices": len(unpaid),
        "notMeteredRooms": len(not_metered),
        "overdueInvoices": len(overdue),
        "totalRooms": len(rooms),
        "rentedRooms": len(rented_room_ids),
    }


# ================================================================
# Phân tích: thu / chi / lợi nhuận 6 tháng + dòng vốn lũy kế
# ================================================================
@router.get("/analytics/summary")
def analytics(db: Session = Depends(get_db)):
    today = _today()
    months = []
    y, m = today.year, today.month
    for i in range(5, -1, -1):
        mm = m - i
        yy = y
        while mm <= 0:
            mm += 12
            yy -= 1
        months.append("%04d-%02d" % (yy, mm))
    income = {mth: 0 for mth in months}
    for inv in db.query(models.Invoice).filter(models.Invoice.status == "paid").all():
        key = inv.month or _month_of(inv.createdDate)
        if key in income:
            income[key] += inv.total
    expense = {mth: 0 for mth in months}
    for e in db.query(models.Expense).all():
        key = _month_of(e.date)
        if key in expense:
            expense[key] += e.amount
    for p in db.query(models.HousePayment).filter(models.HousePayment.status == "paid").all():
        key = _month_of(p.date)
        if key in expense:
            expense[key] += p.amount
    rows, cumulative = [], 0
    for mth in months:
        profit = income[mth] - expense[mth]
        cumulative += profit
        rows.append({"month": mth, "income": income[mth], "expense": expense[mth],
                     "profit": profit, "cumulative": cumulative})
    return {"months": rows}


# ================================================================
# Hóa đơn — CRUD kèm dòng hóa đơn
# ================================================================
inv_router = APIRouter(prefix="/invoices", tags=["invoices"], dependencies=_AUTH)


def _invoice_out(inv):
    return schemas.InvoiceOut.model_validate(inv)


@inv_router.get("", response_model=List[schemas.InvoiceOut])
def list_invoices(db: Session = Depends(get_db),
                  houseId: Optional[str] = Query(None),
                  roomId: Optional[str] = Query(None),
                  status: Optional[str] = Query(None),
                  kind: Optional[str] = Query(None),
                  month: Optional[str] = Query(None)):
    q = db.query(models.Invoice)
    for key, val in (("houseId", houseId), ("roomId", roomId), ("status", status),
                     ("kind", kind), ("month", month)):
        if val is not None:
            q = q.filter(getattr(models.Invoice, key) == val)
    return q.order_by(models.Invoice.created_at, models.Invoice.id).all()


@inv_router.get("/{invoice_id}", response_model=schemas.InvoiceOut)
def get_invoice(invoice_id: str, db: Session = Depends(get_db)):
    inv = db.get(models.Invoice, invoice_id)
    if not inv:
        raise HTTPException(404, "Không tìm thấy hóa đơn")
    return inv


@inv_router.post("", response_model=schemas.InvoiceOut, status_code=201)
def create_invoice(payload: schemas.InvoiceCreate, db: Session = Depends(get_db)):
    data = payload.model_dump(exclude={"lines"})
    inv = models.Invoice(**data)
    for ln in (payload.lines or []):
        inv.lines.append(models.InvoiceLine(**ln.model_dump()))
    if not inv.total:
        inv.total = (inv.roomFee or 0) + sum(l.amount or 0 for l in inv.lines)
    if inv.createdDate is None:
        inv.createdDate = _today()
    db.add(inv)
    db.commit()
    db.refresh(inv)
    return inv


@inv_router.post("/monthly", response_model=schemas.InvoiceOut, status_code=201)
def create_monthly_invoice(payload: schemas.MonthlyInvoiceRequest, db: Session = Depends(get_db)):
    contract = (db.query(models.Contract)
                .filter(models.Contract.roomId == payload.roomId,
                        models.Contract.status == "active").first())
    if not contract:
        raise HTTPException(404, "Phòng chưa có hợp đồng đang hiệu lực")
    existed = (db.query(models.Invoice)
               .filter(models.Invoice.roomId == payload.roomId,
                       models.Invoice.kind == "monthly",
                       models.Invoice.month == payload.month).first())
    if existed:
        raise HTTPException(409, "Phòng đã có hóa đơn tháng này")

    def reading_pair(rtype, prev_override, curr_override):
        rows = (db.query(models.MeterReading)
                .filter(models.MeterReading.roomId == payload.roomId,
                        models.MeterReading.type == rtype)
                .order_by(models.MeterReading.date, models.MeterReading.created_at).all())
        in_month = [r for r in rows if r.date and r.date.strftime("%Y-%m") == payload.month]
        prev = curr = None
        if in_month:
            curr = in_month[-1].current
            prev = in_month[-1].prev
        elif rows:
            prev = curr = rows[-1].current
        if prev_override is not None:
            prev = prev_override
        if curr_override is not None:
            curr = curr_override
        if prev is None:
            prev = 0
        if curr is None:
            curr = prev
        return (prev, curr)

    readings = {
        "dien": reading_pair("dien", payload.dienPrev, payload.dienCurr),
        "nuoc": reading_pair("nuoc", payload.nuocPrev, payload.nuocCurr),
    }
    lines = calc.build_monthly_lines(contract, readings, people=payload.people)
    inv = models.Invoice(
        kind="monthly", houseId=contract.houseId, roomId=contract.roomId,
        month=payload.month, roomFee=contract.price or 0,
        total=(contract.price or 0) + calc.lines_total(lines),
        status="unpaid", createdDate=_today(),
    )
    for ln in lines:
        inv.lines.append(models.InvoiceLine(**ln))
    db.add(inv)
    db.commit()
    db.refresh(inv)
    return inv


@inv_router.put("/{invoice_id}", response_model=schemas.InvoiceOut)
def update_invoice(invoice_id: str, payload: schemas.InvoiceUpdate, db: Session = Depends(get_db)):
    inv = db.get(models.Invoice, invoice_id)
    if not inv:
        raise HTTPException(404, "Không tìm thấy hóa đơn")
    data = payload.model_dump(exclude_unset=True, exclude={"lines"})
    for key, value in data.items():
        setattr(inv, key, value)
    if payload.lines is not None:
        inv.lines.clear()
        db.flush()
        for ln in payload.lines:
            inv.lines.append(models.InvoiceLine(**ln.model_dump()))
        inv.total = (inv.roomFee or 0) + sum(l.amount or 0 for l in inv.lines)
    db.commit()
    db.refresh(inv)
    return inv


@inv_router.delete("/{invoice_id}")
def delete_invoice(invoice_id: str, db: Session = Depends(get_db)):
    inv = db.get(models.Invoice, invoice_id)
    if not inv:
        raise HTTPException(404, "Không tìm thấy hóa đơn")
    db.delete(inv)
    db.commit()
    return {"ok": True, "id": invoice_id}


# ================================================================
# Thanh lý hợp đồng
# ================================================================
@router.post("/contracts/{contract_id}/liquidate")
def liquidate(contract_id: str, payload: schemas.LiquidateRequest, db: Session = Depends(get_db)):
    contract = db.get(models.Contract, contract_id)
    if not contract:
        raise HTTPException(404, "Không tìm thấy hợp đồng")
    if payload.confirm and contract.status != "active":
        raise HTTPException(400, "Hợp đồng đã thanh lý")

    def last_reading(rtype):
        rows = (db.query(models.MeterReading)
                .filter(models.MeterReading.roomId == contract.roomId,
                        models.MeterReading.type == rtype)
                .order_by(models.MeterReading.date, models.MeterReading.created_at).all())
        return rows[-1].current if rows else None

    summary = calc.calc_liquidation(
        contract, payload.dienFinal, payload.nuocFinal, payload.liquidateDate,
        payload.refundRoomFee, payload.prepaidRoomFee,
        last_reading("dien"), last_reading("nuoc"))
    summary["liquidateDate"] = payload.liquidateDate.isoformat()

    if payload.confirm:
        # Lưu chỉ số cuối vào lịch sử chốt
        for rtype, final in (("dien", payload.dienFinal), ("nuoc", payload.nuocFinal)):
            if final is not None:
                db.add(models.MeterReading(
                    houseId=contract.houseId, roomId=contract.roomId, type=rtype,
                    prev=last_reading(rtype) or 0, current=final,
                    date=payload.liquidateDate, note="Chốt thanh lý hợp đồng"))
        contract.status = "liquidated"
        if summary["net"] > 0:
            # Phiếu thu: tạo hóa đơn khác để thu thêm của khách
            inv = models.Invoice(
                kind="other", houseId=contract.houseId, roomId=contract.roomId,
                month=None, roomFee=0, total=summary["net"], status="unpaid",
                createdDate=payload.liquidateDate, reason="Thanh lý hợp đồng")
            inv.lines.append(models.InvoiceLine(
                label="Tiền phòng (thanh lý)", unitPrice=contract.price or 0,
                unit="tháng", qty=summary["days"], amount=summary["roomOwed"]))
            for ln in summary["lines"]:
                inv.lines.append(models.InvoiceLine(**ln))
            inv.lines.append(models.InvoiceLine(
                label="Trừ cọc + tiền phòng thừa", unitPrice=0, unit="",
                qty=1, amount=-summary["returnTotal"]))
            db.add(inv)
            db.flush()
            summary["invoiceId"] = inv.id
        elif summary["net"] < 0:
            # Phiếu chi: hoàn trả khách
            exp = models.Expense(
                houseId=contract.houseId, title="Thanh lý hợp đồng — hoàn trả khách",
                amount=-summary["net"], date=payload.liquidateDate,
                note="Hoàn cọc/phòng thừa khi thanh lý")
            db.add(exp)
            db.flush()
            summary["expenseId"] = exp.id
        db.commit()
    return summary


# ================================================================
# Chốt điện nước chủ nhà (tự tính tổng)
# ================================================================
lm_router = APIRouter(prefix="/landlord-meter-readings", tags=["landlord-meter-readings"], dependencies=_AUTH)


@lm_router.get("", response_model=List[schemas.LandlordMeterOut])
def list_landlord_meter(db: Session = Depends(get_db), houseId: Optional[str] = Query(None)):
    q = db.query(models.LandlordMeterReading)
    if houseId:
        q = q.filter(models.LandlordMeterReading.houseId == houseId)
    return q.order_by(models.LandlordMeterReading.created_at, models.LandlordMeterReading.id).all()


@lm_router.post("", response_model=schemas.LandlordMeterOut, status_code=201)
def create_landlord_meter(payload: schemas.LandlordMeterCreate, db: Session = Depends(get_db)):
    data = payload.model_dump()
    obj = models.LandlordMeterReading(**data)
    obj.total = (obj.dien or 0) + (obj.nuoc or 0) + (obj.internet or 0) + (obj.vesinh or 0)
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@lm_router.put("/{item_id}", response_model=schemas.LandlordMeterOut)
def update_landlord_meter(item_id: str, payload: schemas.LandlordMeterUpdate, db: Session = Depends(get_db)):
    obj = db.get(models.LandlordMeterReading, item_id)
    if not obj:
        raise HTTPException(404, "Không tìm thấy bản ghi")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(obj, key, value)
    obj.total = (obj.dien or 0) + (obj.nuoc or 0) + (obj.internet or 0) + (obj.vesinh or 0)
    db.commit()
    db.refresh(obj)
    return obj


@lm_router.delete("/{item_id}")
def delete_landlord_meter(item_id: str, db: Session = Depends(get_db)):
    obj = db.get(models.LandlordMeterReading, item_id)
    if not obj:
        raise HTTPException(404, "Không tìm thấy bản ghi")
    db.delete(obj)
    db.commit()
    return {"ok": True, "id": item_id}


# ================================================================
# Nạp / nạp lại dữ liệu mẫu
# ================================================================
@router.post("/seed")
def reseed(db: Session = Depends(get_db)):
    from ..seed import seed_db
    seed_db(db, force=True)
    return {"ok": True}
