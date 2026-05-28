from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
import os
import uuid
import aiofiles
import shutil
import httpx

from database import get_db
import models
from routers.auth import get_current_user

router = APIRouter()

def _log(action, resource="", details=None, user=None, success=True):
    try:
        from routers.logs import log_action
        log_action(action=action, resource=resource, details=details, user=user, success=success)
    except Exception:
        pass

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PHOTOS_DIR = os.path.join(BASE_DIR, "uploads", "photos")
DOCS_DIR = os.path.join(BASE_DIR, "uploads", "documents")


# ─── Historical exchange-rate helper ─────────────────────────────────────────
def _fetch_ils_rate(currency: str, date_obj: Optional[datetime]) -> Optional[float]:
    """
    Return 1 {currency} = ? ILS on the given date.
    Uses fawazahmed0/exchange-api (free, historical, no API key, includes ILS).
    Falls back to latest rate if historical date unavailable.
    Returns None only when the network call fully fails.
    """
    if not currency or currency == "ILS":
        return 1.0

    cur = currency.lower()
    date_str = (date_obj or datetime.utcnow()).strftime("%Y-%m-%d")

    # Attempt 1 — historical rate for exact date
    for url in [
        f"https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@{date_str}/v1/currencies/{cur}.json",
        f"https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/{cur}.json",
    ]:
        try:
            with httpx.Client(timeout=8.0) as client:
                r = client.get(url)
            if r.status_code == 200:
                rate = r.json().get(cur, {}).get("ils")
                if rate:
                    return float(rate)
        except Exception:
            continue

    return None


def _update_ils_fields(watch: "models.Watch") -> None:
    """Fetch historical ILS rate for watch's purchase date/currency and persist on the watch object."""
    if not watch.purchase_price or watch.purchase_price <= 0:
        return
    rate = _fetch_ils_rate(watch.price_currency or "USD", watch.purchase_date)
    if rate is not None:
        watch.purchase_rate_to_ils = round(rate, 4)
        watch.purchase_price_ils = round(watch.purchase_price * rate, 2)

def watch_to_dict(watch: models.Watch, include_relations: bool = False) -> dict:
    primary_photo = None
    for p in watch.photos:
        if p.is_primary:
            primary_photo = f"/uploads/photos/{p.filename}"
            break
    if not primary_photo and watch.photos:
        primary_photo = f"/uploads/photos/{watch.photos[0].filename}"

    data = {
        "id": watch.id,
        "brand": watch.brand,
        "model": watch.model,
        "reference": watch.reference,
        "year": watch.year,
        "condition": watch.condition,
        "purchase_price": watch.purchase_price,
        "asking_price": watch.asking_price,
        "sold_price": watch.sold_price,
        "price_currency": watch.price_currency or "USD",
        "status": watch.status,
        "serial_number": watch.serial_number,
        "has_box": watch.has_box,
        "has_papers": watch.has_papers,
        "notes": watch.notes,
        "purchase_date": watch.purchase_date.isoformat() if watch.purchase_date else None,
        "sold_at": watch.sold_at.isoformat() if watch.sold_at else None,
        "created_at": watch.created_at.isoformat() if watch.created_at else None,
        "primary_photo": primary_photo,
        # Tax refund
        "tax_refund": watch.tax_refund or False,
        "tax_refund_amount": watch.tax_refund_amount,
        "tax_refund_currency": watch.tax_refund_currency,
        "tax_refund_country": watch.tax_refund_country,
        # Import duty
        "import_tax": watch.import_tax or 0,
        "import_tax_currency": watch.import_tax_currency or "ILS",
        # Location
        "location": watch.location or "home_safe",
        "location_details": watch.location_details,
        # Historical rate at purchase
        "purchase_price_ils": watch.purchase_price_ils,
        "purchase_rate_to_ils": watch.purchase_rate_to_ils,
    }

    if include_relations:
        data["photos"] = [
            {
                "id": p.id,
                "filename": p.filename,
                "url": f"/uploads/photos/{p.filename}",
                "is_primary": p.is_primary,
                "uploaded_at": p.uploaded_at.isoformat() if p.uploaded_at else None,
            }
            for p in watch.photos
        ]
        data["documents"] = [
            {
                "id": d.id,
                "filename": d.filename,
                "original_name": d.original_name,
                "doc_type": d.doc_type,
                "url": f"/uploads/documents/{d.filename}",
                "uploaded_at": d.uploaded_at.isoformat() if d.uploaded_at else None,
            }
            for d in watch.documents
        ]

    return data

