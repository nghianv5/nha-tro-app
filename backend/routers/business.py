"""Endpoints nghiệp vụ: dashboard, phân tích, hóa đơn, thanh lý."""
import re
from datetime import date, datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query
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
# Hóa đơn: trạng thái SUY RA + sinh mã (SPEC-WEB mục 2)
# ================================================================
def invoice_remaining(inv):
    """Số tiền còn lại = total − discount − paidAmount."""
    return (inv.total or 0) - (inv.discount or 0) - (inv.paidAmount or 0)


def invoice_status(inv):
    """Trạng thái suy ra: paid (Thanh toán hết) | partial (Thanh toán thiếu)
    | unpaid (Chưa thanh toán)."""
    if invoice_remaining(inv) <= 0:
        return "paid"
    if (inv.paidAmount or 0) > 0:
        return "partial"
    return "unpaid"


def sync_invoice_status(inv):
    """Đồng bộ cột status lưu trong DB theo trạng thái suy ra."""
    inv.status = invoice_status(inv)
    return inv


def _room_code_part(db, room_id):
    """Phần mã phòng từ tên phòng: 'Phòng 101' -> '101'; không có số thì
    lấy tên viết liền bỏ dấu cách."""
    room = db.get(models.Room, room_id) if room_id else None
    if not room:
        return ""
    digits = re.sub(r"\D", "", room.name or "")
    return digits or re.sub(r"\s+", "", room.name or "")


def gen_invoice_code(db, room_id, when=None):
    """Mã hóa đơn: tên phòng + YYYYMMDDHHmmss."""
    when = when or datetime.now()
    return _room_code_part(db, room_id) + when.strftime("%Y%m%d%H%M%S")


def gen_receipt_code(db, room_id, when=None):
    """Mã phiếu thu: 'T' + mã phòng + YYYYMMDDHHmmss."""
    when = when or datetime.now()
    return "T" + _room_code_part(db, room_id) + when.strftime("%Y%m%d%H%M%S")


def gen_expense_code(when=None):
    """Mã phiếu chi: 'CHI' + YYYYMMDDHHmmss."""
    when = when or datetime.now()
    return "CHI" + when.strftime("%Y%m%d%H%M%S")


