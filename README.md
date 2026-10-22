# Quản lý nhà trọ — Full-stack (FastAPI + PostgreSQL + Frontend mobile)

Web app quản lý nhà trọ theo thiết kế Balsamiq `NhaTro_mobile__new.bmpr` (85 màn hình):
nhà, phòng, khách hàng, hợp đồng, chốt điện/nước, hóa đơn tháng/khác, thanh lý hợp đồng,
xe, tài sản, dịch vụ, đơn vị tính, chi tiêu, sự cố (workflow trạng thái), đặt cọc,
chủ nhà + hợp đồng chủ nhà + thanh toán tiền nhà + chốt điện nước chủ nhà,
phân tích (biểu đồ thu/chi/lợi nhuận/dòng vốn), phân quyền nhân sự & theo nhà, cài đặt.

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

> Nâng cấp từ bản chưa có đăng nhập: bảng `accounts` có thêm cột `password_hash`.
> Khuyến nghị xóa DB cũ để tạo lại đúng cấu trúc: `docker compose down -v` rồi `docker compose up --build`.
> (Nếu giữ DB cũ mà cột đã tồn tại nhưng chưa có mật khẩu, lần khởi động đầu sẽ tự gán
> mật khẩu `admin123` + quyền admin cho tài khoản quản lý đầu tiên; các tài khoản còn lại
> cần admin đặt lại mật khẩu mới đăng nhập được.)

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
và hệ thống đăng nhập: login đúng/sai mật khẩu, API chưa đăng nhập bị 401, đổi mật khẩu,
staff quản lý tài khoản bị 403, admin đặt lại mật khẩu (tổng **21 test**).

## Cấu trúc thư mục

```
nha-tro-app/
├── backend/
│   ├── main.py          # FastAPI app: đăng ký routers + serve frontend tại /
│   ├── database.py      # Engine/session SQLAlchemy (DATABASE_URL, mặc định PostgreSQL)
│   ├── models.py        # 17 bảng: houses, rooms, customers, contracts, meter_readings,
│   │                    # landlord_meter_readings, invoices + invoice_lines, vehicles,
│   │                    # assets, services, units, expenses, incidents, deposits,
│   │                    # landlords, landlord_contracts, house_payments, accounts
│   ├── schemas.py       # Pydantic create/update/response cho từng thực thể
│   ├── calc.py          # Logic tính tiền thuần: dòng hóa đơn tháng, tính thanh lý
│   ├── seed.py          # Dữ liệu mẫu đúng thiết kế (hóa đơn mẫu 3.190.000đ...)
│   ├── security.py      # Băm mật khẩu bcrypt + JWT + dependency get_current_user/require_admin
│   ├── requirements.txt
│   └── routers/
│       ├── auth.py      # Đăng nhập JWT, /auth/me, đổi mật khẩu, admin đặt lại mật khẩu
│       ├── crud.py      # Factory sinh REST CRUD cho từng module
│       └── business.py  # Dashboard, phân tích, hóa đơn tháng, thanh lý, chốt ĐN chủ nhà
├── frontend/
│   ├── index.html       # Khung mobile 430px + bottom tab bar
│   ├── styles.css
│   └── app.js           # SPA: màn hình đăng nhập + toàn bộ màn hình, gọi REST API kèm JWT
├── tests/
│   ├── conftest.py      # Fixture TestClient + SQLite tạm + đăng nhập lấy token admin/staff
│   ├── test_api.py      # 12 test luồng nghiệp vụ
│   └── test_auth.py     # 9 test đăng nhập & phân quyền API
├── docker-compose.yml   # db (postgres:16) + web
├── Dockerfile
├── SPEC.md              # Đặc tả đầy đủ theo thiết kế
└── design-text-dump.txt # Nội dung trích xuất từ file .bmpr gốc
```

## API chính (prefix `/api`)

> 🔒 Mọi endpoint dưới đây (trừ `POST /api/auth/login` và frontend tĩnh tại `/`) đều yêu cầu
> header `Authorization: Bearer <token>`. Chưa đăng nhập → `401`. Quản lý tài khoản
> (tạo/sửa/xóa `accounts`, đặt lại mật khẩu) chỉ `admin` gọi được, staff gọi → `403`.

| Nhóm | Endpoints |
|---|---|
| Đăng nhập | `POST /api/auth/login` `{phone, password}` → `{access_token, token_type, user}` • `GET /api/auth/me` • `POST /api/auth/change-password` `{old_password, new_password}` |
| Đặt lại mật khẩu (admin) | `POST /api/accounts/{id}/reset-password` `{new_password}` |
| CRUD mỗi module | `GET/POST /api/{houses,rooms,customers,contracts,meter-readings,vehicles,assets,services,units,expenses,incidents,deposits,landlords,landlord-contracts,house-payments,accounts}` + `GET/PUT/DELETE /api/.../{id}` — hỗ trợ filter `?houseId=&roomId=&status=&kind=&type=&month=` |
| Hóa đơn | `GET/POST /api/invoices`, `GET/PUT/DELETE /api/invoices/{id}` (PUT thay cả dòng hóa đơn) |
| Tạo hóa đơn tháng | `POST /api/invoices/monthly` `{roomId, month, people?, dienPrev/Curr?, nuocPrev/Curr?}` — tự tính từ hợp đồng + chỉ số chốt gần nhất; trùng tháng → 409 |
| Thanh lý hợp đồng | `POST /api/contracts/{id}/liquidate` `{liquidateDate, dienFinal, nuocFinal, refundRoomFee, prepaidRoomFee, confirm}` — `confirm:false` chỉ tính thử; `confirm:true` chốt: đóng HĐ, ghi chỉ số cuối, tạo hóa đơn thu thêm (nếu khách nợ) hoặc phiếu chi hoàn trả |
| Chốt điện nước chủ nhà | `GET/POST /api/landlord-meter-readings`, `PUT/DELETE .../{id}` — tổng tự tính |
| Dashboard | `GET /api/dashboard` — tiền sắp thu, phòng trống, cọc, sự cố chưa xong, hóa đơn chưa TT, chưa chốt điện nước, sắp hết HĐ, quá hạn |
| Phân tích | `GET /api/analytics/summary` — thu/chi/lợi nhuận 6 tháng gần nhất + dòng vốn lũy kế |
| Seed lại | `POST /api/seed` |
| Health | `GET /api/health` |

## Ghi chú

- Tiền tệ: số nguyên VND; frontend hiển thị dạng `3.000.000đ`.
- Trạng thái phòng suy ra từ dữ liệu: có hợp đồng `active` → "Đã thuê"; có đặt cọc → "Đã cọc"; còn lại "Trống".
- Hóa đơn tháng tự tính các dòng: Điện (chỉ số đầu–cuối × đơn giá), Nước (theo người hoặc theo số),
  Điện chung, Vệ sinh, Internet (theo người), Xe máy/Ô tô/Xe đạp (số lượng × phí).
