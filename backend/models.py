"""SQLAlchemy models cho toàn bộ thực thể theo SPEC.

Quy ước: thuộc tính Python dùng camelCase (khớp JSON API), tên cột trong DB
dùng snake_case. Các trường danh sách (tiện ích, dịch vụ HĐ, quyền...) lưu JSON.
"""
import uuid
from datetime import datetime

from sqlalchemy import (Boolean, Column, Date, DateTime, ForeignKey, Integer,
                        String, Text)
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
    province = Column("province", String, default="")
    district = Column(String, default="")
    ward = Column(String, default="")
    floors = Column(Integer, default=1)
    floorArea = Column("floor_area", Integer, default=0)
    bedrooms = Column(Integer, default=0)
    bathrooms = Column(Integer, default=0)
    type = Column(String, default="own")  # own | rented
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
    withOwner = Column("with_owner", Boolean, default=False)
    price = Column(Integer, default=0)
    minDeposit = Column("min_deposit", Integer, default=0)
    maxPeople = Column("max_people", Integer, default=0)
    payMonths = Column("pay_months", Integer, default=1)
    payFromDay = Column("pay_from_day", Integer, default=1)
    payToDay = Column("pay_to_day", Integer, default=3)
    amenities = Column(JSON, default=list)
    services = Column(JSON, default=dict)  # {dien, dienChung, internet, extra:[...]}


class Customer(TimestampMixin, Base):
    __tablename__ = "customers"
    id = Column(String, primary_key=True, default=_uid)
    name = Column(String, nullable=False)
    dob = Column(Date, nullable=True)
    phone = Column(String, default="")
    gender = Column(String, default="Nam")
    email = Column(String, default="")
    idCard = Column("id_card", String, default="")


class Contract(TimestampMixin, Base):
    __tablename__ = "contracts"
    id = Column(String, primary_key=True, default=_uid)
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
    kind = Column(String, default="monthly")  # monthly | other
    houseId = Column("house_id", String, ForeignKey("houses.id"), nullable=False, index=True)
    roomId = Column("room_id", String, ForeignKey("rooms.id"), nullable=True, index=True)
    month = Column(String, nullable=True, index=True)  # 'YYYY-MM' với hóa đơn tháng
    roomFee = Column("room_fee", Integer, default=0)
    total = Column(Integer, default=0)
    status = Column(String, default="unpaid")  # paid | unpaid
    createdDate = Column("created_date", Date, nullable=True)
    reason = Column(String, nullable=True)
    lines = relationship("InvoiceLine", back_populates="invoice",
                         cascade="all, delete-orphan", order_by="InvoiceLine.created_at")


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
    code = Column(String, default="")
    type = Column(String, default="")
    status = Column(String, default="Tốt")  # Mới|Như mới|Tốt|Cũ|Hỏng|Mất


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
    houseId = Column("house_id", String, ForeignKey("houses.id"), nullable=True, index=True)
    title = Column(String, default="")
    amount = Column(Integer, default=0)
    date = Column(Date, nullable=True)
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
    houseId = Column("house_id", String, ForeignKey("houses.id"), nullable=False, index=True)
    roomId = Column("room_id", String, ForeignKey("rooms.id"), nullable=False, index=True)
    customerName = Column("customer_name", String, default="")
    phone = Column(String, default="")
    amount = Column(Integer, default=0)
    date = Column(Date, nullable=True)
    note = Column(Text, default="")


class Landlord(TimestampMixin, Base):
    __tablename__ = "landlords"
    id = Column(String, primary_key=True, default=_uid)
    name = Column(String, nullable=False)
    phone = Column(String, default="")
    address = Column(String, default="")


class LandlordContract(TimestampMixin, Base):
    __tablename__ = "landlord_contracts"
    id = Column(String, primary_key=True, default=_uid)
    landlordId = Column("landlord_id", String, ForeignKey("landlords.id"), nullable=False, index=True)
    houseId = Column("house_id", String, ForeignKey("houses.id"), nullable=False, index=True)
    rentPrice = Column("rent_price", Integer, default=0)
    startDate = Column("start_date", Date, nullable=True)
    endDate = Column("end_date", Date, nullable=True)
    payDay = Column("pay_day", Integer, default=5)


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
    role = Column(String, default="staff")  # admin | staff (trước đây: Quản lý / Nhân viên...)
    passwordHash = Column("password_hash", String, nullable=True)  # bcrypt, NULL = chưa đặt mật khẩu
    houseIds = Column("house_ids", JSON, default=list)
    modules = Column(JSON, default=list)
