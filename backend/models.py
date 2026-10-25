"""SQLAlchemy models cho toàn bộ thực thể theo SPEC + SPEC-WEB.

Quy ước: thuộc tính Python dùng camelCase (khớp JSON API), tên cột trong DB
dùng snake_case. Các trường danh sách (tiện ích, dịch vụ HĐ, quyền...) lưu JSON.
"""
import uuid
from datetime import datetime

from sqlalchemy import (Boolean, Column, Date, DateTime, Float, ForeignKey,
                        Integer, String, Text)
from sqlalchemy.types import JSON
from sqlalchemy.orm import relationship

from .database import Base


def _uid():
    return uuid.uuid4().hex[:24]


class TimestampMixin:
    created_at = Column(DateTime, default=datetime.utcnow, index=True)


class House(TimestampMixin, Base):
    __tablename__ = "houses"
    id = Column(String, primary_key=True, default=_uid)
    address = Column(String, nullable=False)
    name = Column(String, default="")  # Tên nhà (SPEC-WEB)
    province = Column("province", String, default="")
    district = Column(String, default="")
    ward = Column(String, default="")
    floors = Column(Integer, default=1)
    floorArea = Column("floor_area", Integer, default=0)
    bedrooms = Column(Integer, default=0)
    bathrooms = Column(Integer, default=0)
    type = Column(String, default="own")  # own | rented
    businessType = Column("business_type", String, default="")  # Loại nhà trọ: Chung cư mini|Nhà nguyên căn|Homestay|Phòng đơn|Phòng trọ
    rentalMode = Column("rental_mode", String, default="Bao phòng")  # Hình thức cho thuê: Bao phòng | Bao người (SPEC-WEB-2 A)
    description = Column(Text, default="")
    latitude = Column("latitude", Float, nullable=True)  # Vĩ độ vị trí trên bản đồ (đợt 7)
    longitude = Column("longitude", Float, nullable=True)  # Kinh độ vị trí trên bản đồ (đợt 7)
    redBookImages = Column("red_book_images", JSON, default=list)  # Danh sách URL ảnh sổ đỏ tải lên (đợt 6, mục 5)
    landlordId = Column("landlord_id", String, ForeignKey("landlords.id"), nullable=True)


class Room(TimestampMixin, Base):
    __tablename__ = "rooms"
    id = Column(String, primary_key=True, default=_uid)
    houseId = Column("house_id", String, ForeignKey("houses.id"), nullable=False, index=True)
    name = Column(String, nullable=False)
    floor = Column(Integer, default=1)
    area = Column(Integer, default=0)
    type = Column(String, default="Khép kín")
    toilet = Column(String, default="Khép kín")
    kitchen = Column(String, default="Không có")  # Trong phòng|Bên ngoài|Chung|Không có (SPEC-WEB)
    withOwner = Column("with_owner", Boolean, default=False)
    price = Column(Integer, default=0)
    minDeposit = Column("min_deposit", Integer, default=0)
    maxPeople = Column("max_people", Integer, default=0)
    subRooms = Column("sub_rooms", Integer, default=0)  # Số phòng con bên trong (SPEC-WEB-2 B)
    payMonths = Column("pay_months", Integer, default=1)
    payFromDay = Column("pay_from_day", Integer, default=1)
    payToDay = Column("pay_to_day", Integer, default=3)
    amenities = Column(JSON, default=list)
    services = Column(JSON, default=dict)  # {dien, dienChung, internet, extra:[...]}
    images = Column(JSON, default=list)  # Đợt 16 — danh sách URL ảnh phòng tải lên (như ảnh sổ đỏ của nhà)


class Customer(TimestampMixin, Base):
    __tablename__ = "customers"
    id = Column(String, primary_key=True, default=_uid)
    name = Column(String, nullable=False)
    dob = Column(Date, nullable=True)
    phone = Column(String, default="")
    gender = Column(String, default="Nam")
    email = Column(String, default="")
    idCard = Column("id_card", String, default="")
    # Hồ sơ đầy đủ (SPEC-WEB-2 C)
    job = Column(String, default="")                       # Nghề nghiệp
    maritalStatus = Column("marital_status", String, default="")  # Tình trạng hôn nhân
    permanentAddress = Column("permanent_address", String, default="")  # Địa chỉ thường trú
    currentAddress = Column("current_address", String, default="")      # Địa chỉ hiện tại
    note = Column(Text, default="")                        # Ghi chú


