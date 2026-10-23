# SPEC-WEB-2 — Hoàn thiện ĐẦY ĐỦ theo thiết kế web (đợt bổ sung chi tiết)

Người dùng phản hồi bản web đợt 1 "thiếu rất nhiều" so với thiết kế. Đợt này: ĐỐI CHIẾU TỪNG MÀN HÌNH trong `design-web-dump.txt` (57 màn hình — đọc lại toàn bộ, kể cả tooltip/ghi chú) với code hiện tại, lập bảng đối chiếu, rồi bổ sung TẤT CẢ điểm thiếu dưới đây. Không được lược bớt. Giữ nguyên: nền tảng FastAPI+PostgreSQL, auth JWT, ensure_columns, 31 test hiện có phải tiếp tục pass.

## A. NHÀ TRỌ
1. Model `houses` thêm: `rentalMode` (Hình thức cho thuê: **Bao phòng | Bao người**). `businessType` đổi nhãn hiển thị thành "Loại nhà trọ / Loại hình kinh doanh", options hợp nhất cả 2 màn thiết kế: **Chung cư mini, Nhà nguyên căn, Homestay, Phòng đơn, Phòng trọ**.
2. Form Thêm/Sửa nhà phải dạng **4 tab** đúng thiết kế: **Thông tin nhà | Chủ nhà | Hợp Đồng | Tài sản chủ nhà**:
   - Tab Thông tin nhà: Tỉnh/TP*, Quận/Huyện*, Phường/Xã*, Địa chỉ*, Tên nhà, Vị trí trên bản đồ (ô text), Loại nhà trọ*, Hình thức cho thuê, Diện tích sàn* (m2), Số tầng*, Số phòng ngủ*, Số nhà vệ sinh*, Thêm mô tả.
   - Tab Chủ nhà: chọn chủ nhà có sẵn hoặc nhập mới — Họ tên*, avatar (bỏ qua), Ngày sinh*, Địa chỉ thường trú, SDT*, Giới tính, Nghề nghiệp, Tình trạng hôn nhân, Mail, CMND*.
   - Tab Hợp Đồng (nhà thuê): Tiền thuê*, Cọc*, Ngày bắt đầu thuê*, Ngày kết thúc hợp đồng*, Số tháng thanh toán 1 lần, Thời gian thanh toán từ ngày–đến ngày. **Cộng thêm mục "Mã Hóa Đơn dịch vụ"** (có trong form dài của thiết kế): Điện — Mã hóa đơn*, Tài khoản, Mật khẩu, Chủ tài khoản; Nước — Mã hóa đơn*, Tài khoản, Mật khẩu, Chủ tài khoản → khi lưu nhà, tạo luôn 2 bản ghi `house_utilities` tương ứng (tháng hiện tại, chưa thanh toán, amount trống/0).
   - Tab Tài sản chủ nhà: danh sách tài sản của chủ nhà trong nhà này (assets ownerType=landlord): Mã tài sản (cột mới `code` cho assets, tự sinh dạng 00000001), Loại tài sản, Trạng thái (**Mới | Như mới | Cũ | Hỏng | Mất | Tốt** — hợp nhất), image (bỏ qua), Note; nút "Thêm tài sản" thêm dòng ngay trong form.
3. DS Nhà: giữ bộ lọc cũ + bảng có ĐỦ cột hợp nhất từ cả 2 biến thể lưới trong thiết kế: STT, Tên nhà, Địa chỉ, Chủ nhà, SDT chủ nhà, Mã hợp đồng, Giá thuê nhà, **Số phòng, Số phòng trống**, Ngày thanh toán tiếp theo, Ngày kết thúc hợp đồng, [Sửa|Xóa]. (Số phòng/Số phòng trống tính từ rooms.)

