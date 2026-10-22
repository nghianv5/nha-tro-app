# SPEC — Web app Quản lý nhà trọ (theo thiết kế Balsamiq NhaTro_mobile__new.bmpr)

Nguồn thiết kế: file dump đầy đủ tại `~/workspace/nha-tro-app/design-text-dump.txt` (85 màn hình).
Đọc kỹ các màn hình có tên tương ứng trong dump trước khi code từng module.

## Sản phẩm
- 1 file HTML duy nhất: `~/workspace/nha-tro-app/index.html` (CSS + JS inline, KHÔNG dùng thư viện ngoài, chạy offline).
- Giao diện mobile: khung điện thoại max-width 430px căn giữa, nền ngoài xám, header xanh dương (#1976d2 hoặc tương tự), bottom tab bar 5 tab: Home, Phòng, Hóa đơn, Sự cố, Menu.
- Toàn bộ UI tiếng Việt, định dạng tiền vi-VN: 3.000.000đ.
- Dữ liệu lưu localStorage key `nhatro_db_v1`; nếu chưa có thì seed dữ liệu mẫu đúng như thiết kế (xem mục Seed).
- Kiến trúc: SPA — mỗi "màn hình" là 1 view render bằng JS, có nút back, điều hướng qua hàm show(view, params). Form thêm/sửa dạng trang riêng. Danh sách dạng card.

## Mô hình dữ liệu (collections)
- houses: {id, address, province, district, ward, floors, floorArea, bedrooms, bathrooms, type: 'own'|'rented', landlordId?}
- rooms: {id, houseId, name, floor, area, type, toilet ('Khép kín'|'Vệ sinh riêng'|'Vệ sinh chung'), withOwner(bool), price, minDeposit, maxPeople, payMonths, payFromDay, payToDay, amenities[], status: derived (có HĐ active = đã thuê, có cọc = đã cọc, else trống)}
- customers: {id, name, dob, phone, gender, email, idCard}
- contracts: {id, houseId, roomId, customerId (người đại diện), signDate, startDate, endDate, price, deposit, people, payMonths, payFromDay, payToDay, services: {dien: {price, unit:'so'}, nuoc:{price, unit:'nguoi'|'so'}, xeMay:{count, fee}, oTo:{count, fee}, xeDap:{count, fee}}, status: 'active'|'liquidated'}
- meterReadings: {id, houseId, roomId, type:'dien'|'nuoc', prev, current, date, note}
- landlordMeterReadings: {id, houseId, date, dien, nuoc, internet, vesinh, total} (chốt điện nước chủ nhà — số tiền)
- invoices: {id, kind:'monthly'|'other', houseId, roomId, month, roomFee, lines:[{label, unitPrice, unit, qty, amount}], total, status:'paid'|'unpaid', createdDate, reason?}
- vehicles: {id, houseId, roomId, type ('Xe máy'|'Ô tô'|'Xe đạp'), plate, ownerName, fee}
- assets: {id, houseId, roomId?, code, type, status ('Mới'|'Như mới'|'Tốt'|'Cũ'|'Hỏng'|'Mất')}
- services: {id, name, price, unitId}
- units: {id, name} (vd: số, người, phòng, xe, tháng)
- expenses: {id, houseId, title, amount, date, note}
- incidents: {id, houseId, roomId, type ('Hỏng điện'|'Hỏng nước'|'Hỏng mạng'|'Khác'), phone, note, status ('Chưa sửa'|'Tiếp nhận sự cố'|'Đang sửa'|'Đã sửa'), creator, assignee}
- deposits: {id, houseId, roomId, customerName, phone, amount, date, note}
- landlords: {id, name, phone, address}
- landlordContracts: {id, landlordId, houseId, rentPrice, startDate, endDate, payDay}
- housePayments: {id, houseId, landlordId, amount, date, status}
- accounts: {id, name, phone, role, houseIds[]} (phân quyền nhân sự + theo nhà)

## Màn hình bắt buộc (theo thứ tự ưu tiên)
1. **Home** ("Quan lý Phòng Tro - Home" + "Quan ly nha tro"): header "Quản lý nhà trọ"; thẻ tổng: Tiền thanh toán sắp tới (tổng hóa đơn chưa TT của các HĐ còn hiệu lực... hiển thị tổng tiền phòng sắp thu), Sắp hết hợp đồng (số HĐ còn ≤30 ngày); lưới thống kê: Phòng trống, Cọc (số đặt cọc), Sự cố chưa hoàn thành, Hóa đơn chưa thanh toán, Chưa chốt điện nước (số phòng chưa chốt tháng này), Sắp hết hạn hợp đồng, Quá hạn thanh toán; "Danh sách nhà" — các nhà (địa chỉ) bấm vào → DS phòng của nhà.
2. **Menu** (tab Menu): avatar + "Nguyễn Văn A"; các nút: Quản lý phòng, Quản lý nhà, Chủ nhà, Hợp đồng, Tài sản, Dịch vụ, Đơn vị tính, Chi tiêu, Xe, Đặt cọc, Chốt điện nước chủ nhà, Thanh toán tiền nhà, Phân quyền, Phân tích, Cài đặt. (Menu gốc có: Quản lý phòng, Quản lý nhà, Phân quyền, Phân tích, Cài đặt — bổ sung các module còn lại vào cùng màn hình cho đủ.)
3. **DS Nhà**: bộ lọc tỉnh/quận/phường (select đơn giản), card nhà: địa chỉ, diện tích sàn, số tầng, số phòng ngủ, số nhà tắm; nút Thêm nhà.
4. **Thêm nhà**: form các trường trên + loại nhà (Nhà của mình/Nhà thuê).
5. **DS Phòng theo nhà**: header địa chỉ nhà; card phòng: Phòng 101, loại phòng, giá; badge trạng thái (Trống/Đã thuê/Đã cọc); nút Thêm phòng; tab/lọc "Phòng trống".
6. **Thêm phòng** (đúng form trong dump): Tên phòng*, Tầng, Diện tích (m2), Loại phòng (select: Khép kín, Không khép kín, Homestay, Phòng đơn, Studio, 1 ngủ 1 khách, 2 ngủ 1 khách, 3 ngủ 1 khách), Vệ sinh (Khép kín/Vệ sinh riêng/Vệ sinh chung), Chung chủ (checkbox), Giá phòng*, Cọc tối thiểu, Số người ở tối đa, Số tháng thanh toán 1 lần*, Thời gian thanh toán: từ ngày–đến ngày, Tiện ích (checkbox: Ban công, Sân phơi, Cửa sổ, Bếp, Gác xép, Có chỗ để xe máy, Có chỗ để ô tô, Có chỗ để sạc xe điện), Tài sản của phòng (thêm dòng: mã TS, loại TS, trạng thái), Dịch vụ của phòng (Điện giá/số, Điện chung giá/người, Internet giá/người + Thêm dịch vụ). Lưu xong hiện popup: "Thêm phòng thành công — Thêm mới / Thêm từ bản sao / Bỏ qua" (đúng popup trong thiết kế).
7. **Chi tiết phòng**: thông tin phòng + tài sản + dịch vụ + nút: Tạo hợp đồng (nếu trống), Xem hợp đồng (nếu đã thuê), Chốt số điện, Chốt số nước, Tạo hóa đơn.
8. **DS Khách hàng**: card khách: tên, SĐT, phòng đang ở; bấm vào → Chi tiết khách hàng (thông tin cá nhân + tóm tắt HĐ: phòng, giá, cọc, số người, giá điện/nước).
9. **DS Hợp đồng**: chọn nhà; tab lọc: Tất cả / Đã ký hợp đồng / Chưa ký hợp đồng / Sắp hết hạn hợp đồng; card: Phòng, người đại diện + SĐT (chỉ hiển thị người đại diện — ghi chú trong thiết kế), Giá thuê, Số người, Thời gian từ–đến; phòng trống hiện "Trống" + nút Tạo hợp đồng.
10. **Tạo hợp đồng** (đúng form trong dump): chọn nhà + phòng trống; Người đại diện: Họ tên*, Ngày sinh, SĐT*, Giới tính, Email, CMND; Ngày ký hợp đồng (mặc định hôm nay); Thời gian thuê từ*–đến*; Giá phòng*, Cọc*, Số người ở*, Số tháng thanh toán 1 lần*, Thời gian thanh toán từ ngày–đến ngày; Dịch vụ: giá điện (đơn vị: số), giá nước (đơn vị: số/người), Xe máy (số lượng, phí/xe), Ô tô (số lượng, phí/xe), Xe đạp (số lượng, phí/xe). Nút "Đăng ký". Tạo HĐ → phòng thành Đã thuê, tạo khách hàng nếu chưa có.
11. **Chi tiết hợp đồng**: toàn bộ thông tin + nút Thanh lý hợp đồng.
12. **Thanh lý hợp đồng** (flow trong dump): bước 1 chốt công tơ (Điện chỉ số cuối, Nước chỉ số cuối) → bước 2 tạo hóa đơn thanh lý: Ngày thanh lý; Tiền khách nợ = Tiền phòng (tính theo ngày ở thực tế: giá/tháng × số ngày/30, làm tròn) + Tiền dịch vụ (điện theo chỉ số đầu–cuối × đơn giá; nước/điện chung/vệ sinh theo số người; xe theo số lượng); Tiền trả khách = Tiền phòng thừa (nếu có — cho tick chọn hoàn tiền phòng) + Tiền cọc; Tổng hợp: nếu khách nợ > trả khách → khách đóng thêm (phiếu thu), ngược lại → hoàn trả khách (phiếu chi). Nút hoàn tất → HĐ status liquidated, phòng về Trống, tạo invoice kind 'other' ghi nhận kết quả (hoặc expense nếu phiếu chi).
13. **Chốt số điện / Chốt số nước** (cho từng phòng có HĐ): hiển thị chỉ số kỳ trước (từ lần chốt gần nhất hoặc chỉ số đầu HĐ), nhập chỉ số mới, ngày chốt; lưu → meterReadings; **Lịch sử chốt điện / chốt nước**: list theo phòng + chi tiết từng lần (chỉ số đầu, cuối, số dùng).
14. **DS Hóa đơn**: lọc theo nhà + trạng thái (Tất cả/Chưa thanh toán/Đã thanh toán); card: phòng, tháng, tổng tiền, trạng thái.
15. **Tạo hóa đơn hàng tháng**: chọn nhà + phòng có HĐ + tháng; tự điền: Tiền phòng (theo HĐ); các dòng dịch vụ tính tự động: Điện (chỉ số đầu = lần chốt trước, chỉ số cuối = lần chốt mới nhất của tháng; nếu chưa chốt thì cho nhập tay), Nước (theo đơn vị HĐ), Điện chung, Vệ sinh, Xe máy/Ô tô/Xe đạp (số lượng × phí); Tổng; nút Tạo hóa đơn. Đúng layout "Tao hóa đơn hàng tháng" trong dump.
16. **Chi tiết hóa đơn hàng tháng**: như dump — nhà, phòng, trạng thái, Tiền phòng, Tiền dịch vụ + từng dòng (Đơn giá, Chỉ số đầu, Chỉ số cuối, Số người/Số lượng, Thành tiền), Tổng; nút Chỉnh sửa + Thanh toán (đánh dấu paid).
17. **Tạo hóa đơn khác**: Lý do thu, Số tiền thu, Đơn vị (người/phòng), Ghi chú, Chọn phòng nhận hóa đơn (checkbox list + Tất cả/Bỏ tất cả), nút Tạo hóa đơn / Tạo hóa đơn cả nhà → tạo 1 invoice 'other' cho mỗi phòng đã chọn (số tiền × số người nếu đơn vị là người).
18. **DS Xe / Thêm xe / Chi tiết xe**: nhà, phòng, loại xe, biển số, chủ xe, phí.
19. **Tài sản — Tổng quan**: thống kê số lượng theo trạng thái + DS tài sản (lọc theo nhà/phòng); Thêm tài sản; Chi tiết/Cập nhật tài sản (đổi trạng thái).
20. **Dịch vụ**: DS dịch vụ (tên, giá, đơn vị); Thêm dịch vụ. **Đơn vị tính**: DS + thêm.
21. **Chi tiêu**: DS chi tiêu (theo nhà, ngày, số tiền); Thêm chi tiêu.
22. **Sự cố**: DS với bộ lọc Nhà/Phòng/Loại/Trạng thái (đúng dump); Thêm sự cố (Nhà, Phòng, Loại, SĐT người gặp sự cố, Ghi chú); Chi tiết sự cố + nút workflow: "Tiếp nhận sự cố" → trạng thái 'Tiếp nhận sự cố' + ghi người tiếp nhận; "Đang xử lý" → 'Đang sửa'; "Hoàn thành" → 'Đã sửa'. (Đúng tooltip workflow trong dump.)
23. **Đặt cọc**: DS khách cọc (tên, SĐT, phòng, số tiền, ngày); Đặt cọc phòng (form) → phòng thành 'Đã cọc'.
24. **Chủ nhà** (cho nhà thuê): DS chủ nhà; Thêm chủ nhà; DS hợp đồng chủ nhà; Tạo hợp đồng nhà (chủ nhà, nhà, giá thuê nhà, thời hạn, ngày thanh toán); Thanh toán tiền nhà (DS nhà thuê + nút thanh toán, ghi housePayments, trạng thái Đã/Chưa thanh toán); Chốt điện nước chủ nhà: theo nhà — nhập Tiền điện, Tiền nước, Tiền internet, Vệ sinh → tổng; Lịch sử chốt điện nước chủ nhà (theo ngày, từng khoản + tổng).
25. **Phân tích**: 4 thẻ/biểu đồ cột đơn giản (vẽ bằng div): Biểu đồ thu (tổng hóa đơn đã thanh toán theo 6 tháng gần nhất), Biểu đồ chi (chi tiêu + thanh toán tiền nhà theo tháng), Biểu đồ lợi nhuận (thu − chi theo tháng), Phân tích dòng vốn (bảng tháng: Thu, Chi, Lợi nhuận, Lũy kế).
26. **Phân quyền**: DS tài khoản nhân sự; Thêm tài khoản (tên, SĐT, vai trò); Cập nhật quyền nhân sự (checkbox module được phép); Phân quyền theo nhà (chọn tài khoản → tick các nhà được quản lý).
27. **Cài đặt**: thông tin người dùng (tên, SĐT), nút "Xóa dữ liệu & nạp lại dữ liệu mẫu", thông tin phiên bản.

## Seed dữ liệu mẫu (đúng tinh thần thiết kế)
- User: Nguyễn Văn A.
- Houses: "370 Bùi Xương Trạch" (Hà Nội, Thanh Xuân, Khương Đình, 5 tầng, 60m2, 10 phòng ngủ, 5 nhà tắm), "70 Bùi Xương Trạch", "12 Xã Đàn", "143 Trương Định", "15 Âu Cơ", "50 Hoàng Cầu", "70 Khương Trung".
- Rooms cho 370 BXT: Phòng 101 (Khép kín, 3.000.000đ, đã thuê), 102 (Khép kín, 3.000.000đ, đã thuê), 104 (Vệ sinh chung, 3.000.000đ, trống), thêm 201, 202.
- Customers + contracts: Phòng 101 — Nguyễn Văn B, 0362200801, 01/02/2020–31/01/2021 (điều chỉnh năm cho hợp lý: dùng 2026), giá 3.000.000, cọc 3.000.000, 3 người, điện 3.000đ/số, nước 80.000đ/người, điện chung 30.000đ/người, vệ sinh 20.000đ/người, xe máy 1 × 30.000đ.
- Meter readings mẫu cho phòng 101: điện kỳ trước 20 → 30; nước tương tự.
- 1 hóa đơn mẫu đã thanh toán đúng số trong dump: tổng 3.190.000đ (phòng 3.000.000 + dịch vụ 190.000).
- Dịch vụ mặc định: Điện 3.000đ/số; Nước 80.000đ/người; Điện chung 30.000đ/người; Vệ sinh 20.000đ/người; Internet 50.000đ/người; Xe máy 30.000đ/xe.
- Đơn vị tính: số, người, phòng, xe, tháng.
- Sự cố mẫu: 370 BXT Phòng 101, Hỏng điện, Chưa sửa, SĐT 0362200501, người tạo Nguyễn Văn T.
- Tài sản mẫu: Nóng lạnh (00000001, Tốt), Điều hòa (00000002, Tốt), Ghế (00000003, Tốt) ở phòng 101.

## Yêu cầu kỹ thuật
- Code sạch, có comment tiếng Việt ngắn gọn theo module.
- Tất cả thao tác CRUD phải hoạt động thật (thêm/sửa/xóa/lọc/chuyển trạng thái), dữ liệu persist qua localStorage.
- Tính tiền dùng số nguyên VND; hàm fmt(n) → "3.000.000đ".
- Không để lỗi JS: kiểm tra bằng `node --check` trên phần JS trích xuất, hoặc mở file kiểm tra cú pháp.
- Cuối file có comment tổng kết module đã làm.
