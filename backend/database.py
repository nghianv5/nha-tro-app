"""Kết nối CSDL — mặc định PostgreSQL, đọc DATABASE_URL từ biến môi trường.

Ví dụ: postgresql+psycopg2://nhatro:nhatro@localhost:5432/nhatro
Để test tự động có thể đặt DATABASE_URL=sqlite:///./test.db
"""
import os

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+psycopg2://nhatro:nhatro@localhost:5432/nhatro",
)
# Chuẩn hoá URL về driver psycopg2 (đã cài sẵn trong requirements) bất kể
# nhà cung cấp cấp dạng nào — tránh lỗi "No module named 'psycopg'":
#   postgres://...           -> postgresql+psycopg2://...
#   postgresql://...         -> postgresql+psycopg2://...
#   postgresql+psycopg://...-> postgresql+psycopg2://...
for _prefix in ("postgresql+psycopg://", "postgresql://", "postgres://"):
    if DATABASE_URL.startswith(_prefix):
        DATABASE_URL = "postgresql+psycopg2://" + DATABASE_URL[len(_prefix):]
        break

_connect_args = {}
if DATABASE_URL.startswith("sqlite"):
    _connect_args = {"check_same_thread": False}

engine = create_engine(DATABASE_URL, pool_pre_ping=True, connect_args=_connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    """Dependency FastAPI: cấp 1 session cho mỗi request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ----------------------------------------------------------------
# Migration nhẹ (SPEC-WEB mục 2): bổ sung cột mới vào DB ĐÃ TỒN TẠI
# (vd bản đang chạy trên Render) mà không bắt người dùng xóa DB.
# Ánh xạ: tên bảng -> {tên cột trong DB (snake_case): kiểu SQL khi ADD COLUMN}.
# Bảng mới hoàn toàn (invoice_payments, receipts, positions,
# staff_assignments, house_utilities) được create_all xử lý.
# ----------------------------------------------------------------
NEW_COLUMNS = {
    "houses": {
        "name": "VARCHAR DEFAULT ''",
        "business_type": "VARCHAR DEFAULT ''",
        "description": "TEXT DEFAULT ''",
        "rental_mode": "VARCHAR DEFAULT 'Bao phòng'",  # SPEC-WEB-2 A
        "red_book_images": "JSON DEFAULT '[]'",  # Đợt 6 (mục 5) — danh sách URL ảnh sổ đỏ
        "latitude": "FLOAT",  # Đợt 7 — vĩ độ vị trí bản đồ (nullable, không mặc định)
        "longitude": "FLOAT",  # Đợt 7 — kinh độ vị trí bản đồ (nullable, không mặc định)
    },
    "rooms": {
        "kitchen": "VARCHAR DEFAULT 'Không có'",
        "sub_rooms": "INTEGER DEFAULT 0",  # SPEC-WEB-2 B
        "images": "JSON DEFAULT '[]'",  # Đợt 16 — ảnh phòng (DB cũ được ADD COLUMN khi khởi động)
    },
    "customers": {  # SPEC-WEB-2 C — hồ sơ khách đầy đủ
        "job": "VARCHAR DEFAULT ''",
        "marital_status": "VARCHAR DEFAULT ''",
        "permanent_address": "VARCHAR DEFAULT ''",
        "current_address": "VARCHAR DEFAULT ''",
        "note": "TEXT DEFAULT ''",
    },
    "assets": {  # SPEC-WEB-2 A — tài sản chủ nhà + ghi chú
        # Đợt 19: cột owner (đổi tên từ owner_type cho khớp 'Chủ sở hữu')
        "owner": "VARCHAR DEFAULT 'room'",
        "note": "TEXT DEFAULT ''",
        "image_url": "VARCHAR DEFAULT ''",  # Đợt 6 — ảnh tài sản tải lên
    },
    "landlords": {
        "dob": "DATE",
        "gender": "VARCHAR DEFAULT ''",
        "job": "VARCHAR DEFAULT ''",
        "marital_status": "VARCHAR DEFAULT ''",
        "email": "VARCHAR DEFAULT ''",
        "id_card": "VARCHAR DEFAULT ''",
        "permanent_address": "VARCHAR DEFAULT ''",
        "id_card_image1": "VARCHAR DEFAULT ''",  # Đợt 6 (mục 4) — ảnh CMND mặt trước
        "id_card_image2": "VARCHAR DEFAULT ''",  # Đợt 6 (mục 4) — ảnh CMND mặt sau
    },
    "accounts": {
        "dob": "DATE",
        "gender": "VARCHAR DEFAULT ''",
        "job": "VARCHAR DEFAULT ''",
        "marital_status": "VARCHAR DEFAULT ''",
        "email": "VARCHAR DEFAULT ''",
        "id_card": "VARCHAR DEFAULT ''",
        "province": "VARCHAR DEFAULT ''",
        "district": "VARCHAR DEFAULT ''",
        "ward": "VARCHAR DEFAULT ''",
        "permanent_address": "VARCHAR DEFAULT ''",
    },
    "deposits": {
        "code": "VARCHAR DEFAULT ''",
        "rent_price": "INTEGER DEFAULT 0",
        "vacant_days": "INTEGER DEFAULT 0",
        "move_in_date": "DATE",
        "move_out_date": "DATE",
        "contract_date": "DATE",
        "expiry_date": "DATE",
        # SPEC-WEB-2 D
        "customer_id": "VARCHAR",
        "pay_months": "INTEGER DEFAULT 1",
        "pay_day_from": "INTEGER DEFAULT 1",
        "pay_day_to": "INTEGER DEFAULT 3",
        "service_config": "JSON DEFAULT '{}'",
    },
    "contracts": {
        "code": "VARCHAR DEFAULT ''",
    },
    "invoices": {
        "code": "VARCHAR DEFAULT ''",
        "discount": "INTEGER DEFAULT 0",
        "paid_amount": "INTEGER DEFAULT 0",
        # SPEC-WEB-2 F — trạng thái gửi hóa đơn
        "sent": "BOOLEAN DEFAULT FALSE",
        "sent_date": "DATE",
    },
    "expenses": {
        "code": "VARCHAR DEFAULT ''",
        "room_id": "VARCHAR",
        "contract_code": "VARCHAR DEFAULT ''",
        "pay_date": "DATE",
        "spender": "VARCHAR DEFAULT ''",
        "receiver_name": "VARCHAR DEFAULT ''",
        "receiver_phone": "VARCHAR DEFAULT ''",
    },
    "landlord_contracts": {
        "code": "VARCHAR DEFAULT ''",
        "deposit": "INTEGER DEFAULT 0",
        "status": "VARCHAR DEFAULT 'active'",
        # SPEC-WEB-2 A — kỳ thanh toán trong form nhà (tab Hợp Đồng)
        "pay_months": "INTEGER DEFAULT 1",
        "pay_from_day": "INTEGER DEFAULT 1",
        "pay_to_day": "INTEGER DEFAULT 3",
        "pay_date": "DATE",  # Đợt 8 — Thời gian thanh toán cụ thể (nullable)
        "first_pay_date": "DATE",  # Đợt 9 — Ngày thanh toán kỳ đầu do người dùng nhập (nullable)
    },
}


def ensure_columns(eng=None):
    """Kiểm tra & ADD COLUMN cho các cột mới còn thiếu. Idempotent,
    chạy được trên SQLite + PostgreSQL, lỗi chỉ được ghi nhận (không
    làm sập app) để bản đang chạy không bị gián đoạn."""
    from sqlalchemy import inspect, text

    eng = eng or engine
    # Đợt 19 — đổi tên cột tài sản cho khớp 'Chủ sở hữu', GIỮ DỮ LIỆU, chạy
    # trong giao dịch RIÊNG và commit trước vòng ADD COLUMN, để vòng sau
    # nhìn thấy cột owner mới và không thử tạo trùng cột (tạo trùng sẽ
    # lỗi và lăn lại cả việc đổi tên). DB cũ có owner_type nhưng chưa có
    # owner -> RENAME (PostgreSQL + SQLite đều hỗ trợ). Đã có cả 2 cột
    # thì không động vào để tránh ghi đè dữ liệu.
    try:
        _insp = inspect(eng)
        if "assets" in _insp.get_table_names():
            _acols = {c["name"] for c in _insp.get_columns("assets")}
            if "owner_type" in _acols and "owner" not in _acols:
                with eng.begin() as _conn:
                    _conn.execute(text('ALTER TABLE "assets" RENAME COLUMN "owner_type" TO "owner"'))
    except Exception as exc:  # pragma: no cover - phòng vệ lúc khởi động
        print("[ensure_columns] Bỏ qua lỗi đổi tên cột assets:", exc)
    try:
        inspector = inspect(eng)
        existing_tables = set(inspector.get_table_names())
        with eng.begin() as conn:
            for table, cols in NEW_COLUMNS.items():
                if table not in existing_tables:
                    continue
                existing_cols = {c["name"] for c in inspector.get_columns(table)}
                for col, ddl in cols.items():
                    if col not in existing_cols:
                        conn.execute(text(
                            'ALTER TABLE "%s" ADD COLUMN "%s" %s' % (table, col, ddl)))
    except Exception as exc:  # pragma: no cover - phòng vệ lúc khởi động
        print("[ensure_columns] Bỏ qua lỗi migration nhẹ:", exc)
