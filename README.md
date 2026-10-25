# Quản lý nhà trọ "Nhà Trọ Việt" — Full-stack (FastAPI + PostgreSQL + Frontend WEB desktop)

Web app quản lý nhà trọ theo thiết kế Balsamiq web `nhatro_web.bmpr` (57 màn hình):
nhà, phòng, khách hàng, hợp đồng, chốt điện/nước, hóa đơn tháng/đặc biệt, thanh lý hợp đồng,
xe, tài sản, dịch vụ, đơn vị tính, phiếu thu/chi, sự cố (workflow trạng thái), đặt cọc,
chủ nhà + hợp đồng chủ nhà + thanh toán tiền nhà + chốt điện nước chủ nhà,
thanh toán điện/nước của nhà, chức vụ & phân vai trò, thông báo tổng hợp,
phân tích (biểu đồ thu/chi/lợi nhuận/dòng vốn), phân quyền nhân sự & theo nhà, cài đặt.

Giao diện **web desktop**: header ngang "Nhà Trọ Việt" + menu (Tổng quan | Nhà trọ |
Phòng trọ | Cọc Phòng | Hợp Đồng | Hóa Đơn | Tài chính | Dịch vụ | Nhân Viên | Thông báo |
Quản lý: Xe/Tài sản/Sự cố/Khách thuê/Đơn vị tính/Cài đặt), danh sách dạng bảng, form dạng trang.
**Mọi thao tác Xóa trên UI đều yêu cầu nhập lại mật khẩu** (xác thực qua
`POST /api/auth/verify-password`).

Hệ thống có **đăng nhập JWT** (số điện thoại + mật khẩu): toàn bộ API yêu cầu đăng nhập,
quản lý tài khoản chỉ dành cho `admin`.

## Đăng nhập & tài khoản mặc định

Sau lần chạy đầu (dữ liệu mẫu được nạp), đăng nhập bằng:

| Vai trò | Số điện thoại | Mật khẩu | Quyền |
|---|---|---|---|
| Admin (quản trị viên) | `0901234567` | `admin123` | Toàn quyền, gồm quản lý tài khoản |
| Staff (nhân viên mẫu) | `0901234568` | `123456` | Dùng API nghiệp vụ; không quản lý được tài khoản |

> ⚠️ **Đổi mật khẩu mặc định ngay sau lần đăng nhập đầu** (vào Cài đặt → Đổi mật khẩu).
> Admin có thể tạo tài khoản mới và đặt lại mật khẩu cho nhân viên tại mục **Phân quyền**.

Cấu hình bảo mật qua biến môi trường:

- `SECRET_KEY`: khóa ký JWT — **bắt buộc đổi khi chạy thật** (mặc định trong code chỉ để dev).
- `ACCESS_TOKEN_EXPIRE_DAYS`: thời hạn token, mặc định `7` ngày.
- Mật khẩu lưu dạng băm **bcrypt** (passlib), server không bao giờ trả mật khẩu/chuỗi băm về client.

> Nâng cấp từ bản cũ: các cột/bảng mới của bản web được **tự bổ sung khi khởi động**
> bằng cơ chế `ensure_columns()` (kiểm tra cột còn thiếu rồi `ALTER TABLE ADD COLUMN`,
> chạy trên cả SQLite và PostgreSQL) — **không cần xóa DB cũ**. Hóa đơn cũ ở trạng thái
> đã thanh toán cũng được tự gán `paidAmount = total − discount` khi nâng cấp.
> (Bản rất cũ chưa có đăng nhập: nếu cột `password_hash` đã tồn tại nhưng chưa tài khoản
> nào có mật khẩu, lần khởi động đầu sẽ tự gán mật khẩu `admin123` + quyền admin cho
> tài khoản quản lý đầu tiên; các tài khoản còn lại cần admin đặt lại mật khẩu.)

## Cách chạy

### Cách 1 — Docker Compose (khuyên dùng)

```bash
cd nha-tro-app
docker compose up --build
```

Mở http://localhost:8000 — gồm 2 service: `db` (PostgreSQL 16, dữ liệu lưu trong volume `pgdata`)
và `web` (FastAPI + frontend). Dữ liệu mẫu tự nạp ở lần chạy đầu khi DB trống.

### Cách 2 — Chạy tay

Yêu cầu: Python 3.11+, PostgreSQL đang chạy.

```bash
# 1) Tạo database + user trên PostgreSQL
psql -U postgres -c "CREATE USER nhatro WITH PASSWORD 'nhatro';"
psql -U postgres -c "CREATE DATABASE nhatro OWNER nhatro;"

# 2) Cài thư viện (nên dùng virtualenv)
cd nha-tro-app
python3 -m venv .venv && source .venv/bin/activate
pip install -r backend/requirements.txt

# 3) Chạy server (mặc định DATABASE_URL=postgresql+psycopg2://nhatro:nhatro@localhost:5432/nhatro)
uvicorn backend.main:app --host 0.0.0.0 --port 8000
```

Mở http://localhost:8000. Đổi chuỗi kết nối qua biến môi trường `DATABASE_URL` nếu cần
(DB SQLite cũng chạy được, vd để thử nhanh: `DATABASE_URL=sqlite:///./nhatro.db`).

### Nạp dữ liệu mẫu

- Tự động: khi DB trống, server tự seed ở lần khởi động đầu.
- Thủ công: `python -m backend.seed` (cũng chỉ nạp khi DB trống).
- Đợt 14 đã gỡ hẳn chức năng "Xóa dữ liệu & nạp lại dữ liệu mẫu" khỏi giao diện và API để tránh bấm nhầm làm mất dữ liệu thật.

### Chạy test

```bash
pip install pytest httpx   # (đã có nếu cài requirements + pytest)
python -m pytest tests/ -q
```

Test dùng FastAPI TestClient với SQLite tạm — kiểm chứng các luồng chính: tạo nhà → phòng →
hợp đồng → chốt điện → hóa đơn tháng **3.190.000đ** (khớp ví dụ thiết kế) → thanh toán →
thanh lý hợp đồng (hoàn trả khách **810.000đ** / thu thêm 190.000đ) → workflow sự cố → đặt cọc;
hệ thống đăng nhập: login đúng/sai mật khẩu, API chưa đăng nhập bị 401, đổi mật khẩu,
staff quản lý tài khoản bị 403, admin đặt lại mật khẩu; và các tính năng bản web:
verify-password, thanh toán hóa đơn từng phần → partial → paid + phiếu thu tự sinh,
phiếu thu/chi, chức vụ & phân công, điện nước nhà + phiếu chi tự sinh, thông báo tổng hợp,
`ensure_columns` trên DB cũ mô phỏng; và các bổ sung đợt 2 (SPEC-WEB-2):
monthly-batch + báo lỗi từng phòng, mark-sent, cọc kèm customer + serviceConfig,
nhà + tài khoản điện/nước, cấu hình dịch vụ của HĐ quyết định hóa đơn tháng,
hồ sơ khách đầy đủ, rentalMode/subRooms, mã tài sản tự sinh, thông báo có giờ
(tổng **43 test**).

## Cấu trúc thư mục

```
nha-tro-app/
├── backend/
│   ├── main.py          # FastAPI app: routers + ensure_columns + serve frontend tại /
│   ├── database.py      # Engine/session SQLAlchemy (DATABASE_URL) + ensure_columns (migration nhẹ)
│   ├── models.py        # 22 bảng: houses, rooms, customers, contracts, meter_readings,
│   │                    # landlord_meter_readings, invoices + invoice_lines + invoice_payments,
│   │                    # receipts, vehicles, assets, services, units, expenses, incidents,
│   │                    # deposits, landlords, landlord_contracts, house_payments, accounts,
│   │                    # positions, staff_assignments, house_utilities
│   ├── schemas.py       # Pydantic create/update/response cho từng thực thể
│   ├── calc.py          # Logic tính tiền thuần: dòng hóa đơn tháng, tính thanh lý
│   ├── seed.py          # Dữ liệu mẫu đúng thiết kế (hóa đơn mẫu 3.190.000đ, phiếu thu/chi mẫu...)
│   ├── security.py      # Băm mật khẩu bcrypt + JWT + dependency get_current_user/require_admin
│   ├── requirements.txt
│   └── routers/
│       ├── auth.py      # Đăng nhập JWT, /auth/me, verify-password, đổi/đặt lại mật khẩu
│       ├── crud.py      # Factory sinh REST CRUD cho từng module
│       └── business.py  # Dashboard, phân tích, hóa đơn + thanh toán, thanh lý,
│                        # thông báo tổng hợp, thanh toán điện nước nhà, chốt ĐN chủ nhà
├── frontend/
│   ├── index.html       # Khung web: header ngang "Nhà Trọ Việt" + menu desktop
│   ├── styles.css
│   └── app.js           # SPA web: đăng nhập + 11 khu vực màn hình, gọi REST API kèm JWT
├── tests/
│   ├── conftest.py      # Fixture TestClient + SQLite tạm + đăng nhập lấy token admin/staff
│   ├── test_api.py      # 12 test luồng nghiệp vụ
│   ├── test_auth.py     # 9 test đăng nhập & phân quyền API
│   ├── test_web.py      # 10 test tính năng bản web (SPEC-WEB)
│   └── test_web2.py     # 12 test bổ sung đợt 2 (SPEC-WEB-2)
├── docker-compose.yml   # db (postgres:16) + web
├── Dockerfile
├── SPEC.md              # Đặc tả bản mobile (cũ)
├── SPEC-WEB.md          # Đặc tả bản web hiện tại
└── design-*-dump.txt    # Nội dung trích xuất từ các file .bmpr gốc
```

