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