## B. PHÒNG TRỌ
1. Model `rooms` thêm `subRooms` (Số phòng — số phòng con bên trong, từ form Thêm phòng web).
2. Form Thêm/Sửa phòng — tiện ích đúng 14 checkbox của thiết kế: **Cửa sổ, Ban công, Sân phơi, Thang máy, Điều hòa, Nóng lạnh, Máy giặt, Gác xép, Có chỗ để xe máy, Có chỗ để ô tô, Có chỗ để sạc xe điện, Bảo vệ, Camera, Internet**. Đủ trường: Tên phòng, Tầng, Loại phòng (7 loại như cũ), Diện tích, Chung chủ, Vệ sinh (Khép kín/Riêng/Chung), Số phòng (subRooms), Số người tối đa, Giá phòng, Cọc tối thiểu, Bếp, Dịch vụ của phòng (giá + đơn vị từng dịch vụ, thêm/xóa dòng), Tài sản trong phòng.
3. Bộ lọc DS Phòng bổ sung lọc tiện ích đúng tooltip thiết kế: Điều hòa, Nóng lạnh, Máy giặt, Tivi, Ban công, Cửa sổ, Có chỗ gửi xe (khớp amenities tương ứng; Tivi khớp tài sản Tivi trong phòng nếu có — nếu phức tạp thì lọc theo amenities có chứa "Tivi" và ghi chú trong báo cáo). Bảng cột mặc định đúng tooltip: STT, Tên nhà, Tầng, Tên phòng, **Cọc**, Giá phòng, Diện tích, Loại phòng, **Trạng thái**, Chung chủ, Vệ sinh, Gác xép, Bếp, Số người tối đa, Dịch vụ (tóm tắt tên dịch vụ).

## C. KHÁCH THUÊ (customers) — hồ sơ đầy đủ
Thêm cột: `dob, gender, job, maritalStatus, email, idCard, permanentAddress` (ensure_columns). Form khách (trong Quản lý → Khách thuê + các form nhúng dưới đây) có đủ: Họ tên*, Ngày sinh, Địa chỉ thường trú, SDT*, Giới tính, Nghề nghiệp, Tình trạng hôn nhân, Mail, CMND, CCCD ảnh (bỏ qua upload), địa chỉ hiện tại, ghi chú (giữ trường cũ).

## D. CỌC PHÒNG (deposits)
1. Thêm cột: `customerId` (FK customers), `payMonths` (Số tháng thanh toán 1 lần), `payDayFrom`, `payDayTo` (Thời gian thanh toán từ ngày–đến ngày), `serviceConfig` (JSON: giá điện + cách tính, giá nước + cách tính, số lượng + phí xe máy/ô tô/xe đạp).
2. Form Thêm cọc = trang **2 tab "Thông tin phòng | Thông tin cọc giữ phòng"** đúng thiết kế "Thêm coc":
   - Phần **Thông tin khách**: form hồ sơ khách ĐẦY ĐỦ như mục C (chọn khách cũ hoặc nhập mới → tạo customer).
   - Số tiền cọc giữ phòng*, Thời gian thuê từ ngày–đến ngày (= moveInDate–moveOutDate), Ngày cọc*, Ngày đến làm hợp đồng*, Ngày hết hạn cọc*.
   - Phần Thông tin phòng (tự điền từ phòng, cho sửa): Giá phòng, Cọc, Số người ở tối đa, Số tháng thanh toán 1 lần, Thời gian thanh toán từ–đến ngày, **Dịch Vụ**: giá điện + cách tính (số/người/phòng), giá nước + cách tính, số lượng xe máy + phí 1 xe, số lượng ô tô + phí 1 xe, số lượng xe đạp + phí 1 xe.
   - Nút "Cọc giữ phòng".

