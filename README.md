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

### Nạp / nạp lại dữ liệu mẫu

- Tự động: khi DB trống, server tự seed ở lần khởi động đầu.
- Thủ công: `python -m backend.seed`
- Từ giao diện: Cài đặt → "Xóa dữ liệu & nạp lại dữ liệu mẫu" (gọi `POST /api/seed`).

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
| Seed lại | `POST /api/seed` |
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
  chủ nhà cho thêm dòng tài sản (`assets.ownerType = 'landlord'`, mã tự sinh
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