def _active_contract_for_room(db, room_id):
    if not room_id:
        return None
    return (db.query(models.Contract)
            .filter(models.Contract.roomId == room_id,
                    models.Contract.status == "active").first())


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
    all_invoices = db.query(models.Invoice).all()
    unpaid = [i for i in all_invoices if invoice_status(i) != "paid"]
    overdue = [i for i in unpaid if (i.month and i.month < cur_month) or
               (not i.month and i.createdDate and i.createdDate < today.replace(day=1))]
    expiring = [c for c in contracts if c.endDate and today <= c.endDate <= today + timedelta(days=30)]
    readings_this_month = {r.roomId for r in db.query(models.MeterReading).all()
                           if r.type == "dien" and r.date and r.date.strftime("%Y-%m") == cur_month}
    not_metered = [rid for rid in rented_room_ids if rid not in readings_this_month]
    open_incidents = db.query(models.Incident).filter(models.Incident.status != "Đã sửa").count()
    return {
        "upcomingPayments": sum(invoice_remaining(i) for i in unpaid),
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
    # Thu theo tháng = tổng PHIẾU THU theo ngày thu (SPEC-WEB mục 3.7)
    income = {mth: 0 for mth in months}
    for rc in db.query(models.Receipt).all():
        key = _month_of(rc.collectDate) or _month_of(rc.createdDate)
        if key in income:
            income[key] += rc.amount or 0
    # Chi = phiếu chi (theo ngày chi, thiếu thì ngày tạo) + tiền nhà đã trả
    expense = {mth: 0 for mth in months}
    for e in db.query(models.Expense).all():
        key = _month_of(e.payDate) or _month_of(e.date)
        if key in expense:
            expense[key] += e.amount or 0
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
    want_paid = data.pop("status", None) == "paid"
    inv = models.Invoice(**data)
    for ln in (payload.lines or []):
        inv.lines.append(models.InvoiceLine(**ln.model_dump()))
    if not inv.total:
        inv.total = (inv.roomFee or 0) + sum(l.amount or 0 for l in inv.lines)
    if inv.createdDate is None:
        inv.createdDate = _today()
    if not inv.code:
        inv.code = gen_invoice_code(db, inv.roomId)
    if want_paid:  # tương thích ngược: tạo thẳng hóa đơn đã thanh toán hết
        inv.paidAmount = max(0, (inv.total or 0) - (inv.discount or 0))
    sync_invoice_status(inv)
    db.add(inv)
    db.commit()
    db.refresh(inv)
    return inv


@inv_router.post("/monthly", response_model=schemas.InvoiceOut, status_code=201)
def create_monthly_invoice(payload: schemas.MonthlyInvoiceRequest, db: Session = Depends(get_db)):
    return _create_monthly_invoice(db, payload.roomId, payload.month,
                                   people=payload.people,
                                   dien=(payload.dienPrev, payload.dienCurr),
                                   nuoc=(payload.nuocPrev, payload.nuocCurr))


def _create_monthly_invoice(db, room_id, month, people=None, dien=(None, None), nuoc=(None, None)):
    """Logic tạo hóa đơn tháng dùng chung cho endpoint đơn + batch.
    Ném HTTPException 404 (chưa có HĐ active) / 409 (đã có hóa đơn tháng)."""
    contract = (db.query(models.Contract)
                .filter(models.Contract.roomId == room_id,
                        models.Contract.status == "active").first())
    if not contract:
        raise HTTPException(404, "Phòng chưa có hợp đồng đang hiệu lực")
    existed = (db.query(models.Invoice)
               .filter(models.Invoice.roomId == room_id,
                       models.Invoice.kind == "monthly",
                       models.Invoice.month == month).first())
    if existed:
        raise HTTPException(409, "Đã có hóa đơn tháng")

    def reading_pair(rtype, prev_override, curr_override):
        rows = (db.query(models.MeterReading)
                .filter(models.MeterReading.roomId == room_id,
                        models.MeterReading.type == rtype)
                .order_by(models.MeterReading.date, models.MeterReading.created_at).all())
        in_month = [r for r in rows if r.date and r.date.strftime("%Y-%m") == month]
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
        "dien": reading_pair("dien", dien[0], dien[1]),
        "nuoc": reading_pair("nuoc", nuoc[0], nuoc[1]),
    }
    lines = calc.build_monthly_lines(contract, readings, people=people)
    inv = models.Invoice(
        kind="monthly", houseId=contract.houseId, roomId=contract.roomId,
        month=month, roomFee=contract.price or 0,
        total=(contract.price or 0) + calc.lines_total(lines),
        status="unpaid", createdDate=_today(),
        code=gen_invoice_code(db, contract.roomId),
    )
    for ln in lines:
        inv.lines.append(models.InvoiceLine(**ln))
    db.add(inv)
    db.commit()
    db.refresh(inv)
    return inv


