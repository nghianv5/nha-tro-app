"""Nạp dữ liệu mẫu đúng SPEC / thiết kế Balsamiq.

Chạy độc lập:  python -m backend.seed
Hoặc qua API:  POST /api/seed  (xóa dữ liệu cũ và nạp lại)
"""
from datetime import date

from . import models
from .database import SessionLocal
from .security import hash_password

# Tài khoản mặc định khi seed (đổi mật khẩu ngay sau lần đăng nhập đầu!)
ADMIN_PHONE, ADMIN_PASSWORD = "0901234567", "admin123"
STAFF_PHONE, STAFF_PASSWORD = "0901234568", "123456"


def _d(y, m, dd):
    return date(y, m, dd)


def ensure_auth_accounts(db):
    """Xử lý nâng cấp DB cũ (idempotent): nếu đã có tài khoản nhưng chưa tài khoản
    nào có mật khẩu đăng nhập, gán mật khẩu mặc định 'admin123' cho tài khoản
    admin đầu tiên (chưa có admin thì thăng tài khoản đầu tiên lên admin)."""
    accounts = (db.query(models.Account)
                .order_by(models.Account.created_at, models.Account.id).all())
    if not accounts:
        return
    if any(a.passwordHash for a in accounts):
        return
    admin = next((a for a in accounts if a.role == "admin"), accounts[0])
    admin.role = "admin"
    admin.passwordHash = hash_password(ADMIN_PASSWORD)
    db.commit()