## API chính (prefix `/api`)

> 🔒 Mọi endpoint dưới đây (trừ `POST /api/auth/login` và frontend tĩnh tại `/`) đều yêu cầu
> header `Authorization: Bearer <token>`. Chưa đăng nhập → `401`. Quản lý tài khoản
> (tạo/sửa/xóa `accounts`, đặt lại mật khẩu) chỉ `admin` gọi được, staff gọi → `403`.

| Nhóm | Endpoints |
|---|---|
| Đăng nhập | `POST /api/auth/login` `{phone, password}` → `{access_token, token_type, user}` • `GET /api/auth/me` • `POST /api/auth/change-password` `{old_password, new_password}` • `POST /api/auth/verify-password` `{password}` → 200/401 (UI gọi trước khi Xóa) |
| Đặt lại mật khẩu (admin) | `POST /api/accounts/{id}/reset-password` `{new_password}` |
| CRUD mỗi module | `GET/POST /api/{houses,rooms,customers,contracts,meter-readings,vehicles,assets,services,units,expenses,incidents,deposits,landlords,landlord-contracts,house-payments,accounts,receipts,positions,staff-assignments,house-utilities}` + `GET/PUT/DELETE /api/.../{id}` — hỗ trợ filter `?houseId=&roomId=&status=&kind=&type=&month=&accountId=&positionId=` |
| Hóa đơn | `GET/POST /api/invoices`, `GET/PUT/DELETE /api/invoices/{id}` (PUT thay cả dòng hóa đơn) |
| Thanh toán hóa đơn | `GET/POST /api/invoices/{id}/payments` `{date, amount, receiver, note}` — cập nhật `paidAmount`, trạng thái suy ra, **tự tạo phiếu thu** • `GET /api/invoice-payments` (lịch sử mọi hóa đơn) |
| Tạo hóa đơn tháng | `POST /api/invoices/monthly` `{roomId, month, people?, dienPrev/Curr?, nuocPrev/Curr?}` — tự tính từ hợp đồng + chỉ số chốt gần nhất; trùng tháng → 409 • `POST /api/invoices/monthly-batch` `{month}` (đợt 2) — tạo cho mọi phòng có HĐ hiệu lực, trả `{results: [{roomId, ok, invoiceId|error}]}` (lỗi: "Đã có hóa đơn tháng" / "Chưa chốt số điện tháng này") |
| Gửi hóa đơn (đợt 2) | `POST /api/invoices/mark-sent` `{invoiceIds}` → đặt `sent=true`, `sentDate` = hôm nay → `{count}` |
| Thanh lý hợp đồng | `POST /api/contracts/{id}/liquidate` `{liquidateDate, dienFinal, nuocFinal, refundRoomFee, prepaidRoomFee, confirm}` — `confirm:false` chỉ tính thử; `confirm:true` chốt: đóng HĐ, ghi chỉ số cuối, tạo hóa đơn thu thêm (nếu khách nợ) hoặc phiếu chi hoàn trả |
| Chốt điện nước chủ nhà | `GET/POST /api/landlord-meter-readings`, `PUT/DELETE .../{id}` — tổng tự tính |
| Thanh toán điện nước nhà | CRUD `/api/house-utilities` + `POST /api/house-utilities/{id}/pay` — đổi trạng thái → paid và **tự tạo phiếu chi** |
| Thông báo | `GET /api/notifications` — tổng hợp: sự cố chưa sửa, HĐ sắp hết hạn ≤30 ngày, hóa đơn chưa thanh toán, cọc sắp hết hạn (mới nhất trước) |
| Dashboard | `GET /api/dashboard` — tiền sắp thu, phòng trống, cọc, sự cố chưa xong, hóa đơn chưa TT, chưa chốt điện nước, sắp hết HĐ, quá hạn |
| Phân tích | `GET /api/analytics/summary` — thu (**theo phiếu thu**, ngày thu) / chi (phiếu chi + tiền nhà đã trả) / lợi nhuận 6 tháng + dòng vốn lũy kế |
| Health | `GET /api/health` |

## Khái niệm mới ở bản web

- **Trạng thái hóa đơn suy ra**: còn lại = `total − discount − paidAmount`; còn lại ≤ 0 →
  `paid` (Thanh toán hết), `paidAmount > 0` → `partial` (Thanh toán thiếu), ngược lại
  `unpaid` (Chưa thanh toán). PUT hóa đơn với `status: "paid"` vẫn được hỗ trợ (tự đặt
  `paidAmount = total − discount`). Mã hóa đơn/hợp đồng/cọc/phiếu thu/chi tự sinh theo
  format thiết kế khi tạo mới (vd phiếu thu `T101...`, phiếu chi `CHI...`).
- **Phiếu thu / phiếu chi**: quản lý ở menu Tài chính (tab Thu/Chi); thu theo tháng trong
  Phân tích lấy từ phiếu thu, chi lấy từ phiếu chi + thanh toán tiền nhà đã trả.
- **Thanh toán từng phần**: ghi từng lần thanh toán cho hóa đơn; mỗi lần ghi tự tạo
  1 phiếu thu tương ứng. Thanh toán điện/nước của nhà cũng tự tạo 1 phiếu chi.
- **Chức vụ & vai trò** (menu Nhân Viên): chức vụ (admin, Quản lý, Nhà đầu tư, Kỹ thuật,
  Bảo vệ, Vệ sinh) có ma trận quyền theo module (Thêm/Sửa/Xóa + xem Thống kê), gán cho
  nhân viên theo từng nhà qua bảng phân chức vụ. Đây là lớp nghiệp vụ bổ sung — quyền
  đăng nhập API (admin/staff) giữ nguyên.
- **Điện nước nhà** (Nhà trọ → Thanh toán điện nước): theo dõi mã điện/mã nước, tài khoản
  cổng thanh toán của từng nhà theo tháng; có lịch sử theo mã và nút thanh toán.
- **Thông báo**: tổng hợp tự động từ sự cố/HĐ/hóa đơn/cọc; bật/tắt theo loại ở ngay
  màn Thông báo (lưu trên trình duyệt).

## Bổ sung đợt 2 (SPEC-WEB-2 — bám sát thiết kế web)

- **Nhà — form 4 tab**: Thông tin nhà | Chủ nhà | Hợp Đồng | Tài sản chủ nhà.
  Thêm **Hình thức cho thuê** (`houses.rentalMode`: Bao phòng | Bao người);
  nhãn mục "Loại nhà trọ" đổi thành **"Loại hình kinh doanh"** (gộp tùy chọn:
  Chung cư mini, Nhà nguyên căn, Homestay, Phòng đơn, Phòng trọ). Tab Hợp Đồng
  có "Số tháng thanh toán 1 lần" + "Thời gian thanh toán từ–đến ngày" và mục
  **Mã Hóa Đơn dịch vụ**: lưu nhà kèm mã điện/mã nước sẽ tự tạo 2 bản ghi
  `house_utilities` của tháng hiện tại (chưa thanh toán, số tiền 0). Tab Tài sản
  chủ nhà cho thêm dòng tài sản (`assets.owner = 'landlord'`, mã tự sinh
  8 số, có ghi chú). DS Nhà thêm cột **Số phòng / Số phòng trống** (đã bỏ ở
  đợt 3 — xem mục dưới).