class Contract(TimestampMixin, Base):
    __tablename__ = "contracts"
    id = Column(String, primary_key=True, default=_uid)
    code = Column(String, default="")  # Mã HĐ: HD + phòng + YYYYMMDD ngày ký (SPEC-WEB)
    houseId = Column("house_id", String, ForeignKey("houses.id"), nullable=False, index=True)
    roomId = Column("room_id", String, ForeignKey("rooms.id"), nullable=False, index=True)
    customerId = Column("customer_id", String, ForeignKey("customers.id"), nullable=False)
    signDate = Column("sign_date", Date, nullable=True)
    startDate = Column("start_date", Date, nullable=True)
    endDate = Column("end_date", Date, nullable=True)
    price = Column(Integer, default=0)
    deposit = Column(Integer, default=0)
    people = Column(Integer, default=1)
    payMonths = Column("pay_months", Integer, default=1)
    payFromDay = Column("pay_from_day", Integer, default=1)
    payToDay = Column("pay_to_day", Integer, default=3)
    # {dien:{price,unit}, nuoc:{price,unit}, dienChung:{price}, vesinh:{price},
    #  internet:{price}, xeMay:{count,fee}, oTo:{count,fee}, xeDap:{count,fee}}
    services = Column(JSON, default=dict)
    status = Column(String, default="active")  # active | liquidated


class MeterReading(TimestampMixin, Base):
    __tablename__ = "meter_readings"
    id = Column(String, primary_key=True, default=_uid)
    houseId = Column("house_id", String, ForeignKey("houses.id"), nullable=False, index=True)
    roomId = Column("room_id", String, ForeignKey("rooms.id"), nullable=False, index=True)
    type = Column(String, default="dien")  # dien | nuoc
    prev = Column(Integer, default=0)
    current = Column(Integer, default=0)
    date = Column(Date, nullable=True)
    note = Column(Text, default="")


class LandlordMeterReading(TimestampMixin, Base):
    __tablename__ = "landlord_meter_readings"
    id = Column(String, primary_key=True, default=_uid)
    houseId = Column("house_id", String, ForeignKey("houses.id"), nullable=False, index=True)
    date = Column(Date, nullable=True)
    dien = Column(Integer, default=0)
    nuoc = Column(Integer, default=0)
    internet = Column(Integer, default=0)
    vesinh = Column(Integer, default=0)
    total = Column(Integer, default=0)


class Invoice(TimestampMixin, Base):
    __tablename__ = "invoices"
    id = Column(String, primary_key=True, default=_uid)
    code = Column(String, default="")  # Mã hóa đơn: phòng + YYYYMMDDHHmmss (SPEC-WEB)
    kind = Column(String, default="monthly")  # monthly | other
    houseId = Column("house_id", String, ForeignKey("houses.id"), nullable=False, index=True)
    roomId = Column("room_id", String, ForeignKey("rooms.id"), nullable=True, index=True)
    month = Column(String, nullable=True, index=True)  # 'YYYY-MM' với hóa đơn tháng
    roomFee = Column("room_fee", Integer, default=0)
    total = Column(Integer, default=0)
    discount = Column(Integer, default=0)      # Giảm giá (SPEC-WEB)
    paidAmount = Column("paid_amount", Integer, default=0)  # Đã trả (SPEC-WEB)
    # status được ĐỒNG BỘ từ total/discount/paidAmount (xem business.invoice_status):
    # paid (hết) | partial (thiếu) | unpaid (chưa thanh toán)
    status = Column(String, default="unpaid")
    sent = Column(Boolean, default=False)      # Đã gửi hóa đơn cho khách chưa (SPEC-WEB-2 F)
    sentDate = Column("sent_date", Date, nullable=True)  # Ngày gửi
    createdDate = Column("created_date", Date, nullable=True)
    reason = Column(String, nullable=True)
    lines = relationship("InvoiceLine", back_populates="invoice",
                         cascade="all, delete-orphan", order_by="InvoiceLine.created_at")
    payments = relationship("InvoicePayment", back_populates="invoice",
                            cascade="all, delete-orphan", order_by="InvoicePayment.created_at")


class InvoiceLine(TimestampMixin, Base):
    __tablename__ = "invoice_lines"
    id = Column(String, primary_key=True, default=_uid)
    invoiceId = Column("invoice_id", String, ForeignKey("invoices.id"), nullable=False, index=True)
    label = Column(String, default="")
    unitPrice = Column("unit_price", Integer, default=0)
    unit = Column(String, default="")
    qty = Column(Integer, default=0)
    prev = Column(Integer, nullable=True)
    current = Column(Integer, nullable=True)
    amount = Column(Integer, default=0)
    invoice = relationship("Invoice", back_populates="lines")


