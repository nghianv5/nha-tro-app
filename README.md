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
`ensure_columns` trên DB cũ mô phỏng (tổng **31 test**).

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
│   └── test_web.py      # 10 test tính năng bản web (SPEC-WEB)
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
| Tạo hóa đơn tháng | `POST /api/invoices/monthly` `{roomId, month, people?, dienPrev/Curr?, nuocPrev/Curr?}` — tự tính từ hợp đồng + chỉ số chốt gần nhất; trùng tháng → 409 |
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
