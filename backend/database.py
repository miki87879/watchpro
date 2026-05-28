from sqlalchemy import create_engine, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# In production (Railway), DATA_DIR env var points to a persistent volume (/data).
# In dev, falls back to the backend directory so existing DB is used.
DATA_DIR = os.environ.get("DATA_DIR", BASE_DIR)
os.makedirs(DATA_DIR, exist_ok=True)

DATABASE_URL = f"sqlite:///{os.path.join(DATA_DIR, 'watch_db.sqlite')}"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def migrate_watches_table():
    """Add new columns to watches table without dropping data (SQLite ALTER TABLE)."""
    new_columns = [
        ("tax_refund",          "BOOLEAN DEFAULT 0"),
        ("tax_refund_amount",   "FLOAT"),
        ("tax_refund_currency", "VARCHAR(10)"),
        ("tax_refund_country",  "VARCHAR(100)"),
        ("import_tax",          "FLOAT DEFAULT 0"),
        ("import_tax_currency", "VARCHAR(10) DEFAULT 'ILS'"),
        ("location",            "VARCHAR(50) DEFAULT 'home_safe'"),
        ("location_details",    "VARCHAR(200)"),
    ]
    with engine.connect() as conn:
        result = conn.execute(text("PRAGMA table_info(watches)"))
        existing = {row[1] for row in result}
        for col_name, col_def in new_columns:
            if col_name not in existing:
                conn.execute(text(f"ALTER TABLE watches ADD COLUMN {col_name} {col_def}"))
        conn.commit()
