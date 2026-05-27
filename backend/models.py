from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, ForeignKey, Text, Enum as SAEnum
from sqlalchemy.orm import relationship
from datetime import datetime
from database import Base
import enum


# ─── User Roles ──────────────────────────────────────────────────────────────
class UserRole(str, enum.Enum):
    admin   = "admin"    # Full access: all CRUD + settings + user management
    manager = "manager"  # CRUD on inventory/finance/docs/community, no settings/users
    viewer  = "viewer"   # Read-only on everything


class User(Base):
    __tablename__ = "users"
    id            = Column(Integer, primary_key=True, index=True)
    email         = Column(String(255), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    full_name     = Column(String(200))
    role          = Column(SAEnum(UserRole), default=UserRole.viewer, nullable=False)
    is_active     = Column(Boolean, default=True)
    created_at    = Column(DateTime, default=datetime.utcnow)
    last_login    = Column(DateTime, nullable=True)

class WatchStatus(str, enum.Enum):
    available = "available"
    sold = "sold"
    reserved = "reserved"

class WatchCondition(str, enum.Enum):
    mint = "mint"
    excellent = "excellent"
    good = "good"
    fair = "fair"

class Watch(Base):
    __tablename__ = "watches"
    id = Column(Integer, primary_key=True, index=True)
    brand = Column(String(100), nullable=False)
    model = Column(String(200), nullable=False)
    reference = Column(String(100))
    year = Column(Integer)
    condition = Column(String(20), default="excellent")
    purchase_price = Column(Float, default=0)
    asking_price = Column(Float, default=0)
    sold_price = Column(Float)
    price_currency = Column(String(10), default="USD")   # currency prices were entered in
    status = Column(String(20), default="available")
    serial_number = Column(String(100))
    has_box = Column(Boolean, default=False)
    has_papers = Column(Boolean, default=False)
    notes = Column(Text)
    purchase_date = Column(DateTime)
    sold_at = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow)
    photos = relationship("WatchPhoto", back_populates="watch", cascade="all, delete-orphan")
    documents = relationship("WatchDocument", back_populates="watch", cascade="all, delete-orphan")

class WatchPhoto(Base):
    __tablename__ = "watch_photos"
    id = Column(Integer, primary_key=True, index=True)
    watch_id = Column(Integer, ForeignKey("watches.id"))
    filename = Column(String(255))
    is_primary = Column(Boolean, default=False)
    uploaded_at = Column(DateTime, default=datetime.utcnow)
    watch = relationship("Watch", back_populates="photos")

class WatchDocument(Base):
    __tablename__ = "watch_documents"
    id = Column(Integer, primary_key=True, index=True)
    watch_id = Column(Integer, ForeignKey("watches.id"))
    filename = Column(String(255))
    original_name = Column(String(255))
    doc_type = Column(String(50), default="other")
    uploaded_at = Column(DateTime, default=datetime.utcnow)
    watch = relationship("Watch", back_populates="documents")

class Contact(Base):
    __tablename__ = "contacts"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    email = Column(String(200))
    phone = Column(String(50))
    interests = Column(String(500))
    notes = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    last_contact_at = Column(DateTime)

class EmailLog(Base):
    __tablename__ = "email_logs"
    id = Column(Integer, primary_key=True, index=True)
    subject = Column(String(500))
    body = Column(Text)
    recipients_count = Column(Integer, default=0)
    sent_at = Column(DateTime, default=datetime.utcnow)

class FinancialEntry(Base):
    __tablename__ = "financial_entries"
    id = Column(Integer, primary_key=True, index=True)
    watch_id = Column(Integer, ForeignKey("watches.id"), nullable=True)
    entry_type = Column(String(30))  # purchase, sale, expense, customs, shipping, repair
    amount = Column(Float)
    date = Column(DateTime, default=datetime.utcnow)
    description = Column(String(500))
    invoice_number = Column(String(100))
    currency = Column(String(10), default="USD")
    exchange_rate = Column(Float, default=1.0)

class SystemDocument(Base):
    """Global document library — covers all file types from all sources."""
    __tablename__ = "system_documents"
    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String(255))          # UUID-based stored name
    original_name = Column(String(255))     # user's original file name
    file_type = Column(String(50))          # pdf / jpg / png / xlsx …
    category = Column(String(50), default="other")
    # categories: warranty | invoice_tax | invoice_customs | receipt |
    #             certificate | appraisal | contract | photo | other
    description = Column(String(500))
    watch_id = Column(Integer, ForeignKey("watches.id"), nullable=True)
    entry_id = Column(Integer, ForeignKey("financial_entries.id"), nullable=True)
    uploaded_at = Column(DateTime, default=datetime.utcnow)
    file_size = Column(Integer, default=0)

class SystemLog(Base):
    """Audit log for all important user actions."""
    __tablename__ = "system_logs"
    id          = Column(Integer, primary_key=True, index=True)
    timestamp   = Column(DateTime, default=datetime.utcnow, index=True)
    user_id     = Column(Integer, ForeignKey("users.id"), nullable=True)
    user_email  = Column(String(255))            # denormalized for fast display
    action      = Column(String(100), index=True) # LOGIN, ADD_WATCH, DELETE_WATCH…
    resource    = Column(String(200))             # e.g. "Watch #12 Rolex Sub"
    details     = Column(Text)                    # JSON extras
    ip_address  = Column(String(50))
    success     = Column(Boolean, default=True)


class PriceAlert(Base):
    __tablename__ = "price_alerts"
    id = Column(Integer, primary_key=True, index=True)
    brand = Column(String(100))
    model = Column(String(200))
    reference = Column(String(100))
    target_price = Column(Float)
    active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class SavedListing(Base):
    __tablename__ = "saved_listings"
    id = Column(Integer, primary_key=True, index=True)
    brand = Column(String(100))
    model = Column(String(200))
    price = Column(Float)
    url = Column(String(1000))
    source = Column(String(100))
    notes = Column(Text)
    saved_at = Column(DateTime, default=datetime.utcnow)
