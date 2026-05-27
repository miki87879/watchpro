"""
System Audit Logs (admin only)
GET /api/logs          – paginated log list
GET /api/logs/stats    – action counts
DELETE /api/logs/clear – clear logs older than N days (admin)

Helper: log_action() — call from any router to write a log entry
"""
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timedelta
import json

from sqlalchemy.orm import Session
from database import SessionLocal, get_db
import models
from routers.auth import require_admin, get_current_user

router = APIRouter()

# ─── Log actions enum (strings) ──────────────────────────────────────────────
class Actions:
    LOGIN           = "LOGIN"
    LOGOUT          = "LOGOUT"
    ADD_WATCH       = "ADD_WATCH"
    EDIT_WATCH      = "EDIT_WATCH"
    SELL_WATCH      = "SELL_WATCH"
    DELETE_WATCH    = "DELETE_WATCH"
    ADD_ENTRY       = "ADD_ENTRY"
    DELETE_ENTRY    = "DELETE_ENTRY"
    EXPORT          = "EXPORT"
    PRICE_SCOUT     = "PRICE_SCOUT"
    WATCH_IDENTIFY  = "WATCH_IDENTIFY"
    GENERATE_DOC    = "GENERATE_DOC"
    CREATE_USER     = "CREATE_USER"
    EDIT_USER       = "EDIT_USER"
    DELETE_USER     = "DELETE_USER"
    SAVE_SETTINGS   = "SAVE_SETTINGS"
    UPLOAD_DOC      = "UPLOAD_DOC"
    DELETE_DOC      = "DELETE_DOC"


# ─── Helper called from other routers ────────────────────────────────────────
def log_action(
    action: str,
    resource: str = "",
    details: Optional[dict] = None,
    user: Optional[models.User] = None,
    success: bool = True,
    ip: str = "",
):
    """Non-blocking: opens its own DB session and writes a log row."""
    db = SessionLocal()
    try:
        entry = models.SystemLog(
            user_id=user.id if user else None,
            user_email=user.email if user else "system",
            action=action,
            resource=resource,
            details=json.dumps(details or {}, ensure_ascii=False),
            ip_address=ip,
            success=success,
        )
        db.add(entry)
        db.commit()
    except Exception as e:
        print(f"[LOG ERROR] {e}")
    finally:
        db.close()


# ─── Pydantic out schema ─────────────────────────────────────────────────────
class LogOut(BaseModel):
    id: int
    timestamp: datetime
    user_email: str
    action: str
    resource: str
    details: str
    ip_address: str
    success: bool

    class Config:
        from_attributes = True


# ─── Endpoints ───────────────────────────────────────────────────────────────
@router.get("/logs", response_model=List[LogOut])
def get_logs(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    action: Optional[str] = None,
    user_email: Optional[str] = None,
    days: int = Query(30, ge=1, le=365),
    admin: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    since = datetime.utcnow() - timedelta(days=days)
    q = db.query(models.SystemLog).filter(models.SystemLog.timestamp >= since)
    if action:
        q = q.filter(models.SystemLog.action == action)
    if user_email:
        q = q.filter(models.SystemLog.user_email.ilike(f"%{user_email}%"))
    total = q.count()
    rows = q.order_by(models.SystemLog.timestamp.desc()).offset((page - 1) * per_page).limit(per_page).all()
    return rows


@router.get("/logs/stats")
def get_log_stats(
    days: int = Query(30, ge=1, le=365),
    admin: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    since = datetime.utcnow() - timedelta(days=days)
    rows = db.query(models.SystemLog).filter(models.SystemLog.timestamp >= since).all()
    counts: dict = {}
    for r in rows:
        counts[r.action] = counts.get(r.action, 0) + 1
    total = len(rows)
    errors = sum(1 for r in rows if not r.success)
    return {"total": total, "errors": errors, "by_action": counts, "days": days}


@router.delete("/logs/clear")
def clear_old_logs(
    older_than_days: int = Query(90, ge=7),
    admin: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    cutoff = datetime.utcnow() - timedelta(days=older_than_days)
    deleted = db.query(models.SystemLog).filter(models.SystemLog.timestamp < cutoff).delete()
    db.commit()
    return {"deleted": deleted, "cutoff": cutoff.isoformat()}
