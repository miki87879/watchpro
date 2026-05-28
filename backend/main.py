from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os
from dotenv import load_dotenv
from database import engine, SessionLocal, DATA_DIR
import models

load_dotenv(override=True)

app = FastAPI(title="Watch Dashboard API")

# CORS: allow local dev + any Railway/custom domain set via env var
_extra_origins = [o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
        "http://localhost:4173",  # vite preview
        *_extra_origins,
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Uploads live in DATA_DIR (persistent volume in prod, backend/ in dev)
UPLOADS_DIR = os.path.join(DATA_DIR, "uploads")
os.makedirs(os.path.join(UPLOADS_DIR, "photos"), exist_ok=True)
os.makedirs(os.path.join(UPLOADS_DIR, "documents"), exist_ok=True)

app.mount("/uploads", StaticFiles(directory=UPLOADS_DIR), name="uploads")

models.Base.metadata.create_all(bind=engine)

# Auto-migrate: add any new columns without touching existing data
from database import migrate_watches_table
migrate_watches_table()

from routers import inventory, price_scout, ads, community, finance, watch_id, documents, settings, auth, logs, currency

# ─── Create default admin on first launch ─────────────────────────────────────
def _ensure_admin():
    """Create admin@watch.local / admin1234 if no users exist yet."""
    db = SessionLocal()
    try:
        if db.query(models.User).count() == 0:
            from routers.auth import hash_password
            admin = models.User(
                email="admin@watch.local",
                hashed_password=hash_password("admin1234"),
                full_name="מנהל ראשי",
                role=models.UserRole.admin,
            )
            db.add(admin)
            db.commit()
            print("✅ Default admin created: admin@watch.local / admin1234")
    finally:
        db.close()

_ensure_admin()

os.makedirs(os.path.join(UPLOADS_DIR, "system_documents"), exist_ok=True)

app.include_router(inventory.router, prefix="/api")
app.include_router(price_scout.router, prefix="/api")
app.include_router(ads.router, prefix="/api")
app.include_router(community.router, prefix="/api")
app.include_router(finance.router, prefix="/api")
app.include_router(watch_id.router, prefix="/api")
app.include_router(documents.router, prefix="/api")
app.include_router(settings.router, prefix="/api")
app.include_router(auth.router, prefix="/api")
app.include_router(logs.router, prefix="/api")
app.include_router(currency.router, prefix="/api")

@app.post("/api/seed")
def seed_data():
    db = SessionLocal()
    try:
        from datetime import datetime, timedelta
        # Check if already seeded
        existing = db.query(models.Watch).first()
        if existing:
            return {"message": "Data already seeded"}

        # Add sample watches
        watches = [
            models.Watch(brand="Rolex", model="Submariner", reference="126610LN", year=2022, condition="mint",
                        purchase_price=12000, asking_price=14500, status="available",
                        serial_number="2T123456", has_box=True, has_papers=True,
                        notes="מצב מושלם, עם כל האביזרים המקוריים"),
            models.Watch(brand="Patek Philippe", model="Nautilus", reference="5711/1A", year=2019, condition="excellent",
                        purchase_price=85000, asking_price=120000, status="available",
                        has_box=True, has_papers=True),
            models.Watch(brand="Rolex", model="Daytona", reference="116500LN", year=2020, condition="excellent",
                        purchase_price=30000, asking_price=45000, status="sold", sold_price=44000,
                        has_box=True, has_papers=True),
            models.Watch(brand="Audemars Piguet", model="Royal Oak", reference="15500ST", year=2021, condition="excellent",
                        purchase_price=55000, asking_price=78000, status="reserved",
                        has_box=False, has_papers=True),
        ]
        for w in watches:
            db.add(w)

        # Add sample contacts
        contacts = [
            models.Contact(name="דוד כהן", email="david@example.com", phone="052-1234567", interests="Rolex, AP"),
            models.Contact(name="יוסי לוי", email="yossi@example.com", phone="054-9876543", interests="Patek Philippe"),
            models.Contact(name="John Smith", email="john@example.com", phone="+1-555-0123", interests="Rolex Submariner, Daytona"),
        ]
        for c in contacts:
            db.add(c)

        db.commit()

        # Get watch IDs
        w1 = db.query(models.Watch).filter_by(model="Submariner").first()
        w2 = db.query(models.Watch).filter_by(model="Daytona").first()

        entries = [
            models.FinancialEntry(watch_id=w1.id if w1 else None, entry_type="purchase", amount=-12000,
                                 description="רכישת Rolex Submariner", date=datetime.utcnow() - timedelta(days=30)),
            models.FinancialEntry(watch_id=w2.id if w2 else None, entry_type="purchase", amount=-30000,
                                 description="רכישת Rolex Daytona", date=datetime.utcnow() - timedelta(days=60)),
            models.FinancialEntry(watch_id=w2.id if w2 else None, entry_type="sale", amount=44000,
                                 description="מכירת Rolex Daytona", date=datetime.utcnow() - timedelta(days=10)),
        ]
        for e in entries:
            db.add(e)
        db.commit()
        return {"message": "Seed data added successfully"}
    finally:
        db.close()

@app.get("/api/health")
def health():
    return {"status": "ok"}

# ─── Serve built React frontend (production only) ─────────────────────────────
STATIC_DIR = os.path.join(BASE_DIR, "static")   # Dockerfile copies frontend/dist here
if os.path.isdir(STATIC_DIR):
    # Serve static assets (JS, CSS, images)
    app.mount("/assets", StaticFiles(directory=os.path.join(STATIC_DIR, "assets")), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa_fallback(full_path: str, request: Request):
        """SPA catch-all: serve index.html so React Router handles navigation."""
        # Let /api/* pass through (already handled by routers)
        if full_path.startswith("api/"):
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail="Not found")
        index = os.path.join(STATIC_DIR, "index.html")
        if os.path.exists(index):
            return FileResponse(index)
        return {"message": "Watch Dashboard API"}
else:
    @app.get("/")
    def root():
        return {"message": "Watch Dashboard API Running — frontend not bundled"}