## E. HỢP ĐỒNG (contracts)
1. Form Thêm/Sửa HĐ bổ sung đầy đủ như thiết kế "Thêm Hop Dong": thông tin phòng tự điền; Giá phòng, Cọc, Số người; **Dịch Vụ cấu hình được**: giá điện + cách tính, giá nước + cách tính, số lượng xe máy + phí 1 xe, số lượng ô tô + phí 1 xe, số lượng xe đạp + phí 1 xe (lưu vào `contract_services` — hóa đơn tháng đã ưu tiên đọc từ đây); Ngày vào, Ngày ra, Số tháng thanh toán 1 lần, Thời gian thanh toán từ ngày–đến ngày; **phần Khách hàng**: chọn khách cũ hoặc nhập mới với hồ sơ ĐẦY ĐỦ như mục C.
2. DS Hợp đồng: cột đúng lưới "Hop đong": STT, Mã HĐ, Tên nhà, Tên phòng, Giá phòng, Giá thuê, Tiền cọc, Trạng thái phòng (Trống/Đang cọc/Đang thuê — suy ra), Thời gian trống phòng (ngày — lấy từ deposit gần nhất của phòng, không có thì để trống), Ngày vào, Ngày ra, Số người ở, Trạng thái HĐ, [Sửa | Thanh lý | Xóa]. Giữ tab lọc cũ.

## F. HÓA ĐƠN — quy trình TẠO + GỬI (phần thiếu lớn nhất)
Thêm cột `invoices.sent` (Boolean, mặc định false) + `sentDate` (ensure_columns). Trạng thái gửi hiển thị: "Chưa gửi" / "Đã gửi".
1. Màn **Tạo hóa đơn hàng tháng** (mục con trong Hóa Đơn): chọn Tháng + lọc Nhà/Phòng + lọc trạng thái (checkbox: Chưa tạo / Chưa gửi / Đã gửi). Bảng: mọi phòng có HĐ active — STT, Tên nhà, Tên phòng, Hóa đơn tháng, Trạng thái (Chưa tạo nếu chưa có hóa đơn tháng đó; Chưa gửi/Đã gửi theo cờ sent), checkbox chọn (header "Tất cả/Bỏ tất cả"), Chi tiết (link mở hóa đơn nếu đã tạo). Nút:
   - **Tạo hóa đơn**: tạo cho các phòng đã chọn (bỏ qua phòng đã có → báo lỗi từng phòng).
   - **Tạo toàn bộ hóa đơn**: endpoint batch mới `POST /api/invoices/monthly-batch` {month} → tạo cho MỌI phòng có HĐ active; trả về danh sách kết quả từng phòng {roomId, ok, invoiceId | error} — UI hiển thị bảng kết quả, phòng lỗi hiện lý do cụ thể (vd "Chưa chốt số điện tháng này", "Đã có hóa đơn tháng"). Trong lúc chạy nút hiện "Đang tạo hóa đơn..." (trạng thái thiết kế: "Chưa tạo hóa đơn xong"); chạy xong nút đổi thành **"Tạo lại toàn bộ hóa đơn"**; bấm tạo lại → popup xác nhận đúng câu chữ thiết kế: *"Chức năng tạo tất cả hóa đơn đã được thực hiện. Bạn có chắc chắn muốn tạo lại không?"* (tạo lại = bỏ qua phòng đã có, chỉ tạo phòng thiếu + báo cáo).
   - **Gửi Hóa đơn**: đánh dấu sent cho các hóa đơn đã chọn → `POST /api/invoices/mark-sent` {invoiceIds} → set sent=true, sentDate=hôm nay.