# ================================================================
# Tạo hóa đơn tháng HÀNG LOẠT + đánh dấu ĐÃ GỬI (SPEC-WEB-2 F)
# ================================================================
@inv_router.post("/monthly-batch")
def create_monthly_batch(payload: schemas.MonthlyBatchRequest, db: Session = Depends(get_db)):
    """Tạo hóa đơn tháng cho MỌI phòng có HĐ active. Trả kết quả TỪNG phòng:
    {roomId, ok, invoiceId} hoặc {roomId, ok: false, error} — lỗi cụ thể như
    "Đã có hóa đơn tháng", "Chưa chốt số điện tháng này".
    Đợt 5: nếu payload có toMonth thì chạy cho CẢ KHOẢNG month..toMonth;
    mỗi kết quả kèm thêm trường "month" của tháng tương ứng."""
    months = [payload.month]
    if payload.toMonth and payload.toMonth != payload.month:
        months = []
        y, m = int(payload.month[:4]), int(payload.month[5:7])
        ey, em = int(payload.toMonth[:4]), int(payload.toMonth[5:7])
        if (ey, em) < (y, m):
            raise HTTPException(400, "Tháng kết thúc phải >= tháng bắt đầu")
        while (y, m) <= (ey, em):
            months.append("%04d-%02d" % (y, m))
            m += 1
            if m > 12:
                m, y = 1, y + 1
            if len(months) > 12:
                raise HTTPException(400, "Khoảng tháng tối đa 12 tháng")
    room_ids = []
    for c in (db.query(models.Contract)
              .filter(models.Contract.status == "active")
              .order_by(models.Contract.created_at, models.Contract.id).all()):
        if c.roomId not in room_ids:
            room_ids.append(c.roomId)
    results = []
    for month in months:
        for room_id in room_ids:
            existed = (db.query(models.Invoice)
                       .filter(models.Invoice.roomId == room_id,
                               models.Invoice.kind == "monthly",
                               models.Invoice.month == month).first())
            if existed:
                results.append({"roomId": room_id, "month": month, "ok": False, "error": "Đã có hóa đơn tháng"})
                continue
            contract = _active_contract_for_room(db, room_id)
            # Điện tính theo số mà tháng này chưa chốt số điện -> báo lỗi riêng
            dien_cfg = ((contract.services or {}).get("dien") or {}) if contract else {}
            if contract and dien_cfg.get("price") and dien_cfg.get("unit", "so") == "so":
                has_reading = any(
                    r.date and r.date.strftime("%Y-%m") == month
                    for r in db.query(models.MeterReading)
                    .filter(models.MeterReading.roomId == room_id,
                            models.MeterReading.type == "dien").all())
                if not has_reading:
                    results.append({"roomId": room_id, "month": month, "ok": False,
                                    "error": "Chưa chốt số điện tháng này"})
                    continue
            try:
                inv = _create_monthly_invoice(db, room_id, month)
                results.append({"roomId": room_id, "month": month, "ok": True, "invoiceId": inv.id})
            except HTTPException as exc:
                db.rollback()
                results.append({"roomId": room_id, "month": month, "ok": False, "error": str(exc.detail)})
            except Exception as exc:  # phòng lỗi không kéo sập cả batch
                db.rollback()
                results.append({"roomId": room_id, "month": month, "ok": False, "error": str(exc)})
    created = sum(1 for r in results if r["ok"])
    return {"month": payload.month, "toMonth": months[-1], "results": results,
            "created": created, "failed": len(results) - created}


@inv_router.post("/mark-sent")
def mark_sent(payload: schemas.MarkSentRequest, db: Session = Depends(get_db)):
    """Đánh dấu ĐÃ GỬI cho danh sách hóa đơn (SPEC-WEB-2 F)."""
    updated = []
    for iid in (payload.invoiceIds or []):
        inv = db.get(models.Invoice, iid)
        if inv and not inv.sent:
            inv.sent = True
            inv.sentDate = _today()
            updated.append(inv.id)
    db.commit()
    return {"ok": True, "updated": updated, "count": len(updated)}


@inv_router.put("/{invoice_id}", response_model=schemas.InvoiceOut)
def update_invoice(invoice_id: str, payload: schemas.InvoiceUpdate, db: Session = Depends(get_db)):
    inv = db.get(models.Invoice, invoice_id)
    if not inv:
        raise HTTPException(404, "Không tìm thấy hóa đơn")
    data = payload.model_dump(exclude_unset=True, exclude={"lines"})
    want_status = data.pop("status", None)
    for key, value in data.items():
        setattr(inv, key, value)
    if payload.lines is not None:
        inv.lines.clear()
        db.flush()
        for ln in payload.lines:
            inv.lines.append(models.InvoiceLine(**ln.model_dump()))
        inv.total = (inv.roomFee or 0) + sum(l.amount or 0 for l in inv.lines)
    # Tương thích ngược (SPEC-WEB mục 2): PUT status='paid' -> trả đủ;
    # status='unpaid' -> chưa trả đồng nào; trạng thái cuối luôn SUY RA lại.
    if want_status == "paid":
        inv.paidAmount = max(0, (inv.total or 0) - (inv.discount or 0))
    elif want_status == "unpaid":
        inv.paidAmount = 0
    sync_invoice_status(inv)
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
# Thanh toán hóa đơn (SPEC-WEB mục 2/3.6): ghi payment -> cập nhật
# paidAmount + trạng thái suy ra + TỰ TẠO 1 phiếu thu tương ứng
# ================================================================
@inv_router.get("/{invoice_id}/payments", response_model=List[schemas.InvoicePaymentOut])
def list_invoice_payments(invoice_id: str, db: Session = Depends(get_db)):
    inv = db.get(models.Invoice, invoice_id)
    if not inv:
        raise HTTPException(404, "Không tìm thấy hóa đơn")
    return (db.query(models.InvoicePayment)
            .filter(models.InvoicePayment.invoiceId == invoice_id)
            .order_by(models.InvoicePayment.date, models.InvoicePayment.created_at).all())