- **Phòng**: thêm **Số phòng con** (`rooms.subRooms`); 14 ô tiện ích đúng thiết
  kế (Cửa sổ, Ban công, Sân phơi, Thang máy, Điều hòa, Nóng lạnh, Máy giặt,
  Gác xép, Có chỗ để xe máy/ô tô/sạc xe điện, Bảo vệ, Camera, Internet) + bộ lọc
  **Tivi** khớp theo tài sản Tivi trong phòng; trình sửa dịch vụ phòng có
  **đơn giá + đơn vị** từng dịch vụ và thêm/bớt dòng dịch vụ khác.
- **Khách thuê — hồ sơ đầy đủ**: thêm Nghề nghiệp, Tình trạng hôn nhân, Địa chỉ
  thường trú, Địa chỉ hiện tại, Ghi chú (`customers.job/maritalStatus/...`) —
  dùng chung ở Quản lý → Khách thuê và các form chọn/tạo khách (cọc, hợp đồng).
- **Cọc giữ phòng — form 2 tab**: Thông tin phòng | Thông tin cọc giữ phòng.
  Khách liên kết bằng `deposits.customerId` (chọn có sẵn hoặc tạo mới đủ hồ sơ);
  thông tin phòng tự điền từ phòng đã chọn và sửa được; **cấu hình dịch vụ**
  (`deposits.serviceConfig`: giá điện/nước + đơn vị, số lượng + phí xe máy/ô
  tô/xe đạp) kèm "Số tháng thanh toán 1 lần" + "Thời gian thanh toán từ–đến".
- **Hợp đồng**: form chọn khách có sẵn hoặc tạo mới đủ hồ sơ, **có nút Sửa**
  (cả ở DS lẫn trang chi tiết); DS đúng lưới thiết kế (Giá phòng, Giá thuê,
  Trạng thái phòng, **Thời gian trống phòng** = ngày từ cọc gần nhất của phòng).
  Cấu hình dịch vụ lưu trên HĐ là nguồn tính hóa đơn tháng.
