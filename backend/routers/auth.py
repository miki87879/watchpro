"""
Authentication & User Management
POST /api/auth/login          – email + password → JWT token
GET  /api/auth/me             – current user info
POST /api/auth/change-password

GET    /api/users             – list users (admin)
POST   /api/users             – create user (admin)
PUT    /api/users/{id}        – update user (admin)
DELETE /api/users/{id}        – delete user (admin)
"""

from fastapi import APIRouter, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime, timedelta
import os

from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from database import SessionLocal
import models

# Lazy import to avoid circular; logs module imports auth
def _log(action, resource="", details=None, user=None, success=True, ip=""):
    try:
        from routers.logs import log_action
        log_action(action=action, resource=resource, details=details, user=user, success=success, ip=ip)
    except Exception:
        pass

router = APIRouter()

# ─── Config ──────────────────────────────────────────────────────────────────
SECRET_KEY = os.environ.get("JWT_SECRET", "watch-dashboard-secret-key-change-in-production")
ALGORITHM  = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
bearer_scheme = HTTPBearer(auto_error=False)


# ─── DB helper ───────────────────────────────────────────────────────────────
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ─── Password helpers ────────────────────────────────────────────────────────
def hash_password(plain: str) -> str:
    return pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


# ─── JWT helpers ─────────────────────────────────────────────────────────────
def create_access_token(data: dict) -> str:
    payload = data.copy()
    payload["exp"] = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


# ─── Current-user dependency ─────────────────────────────────────────────────
def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> models.User:
    if not credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")
    payload = decode_token(credentials.credentials)
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token payload")
    user = db.query(models.User).filter(models.User.id == int(user_id)).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or disabled")
    return user


def get_current_user_optional(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> Optional[models.User]:
    """Like get_current_user but returns None instead of raising 401 when not authenticated."""
    if not credentials:
        return None
    try:
        payload = decode_token(credentials.credentials)
        user_id = payload.get("sub")
        if not user_id:
            return None
        user = db.query(models.User).filter(models.User.id == int(user_id)).first()
        return user if (user and user.is_active) else None
    except Exception:
        return None


def require_admin(current: models.User = Depends(get_current_user)) -> models.User:
    if current.role != models.UserRole.admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    return current


# ─── Pydantic schemas ────────────────────────────────────────────────────────
class LoginRequest(BaseModel):
    email: str
    password: str


class UserOut(BaseModel):
    id: int
    email: str
    full_name: Optional[str]
    role: str
    is_active: bool
    created_at: datetime
    last_login: Optional[datetime]

    class Config:
        from_attributes = True


class CreateUserRequest(BaseModel):
    email: str
    password: str
    full_name: Optional[str] = None
    role: str = "viewer"  # admin | manager | viewer


class UpdateUserRequest(BaseModel):
    full_name: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None
    password: Optional[str] = None  # if provided, change password


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


# ─── Endpoints ───────────────────────────────────────────────────────────────

@router.post("/auth/login")
def login(body: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == body.email.lower().strip()).first()
    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="אימייל או סיסמה שגויים")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="החשבון מושבת. פנה למנהל")

    # Update last login
    user.last_login = datetime.utcnow()
    db.commit()

    token = create_access_token({"sub": str(user.id)})
    _log("LOGIN", resource=user.email, user=user)
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": UserOut.from_orm(user),
    }


@router.get("/auth/me", response_model=UserOut)
def me(current: models.User = Depends(get_current_user)):
    return current


@router.post("/auth/change-password")
def change_password(
    body: ChangePasswordRequest,
    current: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not verify_password(body.current_password, current.hashed_password):
        raise HTTPException(status_code=400, detail="הסיסמה הנוכחית שגויה")
    if len(body.new_password) < 6:
        raise HTTPException(status_code=400, detail="הסיסמה החדשה קצרה מדי (מינימום 6 תווים)")
    current.hashed_password = hash_password(body.new_password)
    db.commit()
    return {"message": "הסיסמה שונתה בהצלחה"}


# ─── User management (admin only) ────────────────────────────────────────────

@router.get("/users", response_model=List[UserOut])
def list_users(admin: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    return db.query(models.User).order_by(models.User.created_at.desc()).all()


@router.post("/users", response_model=UserOut)
def create_user(
    body: CreateUserRequest,
    admin: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    email = body.email.lower().strip()
    if db.query(models.User).filter(models.User.email == email).first():
        raise HTTPException(status_code=400, detail="כתובת המייל כבר קיימת במערכת")
    if len(body.password) < 6:
        raise HTTPException(status_code=400, detail="הסיסמה קצרה מדי (מינימום 6 תווים)")
    try:
        role_enum = models.UserRole(body.role)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"תפקיד לא תקין: {body.role}")

    user = models.User(
        email=email,
        hashed_password=hash_password(body.password),
        full_name=body.full_name,
        role=role_enum,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    _log("CREATE_USER", resource=email, details={"role": body.role}, user=admin)
    return user


@router.put("/users/{user_id}", response_model=UserOut)
def update_user(
    user_id: int,
    body: UpdateUserRequest,
    admin: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="משתמש לא נמצא")
    # Prevent admin from removing their own admin role
    if user.id == admin.id and body.role and body.role != "admin":
        raise HTTPException(status_code=400, detail="לא ניתן לשנות את התפקיד של עצמך")

    if body.full_name is not None:
        user.full_name = body.full_name
    if body.role is not None:
        try:
            user.role = models.UserRole(body.role)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"תפקיד לא תקין: {body.role}")
    if body.is_active is not None:
        if user.id == admin.id and not body.is_active:
            raise HTTPException(status_code=400, detail="לא ניתן להשבית את עצמך")
        user.is_active = body.is_active
    if body.password:
        if len(body.password) < 6:
            raise HTTPException(status_code=400, detail="הסיסמה קצרה מדי")
        user.hashed_password = hash_password(body.password)

    db.commit()
    db.refresh(user)
    return user


@router.delete("/users/{user_id}")
def delete_user(
    user_id: int,
    admin: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="לא ניתן למחוק את עצמך")
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="משתמש לא נמצא")
    db.delete(user)
    db.commit()
    return {"message": f"המשתמש {user.email} נמחק"}
