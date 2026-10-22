"""Logic tính tiền thuần (không phụ thuộc HTTP) — dùng cho hóa đơn tháng,
thanh lý hợp đồng; test trực tiếp được.

Quy ước services của hợp đồng (JSON):
  dien:     {price, unit:'so'}
  nuoc:     {price, unit:'nguoi'|'so'}
  dienChung:{price}  (theo người)
  vesinh:   {price}  (theo người)
  internet: {price}  (theo người)
  xeMay/oTo/xeDap: {count, fee}
"""
from datetime import date


def _svc(contract_services, key):
    s = (contract_services or {}).get(key) or {}
    return s


def build_monthly_lines(contract, readings, people=None):
    """Dựng các dòng dịch vụ của hóa đơn tháng.

    readings: {'dien': (prev, curr)|None, 'nuoc': (prev, curr)|None}
    Trả về list[dict] gồm các dòng có amount > 0 hoặc dòng điện/nước chính.
    """
    sv = contract.services or {}
    ppl = people if people is not None else (contract.people or 1)
    lines = []

    def add(label, unit_price, unit, qty, prev=None, curr=None):
        amount = int(unit_price) * int(qty)
        if amount <= 0 and label not in ("Điện", "Nước"):
            return
        lines.append({
            "label": label, "unitPrice": int(unit_price), "unit": unit,
            "qty": int(qty), "prev": prev, "current": curr, "amount": amount,
        })

    # Điện — theo số (chỉ số đầu/cuối)
    dien = _svc(sv, "dien")
    if dien.get("price"):
        rd = readings.get("dien") or (0, 0)
        add("Điện", dien["price"], "số", max(0, rd[1] - rd[0]), rd[0], rd[1])
    # Nước — theo người hoặc theo số
    nuoc = _svc(sv, "nuoc")
    if nuoc.get("price"):
        if nuoc.get("unit") == "so":
            rd = readings.get("nuoc") or (0, 0)
            add("Nước", nuoc["price"], "số", max(0, rd[1] - rd[0]), rd[0], rd[1])
        else:
            add("Nước", nuoc["price"], "người", ppl)
    # Các khoản theo người
    for key, label in (("dienChung", "Điện chung"), ("vesinh", "Vệ sinh"), ("internet", "Internet")):
        s = _svc(sv, key)
        if s.get("price"):
            add(label, s["price"], "người", ppl)
    # Xe — số lượng × phí/xe
    for key, label in (("xeMay", "Xe máy"), ("oTo", "Ô tô"), ("xeDap", "Xe đạp")):
        s = _svc(sv, key)
        if s.get("fee") and s.get("count"):
            add(label, s["fee"], "xe", s["count"])
    return lines


def lines_total(lines):
    return sum(int(l["amount"]) for l in lines)


def days_in_final_period(start_date, liquidate_date):
    """Số ngày ở thực tế của kỳ thanh lý: từ max(ngày bắt đầu HĐ, đầu tháng
    thanh lý) đến ngày thanh lý, tính cả 2 đầu."""
    if start_date is None:
        return liquidate_date.day
    period_start = max(start_date, liquidate_date.replace(day=1))
    return (liquidate_date - period_start).days + 1


def calc_liquidation(contract, dien_final, nuoc_final, liquidate_date,
                     refund_room_fee, prepaid_room_fee, last_dien, last_nuoc):
    """Tính tổng hợp thanh lý hợp đồng.

    last_dien / last_nuoc: chỉ số chốt gần nhất (current) hoặc None.
    Trả về dict: days, roomOwed, lines, serviceTotal, owedTotal,
                 returnTotal (cọc + phòng thừa), net, result:
                   'collect' (khách đóng thêm) | 'refund' (trả khách) | 'even'
    """
    days = days_in_final_period(contract.startDate, liquidate_date)
    room_owed = round((contract.price or 0) * days / 30)

    readings = {}
    if dien_final is not None:
        readings["dien"] = (last_dien or 0, dien_final)
    if nuoc_final is not None:
        readings["nuoc"] = (last_nuoc or 0, nuoc_final)
    # Với thanh lý, chỉ tính dịch vụ có liên quan; nước theo số cần chỉ số cuối
    sv = contract.services or {}
    if (sv.get("nuoc") or {}).get("unit") == "so" and nuoc_final is None:
        readings.pop("nuoc", None)
    lines = build_monthly_lines(contract, readings)
    # build_monthly_lines luôn thêm dòng Điện/Nước kể cả 0 — bỏ dòng 0 trong thanh lý
    lines = [l for l in lines if l["amount"] > 0]
    service_total = lines_total(lines)

    owed = room_owed + service_total
    returned = (contract.deposit or 0) + (int(prepaid_room_fee or 0) if refund_room_fee else 0)
    net = owed - returned
    result = "collect" if net > 0 else ("refund" if net < 0 else "even")
    return {
        "days": days,
        "roomOwed": room_owed,
        "lines": lines,
        "serviceTotal": service_total,
        "owedTotal": owed,
        "deposit": contract.deposit or 0,
        "prepaidRoomFee": int(prepaid_room_fee or 0) if refund_room_fee else 0,
        "returnTotal": returned,
        "net": net,
        "result": result,
    }
