"""
Global Document Library
GET  /api/documents          – list (filter by category / watch_id / search)
GET  /api/documents/stats    – counts by category
POST /api/documents/upload   – multipart upload
GET  /api/documents/{id}/download
DELETE /api/documents/{id}
"""

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import Optional
import os, uuid
import aiofiles

from database import get_db
import models

router = APIRouter()

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SYS_DOCS_DIR = os.path.join(BASE_DIR, "uploads", "system_documents")
os.makedirs(SYS_DOCS_DIR, exist_ok=True)

CATEGORIES = {
    "warranty":       "תעודת אחריות",
    "invoice_tax":    "חשבונית מס",
    "invoice_customs":"חשבונית מכס",
    "receipt":        "קבלה",
    "certificate":    "תעודת אותנטיות",
    "appraisal":      "הערכת שמאי",
    "contract":       "חוזה / הסכם",
    "photo":          "תמונה",
    "other":          "אחר",
}

CATEGORY_ICONS = {
    "warranty": "🛡️",
    "invoice_tax": "🧾",
    "invoice_customs": "🛃",
    "receipt": "📄",
    "certificate": "📜",
    "appraisal": "🏅",
    "contract": "✍️",
    "photo": "🖼️",
    "other": "📁",
}

def _format(doc: models.SystemDocument, db: Session) -> dict:
    watch_label = None
    if doc.watch_id:
        w = db.query(models.Watch).filter(models.Watch.id == doc.watch_id).first()
        if w:
            watch_label = f"{w.brand} {w.model}" + (f" {w.reference}" if w.reference else "")
    return {
        "id":           doc.id,
        "filename":     doc.filename,
        "original_name":doc.original_name,
        "file_type":    doc.file_type,
        "category":     doc.category,
        "category_label": CATEGORIES.get(doc.category, doc.category),
        "category_icon":  CATEGORY_ICONS.get(doc.category, "📁"),
        "description":  doc.description,
        "watch_id":     doc.watch_id,
        "watch_label":  watch_label,
        "entry_id":     doc.entry_id,
        "uploaded_at":  doc.uploaded_at.isoformat() if doc.uploaded_at else None,
        "file_size":    doc.file_size,
        "download_url": f"/api/documents/{doc.id}/download",
    }


@router.get("/documents/stats")
def document_stats(db: Session = Depends(get_db)):
    from sqlalchemy import func
    total = db.query(func.count(models.SystemDocument.id)).scalar() or 0
    by_cat = db.query(
        models.SystemDocument.category,
        func.count(models.SystemDocument.id)
    ).group_by(models.SystemDocument.category).all()
    total_size = db.query(func.sum(models.SystemDocument.file_size)).scalar() or 0
    return {
        "total":      total,
        "total_size": total_size,
        "by_category": {cat: cnt for cat, cnt in by_cat},
        "categories":  CATEGORIES,
        "category_icons": CATEGORY_ICONS,
    }


@router.get("/documents")
def list_documents(
    category: Optional[str] = Query(None),
    watch_id: Optional[int] = Query(None),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    q = db.query(models.SystemDocument)
    if category and category != "all":
        q = q.filter(models.SystemDocument.category == category)
    if watch_id:
        q = q.filter(models.SystemDocument.watch_id == watch_id)
    if search:
        term = f"%{search}%"
        q = q.filter(
            models.SystemDocument.original_name.ilike(term) |
            models.SystemDocument.description.ilike(term)
        )
    docs = q.order_by(models.SystemDocument.uploaded_at.desc()).all()
    return [_format(d, db) for d in docs]


@router.post("/documents/upload")
async def upload_document(
    file: UploadFile = File(...),
    category: str = Form("other"),
    description: Optional[str] = Form(None),
    watch_id: Optional[int] = Form(None),
    entry_id: Optional[int] = Form(None),
    db: Session = Depends(get_db)
):
    ext = (os.path.splitext(file.filename or "")[1] or "").lower()
    stored = f"{uuid.uuid4()}{ext}"
    path = os.path.join(SYS_DOCS_DIR, stored)

    content = await file.read()
    async with aiofiles.open(path, "wb") as f:
        await f.write(content)

    doc = models.SystemDocument(
        filename=stored,
        original_name=file.filename or stored,
        file_type=ext.lstrip(".") or "bin",
        category=category,
        description=description,
        watch_id=watch_id or None,
        entry_id=entry_id or None,
        file_size=len(content),
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return _format(doc, db)


@router.get("/documents/{doc_id}/download")
def download_document(doc_id: int, db: Session = Depends(get_db)):
    doc = db.query(models.SystemDocument).filter(models.SystemDocument.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    path = os.path.join(SYS_DOCS_DIR, doc.filename)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="File not found on disk")
    return FileResponse(path, filename=doc.original_name, media_type="application/octet-stream")


@router.delete("/documents/{doc_id}")
def delete_document(doc_id: int, db: Session = Depends(get_db)):
    doc = db.query(models.SystemDocument).filter(models.SystemDocument.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    path = os.path.join(SYS_DOCS_DIR, doc.filename)
    if os.path.exists(path):
        os.remove(path)
    db.delete(doc)
    db.commit()
    return {"message": "Deleted"}