def seed_db(db, force=False):
    """Nạp dữ liệu mẫu. force=True: xóa toàn bộ dữ liệu hiện có trước."""
    if force:
        for model in (models.InvoiceLine, models.InvoicePayment, models.Invoice,
                      models.Receipt, models.HouseUtility, models.StaffAssignment,
                      models.Position, models.MeterReading,
                      models.LandlordMeterReading, models.Contract, models.Deposit,
                      models.Incident, models.Expense, models.Vehicle, models.Asset,
                      models.Room, models.HousePayment, models.LandlordContract,
                      models.House, models.Customer, models.Landlord, models.Account,
                      models.Service, models.Unit):
            db.query(model).delete()
        db.commit()
    if db.query(models.House).count() > 0:
        # DB đã có dữ liệu: chỉ xử lý nâng cấp tài khoản cũ chưa có mật khẩu
        ensure_auth_accounts(db)
        return False

    # Đơn vị tính
    units = {}
    for name in ("số", "người", "phòng", "xe", "tháng"):
        u = models.Unit(name=name)
        db.add(u)
        db.flush()
        units[name] = u
    # Dịch vụ mặc định
    for name, price, unit in (("Điện", 3000, "số"), ("Nước", 80000, "người"),
                              ("Điện chung", 30000, "người"), ("Vệ sinh", 20000, "người"),
                              ("Internet", 50000, "người"), ("Xe máy", 30000, "xe")):
        db.add(models.Service(name=name, price=price, unitId=units[unit].id))

    # Chủ nhà mẫu
    ll1 = models.Landlord(name="Trần Văn D", phone="0905123456", address="Đống Đa, Hà Nội")
    ll2 = models.Landlord(name="Lê Đại Phát", phone="0362200120", address="Đống Đa, Hà Nội",
                          dob=_d(1992, 2, 1), gender="Nam", job="văn phòng",
                          maritalStatus="Độc thân", email="phat@gmail.com",
                          idCard="001092000999", permanentAddress="Lục Ngạn, Bắc Giang")
    db.add_all([ll1, ll2])
    db.flush()

    def add_house(address, province, district, ward, floors, area, bed, bath, typ, landlord=None,
                  name="", business=""):
        h = models.House(address=address, province=province, district=district, ward=ward,
                         floors=floors, floorArea=area, bedrooms=bed, bathrooms=bath,
                         type=typ, landlordId=landlord.id if landlord else None,
                         name=name, businessType=business)
        db.add(h)
        db.flush()
        return h

    H1 = add_house("370 Bùi Xương Trạch", "Hà Nội", "Thanh Xuân", "Khương Đình", 5, 60, 10, 5, "own",
                   name="Nhà Bùi Xương Trạch", business="Phòng trọ")
    H2 = add_house("70 Bùi Xương Trạch", "Hà Nội", "Thanh Xuân", "Khương Đình", 5, 60, 10, 5, "rented", ll1)
    H3 = add_house("12 Xã Đàn", "Hà Nội", "Đống Đa", "Phương Liên", 4, 50, 8, 4, "own",
                   name="Nhà Xã Đàn", business="Chung cư mini")
    add_house("143 Trương Định", "Hà Nội", "Hai Bà Trưng", "Trương Định", 4, 55, 8, 4, "own")
    add_house("15 Âu Cơ", "Hà Nội", "Tây Hồ", "Tứ Liên", 3, 45, 6, 3, "own")
    add_house("50 Hoàng Cầu", "Hà Nội", "Đống Đa", "Ô Chợ Dừa", 5, 70, 12, 6, "own")
    add_house("70 Khương Trung", "Hà Nội", "Thanh Xuân", "Khương Trung", 4, 52, 9, 4, "own")
    H8 = add_house("372 Xã Đàn", "Hà Nội", "Đống Đa", "Phương Liên", 4, 65, 13, 5, "rented", ll2,
                   name="Nhà Xã Đàn", business="Chung cư mini")

    def add_room(house, name, floor, area, typ, toilet, price, max_people):
        r = models.Room(houseId=house.id, name=name, floor=floor, area=area, type=typ,
                        toilet=toilet, withOwner=False, price=price, minDeposit=price,
                        maxPeople=max_people, payMonths=1, payFromDay=1, payToDay=3,
                        amenities=["Cửa sổ", "Bếp", "Có chỗ để xe máy"],
                        services={"dien": 3000, "dienChung": 30000, "internet": 50000, "extra": []})
        db.add(r)
        db.flush()
        return r

    R101 = add_room(H1, "Phòng 101", 1, 30, "Khép kín", "Khép kín", 3000000, 3)
    R102 = add_room(H1, "Phòng 102", 1, 28, "Khép kín", "Khép kín", 3000000, 3)
    add_room(H1, "Phòng 104", 1, 25, "Không khép kín", "Vệ sinh chung", 3000000, 2)
    R201 = add_room(H1, "Phòng 201", 2, 30, "Khép kín", "Khép kín", 3200000, 3)
    add_room(H1, "Phòng 202", 2, 26, "Studio", "Vệ sinh riêng", 2800000, 2)
    add_room(H2, "Phòng 101", 1, 30, "Khép kín", "Khép kín", 3000000, 3)
    add_room(H3, "Phòng 101", 1, 32, "Khép kín", "Khép kín", 3500000, 3)
    R8_101 = add_room(H8, "Phòng 101", 1, 30, "Chung cư mini", "Khép kín", 4500000, 3)
    R8_201 = add_room(H8, "Phòng 201", 2, 30, "Chung cư mini", "Khép kín", 4500000, 3)

    # Khách hàng + hợp đồng
    K1 = models.Customer(name="Nguyễn Văn B", dob=_d(1992, 2, 1), phone="0362200801",
                         gender="Nam", email="b@gmail.com", idCard="001092000111")
    K2 = models.Customer(name="Nguyễn Văn C", dob=_d(1995, 5, 10), phone="0362200802",
                         gender="Nam", email="c@gmail.com", idCard="001095000222")
    db.add_all([K1, K2])
    db.flush()

    def svc():
        return {"dien": {"price": 3000, "unit": "so"},
                "nuoc": {"price": 80000, "unit": "nguoi"},
                "dienChung": {"price": 30000}, "vesinh": {"price": 20000},
                "internet": {"price": 50000},
                "xeMay": {"count": 1, "fee": 30000},
                "oTo": {"count": 0, "fee": 100000}, "xeDap": {"count": 0, "fee": 10000}}

    db.add(models.Contract(houseId=H1.id, roomId=R101.id, customerId=K1.id, code="HD10120260201",
                           signDate=_d(2026, 2, 1), startDate=_d(2026, 2, 1), endDate=_d(2027, 1, 31),
                           price=3000000, deposit=3000000, people=3, payMonths=1,
                           payFromDay=1, payToDay=3, services=svc(), status="active"))
    db.add(models.Contract(houseId=H1.id, roomId=R102.id, customerId=K2.id, code="HD10220260301",
                           signDate=_d(2026, 3, 1), startDate=_d(2026, 3, 1), endDate=_d(2027, 2, 28),
                           price=3000000, deposit=3000000, people=2, payMonths=1,
                           payFromDay=1, payToDay=5, services=svc(), status="active"))

    # Chốt điện nước mẫu phòng 101
    db.add(models.MeterReading(houseId=H1.id, roomId=R101.id, type="dien", prev=20, current=30, date=_d(2026, 10, 5)))
    db.add(models.MeterReading(houseId=H1.id, roomId=R101.id, type="nuoc", prev=10, current=15, date=_d(2026, 10, 5)))

    # Hóa đơn mẫu đã thanh toán — tổng 3.190.000đ đúng thiết kế (SPEC-WEB: có mã,
    # paidAmount đầy đủ + 1 payment + 1 phiếu thu tương ứng)
    inv1 = models.Invoice(kind="monthly", houseId=H1.id, roomId=R101.id, month="2026-09",
                          code="10120261001090000",
                          roomFee=3000000, total=3190000, discount=0, paidAmount=3190000,
                          status="paid", sent=True, sentDate=_d(2026, 10, 2),
                          createdDate=_d(2026, 10, 1))
    for label, up, unit, qty, prev, curr, amount in (
            ("Điện", 3000, "số", 10, 20, 30, 30000), ("Nước", 80000, "người", 1, None, None, 80000),
            ("Điện chung", 30000, "người", 1, None, None, 30000), ("Vệ sinh", 20000, "người", 1, None, None, 20000),
            ("Xe máy", 30000, "xe", 1, None, None, 30000)):
        inv1.lines.append(models.InvoiceLine(label=label, unitPrice=up, unit=unit, qty=qty,
                                             prev=prev, current=curr, amount=amount))
    inv1.payments.append(models.InvoicePayment(date=_d(2026, 10, 2), amount=3190000,
                                               receiver="Nguyễn Văn A", note="Thanh toán đủ"))
    db.add(inv1)
    db.flush()
    db.add(models.Receipt(code="T10120261002090000", houseId=H1.id, roomId=R101.id,
                          contractCode="HD10120260201", invoiceId=inv1.id,
                          title="Thanh toán hóa đơn 10120261001090000", amount=3190000,
                          createdDate=_d(2026, 10, 2), collectDate=_d(2026, 10, 2),
                          collector="Nguyễn Văn A", payer="Nguyễn Văn B"))
    inv2 = models.Invoice(kind="monthly", houseId=H1.id, roomId=R102.id, month="2026-10",
                          code="10220261005090000",
                          roomFee=3000000, total=3260000, discount=0, paidAmount=0,
                          status="unpaid", createdDate=_d(2026, 10, 5))
    for label, up, unit, qty, amount in (("Nước", 80000, "người", 2, 160000),
                                         ("Điện chung", 30000, "người", 2, 60000),
                                         ("Vệ sinh", 20000, "người", 2, 40000)):
        inv2.lines.append(models.InvoiceLine(label=label, unitPrice=up, unit=unit, qty=qty, amount=amount))
    db.add(inv2)

    # Xe + tài sản + sự cố + đặt cọc + chi tiêu mẫu
    db.add(models.Vehicle(houseId=H1.id, roomId=R101.id, type="Xe máy", plate="89-N8 0404",
                          ownerName="Nguyễn Văn B", fee=30000, brand="Wave RSX", color="Đỏ"))
    for code, typ in (("00000001", "Nóng lạnh"), ("00000002", "Điều hòa"), ("00000003", "Ghế")):
        db.add(models.Asset(houseId=H1.id, roomId=R101.id, code=code, type=typ, status="Tốt"))
    db.add(models.Incident(houseId=H1.id, roomId=R101.id, type="Hỏng điện", phone="0362200501",
                           note="Mất điện cả phòng", status="Chưa sửa",
                           creator="Nguyễn Văn T", assignee="", date=_d(2026, 10, 18)))
    db.add(models.Deposit(houseId=H1.id, roomId=R201.id, customerName="Lê Thị E",
                          code="20120261015100000",
                          phone="0912345678", amount=1000000, rentPrice=3200000, vacantDays=5,
                          date=_d(2026, 10, 15), moveInDate=_d(2026, 11, 1),
                          moveOutDate=_d(2027, 10, 31), contractDate=_d(2026, 10, 20),
                          expiryDate=_d(2026, 11, 15), note="Cọc giữ phòng"))
    db.add(models.Expense(houseId=H1.id, title="Sửa ống nước tầng 1", amount=350000, date=_d(2026, 10, 10)))

    # Phiếu thu + phiếu chi mẫu đúng ví dụ thiết kế web (372 Xã Đàn)
    db.add(models.Receipt(code="T1012020091", houseId=H8.id, roomId=R8_101.id,
                          contractCode="HD10120200915", invoiceId=None,
                          title="Thu tiền phòng 101", amount=1000000,
                          createdDate=_d(2020, 3, 19), collectDate=_d(2020, 4, 19),
                          collector="Trần Văn Nam", payer="Nguyễn Văn Cường"))
    db.add(models.Expense(houseId=H8.id, roomId=R8_201.id, contractCode="HD10120200915",
                          code="CHI1012020091", title="Mua giường phòng 201", amount=1000000,
                          date=_d(2020, 3, 19), payDate=_d(2020, 4, 19),
                          spender="Trần Văn Nam", receiverName="Nguyễn Văn Cường",
                          receiverPhone="0362200801"))

    # Điện nước nhà mẫu: 372 Xã Đàn, mã điện, tháng hiện tại, chưa thanh toán
    from datetime import date as _date_cls
    db.add(models.HouseUtility(houseId=H8.id, type="dien", customerCode="10120200915",
                               accountHolder="Nguyễn Văn An", username="PD131241514123",
                               password="ePD131241514123",
                               month=_date_cls.today().strftime("%Y-%m"),
                               amount=3200000, status="unpaid"))

    # Hợp đồng chủ nhà + thanh toán tiền nhà mẫu
    db.add(models.LandlordContract(landlordId=ll1.id, houseId=H2.id, rentPrice=15000000,
                                   code="HD7020260101", deposit=15000000, status="active",
                                   startDate=_d(2026, 1, 1), endDate=_d(2026, 12, 31), payDay=5))
    db.add(models.LandlordContract(landlordId=ll2.id, houseId=H8.id, rentPrice=13000000,
                                   code="HD2312414124", deposit=13000000, status="active",
                                   startDate=_d(2026, 1, 1), endDate=_d(2026, 12, 31), payDay=1))
    db.add(models.HousePayment(houseId=H2.id, landlordId=ll1.id, amount=15000000,
                               date=_d(2026, 10, 5), status="paid"))

    # Tài khoản đăng nhập mẫu: admin (toàn quyền) + nhân viên (vài module)
    all_house_ids = [h.id for h in db.query(models.House).all()]
    admin_acc = models.Account(name="Nguyễn Văn A", phone=ADMIN_PHONE, role="admin",
                               passwordHash=hash_password(ADMIN_PASSWORD),
                               houseIds=all_house_ids, modules=["all"])
    staff_acc = models.Account(name="Nguyễn Văn T", phone=STAFF_PHONE, role="staff",
                               passwordHash=hash_password(STAFF_PASSWORD),
                               houseIds=[H1.id], modules=["incidents", "meter", "invoices"])
    phat_acc = models.Account(name="Lê Đại Phát", phone="03622200801", role="staff",
                              passwordHash=hash_password(STAFF_PASSWORD),
                              houseIds=[H8.id], modules=["all"],
                              dob=_d(1992, 2, 1), gender="Nam", job="văn phòng",
                              maritalStatus="Độc thân", email="phat@gmail.com",
                              idCard="001092000999", province="Hà Nội",
                              district="Đống Đa", ward="Phương Liên",
                              permanentAddress="Lục Ngạn, Bắc Giang")
    db.add_all([admin_acc, staff_acc, phat_acc])
    db.flush()

    # Chức vụ + ma trận quyền mặc định (SPEC-WEB mục 2/3.9)
    _mods = ("nha", "phong", "dichVu", "hopDong", "khachThue", "thuChi", "thongBao")

    def _perms(thongke, full=False, none=False):
        p = {"thongKe": thongke}
        for m in _mods:
            p[m] = {"add": full, "edit": full, "delete": full}
        return p

    positions = {}
    for pname, perms in (
            ("admin", _perms(True, full=True)),
            ("Quản lý", _perms(True, full=True)),
            ("Nhà đầu tư", _perms(True)),
            ("Kỹ thuật", _perms(False)),
            ("Bảo vệ", _perms(False)),
            ("Vệ sinh", _perms(False))):
        pos = models.Position(name=pname, permissions=perms)
        # Kỹ thuật được quyền thông báo để nhận việc sửa chữa
        if pname == "Kỹ thuật":
            pos.permissions["thongBao"] = {"add": True, "edit": True, "delete": False}
        db.add(pos)
        db.flush()
        positions[pname] = pos

    # Phân chức vụ theo nhà mẫu: Lê Đại Phát — Quản lý @ 372 Xã Đàn;
    # Nguyễn Văn T — Kỹ thuật @ 370 Bùi Xương Trạch
    db.add(models.StaffAssignment(accountId=phat_acc.id, houseId=H8.id,
                                  positionId=positions["Quản lý"].id))
    db.add(models.StaffAssignment(accountId=staff_acc.id, houseId=H1.id,
                                  positionId=positions["Kỹ thuật"].id))
    db.commit()
    return True


if __name__ == "__main__":
    session = SessionLocal()
    try:
        created = seed_db(session)
        print("Đã nạp dữ liệu mẫu." if created else "DB đã có dữ liệu, bỏ qua.")
    finally:
        session.close()