class InvoicePayment(TimestampMixin, Base):
    """Lịch sử thanh toán của 1 hóa đơn (SPEC-WEB mục 2)."""
    __tablename__ = "invoice_payments"
    id = Column(String, primary_key=True, default=_uid)
    invoiceId = Column("invoice_id", String, ForeignKey("invoices.id"), nullable=False, index=True)
    date = Column(Date, nullable=True)
    amount = Column(Integer, default=0)
    receiver = Column(String, default="")  # Người nhận
    note = Column(Text, default="")
    invoice = relationship("Invoice", back_populates="payments")


class Receipt(TimestampMixin, Base):
    """Phiếu thu — màn Tài chính/Thu (SPEC-WEB mục 2)."""
    __tablename__ = "receipts"
    id = Column(String, primary_key=True, default=_uid)
    code = Column(String, default="")  # Mã phiếu thu: T + mã phòng/ngày
    houseId = Column("house_id", String, ForeignKey("houses.id"), nullable=True, index=True)
    roomId = Column("room_id", String, ForeignKey("rooms.id"), nullable=True, index=True)
    contractCode = Column("contract_code", String, default="")
    invoiceId = Column("invoice_id", String, ForeignKey("invoices.id"), nullable=True)
    title = Column(String, default="")  # Khoản thu
    amount = Column(Integer, default=0)
    createdDate = Column("created_date", Date, nullable=True)  # Ngày tạo
    collectDate = Column("collect_date", Date, nullable=True)  # Ngày thu
    collector = Column(String, default="")  # Người thu
    payer = Column(String, default="")      # Người nộp
    note = Column(Text, default="")


class Vehicle(TimestampMixin, Base):
    __tablename__ = "vehicles"
    id = Column(String, primary_key=True, default=_uid)
    houseId = Column("house_id", String, ForeignKey("houses.id"), nullable=False, index=True)
    roomId = Column("room_id", String, ForeignKey("rooms.id"), nullable=True, index=True)
    type = Column(String, default="Xe máy")  # Xe máy | Ô tô | Xe đạp
    plate = Column(String, default="")
    ownerName = Column("owner_name", String, default="")
    fee = Column(Integer, default=0)
    brand = Column(String, default="")
    color = Column(String, default="")


class Asset(TimestampMixin, Base):
    __tablename__ = "assets"
    id = Column(String, primary_key=True, default=_uid)
    houseId = Column("house_id", String, ForeignKey("houses.id"), nullable=False, index=True)
    roomId = Column("room_id", String, ForeignKey("rooms.id"), nullable=True, index=True)
    code = Column(String, default="")  # Mã tài sản 8 số tự sinh (00000001...)
    # Đợt 19: đổi tên trường cho khớp tên hiển thị 'Chủ sở hữu':
    # room = Chủ đầu tư/Quản lý (tài sản trong phòng cũ) | landlord = Chủ nhà
    owner = Column("owner", String, default="room")
    type = Column(String, default="")
    status = Column(String, default="Tốt")  # Mới|Như mới|Tốt|Cũ|Hỏng|Mất
    note = Column(Text, default="")
    imageUrl = Column("image_url", String, default="")  # Ảnh tài sản đã tải lên /uploads/... (đợt 6)


class Unit(TimestampMixin, Base):
    __tablename__ = "units"
    id = Column(String, primary_key=True, default=_uid)
    name = Column(String, nullable=False)


class Service(TimestampMixin, Base):
    __tablename__ = "services"
    id = Column(String, primary_key=True, default=_uid)
    name = Column(String, nullable=False)
    price = Column(Integer, default=0)
    unitId = Column("unit_id", String, ForeignKey("units.id"), nullable=True)


class Expense(TimestampMixin, Base):
    __tablename__ = "expenses"
    id = Column(String, primary_key=True, default=_uid)
    code = Column(String, default="")  # Mã phiếu chi: CHI + ... (SPEC-WEB)
    houseId = Column("house_id", String, ForeignKey("houses.id"), nullable=True, index=True)
    roomId = Column("room_id", String, ForeignKey("rooms.id"), nullable=True, index=True)
    contractCode = Column("contract_code", String, default="")
    title = Column(String, default="")
    amount = Column(Integer, default=0)
    date = Column(Date, nullable=True)      # Ngày tạo
    payDate = Column("pay_date", Date, nullable=True)  # Ngày chi (SPEC-WEB)
    spender = Column(String, default="")        # Người chi
    receiverName = Column("receiver_name", String, default="")  # Người nhận
    receiverPhone = Column("receiver_phone", String, default="")  # SĐT người nhận
    note = Column(Text, default="")