@router.get("/inventory")
def list_watches(
    status: Optional[str] = None,
    brand: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db)
):
    query = db.query(models.Watch)
    if status:
        query = query.filter(models.Watch.status == status)
    if brand:
        query = query.filter(models.Watch.brand.ilike(f"%{brand}%"))
    if search:
        query = query.filter(
            (models.Watch.brand.ilike(f"%{search}%")) |
            (models.Watch.model.ilike(f"%{search}%")) |
            (models.Watch.reference.ilike(f"%{search}%"))
        )
    watches = query.order_by(models.Watch.created_at.desc()).all()
    return [watch_to_dict(w) for w in watches]

@router.post("/inventory")
def create_watch(
    brand: str = Form(...),
    model: str = Form(...),
    reference: Optional[str] = Form(None),
    year: Optional[int] = Form(None),
    condition: str = Form("excellent"),
    purchase_price: float = Form(0),
    asking_price: float = Form(0),
    price_currency: str = Form("USD"),
    status: str = Form("available"),
    serial_number: Optional[str] = Form(None),
    has_box: bool = Form(False),
    has_papers: bool = Form(False),
    notes: Optional[str] = Form(None),
    purchase_date: Optional[str] = Form(None),
    # Tax refund
    tax_refund: bool = Form(False),
    tax_refund_amount: Optional[float] = Form(None),
    tax_refund_currency: Optional[str] = Form(None),
    tax_refund_country: Optional[str] = Form(None),
    # Import duty
    import_tax: float = Form(0),
    import_tax_currency: str = Form("ILS"),
    # Location
    location: str = Form("home_safe"),
    location_details: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    purchase_date_obj = None
    if purchase_date:
        try:
            purchase_date_obj = datetime.fromisoformat(purchase_date)
        except Exception:
            pass

    watch = models.Watch(
        brand=brand,
        model=model,
        reference=reference,
        year=year,
        condition=condition,
        purchase_price=purchase_price,
        asking_price=asking_price,
        price_currency=price_currency,
        status=status,
        serial_number=serial_number,
        has_box=has_box,
        has_papers=has_papers,
        notes=notes,
        purchase_date=purchase_date_obj,
        tax_refund=tax_refund,
        tax_refund_amount=tax_refund_amount,
        tax_refund_currency=tax_refund_currency,
        tax_refund_country=tax_refund_country,
        import_tax=import_tax,
        import_tax_currency=import_tax_currency,
        location=location,
        location_details=location_details,
    )
    # Fetch historical ILS rate before first commit
    _update_ils_fields(watch)

    db.add(watch)
    db.commit()
    db.refresh(watch)

    # Add financial entry for purchase
    if purchase_price > 0:
        entry = models.FinancialEntry(
            watch_id=watch.id,
            entry_type="purchase",
            amount=-purchase_price,
            description=f"רכישת {brand} {model}",
            date=purchase_date_obj or datetime.utcnow(),
        )
        db.add(entry)
        db.commit()

    _log("ADD_WATCH", f"{brand} {model}", {"reference": reference, "asking_price": asking_price, "currency": price_currency}, user=current_user)
    return watch_to_dict(watch, include_relations=True)

@router.get("/inventory/{watch_id}")
def get_watch(watch_id: int, db: Session = Depends(get_db)):
    watch = db.query(models.Watch).filter(models.Watch.id == watch_id).first()
    if not watch:
        raise HTTPException(status_code=404, detail="Watch not found")
    return watch_to_dict(watch, include_relations=True)

@router.put("/inventory/{watch_id}")
def update_watch(
    watch_id: int,
    brand: Optional[str] = Form(None),
    model: Optional[str] = Form(None),
    reference: Optional[str] = Form(None),
    year: Optional[int] = Form(None),
    condition: Optional[str] = Form(None),
    purchase_price: Optional[float] = Form(None),
    asking_price: Optional[float] = Form(None),
    price_currency: Optional[str] = Form(None),
    sold_price: Optional[float] = Form(None),
    status: Optional[str] = Form(None),
    serial_number: Optional[str] = Form(None),
    has_box: Optional[bool] = Form(None),
    has_papers: Optional[bool] = Form(None),
    notes: Optional[str] = Form(None),
    purchase_date: Optional[str] = Form(None),
    # Tax refund
    tax_refund: Optional[bool] = Form(None),
    tax_refund_amount: Optional[float] = Form(None),
    tax_refund_currency: Optional[str] = Form(None),
    tax_refund_country: Optional[str] = Form(None),
    # Import duty
    import_tax: Optional[float] = Form(None),
    import_tax_currency: Optional[str] = Form(None),
    # Location
    location: Optional[str] = Form(None),
    location_details: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    watch = db.query(models.Watch).filter(models.Watch.id == watch_id).first()
    if not watch:
        raise HTTPException(status_code=404, detail="Watch not found")

    if brand is not None: watch.brand = brand
    if model is not None: watch.model = model
    if reference is not None: watch.reference = reference
    if year is not None: watch.year = year
    if condition is not None: watch.condition = condition
    if purchase_price is not None: watch.purchase_price = purchase_price
    if asking_price is not None: watch.asking_price = asking_price
    if price_currency is not None: watch.price_currency = price_currency
    if sold_price is not None: watch.sold_price = sold_price
    if status is not None:
        if status == "sold" and watch.status != "sold":
            watch.sold_at = datetime.utcnow()
            if sold_price:
                entry = models.FinancialEntry(
                    watch_id=watch.id,
                    entry_type="sale",
                    amount=sold_price,
                    description=f"מכירת {watch.brand} {watch.model}",
                    date=datetime.utcnow(),
                )
                db.add(entry)
        watch.status = status
    if serial_number is not None: watch.serial_number = serial_number
    if has_box is not None: watch.has_box = has_box
    if has_papers is not None: watch.has_papers = has_papers
    if notes is not None: watch.notes = notes
    if tax_refund is not None: watch.tax_refund = tax_refund
    if tax_refund_amount is not None: watch.tax_refund_amount = tax_refund_amount
    if tax_refund_currency is not None: watch.tax_refund_currency = tax_refund_currency
    if tax_refund_country is not None: watch.tax_refund_country = tax_refund_country
    if import_tax is not None: watch.import_tax = import_tax
    if import_tax_currency is not None: watch.import_tax_currency = import_tax_currency
    if location is not None: watch.location = location
    if location_details is not None: watch.location_details = location_details
    if purchase_date is not None:
        try:
            watch.purchase_date = datetime.fromisoformat(purchase_date)
        except Exception:
            pass

    # Re-fetch ILS rate if any price/date/currency field changed
    price_fields_changed = any(x is not None for x in [
        purchase_price, price_currency, purchase_date
    ])
    if price_fields_changed:
        _update_ils_fields(watch)

    db.commit()
    db.refresh(watch)
    action = "EDIT_WATCH"
    if status == "sold":
        action = "SELL_WATCH"
    _log(action, f"{watch.brand} {watch.model} (#{watch_id})", {"status": watch.status}, user=current_user)
    return watch_to_dict(watch, include_relations=True)

@router.delete("/inventory/{watch_id}")
def delete_watch(watch_id: int, db: Session = Depends(get_db),
                 current_user: models.User = Depends(get_current_user)):
    watch = db.query(models.Watch).filter(models.Watch.id == watch_id).first()
    if not watch:
        raise HTTPException(status_code=404, detail="Watch not found")

    label = f"{watch.brand} {watch.model} (#{watch_id})"
    # Delete associated files
    for photo in watch.photos:
        path = os.path.join(PHOTOS_DIR, photo.filename)
        if os.path.exists(path):
            os.remove(path)
    for doc in watch.documents:
        path = os.path.join(DOCS_DIR, doc.filename)
        if os.path.exists(path):
            os.remove(path)

    db.delete(watch)
    db.commit()
    _log("DELETE_WATCH", label, user=current_user)
    return {"message": "Watch deleted successfully"}

@router.post("/inventory/{watch_id}/photos")
async def upload_photos(
    watch_id: int,
    files: List[UploadFile] = File(...),
    db: Session = Depends(get_db)
):
    watch = db.query(models.Watch).filter(models.Watch.id == watch_id).first()
    if not watch:
        raise HTTPException(status_code=404, detail="Watch not found")

    uploaded = []
    has_primary = any(p.is_primary for p in watch.photos)

    for file in files:
        ext = os.path.splitext(file.filename)[1] if file.filename else ".jpg"
        filename = f"{uuid.uuid4()}{ext}"
        filepath = os.path.join(PHOTOS_DIR, filename)

        async with aiofiles.open(filepath, 'wb') as f:
            content = await file.read()
            await f.write(content)

        is_primary = not has_primary
        has_primary = True

        photo = models.WatchPhoto(
            watch_id=watch_id,
            filename=filename,
            is_primary=is_primary,
        )
        db.add(photo)
        uploaded.append(filename)

    db.commit()
    db.refresh(watch)
    return watch_to_dict(watch, include_relations=True)

@router.delete("/inventory/{watch_id}/photos/{photo_id}")
def delete_photo(watch_id: int, photo_id: int, db: Session = Depends(get_db)):
    photo = db.query(models.WatchPhoto).filter(
        models.WatchPhoto.id == photo_id,
        models.WatchPhoto.watch_id == watch_id
    ).first()
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")

    filepath = os.path.join(PHOTOS_DIR, photo.filename)
    if os.path.exists(filepath):
        os.remove(filepath)

    was_primary = photo.is_primary
    db.delete(photo)
    db.commit()

    # Assign new primary if needed
    if was_primary:
        remaining = db.query(models.WatchPhoto).filter(models.WatchPhoto.watch_id == watch_id).first()
        if remaining:
            remaining.is_primary = True
            db.commit()

    return {"message": "Photo deleted"}

@router.post("/inventory/{watch_id}/documents")
async def upload_document(
    watch_id: int,
    file: UploadFile = File(...),
    doc_type: str = Form("other"),
    db: Session = Depends(get_db)
):
    watch = db.query(models.Watch).filter(models.Watch.id == watch_id).first()
    if not watch:
        raise HTTPException(status_code=404, detail="Watch not found")

    ext = os.path.splitext(file.filename)[1] if file.filename else ".pdf"
    filename = f"{uuid.uuid4()}{ext}"
    filepath = os.path.join(DOCS_DIR, filename)

    async with aiofiles.open(filepath, 'wb') as f:
        content = await file.read()
        await f.write(content)

    doc = models.WatchDocument(
        watch_id=watch_id,
        filename=filename,
        original_name=file.filename,
        doc_type=doc_type,
    )
    db.add(doc)
    db.commit()
    db.refresh(watch)
    return watch_to_dict(watch, include_relations=True)

@router.delete("/inventory/{watch_id}/documents/{doc_id}")
def delete_document(watch_id: int, doc_id: int, db: Session = Depends(get_db)):
    doc = db.query(models.WatchDocument).filter(
        models.WatchDocument.id == doc_id,
        models.WatchDocument.watch_id == watch_id
    ).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    filepath = os.path.join(DOCS_DIR, doc.filename)
    if os.path.exists(filepath):
        os.remove(filepath)

    db.delete(doc)
    db.commit()
    return {"message": "Document deleted"}

@router.patch("/inventory/{watch_id}/status")
def update_status(
    watch_id: int,
    status: str = Form(...),
    sold_price: Optional[float] = Form(None),
    db: Session = Depends(get_db)
):
    watch = db.query(models.Watch).filter(models.Watch.id == watch_id).first()
    if not watch:
        raise HTTPException(status_code=404, detail="Watch not found")

    if status == "sold" and watch.status != "sold":
        watch.sold_at = datetime.utcnow()
        if sold_price:
            watch.sold_price = sold_price
            entry = models.FinancialEntry(
                watch_id=watch.id,
                entry_type="sale",
                amount=sold_price,
                description=f"מכירת {watch.brand} {watch.model}",
                date=datetime.utcnow(),
            )
            db.add(entry)

    watch.status = status
    db.commit()
    db.refresh(watch)
    return watch_to_dict(watch, include_relations=True)

@router.get("/inventory/brands/list")
def get_brands(db: Session = Depends(get_db)):
    brands = db.query(models.Watch.brand).distinct().all()
    return [b[0] for b in brands]


@router.post("/inventory/{watch_id}/refresh-rate")
def refresh_ils_rate(
    watch_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Re-fetch historical ILS rate for a single watch (e.g., for legacy entries)."""
    watch = db.query(models.Watch).filter(models.Watch.id == watch_id).first()
    if not watch:
        raise HTTPException(status_code=404, detail="Watch not found")
    _update_ils_fields(watch)
    db.commit()
    db.refresh(watch)
    return {
        "purchase_rate_to_ils": watch.purchase_rate_to_ils,
        "purchase_price_ils": watch.purchase_price_ils,
    }


@router.post("/inventory/refresh-all-rates")
def refresh_all_ils_rates(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Backfill historical ILS rates for all watches that are missing them."""
    watches = db.query(models.Watch).filter(
        models.Watch.purchase_price > 0,
        models.Watch.purchase_price_ils.is_(None),
    ).all()
    updated = 0
    for watch in watches:
        _update_ils_fields(watch)
        if watch.purchase_price_ils is not None:
            updated += 1
    db.commit()
    return {"updated": updated, "total": len(watches)}