- **Hóa đơn — quy trình Tạo/Gửi**: cột mới `invoices.sent` + `sentDate`.
  Màn **Tạo hóa đơn hàng tháng**: chọn tháng + lọc Nhà/Trạng thái (Chưa tạo /
  Chưa gửi / Đã gửi), bảng mọi phòng có HĐ hiệu lực, chọn từng phòng tạo lẻ
  hoặc **Tạo toàn bộ hóa đơn** qua `POST /api/invoices/monthly-batch` — trả kết
  quả **từng phòng** kèm lỗi cụ thể ("Đã có hóa đơn tháng", "Chưa chốt số điện
  tháng này"); nút chuyển trạng thái "Đang tạo hóa đơn..." khi chạy và "Tạo lại
  toàn bộ hóa đơn" (có hộp xác nhận) sau khi xong. **Gửi Hóa đơn** qua
  `POST /api/invoices/mark-sent` (đánh dấu đã gửi + ngày gửi). Màn **Hóa đơn
  đặc biệt**: lọc theo Lý do thu / Ngày tạo / trạng thái gửi; form tạo có lọc
  Nhà/Phòng + bảng chọn phòng và nút **"Tạo hóa đơn đặc biệt cho tất cả"**.
- **Tài chính**: mỗi dòng phiếu thu/chi có link **Chi tiết** mở hộp thoại đầy
  đủ mọi trường + ghi chú.
- **Điện nước nhà**: lọc thêm theo **khoảng tháng (Từ–Đến)**; số tiền 0 hiển
  thị dạng `----------------`; nút "+ Thêm hóa đơn tháng mới"; sửa được số
  tiền của hóa đơn chưa thanh toán (form sửa sẵn có).
- **Nhân Viên**: nút "Thêm Chức vụ" mở form riêng chỉ gồm ô **Chức vụ** + nút
  **Thêm Chức vụ** (đúng mockup).
- **Thông báo**: thời gian hiển thị kèm **giờ** (`2026/10/23 10:41`) — API trả
  datetime đầy đủ từ `created_at` của bản ghi gốc.
- Cột mới đều đi qua `ensure_columns` (không cần xóa DB); hóa đơn mẫu
  3.190.000đ nay có `sent = true` để dữ liệu mẫu có cả 2 trạng thái gửi.

## Chỉnh màn Danh sách nhà đúng ảnh thiết kế (đợt 3)

Màn **Nhà trọ → Danh sách nhà** đã chỉnh lại đúng y hệt ảnh chụp màn thiết kế
Balsamiq "Danh sách Nhà tro" mà người dùng chốt:

- Dưới menu có 2 nút điều hướng con: **Danh sách nhà** | **Thanh toán điện nước**.
- Bộ lọc đúng **4 hàng**: (1) Tỉnh/thành phố — Quận/Huyện — Xã/phường (select
  "Tất cả"); (2) **Tên nhà** — **Địa chỉ** — **SDT chủ nhà**, cả 3 là ô text
  tìm kiếm, **gõ là lọc ngay** (chuỗi con, không phân biệt hoa thường; địa chỉ
  lọc trên địa chỉ đầy đủ gồm phường/quận/tỉnh); (3) **Thời gian thanh toán
  tiếp theo** Từ–Đến + checkbox **Sắp đến hạn thanh toán** (ngày thanh toán
  tiếp theo trong vòng 30 ngày tới); (4) **Thời gian kết thúc hợp đồng** Từ–Đến
  + checkbox **Sắp hết hạn hợp đồng** (HĐ chủ nhà kết thúc trong vòng 30 ngày
  tới). Mọi điều kiện kết hợp AND; có nút **Xóa bộ lọc**.
- Nút **Thêm nhà** ở góc phải, ngay phía trên bảng.
- Bảng đúng các cột của ảnh: STT | Tên nhà | Địa chỉ (đầy đủ: số nhà, phường,
  quận, tỉnh) | Chủ nhà | SDT chủ nhà | Mã hợp đồng | Giá thuê nhà (vnđ) |
  Ngày thanh toán tiếp theo (tính từ `payDay` của HĐ chủ nhà) | Ngày kết thúc
  hợp đồng | Sửa | Xóa. Đã **bỏ 2 cột Số phòng / Số phòng trống** của đợt 2.
  Nhà tự quản lý (không có HĐ chủ nhà) để trống các cột của hợp đồng. Xóa vẫn
  qua modal nhập mật khẩu xác thực. Chỉ sửa frontend (`frontend/app.js`),
  không đổi backend/API.

## Chỉnh màn Thanh toán điện nước đúng ảnh thiết kế (đợt 4)

Màn **Nhà trọ → Thanh toán điện nước** (`house_utilities`) đã chỉnh lại đúng
ảnh chụp màn thiết kế Balsamiq "Dien nuoc nha" mà người dùng chốt:

- Trên cùng có hàng nút điều hướng con **Danh sách nhà** | **Thanh toán
  điện nước**; dưới là thanh tab **[Điện] [Nước]** với nhãn đơn giản —
  **không còn kèm số đếm "(Chưa thanh toán N)"**. Tab thứ ba **Chốt điện
  nước chủ nhà** và nút **+ Thêm hóa đơn tháng mới** được giữ lại.
- Bộ lọc: **Tên nhà** và **Địa chỉ** là 2 ô text riêng, **gõ là lọc ngay**
  (chuỗi con, không phân biệt hoa thường; địa chỉ lọc trên địa chỉ đầy đủ);
  **Mã điện / Mã nước** lọc theo chuỗi con của mã khách hàng; **Thời gian**
  chỉ còn **1 ô chọn tháng** (đã bỏ bộ lọc khoảng tháng Từ–Đến của đợt 2) và
  **mặc định lấy tháng hiện tại** đúng ghi chú thiết kế; **Trạng thái** gồm
  Tất cả | Chưa thanh toán | Đã thanh toán. Mọi điều kiện kết hợp AND; nút
  **Xóa bộ lọc** đưa Thời gian về tháng hiện tại, các ô còn lại về mặc định.
- Bảng đúng thứ tự cột của ảnh: STT | Tên nhà | Địa chỉ (đầy đủ) | Mã Điện
  (tab Nước: Mã Nước) | Chủ tài khoản | Tài Khoản | Mật khẩu | Thời gian |
  Tiền thanh toán | nút hành động. **Bỏ cột Trạng thái dạng badge.** Thời
  gian hiển thị dạng `2020/9` (năm/tháng, không số 0 ở đầu); chưa có tiền
  (0/trống) hiển thị dãy gạch `--------------------`.
- **Nút hành động theo trạng thái** (điểm cốt lõi của ảnh): dòng **đã thanh
  toán** chỉ có nút **[Lịch sử]**; dòng **chưa thanh toán** có **[Thanh
  toán]** và **[Lịch sử]**. Nút Thanh toán mở **hộp thoại xác nhận** có ô
  **Số tiền thanh toán** (điền sẵn số tiền hiện có của bản ghi nếu > 0; để
  trống/0 thì bắt buộc nhập) — xác nhận sẽ cập nhật số tiền rồi mới đánh dấu
  đã thanh toán và sinh phiếu chi đúng số tiền đó. Nút Lịch sử xem mọi tháng
  của cùng một mã điện/nước.
- Backend mở rộng tối thiểu: `POST /api/house-utilities/{id}/pay` nhận thêm
  body tùy chọn `{amount}` — khi `amount > 0` thì cập nhật `amount` của bản
  ghi trước khi đổi trạng thái `paid` và sinh phiếu chi (không gửi body vẫn
  chạy như cũ). Có test mới `test_house_utilities_pay_with_amount`; tổng
  test hiện tại: **44**.

## Chỉnh 24 màn hình đúng ảnh thiết kế (đợt 5) + rà soát toàn bộ

Đợt này chỉnh các form/lưới cho khớp ảnh Balsamiq người dùng gửi và rà soát lại cả 57 màn
trong `design-web-dump.txt`. Quy ước mới: tiền ở lưới Phòng/Cọc/Hợp đồng hiển thị **theo triệu
dạng thập phân** (helper `fmtTrieu`: 4.500.000 → "4.5", cột ghi "(triệu)"); ảnh chụp người dùng
là chuẩn cao nhất khi khác spec cũ.

**Form (bỏ tab, chuyển 1 trang cuộn):**
- Nhà: 5 phần Thông Tin Nhà → Chủ Nhà → Hợp Đồng → Mã Hóa Đơn dịch vụ → Tài sản; Loại hình
  kinh doanh đúng 4 lựa chọn; khung placeholder bản đồ (📍) + ô ghi chú vị trí; chọn chủ nhà
  có sẵn tự điền hồ sơ; avatar + 2 ô ảnh CMND dạng placeholder; tài sản chủ nhà theo dòng
  (Loại tài sản select/Trạng thái select/ảnh placeholder, sửa nhà thì hiện tài sản sẵn có và
  cập nhật đúng dòng). Form bỏ "Hình thức cho thuê" (cột DB giữ nguyên, lưu nhà giữ giá trị cũ).
- Phòng: thứ tự trường theo ảnh; Giá phòng nhập theo TRIỆU (lưu ×1.000.000); Chung chủ = checkbox;
  Dịch vụ dạng từng dòng "Tên — giá vnđ/đơn vị" có nút Sửa từng dòng + hàng thêm dịch vụ từ
  danh mục; Bếp mặc định "Không có"; đúng 14 checkbox tiện ích; 7 loại phòng.
- Cọc: 1 trang, chọn Nhà → Phòng (tiêu đề "Phòng <tên>"), Thông tin khách (chọn khách có sẵn
  + hồ sơ đầy đủ + ảnh CMND placeholder, lưu cọc thì cập nhật luôn hồ sơ khách đã chọn),
  Thông tin phòng, Dịch Vụ; nút Cọc giữ phòng / Lưu thay đổi.
- Hợp đồng: 1 trang, Khách hàng ở cuối; lưới hợp đồng chỉ còn lọc Nhà/Phòng, bỏ tab trạng
  thái, bỏ nút Xóa và cột Trạng thái HĐ (vẫn xem ở Chi tiết hợp đồng), tiền theo triệu.

**Hóa đơn:**
- Lưới chính: bỏ cột Gửi; thêm cột Lịch sử thanh toán với icon ↻ (chỉ hiện khi đã có thanh
  toán, bấm mở popup Thời gian | Số tiền | Người nhận); Chi tiết/Sửa/Xóa gộp 1 cột.
- Chi tiết hóa đơn trình bày dạng chứng từ: "Hóa Đơn Tháng <n>" giữa trang, nhãn khoản thu
  "<Tên> theo <cách tính>" (Điện theo công tơ, Nước theo đầu người/công tơ/phòng...), hàng
  **Tổng dịch vụ**, **Tổng hóa đơn: … vnđ**; khối Quản lý thanh toán tách riêng bên dưới.
- Tạo hóa đơn hàng tháng: lọc Từ tháng – Đến tháng (tối đa 12 tháng), mỗi dòng = phòng ×
  tháng, nhãn tháng dạng 2020/10; nút Tạo lại toàn bộ có popup xác nhận đúng nguyên văn;
  bảng kết quả từng dòng kèm tháng. Backend: `POST /api/invoices/monthly-batch` nhận thêm
  `toMonth` tùy chọn (vắng mặt = hành vi cũ) — test mới `test_monthly_batch_range_two_months`.
- Hóa đơn đặc biệt: lưới có đủ select Nhà/Phòng + nút Gửi Hóa đơn; form tạo có Phòng trọ là
  select lọc, Số tiền thu là text, Ghi chú là textarea; thêm màn riêng **Gửi hóa đơn đặc biệt**
  (lọc Nhà/Phòng/Lý do thu/Ngày tạo, nút Gửi / Gửi tất cả).

**Tài chính:** lưới Thu thay cột Khoản thu bằng **Mã hóa đơn**; form phiếu thu/chi làm lại:
tab Thu/Chi trên cùng, Số tiền dạng text, Người thu/Người chi + Ngày tạo/Ngày thu (chi);
Đối tượng nộp tiền = cascade Nhà → Phòng → Khách thuê (từ hợp đồng đang thuê) + ô Người khác;
Đối tượng nhận tiền = 2 radio Khách thuê / Người khác (Tên + SĐT). Backend: thanh toán điện
nước nhà tự sinh phiếu chi với Người nhận = chủ tài khoản tiện ích, Người chi = người dùng
hiện tại; hoàn cọc khi thanh lý điền đủ phòng/hợp đồng/ngày chi/người nhận.

**Dịch vụ:** Thêm Dịch Vụ góc phải trên bảng, giá hiển thị đầy đủ vnđ, nút Sửa/Xóa dạng icon
✎/🗑 (xóa vẫn qua modal mật khẩu); form chỉ 3 trường (Tên, Giá [text], Đơn vị từ danh mục).

**Nhân viên:** đúng 3 tab con [Phân chức vụ theo nhà] [Danh sách nhân viên] [Phân chia vai
trò theo chức vụ]; tab danh sách gom theo nhân viên (rowspan, "Tên(SDT)", cột Nhà liệt kê
theo từng chức vụ), lọc Nhân Viên là select; form hồ sơ đầy đủ như khách/chủ nhà (avatar,
Tỉnh/Quận/Phường dạng select, CMND + 2 ảnh placeholder); tab vai trò: bảng STT | Chức vụ |
Vai Trò (tóm tắt quyền dạng chữ, admin = "Tất cả các quyền"), nút Thêm chức vụ dưới bảng,
ma trận quyền giữ nguyên. CRUD Chức vụ cũ gộp vào tab vai trò.

**Thông báo:** bỏ thẻ cài đặt khỏi đầu trang; nút ⚙ Cài đặt thông báo góc phải mở hộp thoại
bật/tắt từng loại (lưu localStorage); feed 2 cột: ngày giờ dạng `2021/1/14 21:19` + nội dung.

**Rà soát toàn bộ (audit):** sửa thêm — màn Lịch sử thanh toán (tất cả) cột đúng thiết kế
(thêm Mã Hợp đồng, bỏ Người nhận); lưới HĐ chủ nhà tiền theo triệu, Kỳ thanh toán "Mỗi N
tháng", Thời gian thanh toán "Ngày X đến Y"; hồ sơ khách/chủ nhà có avatar placeholder; form
chủ nhà nút Thêm chủ nhà / Lưu thay đổi; xuất CSV phòng thêm cột Số phòng + Dịch vụ; bản in
hóa đơn dùng cùng nhãn chứng từ + hàng Tổng dịch vụ. Các màn không có ảnh riêng (Tổng quan,
Xe, Tài sản, Sự cố, Khách thuê, Đơn vị tính, Cài đặt, đăng nhập) đã đối chiếu SPEC-WEB và giữ
nguyên vì đã khớp.

**Kiểm chứng đợt 5:** `node --check frontend/app.js` OK; pytest **45/45 pass** (44 cũ + 1
test mới batch theo khoảng); server thật + login admin: batch 2 tháng tạo đủ 2 hóa đơn, batch
kiểu cũ không `toMonth` báo lỗi "Đã có hóa đơn tháng" đúng, thanh toán điện/nước sinh phiếu
chi đúng người nhận/người chi; harness jsdom (app.js thật + API giả lập) **73/73 assert pass**
cho 24 mục + helper.

## Đợt 6 — Địa chỉ hành chính dạng select + tải ảnh thật + responsive mobile

1. **Select hành chính Việt Nam xếp tầng (form Thêm/Sửa nhà):** Tỉnh / TP, Quận / Huyện,
   Phường / Xã không còn là ô text — là 3 select xếp tầng: chọn Tỉnh → nạp Quận/Huyện →
   chọn Quận → nạp Phường/Xã. Dữ liệu hành chính thật đóng gói tĩnh tại
   `frontend/vn-admin.js` (nguồn: provinces.open-api.vn, API depth=3 — **63 tỉnh/thành,
   696 quận/huyện, 10.051 phường/xã**), app tự chạy offline, không gọi API ngoài lúc chạy.
   Tên đã chuẩn hoá bỏ tiền tố hành chính (Tỉnh/Thành phố/Quận/Huyện/Phường/Xã/Thị trấn/
   Thị xã) để khớp convention tên ngắn của hệ thống (vd "Hà Nội", "Đống Đa"); nơi bỏ tiền
   tố gây trùng tên hoặc còn lại là số thuần (vd "Quận 1") thì giữ tên đầy đủ. Chế độ sửa
   chọn sẵn theo tên đã lưu; giá trị đã lưu không có trong dữ liệu chuẩn (vd tên phường cũ
   "Phương Liên" trước khi sáp nhập thành "Phương Liên - Trung Tự") vẫn được giữ làm một
   lựa chọn để không mất dữ liệu. Áp dụng thêm cho form Nhân viên (dùng chung helper).
2. **Tải ảnh tài sản thật:** mỗi dòng tài sản ở phần Tài sản (form nhà) và form Tài sản
   (Quản lý) có nút chọn ảnh → tải lên server qua `POST /api/upload`, hiện thumbnail ngay
   trong dòng, lưu kèm tài sản (cột `assets.image_url`), mở Sửa thấy lại ảnh; thay/bỏ ảnh
   được. Danh sách Tài sản có cột Ảnh (thumbnail).
3. **Ảnh CMND/CCCD của chủ nhà tải lên thật:** 2 ô mặt trước / mặt sau ở phần Chủ Nhà
   (form nhà) và form Chủ nhà (Quản lý) — tải lên, xem trước, lưu vào hồ sơ chủ nhà
   (cột `landlords.id_card_image1`, `id_card_image2`). Lưu ý: khi lưu nhà với một chủ nhà
   có sẵn được chọn, hồ sơ chủ nhà (kèm 2 ảnh CMND) được cập nhật lại theo form — đúng
   nhãn "chọn là tự điền hồ sơ, sửa được".
4. **Ảnh sổ đỏ của nhà:** khu vực "Ảnh sổ đỏ" ở phần Thông Tin Nhà — chọn được NHIỀU ảnh
   (các trang sổ đỏ), hiện lưới thumbnail, xóa từng ảnh, lưu danh sách URL vào
   `houses.red_book_images` (JSON).
5. **Endpoint upload:** `POST /api/upload` (multipart, bắt buộc đăng nhập JWT) — chỉ nhận
   png/jpg/jpeg/gif/webp, tối đa 5MB, kiểm tra cả chữ ký file (magic bytes). File lưu ở
   thư mục `uploads/` (đổi bằng biến môi trường `UPLOAD_DIR`), phục vụ tĩnh tại
   `/uploads/...`. Cần gói `python-multipart` (đã thêm vào `requirements.txt`). Các cột
   mới được tự bổ sung vào DB cũ qua `ensure_columns()` — không cần xóa DB.
6. **Responsive web + mobile:** thêm khối CSS `@media (max-width:1024px)` và
   `(max-width:768px)` trong `frontend/styles.css` — menu ngang cuộn ngang được, bảng dữ
   liệu cuộn ngang trong khung chứa, lưới form về 1 cột, popup vừa màn hình, nút/ô nhập
   đủ lớn để chạm (≥44px), thống kê 2 cột. Desktop giữ nguyên hiển thị như trước.

**⚠️ Lưu ý vận hành về ảnh trên Render:** ảnh lưu trên đĩa của web service. Đĩa này
KHÔNG bền vững — ảnh có thể mất khi Render deploy lại/rebuild (trừ khi gắn **Persistent
Disk** và đặt biến môi trường `UPLOAD_DIR` trỏ vào thư mục trên disk đó). Cân nhắc gắn
Persistent Disk (có phí) nếu cần giữ ảnh lâu dài.

**Kiểm chứng đợt 6:** pytest **55/55 pass** (45 cũ + 10 test mới tại `tests/test_upload.py`:
upload chưa đăng nhập → 401, file không phải ảnh/nội dung giả ảnh/quá 5MB → 400, upload
PNG/GIF thật → URL truy cập được đúng content-type + bytes, round-trip `imageUrl` của tài
sản, ảnh CMND chủ nhà, `redBookImages` của nhà, file vn-admin.js phục vụ được);
`node --check` cho `app.js` + `vn-admin.js` OK; server uvicorn thật: login → upload PNG →
mở URL trả về **200 image/png, bytes khớp**; mô phỏng DB cũ thiếu 3 cột mới → khởi động
app tự bổ sung qua `ensure_columns()`; harness jsdom **24/24 assert pass** (select xếp
tầng chọn sẵn đúng tên đã lưu + giữ tên phường cũ, đổi tỉnh/quận nạp lại đúng, lưới ảnh
sổ đỏ, ảnh CMND, payload lưu nhà/chủ nhà/tài sản).

## Đợt 7 — "Vị trí trên bản đồ" là bản đồ thật để chọn vị trí (form Thêm/Sửa nhà)

Khung placeholder bản đồ (đợt 5) được thay bằng **bản đồ tương tác thật**:

1. **Thư viện + nền bản đồ:** Leaflet **1.9.4** (JS + CSS + ảnh marker mặc định) đóng gói
   tĩnh tại `frontend/leaflet/` — không phụ thuộc CDN lúc chạy; chỉ các ô gạch bản đồ
   (tiles) nạp từ **OpenStreetMap** (`tile.openstreetmap.org`) qua mạng như mọi bản đồ
   web. Miễn phí, không cần API key.
2. **Tương tác:** bấm vào bản đồ để đặt/di chuyển ghim, **kéo thả ghim**; 2 ô **Vĩ độ
   (latitude) / Kinh độ (longitude)** đồng bộ hai chiều với ghim (ghim đổi → ô cập nhật;
   nhập tọa độ tay → ghim nhảy tới). **Ô tìm kiếm địa chỉ** dùng Nominatim của
   OpenStreetMap (phía trình duyệt, không cần key) + nút **"Tìm theo địa chỉ đã nhập"**
   lấy Địa chỉ + Phường/Quận/Tỉnh đang nhập trong form để định vị nhanh. Ô ghi chú vị
   trí giữ nguyên như cũ. Chế độ sửa có thêm link **"Mở Google Maps"** theo tọa độ đã lưu.
3. **Lưu tọa độ theo nhà:** 2 cột số thập phân `latitude` / `longitude` (nullable) trong
   bảng `houses` — DB cũ tự bổ sung qua `ensure_columns()`, schema
   Create/Update/Out đầy đủ. Mở Sửa nhà: bản đồ hiện đúng ghim đã lưu ở zoom 16; nhà
   chưa có tọa độ mở ở Hà Nội (zoom 12). Chiều cao bản đồ 320px (260px trên mobile).
4. **Mất mạng vẫn dùng được form:** nếu không nạp được thư viện/tiles bản đồ, khung bản
   đồ hiện thông báo dự phòng, không lỗi JS — 2 ô tọa độ vẫn nhập tay và lưu bình thường.

**Kiểm chứng đợt 7:** pytest **59/59 pass** (55 cũ + 4 test mới tại `tests/test_map.py`:
tạo/sửa/xóa tọa độ nhà khứ hồi qua API, nhà không tọa độ → `null`, mô phỏng DB cũ thiếu
2 cột → `ensure_columns()` bổ sung không mất dữ liệu, các file Leaflet phục vụ 200);
`node --check frontend/app.js` OK; server uvicorn thật: login → tạo nhà có tọa độ → GET
trả đúng → PUT đổi tọa độ đúng, `/leaflet/leaflet.js|css` + ảnh marker **200** đúng
content-type; harness jsdom **25/25 assert pass** (ghim đúng vị trí đã lưu + zoom 16,
bấm bản đồ/kéo ghim/nhập tay đồng bộ 2 chiều với ô tọa độ, payload POST/PUT chứa
latitude/longitude, và kịch bản không có Leaflet: form vẫn render + lưu được tọa độ
nhập tay).

**Giới hạn:** tiles bản đồ và tìm kiếm địa chỉ cần kết nối mạng; độ chính xác của kết
quả tìm địa chỉ phụ thuộc dữ liệu OpenStreetMap (khu vực ít dữ liệu có thể không tìm
thấy — khi đó bấm trực tiếp lên bản đồ hoặc nhập tọa độ tay).

## Đợt sửa — Bỏ trường "Loại nhà" (Nhà của mình / Nhà thuê) khỏi form nhà

Theo quyết định của người dùng, trường "Loại nhà" (đợt 5 từng giữ lại chờ quyết
định) nay **bỏ hẳn khỏi form Thêm/Sửa nhà**:

1. Form nhà không còn ô "Loại nhà"; khi lưu nhà, frontend **không gửi trường
   `type`** nữa.
2. **Hợp đồng chủ nhà vẫn được tạo/cập nhật như trước:** điều kiện cũ "chỉ khi
   nhà là Nhà thuê" được thay bằng "hễ phần Hợp Đồng của form có nhập **Tiền
   thuê** thì tạo/cập nhật hợp đồng chủ nhà" — mọi nhà đều đi theo luồng này.
3. Form **Thanh toán tiền nhà** (mục Hợp đồng chủ nhà): ô chọn nhà nay liệt kê
   **tất cả các nhà** (không còn lọc nhà thuê), nhãn rút gọn thành "Nhà".
4. Cột DB `houses.type` và dữ liệu cũ được **giữ nguyên** (backend vẫn chấp
   nhận trường `type` nếu client cũ gửi lên); chỉ frontend ngừng sử dụng.
   Các nhãn "Đã thuê / Đang thuê" của **trạng thái phòng** không liên quan và
   không thay đổi.

**Kiểm chứng:** pytest **59/59 pass**; `node --check frontend/app.js` OK; harness
jsdom **12/12 assert pass** (form Thêm/Sửa nhà không còn phần tử `#h_type`,
payload lưu nhà không chứa `type`, lưu nhà có tiền thuê vẫn phát sinh
`POST /api/landlord-contracts`, ô chọn nhà của Thanh toán tiền nhà liệt kê cả
nhà từng mang type `own` lẫn `rented`).

## Đợt 8 — Thanh toán tiền nhà cho chủ nhà: hạn 1,5 tháng, "Thời gian thanh toán" là ngày cụ thể, tổng tiền mỗi kỳ

Theo yêu cầu của người dùng, 4 thay đổi quanh kỳ thanh toán của hợp đồng
chủ nhà:

1. **Lọc "Sắp đến hạn thanh toán" = 1,5 tháng:** ở Danh sách nhà, cửa sổ lọc
   đổi từ 30 ngày thành **45 ngày** — nhà có "Ngày thanh toán tiếp theo" trong
   vòng 45 ngày tới sẽ hiển thị khi tích checkbox này.
2. **"Thời gian thanh toán" là một ngày cụ thể:** form Thêm/Sửa nhà, phần
   Hợp Đồng bỏ 2 ô số "thanh toán từ ngày / đến ngày" (`lc_from`/`lc_to`), thay
   bằng **một ô chọn ngày `lc_paydate`** (ngày/tháng/năm). Backend thêm cột
   `landlord_contracts.pay_date` (DATE, nullable — qua `ensure_columns()` +
   model/schema `payDate`); các cột cũ `payDay`/`payFromDay`/`payToDay` được
   **giữ nguyên** (không mất dữ liệu). Khi lưu nhà, `payDay` được suy từ ngày
   trong tháng của `payDate` (cả ở frontend lẫn enrich phía backend) để các
   hiển thị cũ vẫn khớp; sửa nhà thì ô ngày nạp từ HĐ chủ nhà hiện tại.
3. **"Ngày thanh toán tiếp theo"** tính bằng **một hàm chung** `nextPayDate()`
   dùng cho form, bộ lọc và danh sách: neo = `payDate` (trống thì `startDate`),
   bước nhảy = "Số tháng thanh toán 1 lần" (`payMonths`, tối thiểu 1); từ neo
   cộng dồn từng bước (cộng tháng có **kẹp ngày cuối tháng**: 31/01 + 1 tháng
   → 28/02) cho đến ngày đầu tiên ≥ hôm nay. HĐ cũ không có cả `payDate` lẫn
   `startDate` thì fallback về logic `payDay` theo tháng như trước. Trong form
   nhà, đây là ô **chỉ đọc** tự cập nhật ngay khi đổi Thời gian thanh toán /
   Số tháng / Ngày bắt đầu. Ở Danh sách HĐ chủ nhà, cột "Thời gian thanh toán"
   hiện **ngày cụ thể** nếu HĐ có `payDate`, chưa có thì giữ dạng
   "Ngày X đến Y" cũ.
4. **"Tổng số tiền thanh toán" = Tiền thuê × Số tháng thanh toán 1 lần:** có ở
   cả 2 nơi — ô chỉ đọc trong form nhà (tự cập nhật khi đổi Tiền thuê/Số
   tháng) và **cột mới trong bảng Danh sách nhà** (lấy từ HĐ chủ nhà đang
   hiệu lực của nhà; nhà không có HĐ hiện "—").

Form HĐ chủ nhà độc lập và form cọc không thay đổi ở đợt này.

**Kiểm chứng:** pytest **61/61 pass** (59 cũ + 2 test mới: tạo/cập nhật/đọc
lại `payDate` qua API, `payDay` suy từ `payDate` = 15 với `payDate`
15/08/2026; `ensure_columns` thêm `pay_date` trên DB cũ mô phỏng);
`node --check frontend/app.js` OK; harness jsdom **25/25 assert pass** (cố
định hôm nay = 24/10/2026: form nhà không còn `lc_from`/`lc_to`, có ô date
`lc_paydate`; nhập `payDate` 15/08/2026 + `payMonths` 3 → "Ngày thanh toán
tiếp theo" hiện **15/11/2026**; Tiền thuê 5.000.000 × 3 → "Tổng số tiền thanh
toán" hiện **15.000.000**; danh sách nhà: nhà có ngày TT tiếp theo cách 40
ngày thì lọt lọc "Sắp đến hạn", cách 50 ngày thì bị ẩn; cột tổng tiền hiện
đúng giá trị, nhà không HĐ hiện "—"; danh sách HĐ chủ nhà hiện ngày cụ thể
khi có `payDate`, giữ dạng cũ khi chưa có).

## Đợt 9 — Màn hình chi tiết nhà + "Ngày thanh toán kỳ đầu" nhập tay

**1. Màn hình CHI TIẾT NHÀ (mới):** ở bảng Danh sách nhà, **tên nhà là
link bấm được** và có thêm **cột/nút "Chi tiết"** cạnh Sửa/Xóa (route
`houseDetail`) — mở trang chi tiết hiển thị **toàn bộ thông tin của nhà**
theo đúng các phần của form Thêm nhà, dữ liệu lấy từ cache frontend đã nạp
sẵn (không thêm endpoint):

- **Thông Tin Nhà:** tên nhà, địa chỉ đầy đủ, diện tích sàn, số tầng, số
  phòng ngủ, số nhà vệ sinh, loại hình kinh doanh, mô tả, tọa độ + link
  "Mở Google Maps", **ảnh sổ đỏ** dạng lưới thumbnail (bấm mở ảnh lớn).
- **Chủ Nhà:** họ tên, ngày sinh, địa chỉ thường trú, SĐT, giới tính, nghề
  nghiệp, tình trạng hôn nhân, mail, số CMND, **ảnh CMND mặt trước/sau**.
- **Hợp Đồng (với chủ nhà):** mã HĐ, tiền thuê, tiền cọc, ngày bắt đầu/kết
  thúc, "Thời gian thanh toán" (`payDate`), **"Ngày thanh toán kỳ đầu"**
  (`firstPayDate` đã lưu), số tháng thanh toán 1 lần, **"Ngày thanh toán
  tiếp theo"** (ngày suy ra — xem mục 2), **tổng số tiền thanh toán**
  (thuê × số tháng), trạng thái HĐ. Chưa có HĐ thì ghi "Chưa có hợp đồng
  chủ nhà".
- **Mã Hóa Đơn dịch vụ:** điện + nước (mã hóa đơn, chủ tài khoản, tài
  khoản; **mật khẩu luôn che `••••••`**).
- **Tài sản của chủ nhà** thuộc nhà (loại, trạng thái, ghi chú, thumbnail
  ảnh) và **Phòng thuộc nhà**: tổng số phòng + trống/đã cọc/đã thuê kèm
  bảng phòng (tên, tầng, giá, trạng thái; bấm tên phòng sang chi tiết
  phòng). Có nút **Sửa nhà** và **Quay lại**. Trường trống hiện "—".

**2. Mô hình ngày thanh toán (chốt lại ở đợt này):**

- **"Ngày thanh toán kỳ đầu" (`firstPayDate`) là ngày người dùng TỰ NHẬP**
  ở form Thêm/Sửa nhà — ngày thanh toán của **kỳ đầu tiên**. Đây là ô
  `<input type="date">` (`lc_firstpay`); **ô chỉ đọc "Ngày thanh toán tiếp
  theo" tự gen của đợt 8 đã BỎ khỏi form**. Backend thêm cột
  `landlord_contracts.first_pay_date` (DATE, nullable — qua
  `ensure_columns()` + model/schema `firstPayDate`). Khi sửa nhà: nạp đúng
  ngày đã lưu; HĐ chưa có thì **điền sẵn gợi ý** = ngày tính được từ
  `payDate` (hàm `nextPayDate()`), người dùng sửa được; gợi ý chỉ điền khi
  ô đang trống, **không bao giờ ghi đè** giá trị người dùng đã nhập, và
  **ngày kỳ đầu đã lưu không bao giờ bị hệ thống tự sửa/cuộn**.
- **"Ngày thanh toán tiếp theo" là ngày SUY RA (không nhập, không lưu):**
  hàm chung `nextPayDate()` cuộn từ ngày neo với bước nhảy = "Số tháng
  thanh toán 1 lần" tới ngày đầu tiên ≥ hôm nay; thứ tự ưu tiên neo:
  **`firstPayDate` → `payDate` → `startDate`** → fallback `payDay` theo
  tháng như cũ. Giá trị suy ra này dùng **chung một kiểu tính duy nhất**
  cho: **cột "Ngày thanh toán tiếp theo" ở Danh sách nhà** (nhà không có
  HĐ/ngày neo thì hiện "—"), **bộ lọc "Sắp đến hạn thanh toán" (45 ngày)**
  và **màn hình chi tiết nhà**.
- Form HĐ chủ nhà độc lập không có ô kỳ đầu; vì API cập nhật dùng
  `exclude_unset`, lưu từ form đó **không xóa** `firstPayDate` đã lưu.

**Kiểm chứng:** pytest **62/62 pass** (61 cũ + 1 test mới: tạo/cập nhật/đọc
lại `firstPayDate` qua API, cập nhật trường khác không làm mất
`firstPayDate`; `ensure_columns` thêm `first_pay_date` trên DB cũ mô
phỏng); `node --check frontend/app.js` OK; harness jsdom **62/62 assert
pass** (hôm nay cố định 24/10/2026: bấm tên nhà/nút Chi tiết mở chi tiết
đủ 6 phần với đúng giá trị — kỳ đầu 15/08/2026 hiện đúng ngày đã lưu, ngày
tiếp theo suy ra **15/11/2026**, tổng tiền 15.000.000đ, mật khẩu bị che,
thumbnail sổ đỏ/CMND/tài sản render, thống kê phòng 3/1/1/1; Sửa nhà mở
đúng form, Quay lại về danh sách; cột DS nhà hiện 15/11/2026 cho nhà kỳ
đầu 15/08/2026 + 3 tháng và "—" cho nhà không HĐ; lọc Sắp đến hạn: nhà
suy ra +22 ngày hiện, nhà kỳ đầu 25/12/2026 ẩn **dù** `payDate` của nó suy
ra chỉ +6 ngày — neo kỳ đầu thắng; form: ô kỳ đầu là date nhập được,
không còn ô tự gen, gợi ý điền khi trống và không ghi đè khi người dùng
đã sửa, lưu nhà gửi đúng `firstPayDate` người dùng nhập 20/12/2026).

## Đợt 10 — Bỏ ô "Thời gian thanh toán" khỏi form Thêm/Sửa nhà

Theo yêu cầu: form Thêm/Sửa nhà (một form chung) **bỏ hẳn ô "Thời gian
thanh toán"** (`lc_paydate`, trường bắt buộc của đợt 8) trong phần Hợp
Đồng — mốc chính từ nay chỉ là **"Ngày thanh toán kỳ đầu"** do người dùng
nhập tay.

- `saveHouse` **ngừng gửi khóa `payDate`** (payload bỏ hẳn): API cập nhật
  dùng `exclude_unset` nên `payDate` đã lưu trong DB của các hợp đồng cũ
  **được giữ nguyên, không bị xóa trắng**. Cột `landlord_contracts.pay_date`
  và mọi dữ liệu cũ giữ nguyên; `payDate` vẫn là neo dự phòng trong hàm
  `nextPayDate()` (thứ tự neo `firstPayDate → payDate → startDate` không
  đổi) — nên **cột "Ngày thanh toán tiếp theo" ở Danh sách nhà, màn hình
  chi tiết nhà và bộ lọc "Sắp đến hạn thanh toán" không đổi hành vi**: vẫn
  suy ra từ ngày kỳ đầu + "Số tháng thanh toán 1 lần" cuộn tới kỳ sắp tới,
  neo kỳ đầu thắng tuyệt đối (ví dụ: kỳ đầu 15/08/2026, mỗi 3 tháng, hôm
  nay 24/10/2026 → **15/11/2026**).
- **Gợi ý ô kỳ đầu** trong `lcFormRefresh()` đổi căn cứ: từ nay tính từ
  **Ngày bắt đầu hợp đồng (`lc_start`)** + số tháng (không còn đọc ô
  `lc_paydate` đã bỏ); vẫn chỉ điền khi ô kỳ đầu đang trống, **không bao
  giờ ghi đè** giá trị người dùng nhập. Ô "Tổng số tiền thanh toán" cập
  nhật như cũ.
- **Màn hình chi tiết nhà:** dòng "Thời gian thanh toán" **chỉ hiển thị
  khi hợp đồng có `payDate`**; không có thì ẩn hẳn dòng đó (khỏi hiện
  dạng dự phòng/thừa).

**Kiểm chứng:** pytest **63/63 pass** (62 cũ + 1 test mới: cập nhật HĐ
bằng payload kiểu `saveHouse` mới — không có khóa `payDate` — thì
`payDate` cũ trong DB vẫn nguyên); `node --check frontend/app.js` OK;
harness jsdom **39/39 assert pass** (hôm nay cố định 24/10/2026): form
Thêm + Sửa không còn `#lc_paydate`/nhãn "Thời gian thanh toán"; payload
POST/PUT khi lưu nhà không có khóa `payDate`, `firstPayDate` gửi đúng
ngày nhập; gợi ý kỳ đầu sửa H4 = 01/11/2026 từ ngày bắt đầu (không còn
15/11 từ `payDate`); cột DS nhà khẳng định lại ví dụ kỳ đầu 15/08/2026 +
3 tháng → 15/11/2026, neo kỳ đầu thắng `payDate` ở cả cột/lọc/chi tiết;
chi tiết nhà ẩn dòng "Thời gian thanh toán" khi HĐ không có `payDate` và
hiện khi có.

## Đợt 11 — Chi tiết nhà theo giao diện form Thêm nhà + sửa lỗi nút Xóa nhà

### 1. Màn hình chi tiết nhà viết lại theo đúng giao diện form Thêm nhà

Màn hình chi tiết nhà (`houseDetail`, thêm ở đợt 9) trước đây dùng bố cục
card/kv riêng. Nay viết lại để **nhìn như form Thêm nhà**: cùng wrapper
`.form-card`, cùng thứ tự 5 phần, cùng tiêu đề phần (`.form-sec`/`.sec`)
và cùng lưới trường (`.fgrid`/`.fld`) — chỉ khác là các ô nhập thành
**giá trị text chỉ đọc** (không còn input/select/textarea nào trên trang).

- **Phần 1 — Thông Tin Nhà** (đúng thứ tự form): Địa chỉ, Tỉnh/TP,
  Quận/Huyện, Phường/Xã → khối vị trí bản đồ (khung `.map-real` hiển thị
  tọa độ + link "Mở Google Maps", **không khởi tạo bản đồ tương tác**) →
  Vĩ độ/Kinh độ → Ghi chú vị trí → lưới ảnh sổ đỏ → Tên nhà, Diện tích
  sàn, Số tầng, Số phòng ngủ, Số nhà vệ sinh, Loại hình kinh doanh →
  Thêm mô tả.
- **Phần 2 — Chủ Nhà:** đủ hồ sơ + khối ảnh CMND/CCCD (mặt trước/sau,
  bấm mở ảnh lớn).
- **Phần 3 — Hợp Đồng:** Mã hợp đồng, Tiền thuê, Cọc, Ngày bắt đầu/kết
  thúc, Số tháng thanh toán 1 lần, [Thời gian thanh toán — chỉ hiện khi
  HĐ có `payDate`], Ngày thanh toán kỳ đầu, Ngày thanh toán tiếp theo
  (suy ra bằng `nextPayDate()`, chỉ hiển thị, không lưu), Tổng số tiền
  thanh toán, Trạng thái hợp đồng.
- **Phần 4 — Mã Hóa Đơn dịch vụ:** điện/nước (mã, chủ tài khoản, tài
  khoản; **mật khẩu che dạng `••••••`**).
- **Phần 5 — Tài sản:** mỗi tài sản một dòng `.fgrid` như form (Mã, Loại,
  Trạng thái, Ảnh, Note).
- **Phần 6 — Phòng thuộc nhà** (chỉ có ở chi tiết, đặt sau Tài sản):
  tổng phòng + trống/đã cọc/đã thuê + bảng phòng (tên bấm sang chi tiết
  phòng).
- Trường trống hiện "—". Nút **Sửa nhà** và **Quay lại** giữ nguyên ở đầu
  và cuối trang. Không đổi logic nghiệp vụ: vẫn lấy dữ liệu từ cache
  frontend, không thêm endpoint.

**Kiểm chứng:** `node --check frontend/app.js` OK; harness jsdom
**85/85 assert pass** (app.js thật, hôm nay cố định 24/10/2026): đủ 6
phần đúng thứ tự với tiêu đề `.sec`, không còn `.kv`/`.card` cũ, 0
input/select/textarea; đủ nhãn/giá trị (sổ đỏ 2 ảnh, CMND 2 mặt, kỳ đầu
15/08/2026, ngày tiếp theo suy ra 15/11/2026, tổng tiền 15.000.000đ, mật
khẩu bị che); HĐ không `payDate` thì ẩn dòng "Thời gian thanh toán";
Sửa nhà mở đúng form (kỳ đầu nạp ngày đã lưu), Quay lại về danh sách.

### 2. Sửa lỗi nút Xóa nhà không hoạt động sau khi nhập mật khẩu

**Nguyên nhân thật sự (đã tái hiện):** nút Xóa ở Danh sách nhà gọi
`delBtn('Nhà ...','houses', id)` → xác thực mật khẩu
(`POST /auth/verify-password`) → `DELETE /api/houses/{id}` (router CRUD
generic). Router này chỉ làm `db.delete(house); db.commit()` mà không
xóa dữ liệu liên quan. Trên **PostgreSQL (Render)** các khóa ngoại tới
`houses.id` (phòng, hợp đồng, hóa đơn, cọc, tài sản, mã điện/nước...)
làm commit vi phạm FK → **HTTP 500 "Internal Server Error"** (text
trơn, không có thông báo rõ ràng) — frontend chỉ hiện toast
"Lỗi: Lỗi 500" trong 2,4 giây rồi biến mất nên người dùng cảm nhận là
"nhập mật khẩu xong không thấy gì xảy ra, nhà vẫn còn". Trên SQLite
test (không bật `PRAGMA foreign_keys`) lỗi này không lộ ra nên test cũ
không bắt được. Đã tái hiện đúng bằng server thật + dữ liệu seed thật
và bằng TestClient có bật FK pragma (mô phỏng PostgreSQL): nhà có
5 phòng + 2 hợp đồng + 2 hóa đơn → DELETE trả 500, nhà còn nguyên;
nhà không có dữ liệu liên quan → DELETE 200.

**Cách sửa:**
- **Backend:** thêm hook `before_delete` cho router CRUD generic
  (`backend/routers/crud.py`); router houses gắn
  `_delete_house_cascade` (`backend/main.py`): trong cùng 1 transaction,
  xóa kèm toàn bộ dữ liệu thuộc về nhà — dòng hóa đơn + lịch sử thanh
  toán + phiếu thu gắn hóa đơn, rồi hóa đơn, phiếu thu, chốt chỉ số,
  chốt ĐN chủ nhà, hợp đồng thuê, cọc, xe, tài sản, chi tiêu, sự cố,
  HĐ chủ nhà, thanh toán tiền nhà, phân công nhân viên, mã điện/nước,
  cuối cùng là phòng; đồng thời dọn `houseIds` khỏi hồ sơ tài khoản.
  Chủ nhà/khách thuê **không** bị xóa (có thể liên quan nhiều nhà).
  Từ nay `DELETE /api/houses/{id}` trả 200 cả trên PostgreSQL.
- **Frontend:** (a) nhánh 401 của `api()` không còn đăng xuất người
  dùng khi đường dẫn là `/auth/verify-password` — trước đây nhập **sai**
  mật khẩu ở modal Xóa là bị văng ra màn hình đăng nhập thay vì chỉ
  báo "Mật khẩu không đúng"; nay modal còn mở, nút Xóa được bật lại,
  nhà còn nguyên. (b) Modal xóa nhà hiển thị cảnh báo đỏ: xóa nhà sẽ
  xóa kèm toàn bộ dữ liệu liên quan, không thể hoàn tác. (c) Sau khi
  xóa nhà thành công, danh sách nạp lại toàn bộ dữ liệu (`loadAll`)
  để không còn bản ghi mồ côi trong cache.
- Các nút Xóa khác (phòng, cọc, HĐ...) không đổi hành vi — đã kiểm
  chứng nút Xóa phòng vẫn hoạt động bình thường, không có cảnh báo
  cascade của nhà.

**Kiểm chứng:** pytest **65/65 pass** (63 cũ + 2 test mới trong
`tests/test_delete_house.py`: xóa nhà đủ dữ liệu liên quan → 200, nhà
+ dữ liệu liên quan biến mất, chủ nhà/khách thuê còn nguyên; và cùng
kịch bản với FK pragma bật → 200 thay vì 500); live-test có bật FK:
DELETE nhà seed (5 phòng, 2 HĐ, 2 hóa đơn) → 200, 15 bảng liên quan
đều về 0, chủ nhà/khách thuê còn đủ; harness jsdom **22/22 assert
pass**: modal có cảnh báo cascade; mật khẩu sai → toast lỗi rõ ràng,
không bị đăng xuất, nhà còn nguyên; mật khẩu đúng → toast "Đã xóa",
nhà biến mất khỏi bảng; DELETE lỗi 500 → toast lỗi, nhà còn nguyên;
xóa phòng vẫn hoạt động.

## Ghi chú

- Tiền tệ: số nguyên VND; frontend hiển thị dạng `3.000.000đ`.
- Trạng thái phòng suy ra từ dữ liệu: có hợp đồng `active` → "Đã thuê"; có đặt cọc → "Đã cọc"; còn lại "Trống".
- Hóa đơn tháng tự tính các dòng: Điện (chỉ số đầu–cuối × đơn giá), Nước (theo người hoặc theo số),
  Điện chung, Vệ sinh, Internet (theo người), Xe máy/Ô tô/Xe đạp (số lượng × phí).

## Triển khai lên Render

Project có sẵn `render.yaml` (Blueprint) và `Dockerfile` đã tương thích Render
(app tự nghe cổng `$PORT` do Render cấp; `DATABASE_URL` dạng `postgres://` được tự chuẩn hoá).

**Cách nhanh (Blueprint):**
1. Đẩy code lên GitHub (repo mới).
2. Render Dashboard → **New** → **Blueprint** → chọn repo → **Apply**.
   Render tự tạo Web Service + PostgreSQL và gắn `DATABASE_URL`, `SECRET_KEY`.
3. Chờ deploy xong → mở URL `https://<tên-app>.onrender.com` → đăng nhập
   admin `0901234567` / `admin123` → đổi mật khẩu ngay.

**Cách thủ công:** tạo PostgreSQL trước, rồi tạo Web Service (runtime Docker) trỏ vào repo,
thêm env `DATABASE_URL` = Internal Database URL của Postgres vừa tạo, và `SECRET_KEY` = một chuỗi bí mật dài.

**Lưu ý gói free:** Web Service free sẽ "ngủ" sau ~15 phút không có truy cập (mở lại chờ khoảng 1 phút);
**PostgreSQL free hết hạn sau 30 ngày** (bị xóa dữ liệu) — khi dùng thật hãy nâng cấp
Postgres lên gói Basic và Web Service lên Starter trong Dashboard.