class Incident(TimestampMixin, Base):
    __tablename__ = "incidents"
    id = Column(String, primary_key=True, default=_uid)
    houseId = Column("house_id", String, ForeignKey("houses.id"), nullable=False, index=True)
    roomId = Column("room_id", String, ForeignKey("rooms.id"), nullable=True, index=True)
    type = Column(String, default="Khác")  # Hỏng điện|Hỏng nước|Hỏng mạng|Khác
    phone = Column(String, default="")
    note = Column(Text, default="")
    status = Column(String, default="Chưa sửa")  # Chưa sửa|Tiếp nhận sự cố|Đang sửa|Đã sửa
    creator = Column(String, default="")
    assignee = Column(String, default="")
    date = Column(Date, nullable=True)


class Deposit(TimestampMixin, Base):
    __tablename__ = "deposits"
    id = Column(String, primary_key=True, default=_uid)
    code = Column(String, default="")  # Mã HĐ cọc: phòng + YYYYMMDDHHmmss (SPEC-WEB)
    houseId = Column("house_id", String, ForeignKey("houses.id"), nullable=False, index=True)
    roomId = Column("room_id", String, ForeignKey("rooms.id"), nullable=False, index=True)
    customerId = Column("customer_id", String, ForeignKey("customers.id"), nullable=True, index=True)  # SPEC-WEB-2 D
    customerName = Column("customer_name", String, default="")
    phone = Column(String, default="")
    amount = Column(Integer, default=0)  # Tiền giữ phòng
    rentPrice = Column("rent_price", Integer, default=0)  # Giá thuê
    vacantDays = Column("vacant_days", Integer, default=0)  # Thời gian trống phòng (ngày)
    payMonths = Column("pay_months", Integer, default=1)      # Số tháng thanh toán 1 lần (SPEC-WEB-2 D)
    payDayFrom = Column("pay_day_from", Integer, default=1)   # Thời gian thanh toán từ ngày
    payDayTo = Column("pay_day_to", Integer, default=3)       # đến ngày
    # Cấu hình dịch vụ tại thời điểm cọc (SPEC-WEB-2 D):
    # {dien:{price,unit}, nuoc:{price,unit}, xeMay:{count,fee}, oTo:{count,fee}, xeDap:{count,fee}}
    serviceConfig = Column("service_config", JSON, default=dict)
    date = Column(Date, nullable=True)  # Ngày cọc
    moveInDate = Column("move_in_date", Date, nullable=True)   # Ngày vào
    moveOutDate = Column("move_out_date", Date, nullable=True)  # Ngày ra
    contractDate = Column("contract_date", Date, nullable=True)  # Ngày đến làm hợp đồng
    expiryDate = Column("expiry_date", Date, nullable=True)      # Ngày hết hạn cọc
    note = Column(Text, default="")


class Landlord(TimestampMixin, Base):
    __tablename__ = "landlords"
    id = Column(String, primary_key=True, default=_uid)
    name = Column(String, nullable=False)
    phone = Column(String, default="")
    address = Column(String, default="")
    # Hồ sơ đầy đủ theo SPEC-WEB
    dob = Column(Date, nullable=True)
    gender = Column(String, default="")
    job = Column(String, default="")
    maritalStatus = Column("marital_status", String, default="")
    email = Column(String, default="")
    idCard = Column("id_card", String, default="")
    permanentAddress = Column("permanent_address", String, default="")
    # Ảnh CMND/CCCD tải lên thật (đợt 6, mục 4): URL /uploads/... mặt trước / mặt sau
    idCardImage1 = Column("id_card_image1", String, default="")
    idCardImage2 = Column("id_card_image2", String, default="")


