"""Pydantic schemas (create / update / response) cho từng thực thể.

Tên trường dùng camelCase để khớp với JSON API và frontend.
"""
from datetime import date as DateType
from datetime import datetime as DateTimeType
from typing import Any, List, Optional

from pydantic import BaseModel, ConfigDict, field_validator


class OutBase(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---------- Nhà ----------
class HouseCreate(BaseModel):
    address: str
    name: Optional[str] = ""
    province: Optional[str] = ""
    district: Optional[str] = ""
    ward: Optional[str] = ""
    floors: Optional[int] = 1
    floorArea: Optional[int] = 0
    bedrooms: Optional[int] = 0
    bathrooms: Optional[int] = 0
    type: Optional[str] = "own"
    businessType: Optional[str] = ""
    rentalMode: Optional[str] = "Bao phòng"
    description: Optional[str] = ""
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    landlordId: Optional[str] = None
    redBookImages: Optional[List[str]] = []
    managedForOwner: Optional[bool] = False


class HouseUpdate(BaseModel):
    address: Optional[str] = None
    name: Optional[str] = None
    province: Optional[str] = None
    district: Optional[str] = None
    ward: Optional[str] = None
    floors: Optional[int] = None
    floorArea: Optional[int] = None
    bedrooms: Optional[int] = None
    bathrooms: Optional[int] = None
    type: Optional[str] = None
    businessType: Optional[str] = None
    rentalMode: Optional[str] = None
    description: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    landlordId: Optional[str] = None
    redBookImages: Optional[List[str]] = None
    managedForOwner: Optional[bool] = None


class HouseOut(OutBase, HouseCreate):
    id: str


# ---------- Phòng ----------
def _clamp_pay_day(cls, v):
    """Đợt 26: 'Thời gian đóng tiền' là ngày trong tháng -> kẹp về 1-31.
    None (trường hợp update không đụng tới) giữ nguyên."""
    if v is None:
        return None
    try:
        v = int(v)
    except (TypeError, ValueError):
        return v
    return max(1, min(31, v))


class RoomCreate(BaseModel):
    houseId: str
    name: str
    floor: Optional[int] = 1
    area: Optional[int] = 0
    type: Optional[str] = "Khép kín"
    toilet: Optional[str] = "Khép kín"
    kitchen: Optional[str] = "Không có"
    withOwner: Optional[bool] = False
    price: Optional[int] = 0
    minDeposit: Optional[int] = 0
    maxPeople: Optional[int] = 0
    subRooms: Optional[int] = 0
    payMonths: Optional[int] = 1
    payFromDay: Optional[int] = 1
    payToDay: Optional[int] = 3
    # Đợt 26: ngày đóng tiền duy nhất của phòng; 2 trường cũ vẫn nhận
    # để tương thích nhưng không dùng để hiển thị nữa.
    payDay: Optional[int] = 1
    amenities: Optional[List[str]] = []
    services: Optional[dict] = {}
    images: Optional[List[str]] = []

    _clamp_payDay = field_validator("payDay", mode="before")(_clamp_pay_day)


class RoomUpdate(BaseModel):
    houseId: Optional[str] = None
    name: Optional[str] = None
    floor: Optional[int] = None
    area: Optional[int] = None
    type: Optional[str] = None
    toilet: Optional[str] = None
    kitchen: Optional[str] = None
    withOwner: Optional[bool] = None
    price: Optional[int] = None
    minDeposit: Optional[int] = None
    maxPeople: Optional[int] = None
    subRooms: Optional[int] = None
    payMonths: Optional[int] = None
    payFromDay: Optional[int] = None
    payToDay: Optional[int] = None
    payDay: Optional[int] = None
    amenities: Optional[List[str]] = None
    services: Optional[dict] = None
    images: Optional[List[str]] = None

    _clamp_payDay = field_validator("payDay", mode="before")(_clamp_pay_day)


class RoomOut(OutBase, RoomCreate):
    id: str


# ---------- Khách hàng ----------
class CustomerCreate(BaseModel):
    name: str
    dob: Optional[DateType] = None
    phone: Optional[str] = ""
    gender: Optional[str] = "Nam"
    email: Optional[str] = ""
    idCard: Optional[str] = ""
    job: Optional[str] = ""
    maritalStatus: Optional[str] = ""
    permanentAddress: Optional[str] = ""
    currentAddress: Optional[str] = ""
    note: Optional[str] = ""


class CustomerUpdate(BaseModel):
    name: Optional[str] = None
    dob: Optional[DateType] = None
    phone: Optional[str] = None
    gender: Optional[str] = None
    email: Optional[str] = None
    idCard: Optional[str] = None
    job: Optional[str] = None
    maritalStatus: Optional[str] = None
    permanentAddress: Optional[str] = None
    currentAddress: Optional[str] = None
    note: Optional[str] = None


class CustomerOut(OutBase, CustomerCreate):
    id: str


# ---------- Hợp đồng ----------
class ContractCreate(BaseModel):
    houseId: str
    roomId: str
    customerId: str
    code: Optional[str] = ""
    signDate: Optional[DateType] = None
    startDate: Optional[DateType] = None
    endDate: Optional[DateType] = None
    price: Optional[int] = 0
    deposit: Optional[int] = 0
    people: Optional[int] = 1
    payMonths: Optional[int] = 1
    payFromDay: Optional[int] = 1
    payToDay: Optional[int] = 3
    services: Optional[dict] = {}
    status: Optional[str] = "active"


class ContractUpdate(BaseModel):
    houseId: Optional[str] = None
    roomId: Optional[str] = None
    customerId: Optional[str] = None
    code: Optional[str] = None
    signDate: Optional[DateType] = None
    startDate: Optional[DateType] = None
    endDate: Optional[DateType] = None
    price: Optional[int] = None
    deposit: Optional[int] = None
    people: Optional[int] = None
    payMonths: Optional[int] = None
    payFromDay: Optional[int] = None
    payToDay: Optional[int] = None
    services: Optional[dict] = None
    status: Optional[str] = None


class ContractOut(OutBase, ContractCreate):
    id: str


# ---------- Chốt điện / nước ----------
class MeterReadingCreate(BaseModel):
    houseId: str
    roomId: str
    type: str = "dien"
    prev: Optional[int] = 0
    current: Optional[int] = 0
    date: Optional[DateType] = None
    note: Optional[str] = ""


class MeterReadingUpdate(BaseModel):
    prev: Optional[int] = None
    current: Optional[int] = None
    date: Optional[DateType] = None
    note: Optional[str] = None


class MeterReadingOut(OutBase, MeterReadingCreate):
    id: str


# ---------- Chốt điện nước chủ nhà ----------
class LandlordMeterCreate(BaseModel):
    houseId: str
    date: Optional[DateType] = None
    dien: Optional[int] = 0
    nuoc: Optional[int] = 0
    internet: Optional[int] = 0
    vesinh: Optional[int] = 0


class LandlordMeterUpdate(BaseModel):
    date: Optional[DateType] = None
    dien: Optional[int] = None
    nuoc: Optional[int] = None
    internet: Optional[int] = None
    vesinh: Optional[int] = None


class LandlordMeterOut(OutBase):
    id: str
    houseId: str
    date: Optional[DateType] = None
    dien: int = 0
    nuoc: int = 0
    internet: int = 0
    vesinh: int = 0
    total: int = 0


# ---------- Hóa đơn ----------
class InvoiceLineIn(BaseModel):
    label: str = ""
    unitPrice: Optional[int] = 0
    unit: Optional[str] = ""
    qty: Optional[int] = 0
    prev: Optional[int] = None
    current: Optional[int] = None
    amount: Optional[int] = 0


class InvoiceLineOut(OutBase, InvoiceLineIn):
    id: str
    invoiceId: str


class InvoiceCreate(BaseModel):
    kind: str = "monthly"
    code: Optional[str] = ""
    houseId: str
    roomId: Optional[str] = None
    month: Optional[str] = None
    roomFee: Optional[int] = 0
    total: Optional[int] = 0
    discount: Optional[int] = 0
    paidAmount: Optional[int] = 0
    status: Optional[str] = "unpaid"
    sent: Optional[bool] = False
    sentDate: Optional[DateType] = None
    createdDate: Optional[DateType] = None
    reason: Optional[str] = None
    lines: Optional[List[InvoiceLineIn]] = []


class InvoiceUpdate(BaseModel):
    kind: Optional[str] = None
    code: Optional[str] = None
    houseId: Optional[str] = None
    roomId: Optional[str] = None
    month: Optional[str] = None
    roomFee: Optional[int] = None
    total: Optional[int] = None
    discount: Optional[int] = None
    paidAmount: Optional[int] = None
    status: Optional[str] = None
    sent: Optional[bool] = None
    sentDate: Optional[DateType] = None
    createdDate: Optional[DateType] = None
    reason: Optional[str] = None
    lines: Optional[List[InvoiceLineIn]] = None


class InvoiceOut(OutBase):
    id: str
    kind: str
    code: Optional[str] = ""
    houseId: str
    roomId: Optional[str] = None
    month: Optional[str] = None
    roomFee: int = 0
    total: int = 0
    discount: int = 0
    paidAmount: int = 0
    status: str = "unpaid"  # SUY RA từ total/discount/paidAmount (đồng bộ ở backend)
    sent: bool = False      # Đã gửi cho khách chưa (SPEC-WEB-2 F)
    sentDate: Optional[DateType] = None
    createdDate: Optional[DateType] = None
    reason: Optional[str] = None
    lines: List[InvoiceLineOut] = []


class InvoicePaymentCreate(BaseModel):
    """Ghi 1 lần thanh toán cho hóa đơn (SPEC-WEB)."""
    date: Optional[DateType] = None
    amount: int
    receiver: Optional[str] = ""
    note: Optional[str] = ""


class InvoicePaymentOut(OutBase):
    id: str
    invoiceId: str
    date: Optional[DateType] = None
    amount: int = 0
    receiver: Optional[str] = ""
    note: Optional[str] = ""


class MonthlyInvoiceRequest(BaseModel):
    """Tạo hóa đơn tháng từ hợp đồng đang hiệu lực của phòng."""
    roomId: str
    month: str  # 'YYYY-MM'
    people: Optional[int] = None          # ghi đè số người cho dòng theo người
    dienPrev: Optional[int] = None
    dienCurr: Optional[int] = None
    nuocPrev: Optional[int] = None
    nuocCurr: Optional[int] = None


class MonthlyBatchRequest(BaseModel):
    """Tạo hóa đơn tháng cho MỌI phòng có HĐ active (SPEC-WEB-2 F).
    Đợt 5: thêm toMonth tùy chọn — tạo cho CẢ KHOẢNG tháng month..toMonth
    (vắng mặt = chỉ tháng `month` như cũ)."""
    month: str  # 'YYYY-MM'
    toMonth: Optional[str] = None  # 'YYYY-MM'


class MarkSentRequest(BaseModel):
    """Đánh dấu đã gửi cho danh sách hóa đơn (SPEC-WEB-2 F)."""
    invoiceIds: List[str] = []


class LiquidateRequest(BaseModel):
    """Thanh lý hợp đồng: chỉ số cuối + ngày thanh lý + tùy chọn hoàn tiền phòng."""
    liquidateDate: DateType
    dienFinal: Optional[int] = None
    nuocFinal: Optional[int] = None
    refundRoomFee: bool = False           # tick hoàn tiền phòng thừa
    prepaidRoomFee: int = 0               # số tiền phòng đã trả thừa
    confirm: bool = False                 # true = chốt thanh lý thật


# ---------- Phiếu thu ----------
class ReceiptCreate(BaseModel):
    code: Optional[str] = ""
    houseId: Optional[str] = None
    roomId: Optional[str] = None
    contractCode: Optional[str] = ""
    invoiceId: Optional[str] = None
    title: str = ""
    amount: Optional[int] = 0
    createdDate: Optional[DateType] = None
    collectDate: Optional[DateType] = None
    collector: Optional[str] = ""
    payer: Optional[str] = ""
    note: Optional[str] = ""


class ReceiptUpdate(BaseModel):
    code: Optional[str] = None
    houseId: Optional[str] = None
    roomId: Optional[str] = None
    contractCode: Optional[str] = None
    invoiceId: Optional[str] = None
    title: Optional[str] = None
    amount: Optional[int] = None
    createdDate: Optional[DateType] = None
    collectDate: Optional[DateType] = None
    collector: Optional[str] = None
    payer: Optional[str] = None
    note: Optional[str] = None


class ReceiptOut(OutBase, ReceiptCreate):
    id: str


# ---------- Xe ----------
class VehicleCreate(BaseModel):
    houseId: str
    roomId: Optional[str] = None
    type: str = "Xe máy"
    plate: Optional[str] = ""
    ownerName: Optional[str] = ""
    fee: Optional[int] = 0
    brand: Optional[str] = ""
    color: Optional[str] = ""


class VehicleUpdate(BaseModel):
    houseId: Optional[str] = None
    roomId: Optional[str] = None
    type: Optional[str] = None
    plate: Optional[str] = None
    ownerName: Optional[str] = None
    fee: Optional[int] = None
    brand: Optional[str] = None
    color: Optional[str] = None


class VehicleOut(OutBase, VehicleCreate):
    id: str


# ---------- Tài sản ----------
class AssetCreate(BaseModel):
    houseId: str
    roomId: Optional[str] = None
    code: Optional[str] = ""
    owner: Optional[str] = "room"  # Đợt 19: đổi tên từ ownerType cho khớp 'Chủ sở hữu'
    type: str = ""
    status: Optional[str] = "Tốt"
    note: Optional[str] = ""
    imageUrl: Optional[str] = ""


class AssetUpdate(BaseModel):
    houseId: Optional[str] = None
    roomId: Optional[str] = None
    code: Optional[str] = None
    owner: Optional[str] = None
    type: Optional[str] = None
    status: Optional[str] = None
    note: Optional[str] = None
    imageUrl: Optional[str] = None


class AssetOut(OutBase, AssetCreate):
    id: str


# ---------- Đơn vị tính ----------
class UnitCreate(BaseModel):
    name: str


class UnitUpdate(BaseModel):
    name: Optional[str] = None


class UnitOut(OutBase, UnitCreate):
    id: str


# ---------- Dịch vụ ----------
class ServiceCreate(BaseModel):
    name: str
    price: Optional[int] = 0
    unitId: Optional[str] = None


class ServiceUpdate(BaseModel):
    name: Optional[str] = None
    price: Optional[int] = None
    unitId: Optional[str] = None


class ServiceOut(OutBase, ServiceCreate):
    id: str


# ---------- Chi tiêu / Phiếu chi ----------
class ExpenseCreate(BaseModel):
    houseId: Optional[str] = None
    code: Optional[str] = ""
    roomId: Optional[str] = None
    contractCode: Optional[str] = ""
    title: str = ""
    amount: Optional[int] = 0
    date: Optional[DateType] = None
    payDate: Optional[DateType] = None
    spender: Optional[str] = ""
    receiverName: Optional[str] = ""
    receiverPhone: Optional[str] = ""
    note: Optional[str] = ""


class ExpenseUpdate(BaseModel):
    houseId: Optional[str] = None
    code: Optional[str] = None
    roomId: Optional[str] = None
    contractCode: Optional[str] = None
    title: Optional[str] = None
    amount: Optional[int] = None
    date: Optional[DateType] = None
    payDate: Optional[DateType] = None
    spender: Optional[str] = None
    receiverName: Optional[str] = None
    receiverPhone: Optional[str] = None
    note: Optional[str] = None


class ExpenseOut(OutBase, ExpenseCreate):
    id: str


# ---------- Sự cố ----------
class IncidentCreate(BaseModel):
    houseId: str
    roomId: Optional[str] = None
    type: str = "Khác"
    phone: Optional[str] = ""
    note: Optional[str] = ""
    status: Optional[str] = "Chưa sửa"
    creator: Optional[str] = ""
    assignee: Optional[str] = ""
    date: Optional[DateType] = None


class IncidentUpdate(BaseModel):
    houseId: Optional[str] = None
    roomId: Optional[str] = None
    type: Optional[str] = None
    phone: Optional[str] = None
    note: Optional[str] = None
    status: Optional[str] = None
    creator: Optional[str] = None
    assignee: Optional[str] = None
    date: Optional[DateType] = None


class IncidentOut(OutBase, IncidentCreate):
    id: str


# ---------- Đặt cọc ----------
class DepositCreate(BaseModel):
    houseId: str
    roomId: str
    code: Optional[str] = ""
    customerId: Optional[str] = None
    customerName: Optional[str] = ""
    phone: Optional[str] = ""
    amount: Optional[int] = 0
    rentPrice: Optional[int] = 0
    vacantDays: Optional[int] = 0
    payMonths: Optional[int] = 1
    payDayFrom: Optional[int] = 1
    payDayTo: Optional[int] = 3
    serviceConfig: Optional[dict] = {}
    date: Optional[DateType] = None
    moveInDate: Optional[DateType] = None
    moveOutDate: Optional[DateType] = None
    contractDate: Optional[DateType] = None
    expiryDate: Optional[DateType] = None
    note: Optional[str] = ""


class DepositUpdate(BaseModel):
    houseId: Optional[str] = None
    roomId: Optional[str] = None
    code: Optional[str] = None
    customerId: Optional[str] = None
    customerName: Optional[str] = None
    phone: Optional[str] = None
    amount: Optional[int] = None
    rentPrice: Optional[int] = None
    vacantDays: Optional[int] = None
    payMonths: Optional[int] = None
    payDayFrom: Optional[int] = None
    payDayTo: Optional[int] = None
    serviceConfig: Optional[dict] = None
    date: Optional[DateType] = None
    moveInDate: Optional[DateType] = None
    moveOutDate: Optional[DateType] = None
    contractDate: Optional[DateType] = None
    expiryDate: Optional[DateType] = None
    note: Optional[str] = None


class DepositOut(OutBase, DepositCreate):
    id: str
    # Đợt 29: frontend cần created_at để chọn cọc mới nhất của phòng khi tạo hợp đồng.
    created_at: Optional[DateTimeType] = None


# ---------- Chủ nhà ----------
class LandlordCreate(BaseModel):
    name: str
    phone: Optional[str] = ""
    address: Optional[str] = ""
    dob: Optional[DateType] = None
    gender: Optional[str] = ""
    job: Optional[str] = ""
    maritalStatus: Optional[str] = ""
    email: Optional[str] = ""
    idCard: Optional[str] = ""
    permanentAddress: Optional[str] = ""
    idCardImage1: Optional[str] = ""
    idCardImage2: Optional[str] = ""


class LandlordUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    dob: Optional[DateType] = None
    gender: Optional[str] = None
    job: Optional[str] = None
    maritalStatus: Optional[str] = None
    email: Optional[str] = None
    idCard: Optional[str] = None
    permanentAddress: Optional[str] = None
    idCardImage1: Optional[str] = None
    idCardImage2: Optional[str] = None


class LandlordOut(OutBase, LandlordCreate):
    id: str


# ---------- Hợp đồng chủ nhà ----------
class LandlordContractCreate(BaseModel):
    landlordId: str
    houseId: str
    code: Optional[str] = ""
    rentPrice: Optional[int] = 0
    deposit: Optional[int] = 0
    startDate: Optional[DateType] = None
    endDate: Optional[DateType] = None
    payDay: Optional[int] = 5
    payMonths: Optional[int] = 1
    payFromDay: Optional[int] = 1
    payToDay: Optional[int] = 3
    payDate: Optional[DateType] = None
    firstPayDate: Optional[DateType] = None
    status: Optional[str] = "active"


class LandlordContractUpdate(BaseModel):
    landlordId: Optional[str] = None
    houseId: Optional[str] = None
    code: Optional[str] = None
    rentPrice: Optional[int] = None
    deposit: Optional[int] = None
    startDate: Optional[DateType] = None
    endDate: Optional[DateType] = None
    payDay: Optional[int] = None
    payMonths: Optional[int] = None
    payFromDay: Optional[int] = None
    payToDay: Optional[int] = None
    payDate: Optional[DateType] = None
    firstPayDate: Optional[DateType] = None
    status: Optional[str] = None


class LandlordContractOut(OutBase, LandlordContractCreate):
    id: str


# ---------- Thanh toán tiền nhà ----------
class HousePaymentCreate(BaseModel):
    houseId: str
    landlordId: Optional[str] = None
    amount: Optional[int] = 0
    date: Optional[DateType] = None
    status: Optional[str] = "paid"


class HousePaymentUpdate(BaseModel):
    houseId: Optional[str] = None
    landlordId: Optional[str] = None
    amount: Optional[int] = None
    date: Optional[DateType] = None
    status: Optional[str] = None


class HousePaymentOut(OutBase, HousePaymentCreate):
    id: str


# ---------- Tài khoản / nhân viên ----------
class AccountCreate(BaseModel):
    name: str
    phone: Optional[str] = ""
    role: Optional[str] = "staff"
    password: Optional[str] = None  # chỉ nhận vào khi tạo, server băm rồi lưu password_hash
    houseIds: Optional[List[str]] = []
    modules: Optional[List[str]] = []
    dob: Optional[DateType] = None
    gender: Optional[str] = ""
    job: Optional[str] = ""
    maritalStatus: Optional[str] = ""
    email: Optional[str] = ""
    idCard: Optional[str] = ""
    province: Optional[str] = ""
    district: Optional[str] = ""
    ward: Optional[str] = ""
    permanentAddress: Optional[str] = ""


class AccountUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    role: Optional[str] = None
    houseIds: Optional[List[str]] = None
    modules: Optional[List[str]] = None
    dob: Optional[DateType] = None
    gender: Optional[str] = None
    job: Optional[str] = None
    maritalStatus: Optional[str] = None
    email: Optional[str] = None
    idCard: Optional[str] = None
    province: Optional[str] = None
    district: Optional[str] = None
    ward: Optional[str] = None
    permanentAddress: Optional[str] = None


class AccountOut(OutBase):
    """Schema trả về — TUYỆT ĐỐI không chứa password / password_hash."""
    id: str
    name: str
    phone: Optional[str] = ""
    role: Optional[str] = "staff"
    houseIds: Optional[List[str]] = []
    modules: Optional[List[str]] = []
    dob: Optional[DateType] = None
    gender: Optional[str] = ""
    job: Optional[str] = ""
    maritalStatus: Optional[str] = ""
    email: Optional[str] = ""
    idCard: Optional[str] = ""
    province: Optional[str] = ""
    district: Optional[str] = ""
    ward: Optional[str] = ""
    permanentAddress: Optional[str] = ""


# ---------- Chức vụ ----------
class PositionCreate(BaseModel):
    name: str
    permissions: Optional[dict] = {}


class PositionUpdate(BaseModel):
    name: Optional[str] = None
    permissions: Optional[dict] = None


class PositionOut(OutBase, PositionCreate):
    id: str


# ---------- Phân chức vụ theo nhà ----------
class StaffAssignmentCreate(BaseModel):
    accountId: str
    houseId: str
    positionId: str


class StaffAssignmentUpdate(BaseModel):
    accountId: Optional[str] = None
    houseId: Optional[str] = None
    positionId: Optional[str] = None


class StaffAssignmentOut(OutBase, StaffAssignmentCreate):
    id: str


# ---------- Thanh toán điện nước của nhà ----------
class HouseUtilityCreate(BaseModel):
    houseId: str
    type: str = "dien"
    customerCode: Optional[str] = ""
    accountHolder: Optional[str] = ""
    username: Optional[str] = ""
    password: Optional[str] = ""
    month: Optional[str] = ""
    amount: Optional[int] = 0
    status: Optional[str] = "unpaid"


class HouseUtilityUpdate(BaseModel):
    houseId: Optional[str] = None
    type: Optional[str] = None
    customerCode: Optional[str] = None
    accountHolder: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None
    month: Optional[str] = None
    amount: Optional[int] = None
    status: Optional[str] = None


class HouseUtilityOut(OutBase, HouseUtilityCreate):
    id: str


class PayUtilityRequest(BaseModel):
    """Body tùy chọn khi thanh toán điện/nước nhà: amount > 0 sẽ cập nhật
    số tiền của bản ghi trước khi đánh dấu đã thanh toán + sinh phiếu chi."""
    amount: Optional[int] = None


# ---------- Đăng nhập / xác thực ----------
class LoginRequest(BaseModel):
    phone: str
    password: str


class UserOut(OutBase):
    """Thông tin người dùng trả về khi đăng nhập / GET /api/auth/me."""
    id: str
    name: str
    phone: Optional[str] = ""
    role: Optional[str] = "staff"
    modules: Optional[List[str]] = []
    houseIds: Optional[List[str]] = []


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str


class ResetPasswordRequest(BaseModel):
    new_password: str


class VerifyPasswordRequest(BaseModel):
    """Xác thực lại mật khẩu của người đang đăng nhập (vd trước khi Xóa)."""
    password: str
