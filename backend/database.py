# backend/database.py
import os
from sqlalchemy import create_engine, Column, Integer, String, Boolean
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from pathlib import Path

# 確保資料目錄存在
DATA_DIR = Path("/app/backend/data") if os.getenv("DOCKER_ENV") == "true" else Path(".")
DATA_DIR.mkdir(parents=True, exist_ok=True)

# SQLite 資料庫路徑
DB_FILE = DATA_DIR / "todos.db"
SQLALCHEMY_DATABASE_URL = f"sqlite:///{DB_FILE}"

print(f"📍 資料庫路徑: {DB_FILE}")

# 建立引擎
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    echo=False  # 設為 True 可以看到 SQL 查詢日誌
)

# 建立 Session
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# 建立 Base
Base = declarative_base()

# Todo 模型
class Todo(Base):
    __tablename__ = "todos"
    
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    completed = Column(Boolean, default=False)
    order = Column(Integer, default=0)

# 建立資料表
Base.metadata.create_all(bind=engine)

print(f"✅ 資料表建立完成!")

# 依賴注入函式
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()