class LandlordContract(TimestampMixin, Base):
    __tablename__ = "landlord_contracts"
    id = Column(String, primary_key=True, default=_uid)
    code = Column(String, default="")  # Mã HĐ chủ nhà
    landlordId = Column("landlord_id", String, ForeignKey("landlords.id"), nullable=False, index=True)
    houseId = Column("house_id", String, ForeignKey("houses.id"), nullable=False, index=True)
    rentPrice = Column("rent_price", Integer, default=0)
    deposit = Column(Integer, default=0)
    startDate = Column("start_date", Date, nullable=True)
    endDate = Column("end_date", Date, nullable=True)
    payDay = Column("pay_day", Integer, default=5)
    payMonths = Column("pay_months", Integer, default=1)      # Số tháng thanh toán 1 lần (SPEC-WEB-2 A)
    payFromDay = Column("pay_from_day", Integer, default=1)   # Thời gian thanh toán từ ngày
    payToDay = Column("pay_to_day", Integer, default=3)       # đến ngày
    payDate = Column("pay_date", Date, nullable=True)  # Đợt 8 — Thời gian thanh toán: 1 ngày cụ thể (neo tính kỳ TT tiếp theo)
    firstPayDate = Column("first_pay_date", Date, nullable=True)  # Đợt 9 — Ngày thanh toán KỲ ĐẦU do NGƯỜI DÙNG nhập ở form nhà (hệ thống không bao giờ tự sửa ngày đã lưu; chỉ là neo ưu tiên nhất để suy ra "Ngày thanh toán tiếp theo")
    status = Column(String, default="active")  # active | liquidated (SPEC-WEB)


class HousePayment(TimestampMixin, Base):
    __tablename__ = "house_payments"
    id = Column(String, primary_key=True, default=_uid)
    houseId = Column("house_id", String, ForeignKey("houses.id"), nullable=False, index=True)
    landlordId = Column("landlord_id", String, ForeignKey("landlords.id"), nullable=True)
    amount = Column(Integer, default=0)
    date = Column(Date, nullable=True)
    status = Column(String, default="paid")  # paid | unpaid


class Account(TimestampMixin, Base):
    __tablename__ = "accounts"
    id = Column(String, primary_key=True, default=_uid)
    name = Column(String, nullable=False)
    phone = Column(String, default="")
    role = Column(String, default="staff")  # admin | staff (đăng nhập/phân quyền API)
    passwordHash = Column("password_hash", String, nullable=True)  # bcrypt, NULL = chưa đặt mật khẩu
    houseIds = Column("house_ids", JSON, default=list)
    modules = Column(JSON, default=list)
    # Hồ sơ nhân viên đầy đủ theo SPEC-WEB
    dob = Column(Date, nullable=True)
    gender = Column(String, default="")
    job = Column(String, default="")
    maritalStatus = Column("marital_status", String, default="")
    email = Column(String, default="")
    idCard = Column("id_card", String, default="")
    province = Column(String, default="")
    district = Column(String, default="")
    ward = Column(String, default="")
    permanentAddress = Column("permanent_address", String, default="")


class Position(TimestampMixin, Base):
    """Chức vụ + ma trận quyền (SPEC-WEB mục 2/3.9).

    permissions dạng: {"thongKe": true, "nha": {"add":bool,"edit":bool,"delete":bool},
    "phong": {...}, "dichVu": {...}, "hopDong": {...}, "khachThue": {...},
    "thuChi": {...}, "thongBao": {...}}
    """
    __tablename__ = "positions"
    id = Column(String, primary_key=True, default=_uid)
    name = Column(String, nullable=False)
    permissions = Column(JSON, default=dict)


class StaffAssignment(TimestampMixin, Base):
    """Phân chức vụ theo nhà (SPEC-WEB mục 2)."""
    __tablename__ = "staff_assignments"
    id = Column(String, primary_key=True, default=_uid)
    accountId = Column("account_id", String, ForeignKey("accounts.id"), nullable=False, index=True)
    houseId = Column("house_id", String, ForeignKey("houses.id"), nullable=False, index=True)
    positionId = Column("position_id", String, ForeignKey("positions.id"), nullable=False, index=True)


class HouseUtility(TimestampMixin, Base):
    """Thanh toán điện/nước của NHÀ với nhà cung cấp (SPEC-WEB mục 2/3.2)."""
    __tablename__ = "house_utilities"
    id = Column(String, primary_key=True, default=_uid)
    houseId = Column("house_id", String, ForeignKey("houses.id"), nullable=False, index=True)
    type = Column(String, default="dien")  # dien | nuoc
    customerCode = Column("customer_code", String, default="")  # Mã điện / Mã nước
    accountHolder = Column("account_holder", String, default="")  # Chủ tài khoản
    username = Column(String, default="")   # Tài khoản đăng nhập cổng thanh toán
    password = Column(String, default="")   # Mật khẩu (theo đúng thiết kế: lưu & hiển thị)
    month = Column(String, default="")      # 'YYYY-MM'
    amount = Column(Integer, default=0)     # Tiền thanh toán
    status = Column(String, default="unpaid")  # unpaid | paid
