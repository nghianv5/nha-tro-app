"""Đợt 26 — Chặn số nguyên vượt giới hạn int32 của PostgreSQL TRƯỚC khi ghi.

Bối cảnh (log thật từ Render): gõ "5.700.000" (đồng) vào ô "Giá phòng
(triệu vnđ)" -> parser triệu hiểu thành 5.700.000 triệu -> x1.000.000 =
5,7 nghìn tỷ, trong khi cột INTEGER của Postgres chỉ chứa tối đa ~2,147
tỷ -> INSERT nổ NumericValueOutOfRange, server trả 500 chung chung và
phòng KHÔNG được lưu. SQLite không bắt được lỗi này (số nguyên 64-bit)
nên test cũ không phát hiện — cùng điểm mù như vụ FK-500 đợt 11.

Guard này chạy vô điều kiện trong router CRUD generic (mọi màn tạo/sửa
đều đi qua đó) nên các màn khác cùng được hưởng. Chỉ xét số nguyên ở
cấp cao nhất của payload (bool không tính — bool là subclass của int
trong Python; dict/list lồng nhau như services là JSON, không bị giới
hạn int32 của cột). Trường nào không có trong bảng nhãn thì vẫn chặn
bằng thông báo chung nêu tên field.
"""

from fastapi import HTTPException

INT32_MIN = -2147483648
INT32_MAX = 2147483647

# (tên model, tên field) -> (nhãn tiếng Việt, có phải ô nhập theo triệu?)
# Đợt 27: giá phòng là ô triệu cuối cùng, nay đã đổi sang nhập trực tiếp
# bằng vnđ như mọi ô tiền khác — app hiện không còn ô triệu nào. Cờ triệu
# và nhánh gợi ý triệu bên dưới giữ lại để dự phòng, không còn field nào
# gắn cờ True.
_LABELS = {
    ("Room", "price"): ("Giá phòng", False),
    ("Room", "minDeposit"): ("Cọc tối thiểu", False),
    ("Contract", "price"): ("Giá thuê", False),
    ("Contract", "deposit"): ("Tiền cọc", False),
    ("LandlordContract", "rentPrice"): ("Tiền thuê nhà", False),
    ("LandlordContract", "deposit"): ("Tiền cọc nhà", False),
    ("Deposit", "amount"): ("Tiền cọc", False),
    ("HousePayment", "amount"): ("Số tiền thanh toán", False),
    ("Invoice", "total"): ("Tổng tiền hóa đơn", False),
    ("Invoice", "paidAmount"): ("Số tiền đã trả", False),
    ("Expense", "amount"): ("Số tiền chi", False),
    ("Receipt", "amount"): ("Số tiền thu", False),
    ("Service", "price"): ("Giá dịch vụ", False),
}


def _fmt_int(n):
    """Nhóm 3 chữ số bằng dấu chấm: 5700000 -> '5.700.000'."""
    return f"{n:,}".replace(",", ".")


def _fmt_vn(x):
    """Số kiểu VN: nguyên -> '5.700.000'; thập phân -> '5,7' (bỏ 0 thừa)."""
    if isinstance(x, float):
        s = f"{x:.6f}".rstrip("0").rstrip(".")
        ip, _, fp = s.partition(".")
        out = _fmt_int(int(ip))
        return out + ("," + fp if fp else "")
    return _fmt_int(x)


def _as_trieu(value):
    """VND đã quy đổi -> số triệu (nguyên nếu chia hết, thập phân nếu lẻ)."""
    if value % 1000000 == 0:
        return value // 1000000
    return value / 1000000


def check_int32(model_name, data):
    """Ném HTTPException 400 nếu field nguyên nào vượt int32. Gọi trước
    khi tạo/cập nhật bản ghi trong router CRUD generic."""
    for key, value in data.items():
        if isinstance(value, bool) or not isinstance(value, int):
            continue
        if INT32_MIN <= value <= INT32_MAX:
            continue
        label, is_trieu = _LABELS.get((model_name, key), (key, False))
        if is_trieu:
            trieu = _as_trieu(value)
            # Nếu ý người dùng là `trieu` đồng thì số triệu đúng là
            # trieu / 1.000.000 (vd 5.700.000đ -> nhập 5,7).
            suggest = trieu / 1000000 if isinstance(trieu, (int, float)) else trieu
            raise HTTPException(
                400,
                f"{label} {_fmt_vn(trieu)} triệu (tức {_fmt_int(value)}đ) "
                f"vượt quá giới hạn lưu trữ. Ô này tính theo triệu — nếu ý "
                f"bạn là {_fmt_vn(trieu)}đ thì nhập {_fmt_vn(suggest)} thay "
                f"vì {_fmt_vn(trieu)}.")
        raise HTTPException(
            400,
            f"{label} {_fmt_int(value)}đ quá lớn, vượt quá giới hạn lưu trữ. "
            f"Vui lòng kiểm tra lại số đã nhập.")