@inv_router.post("/{invoice_id}/payments", response_model=schemas.InvoicePaymentOut, status_code=201)
def create_invoice_payment(invoice_id: str, payload: schemas.InvoicePaymentCreate,
                           db: Session = Depends(get_db)):
    inv = db.get(models.Invoice, invoice_id)
    if not inv:
        raise HTTPException(404, "Không tìm thấy hóa đơn")
    if not payload.amount or payload.amount <= 0:
        raise HTTPException(400, "Số tiền thanh toán phải lớn hơn 0")
    pay_date = payload.date or _today()
    payment = models.InvoicePayment(
        invoiceId=inv.id, date=pay_date, amount=payload.amount,
        receiver=payload.receiver or "", note=payload.note or "")
    db.add(payment)
    inv.paidAmount = (inv.paidAmount or 0) + payload.amount
    sync_invoice_status(inv)
    # Tự tạo phiếu thu tương ứng để chảy vào Tài chính/Thu + Phân tích
    contract = _active_contract_for_room(db, inv.roomId)
    payer = ""
    if contract:
        customer = db.get(models.Customer, contract.customerId)
        payer = customer.name if customer else ""
    db.add(models.Receipt(
        code=gen_receipt_code(db, inv.roomId), houseId=inv.houseId, roomId=inv.roomId,
        contractCode=(contract.code if contract else "") or "",
        invoiceId=inv.id,
        title=("Thanh toán hóa đơn " + (inv.code or inv.month or "")).strip(),
        amount=payload.amount, createdDate=_today(), collectDate=pay_date,
        collector=payload.receiver or "", payer=payer, note=payload.note or ""))
    db.commit()
    db.refresh(payment)
    return payment


@router.get("/invoice-payments", response_model=List[schemas.InvoicePaymentOut])
def list_all_payments(db: Session = Depends(get_db)):
    """Lịch sử thanh toán của MỌI hóa đơn (màn Lịch sử thanh toán riêng)."""
    return (db.query(models.InvoicePayment)
            .order_by(models.InvoicePayment.date.desc(),
                      models.InvoicePayment.created_at.desc()).all())


# ================================================================
# Thông báo tổng hợp (SPEC-WEB mục 3.10)
# ================================================================
@router.get("/notifications")
def notifications(db: Session = Depends(get_db)):
    today = _today()
    now_iso = datetime.now().isoformat(timespec="seconds")
    houses = {h.id: h for h in db.query(models.House).all()}
    rooms = {r.id: r for r in db.query(models.Room).all()}

    def house_label(hid):
        h = houses.get(hid)
        return (h.name or h.address) if h else ""

    def room_label(rid):
        r = rooms.get(rid)
        return r.name if r else ""

    def created_iso(obj, fallback_date=None):
        """Thời gian hiển thị = createdAt (có GIỜ) của bản ghi (SPEC-WEB-2 J)."""
        if getattr(obj, "created_at", None):
            return obj.created_at.isoformat(timespec="seconds")
        if fallback_date:
            return datetime.combine(fallback_date, datetime.min.time()).isoformat(timespec="seconds")
        return now_iso

    items = []
    # Sự cố chưa sửa xong
    for inc in db.query(models.Incident).filter(models.Incident.status != "Đã sửa").all():
        content = "%s, %s %s" % (inc.note or inc.type, room_label(inc.roomId),
                                 house_label(inc.houseId))
        items.append({"id": "incident-" + inc.id, "type": "incident",
                      "time": created_iso(inc, inc.date), "content": content.strip(),
                      "refId": inc.id})
    # Hợp đồng sắp hết hạn (<= 30 ngày, tính cả vừa hết hạn 30 ngày) — giờ = hiện tại
    for c in db.query(models.Contract).filter(models.Contract.status == "active").all():
        if c.endDate and today - timedelta(days=30) <= c.endDate <= today + timedelta(days=30):
            content = "%s %s hết hợp đồng vào %s" % (
                room_label(c.roomId), house_label(c.houseId),
                c.endDate.strftime("%d/%m/%Y"))
            items.append({"id": "contract-" + c.id, "type": "contract",
                          "time": now_iso, "content": content,
                          "refId": c.id})
    # Hóa đơn chưa thanh toán hết (quá hạn / chưa thanh toán)
    for inv in db.query(models.Invoice).all():
        if invoice_status(inv) == "paid":
            continue
        content = "Hóa đơn %s — %s %s chưa thanh toán, còn lại %sđ" % (
            inv.code or (inv.month or ""), room_label(inv.roomId),
            house_label(inv.houseId), "{:,}".format(invoice_remaining(inv)).replace(",", "."))
        items.append({"id": "invoice-" + inv.id, "type": "invoice",
                      "time": created_iso(inv, inv.createdDate), "content": content,
                      "refId": inv.id})
    # Cọc sắp hết hạn
    for dep in db.query(models.Deposit).all():
        if dep.expiryDate and today - timedelta(days=30) <= dep.expiryDate <= today + timedelta(days=30):
            content = "Cọc phòng %s %s hết hạn vào %s" % (
                room_label(dep.roomId), house_label(dep.houseId),
                dep.expiryDate.strftime("%d/%m/%Y"))
            items.append({"id": "deposit-" + dep.id, "type": "deposit",
                          "time": created_iso(dep, dep.expiryDate), "content": content,
                          "refId": dep.id})
    items.sort(key=lambda x: x["time"], reverse=True)
    return {"items": items, "total": len(items)}