2. Màn **Hóa đơn đặc biệt** (mục con): DS hóa đơn kind=other: lọc Lý do thu (tìm), Ngày tạo Từ–Đến, trạng thái gửi (Chưa gửi/Đã gửi); bảng: STT, Tên nhà, Tên phòng, Ngày tạo, Trạng thái (gửi), Lý do thu, Số tiền thu, checkbox chọn, Chi tiết. Nút: Tạo hóa đơn đặc biệt, **Gửi Hóa đơn** (mark-sent các dòng đã chọn).
3. Màn **Tạo hóa đơn đặc biệt**: Lý do thu, Số tiền thu, Ghi chú, mục **Chọn người nhận hóa đơn**: lọc Nhà/Phòng + bảng phòng có checkbox (Tất cả/Bỏ tất cả) → nút "Tạo hóa đơn đặc biệt" (cho phòng đã chọn) và **"Tạo hóa đơn đặc biệt cho tất cả"** (batch mọi phòng có HĐ active). Mỗi phòng 1 hóa đơn other với 1 dòng thu = số tiền.
4. DS Hóa đơn chính: thêm cột **Gửi** (Chưa gửi/Đã gửi) + nút Gửi ngay trên từng dòng chưa gửi.
5. Seed: hóa đơn mẫu 3.190.000đ đặt sent=true để dữ liệu mẫu có cả 2 trạng thái.

## G. TÀI CHÍNH — Thu/Chi
- DS Thu và DS Chi: mỗi dòng có link **Chi tiết** mở trang/modal chi tiết phiếu (mọi trường + ghi chú) — kiểm tra bản hiện tại, thiếu thì bổ sung.
- Thống kê: giữ nguyên.

## H. ĐIỆN NƯỚC NHÀ (house_utilities)
- Bổ sung form **Thêm hóa đơn điện/nước tháng mới** cho một mã (chọn nhà + loại + mã + tháng + số tiền) ngay tại màn Thanh toán điện nước (thiết kế có dòng chưa có số tiền hiển thị "------" và chỉ có nút Lịch sử — tức là bản ghi tháng được tạo trước, bổ sung số tiền sau): cho phép **Sửa** số tiền của bản ghi chưa thanh toán.
- Bộ lọc: thêm khoảng Thời gian Từ–Đến (tháng) như biến thể lưới thứ hai, bên cạnh chọn tháng đơn hiện tại.

## I. NHÂN VIÊN / CHỨC VỤ / VAI TRÒ
- Form Thêm nhân viên: đủ các trường hồ sơ như thiết kế (đã có phần lớn) + Tỉnh/TP, Quận/Huyện, Phường/Xã của địa chỉ thường trú dạng select text — kiểm tra và bổ sung nếu thiếu.
- Màn Chức vụ: nút "Thêm Chức vụ" mở form chỉ gồm ô **Chức vụ** + nút Thêm (đúng mockup). Màn Vai trò theo chức vụ giữ ma trận quyền như đợt 1.

## J. THÔNG BÁO
- Mỗi thông báo hiển thị **ngày giờ** dạng `YYYY/M/D HH:mm` (dùng createdAt của sự cố/hóa đơn/cọc tương ứng; HĐ sắp hết hạn dùng ngày hiện tại). Kiểm tra API notifications trả trường thời gian có giờ — bổ sung nếu đang chỉ có ngày.

## K. Kiểm chứng bắt buộc (có bằng chứng trong báo cáo)
1. Bảng đối chiếu từng màn hình thiết kế → trạng thái sau bổ sung (Đủ / Đã bổ sung gì).
2. pytest toàn bộ pass (giữ 31 test cũ; thêm test mới cho: monthly-batch (tạo nhiều phòng + báo lỗi trùng), mark-sent, deposit kèm customer + serviceConfig, house tạo kèm utility accounts, contract service config ảnh hưởng hóa đơn tháng, customers trường mới).
3. Server thật: login OK; gọi thử monthly-batch + mark-sent + tạo nhà kèm mã hóa đơn dịch vụ → kiểm tra house_utilities có 2 bản ghi; `node --check` app.js.
4. Cập nhật README mục thay đổi đợt 2. Dọn `.venv`/`__pycache__`/`.pytest_cache`.

## Ngoài phạm vi
- Upload ảnh/avatar: để trống như cũ. Batch chạy ngầm thật (async queue): mô phỏng bằng gọi API đồng bộ + trạng thái nút như thiết kế (ghi rõ trong báo cáo). Không đổi auth/env/deploy (render.yaml, Dockerfile giữ nguyên).