# ================================================================
# Thanh toán điện nước của nhà (SPEC-WEB mục 3.2): đổi trạng thái
# -> paid + tự tạo 1 phiếu chi tương ứng
# ================================================================
util_router = APIRouter(prefix="/house-utilities", tags=["house-utilities"], dependencies=_AUTH)


@util_router.post("/{utility_id}/pay")
def pay_house_utility(utility_id: str,
                      payload: Optional[schemas.PayUtilityRequest] = Body(default=None),
                      db: Session = Depends(get_db),
                      user=Depends(get_current_user)):
    util = db.get(models.HouseUtility, utility_id)
    if not util:
        raise HTTPException(404, "Không tìm thấy bản ghi điện nước")
    if util.status == "paid":
        raise HTTPException(400, "Khoản này đã thanh toán rồi")
    # Số tiền thanh toán gửi kèm (từ hộp thoại xác nhận): cập nhật trước khi
    # đánh dấu paid để phiếu chi sinh ra khớp đúng số tiền thực trả.
    if payload is not None and payload.amount is not None and payload.amount > 0:
        util.amount = payload.amount
    util.status = "paid"
    house = db.get(models.House, util.houseId)
    label = "điện" if util.type == "dien" else "nước"
    house_label = (house.name or house.address) if house else ""
    exp = models.Expense(
        code=gen_expense_code(), houseId=util.houseId,
        title="Thanh toán %s %s tháng %s" % (label, house_label, util.month),
        amount=util.amount or 0, date=_today(), payDate=_today(),
        # Đợt 5 (mục 16): phiếu chi tự sinh có người chi = tài khoản đang thao tác,
        # người nhận = chủ tài khoản tiện ích; SĐT người nhận để trống (không có dữ kiện)
        spender=getattr(user, "name", "") or "",
        receiverName=util.accountHolder or "", receiverPhone="",
        note="Tự tạo khi thanh toán %s của nhà (mã %s)" % (label, util.customerCode or ""))
    db.add(exp)
    db.commit()
    db.refresh(util)
    db.refresh(exp)
    return {"ok": True, "utility": schemas.HouseUtilityOut.model_validate(util),
            "expenseId": exp.id, "expenseCode": exp.code}


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
            # Phiếu chi: hoàn trả khách (người nhận = khách của hợp đồng)
            _cust = db.get(models.Customer, contract.customerId)
            exp = models.Expense(
                houseId=contract.houseId, roomId=contract.roomId,
                contractCode=contract.code or "",
                title="Thanh lý hợp đồng — hoàn trả khách",
                amount=-summary["net"], date=payload.liquidateDate,
                payDate=payload.liquidateDate,
                receiverName=_cust.name if _cust else "",
                receiverPhone=_cust.phone if _cust else "",
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
