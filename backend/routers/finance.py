"""
Finance router — financial entries, invoices (PDF), document upload,
customs/tax tracking, Excel export, profit/loss reports.
"""
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Query
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, date
from sqlalchemy.orm import Session
from sqlalchemy import func
import os, uuid, shutil, io
from database import get_db
import models
from routers.auth import get_current_user_optional

router = APIRouter()

def _log(action, resource="", details=None, user=None, success=True):
    try:
        from routers.logs import log_action
        log_action(action=action, resource=resource, details=details, user=user, success=success)
    except Exception:
        pass

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INVOICES_DIR = os.path.join(BASE_DIR, "uploads", "invoices")
os.makedirs(INVOICES_DIR, exist_ok=True)

# ─── Pydantic models ──────────────────────────────────────────────────────
class EntryCreate(BaseModel):
    watch_id: Optional[int] = None
    entry_type: str            # purchase | sale | expense | customs | shipping | repair
    amount: float
    date: Optional[str] = None
    description: str = ""
    invoice_number: Optional[str] = None
    currency: str = "USD"
    exchange_rate: float = 1.0  # to USD

class EntryOut(BaseModel):
    id: int
    watch_id: Optional[int]
    entry_type: str
    amount: float
    description: str
    date: str
    invoice_number: Optional[str] = None
    currency: str
    exchange_rate: float
    class Config: orm_mode = True


# ─── GET /finance/summary ─────────────────────────────────────────────────
@router.get("/finance/summary")
def get_summary(db: Session = Depends(get_db)):
    entries = db.query(models.FinancialEntry).all()
    watches = db.query(models.Watch).all()

    total_purchased = sum(abs(e.amount) for e in entries if e.entry_type == "purchase")
    total_sold = sum(e.amount for e in entries if e.entry_type == "sale")
    total_expenses = sum(abs(e.amount) for e in entries
                         if e.entry_type in ("expense","customs","shipping","repair"))
    realized_profit = total_sold - total_purchased - total_expenses

    available = [w for w in watches if w.status == "available"]
    portfolio_value = sum(w.asking_price or 0 for w in available)
    portfolio_cost   = sum(w.purchase_price or 0 for w in available)
    unrealized_profit = portfolio_value - portfolio_cost

    return {
        "total_purchased":    total_purchased,
        "total_sold":         total_sold,
        "total_expenses":     total_expenses,
        "realized_profit":    realized_profit,
        "unrealized_profit":  unrealized_profit,
        "total_profit":       realized_profit + unrealized_profit,
        "portfolio_value":    portfolio_value,
        "portfolio_cost":     portfolio_cost,
        "watches_count":      len(watches),
        "watches_available":  len(available),
        "watches_sold":       len([w for w in watches if w.status == "sold"]),
        "watches_reserved":   len([w for w in watches if w.status == "reserved"]),
        "roi_percent":        round((realized_profit / total_purchased * 100), 1) if total_purchased else 0,
    }


# ─── GET /finance/monthly ─────────────────────────────────────────────────
@router.get("/finance/monthly")
def monthly_breakdown(months: int = Query(12), db: Session = Depends(get_db)):
    entries = db.query(models.FinancialEntry).all()
    from collections import defaultdict
    monthly = defaultdict(lambda: {"purchases": 0, "sales": 0, "expenses": 0, "profit": 0})
    for e in entries:
        if not e.date: continue
        key = e.date.strftime("%Y-%m") if isinstance(e.date, datetime) else str(e.date)[:7]
        if e.entry_type == "purchase":
            monthly[key]["purchases"] += abs(e.amount)
        elif e.entry_type == "sale":
            monthly[key]["sales"] += e.amount
        elif e.entry_type in ("expense","customs","shipping","repair"):
            monthly[key]["expenses"] += abs(e.amount)
    for key, d in monthly.items():
        d["profit"] = d["sales"] - d["purchases"] - d["expenses"]
        d["month"] = key
    result = sorted(monthly.values(), key=lambda x: x["month"])
    return result[-months:]


# ─── GET/POST/DELETE /finance/entries ─────────────────────────────────────
@router.get("/finance/entries")
def list_entries(
    entry_type: Optional[str] = None,
    watch_id: Optional[int] = None,
    db: Session = Depends(get_db)
):
    q = db.query(models.FinancialEntry)
    if entry_type:
        q = q.filter(models.FinancialEntry.entry_type == entry_type)
    if watch_id:
        q = q.filter(models.FinancialEntry.watch_id == watch_id)
    entries = q.order_by(models.FinancialEntry.date.desc()).all()
    result = []
    for e in entries:
        watch = db.query(models.Watch).get(e.watch_id) if e.watch_id else None
        result.append({
            "id": e.id,
            "watch_id": e.watch_id,
            "watch_name": f"{watch.brand} {watch.model}" if watch else None,
            "entry_type": e.entry_type,
            "amount": e.amount,
            "description": e.description,
            "date": e.date.strftime("%d/%m/%Y") if e.date else "",
            "invoice_number": getattr(e, "invoice_number", None),
            "currency": getattr(e, "currency", "USD"),
        })
    return result

@router.post("/finance/entries")
def create_entry(data: EntryCreate, db: Session = Depends(get_db)):
    date_val = None
    if data.date:
        try: date_val = datetime.strptime(data.date, "%Y-%m-%d")
        except: date_val = datetime.utcnow()
    else:
        date_val = datetime.utcnow()

    entry = models.FinancialEntry(
        watch_id=data.watch_id,
        entry_type=data.entry_type,
        amount=-abs(data.amount) if data.entry_type in ("purchase","expense","customs","shipping","repair") else abs(data.amount),
        date=date_val,
        description=data.description,
    )
    db.add(entry); db.commit(); db.refresh(entry)
    return entry

@router.delete("/finance/entries/{entry_id}")
def delete_entry(entry_id: int, db: Session = Depends(get_db)):
    e = db.query(models.FinancialEntry).get(entry_id)
    if not e: raise HTTPException(404, "Not found")
    db.delete(e); db.commit()
    return {"ok": True}


# ─── GET /finance/watch-profit/{id} ──────────────────────────────────────
@router.get("/finance/watch-profit/{watch_id}")
def watch_profit(watch_id: int, db: Session = Depends(get_db)):
    watch = db.query(models.Watch).get(watch_id)
    if not watch: raise HTTPException(404, "Watch not found")
    entries = db.query(models.FinancialEntry).filter_by(watch_id=watch_id).all()
    total_in = sum(abs(e.amount) for e in entries if e.entry_type == "purchase")
    total_expenses = sum(abs(e.amount) for e in entries if e.entry_type in ("expense","customs","shipping","repair"))
    total_out = sum(e.amount for e in entries if e.entry_type == "sale")
    profit = total_out - total_in - total_expenses
    margin = (profit / total_in * 100) if total_in else 0
    return {
        "watch": f"{watch.brand} {watch.model}",
        "purchase_cost": total_in,
        "extra_expenses": total_expenses,
        "total_cost": total_in + total_expenses,
        "sale_revenue": total_out,
        "profit": profit,
        "margin_percent": round(margin, 1),
        "status": watch.status,
    }


# ══════════════════════════════════════════════════════════════════════════
#  INVOICE GENERATION (PDF)
# ══════════════════════════════════════════════════════════════════════════
class InvoiceData(BaseModel):
    invoice_number: str
    date: str
    seller_name: str = "Watch Pro"
    seller_address: str = ""
    seller_phone: str = ""
    seller_email: str = ""
    buyer_name: str
    buyer_address: str = ""
    buyer_phone: str = ""
    watch_brand: str
    watch_model: str
    watch_reference: str = ""
    watch_year: Optional[int] = None
    watch_serial: str = ""
    watch_condition: str = ""
    has_box: bool = False
    has_papers: bool = False
    price: float
    currency: str = "USD"
    payment_method: str = "Bank Transfer"
    notes: str = ""
    include_customs: bool = False
    customs_amount: float = 0
    vat_percent: float = 0

def _safe(text: str) -> str:
    """Strip non-latin-1 characters so fpdf2 Helvetica doesn't crash."""
    if not text: return ""
    # Replace common Unicode symbols with ASCII equivalents
    replacements = {
        "—": "-", "–": "-", "’": "'", "‘": "'",
        "“": '"', "”": '"', "…": "...", "€": "EUR",
        "©": "(c)", "®": "(R)", "™": "(TM)",
    }
    for k, v in replacements.items():
        text = text.replace(k, v)
    # Final fallback: encode to latin-1, drop anything that still fails
    return text.encode("latin-1", errors="ignore").decode("latin-1")

@router.post("/finance/generate-invoice")
def generate_invoice(data: InvoiceData):
    """Generate a professional PDF invoice for a watch sale."""
    try:
        from fpdf import FPDF
    except ImportError:
        raise HTTPException(500, "fpdf2 not installed. Run: pip install fpdf2")

    pdf = FPDF()
    pdf.add_page()
    pdf.set_auto_page_break(auto=True, margin=15)

    # ── Colors ──
    GOLD = (212, 175, 55)
    DARK = (17, 24, 39)
    GRAY = (107, 114, 128)
    WHITE = (255, 255, 255)
    LIGHT = (243, 244, 246)

    # ── Header background ──
    pdf.set_fill_color(*DARK)
    pdf.rect(0, 0, 210, 45, "F")

    # Logo / company name
    pdf.set_text_color(*GOLD)
    pdf.set_font("Helvetica", "B", 26)
    pdf.set_xy(15, 10)
    pdf.cell(0, 10, "WATCH PRO", ln=False)

    # Invoice label
    pdf.set_text_color(*WHITE)
    pdf.set_font("Helvetica", "", 11)
    pdf.set_xy(15, 25)
    pdf.cell(0, 6, _safe("Luxury Watch Trading | Invoice"), ln=True)

    # Invoice number box (right side)
    pdf.set_fill_color(*GOLD)
    pdf.rect(140, 8, 60, 30, "F")
    pdf.set_text_color(*DARK)
    pdf.set_font("Helvetica", "B", 9)
    pdf.set_xy(142, 11)
    pdf.cell(56, 5, "INVOICE", align="C", ln=True)
    pdf.set_font("Helvetica", "B", 13)
    pdf.set_xy(142, 17)
    pdf.cell(56, 7, f"#{data.invoice_number}", align="C", ln=True)
    pdf.set_font("Helvetica", "", 9)
    pdf.set_xy(142, 26)
    pdf.cell(56, 5, f"Date: {data.date}", align="C", ln=True)
    pdf.set_xy(142, 32)
    pdf.cell(56, 5, f"Payment: {data.payment_method}", align="C", ln=True)

    # ── Seller / Buyer info ──
    pdf.set_text_color(*DARK)
    pdf.set_y(55)

    # Seller block
    pdf.set_fill_color(*LIGHT)
    pdf.rect(10, 52, 90, 38, "F")
    pdf.set_font("Helvetica", "B", 9)
    pdf.set_text_color(*GRAY)
    pdf.set_xy(13, 54)
    pdf.cell(0, 5, "FROM (SELLER)")
    pdf.set_font("Helvetica", "B", 11)
    pdf.set_text_color(*DARK)
    pdf.set_xy(13, 61)
    pdf.cell(0, 5, _safe(data.seller_name))
    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(*GRAY)
    for i, line in enumerate([data.seller_address, data.seller_phone, data.seller_email]):
        if line:
            pdf.set_xy(13, 68 + i * 6)
            pdf.cell(0, 5, _safe(line))

    # Buyer block
    pdf.set_fill_color(*LIGHT)
    pdf.rect(110, 52, 90, 38, "F")
    pdf.set_font("Helvetica", "B", 9)
    pdf.set_text_color(*GRAY)
    pdf.set_xy(113, 54)
    pdf.cell(0, 5, "TO (BUYER)")
    pdf.set_font("Helvetica", "B", 11)
    pdf.set_text_color(*DARK)
    pdf.set_xy(113, 61)
    pdf.cell(0, 5, _safe(data.buyer_name))
    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(*GRAY)
    for i, line in enumerate([data.buyer_address, data.buyer_phone]):
        if line:
            pdf.set_xy(113, 68 + i * 6)
            pdf.cell(0, 5, _safe(line))

    # ── Watch Details ──
    pdf.set_y(98)
    pdf.set_font("Helvetica", "B", 9)
    pdf.set_text_color(*GRAY)
    pdf.set_x(10)
    pdf.cell(0, 5, "WATCH DETAILS", ln=True)

    # Gold divider
    pdf.set_draw_color(*GOLD)
    pdf.set_line_width(0.8)
    pdf.line(10, 104, 200, 104)
    pdf.set_line_width(0.2)

    # Table header
    pdf.set_fill_color(*DARK)
    pdf.set_text_color(*WHITE)
    pdf.set_font("Helvetica", "B", 9)
    pdf.set_y(107)
    pdf.set_x(10)
    pdf.cell(70, 7, "Description", border=0, fill=True)
    pdf.cell(40, 7, "Reference", border=0, fill=True)
    pdf.cell(30, 7, "Year", border=0, fill=True)
    pdf.cell(50, 7, "Condition", border=0, fill=True, ln=True)

    # Table row
    accessories = []
    if data.has_box: accessories.append("Box")
    if data.has_papers: accessories.append("Papers")
    acc_str = " + ".join(accessories) if accessories else "No accessories"

    pdf.set_fill_color(*LIGHT)
    pdf.set_text_color(*DARK)
    pdf.set_font("Helvetica", "", 10)
    pdf.set_x(10)
    pdf.cell(70, 8, _safe(f"{data.watch_brand} {data.watch_model}"), border=0, fill=True)
    pdf.cell(40, 8, _safe(data.watch_reference or "N/A"), border=0, fill=True)
    pdf.cell(30, 8, str(data.watch_year) if data.watch_year else "N/A", border=0, fill=True)
    pdf.cell(50, 8, _safe(data.watch_condition.capitalize()) if data.watch_condition else "N/A", border=0, fill=True, ln=True)

    # Serial + accessories
    pdf.set_x(10)
    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(*GRAY)
    pdf.cell(70, 6, _safe(f"Serial: {data.watch_serial or 'N/A'}"), ln=False)
    pdf.cell(0, 6, _safe(f"Includes: {acc_str}"), ln=True)

    # ── Pricing ──
    pdf.set_y(pdf.get_y() + 10)
    pdf.set_draw_color(*GOLD)
    pdf.line(10, pdf.get_y(), 200, pdf.get_y())
    pdf.set_y(pdf.get_y() + 5)

    # Use ASCII-safe currency symbols only
    cur_sym = {"USD": "USD ", "EUR": "EUR ", "GBP": "GBP ", "ILS": "ILS ", "CHF": "CHF "}.get(data.currency, "USD ")

    def price_row(label, amount, bold=False, color=DARK):
        pdf.set_x(100)
        pdf.set_font("Helvetica", "B" if bold else "", 10)
        pdf.set_text_color(*color)
        pdf.cell(60, 7, _safe(label), align="R")
        pdf.cell(40, 7, f"{cur_sym}{amount:,.2f}", align="R", ln=True)

    price_row("Watch Price:", data.price)
    if data.vat_percent > 0:
        vat_amount = data.price * data.vat_percent / 100
        price_row(f"VAT ({data.vat_percent}%):", vat_amount)
    if data.include_customs and data.customs_amount > 0:
        price_row("Import Customs:", data.customs_amount)

    total = data.price
    if data.vat_percent > 0:
        total += data.price * data.vat_percent / 100
    if data.include_customs:
        total += data.customs_amount

    # Total box
    pdf.set_y(pdf.get_y() + 2)
    pdf.set_fill_color(*GOLD)
    pdf.set_x(100)
    pdf.set_font("Helvetica", "B", 13)
    pdf.set_text_color(*DARK)
    pdf.cell(60, 10, "TOTAL:", align="R", fill=True)
    pdf.cell(40, 10, f"{cur_sym}{total:,.2f}", align="R", fill=True, ln=True)

    # ── Notes ──
    if data.notes:
        pdf.set_y(pdf.get_y() + 10)
        pdf.set_font("Helvetica", "B", 9)
        pdf.set_text_color(*GRAY)
        pdf.set_x(10)
        pdf.cell(0, 5, "NOTES:", ln=True)
        pdf.set_font("Helvetica", "", 9)
        pdf.set_text_color(*DARK)
        pdf.set_x(10)
        pdf.multi_cell(190, 5, _safe(data.notes))

    # ── Footer ──
    pdf.set_y(270)
    pdf.set_draw_color(*GOLD)
    pdf.line(10, 270, 200, 270)
    pdf.set_font("Helvetica", "", 8)
    pdf.set_text_color(*GRAY)
    pdf.set_x(10)
    pdf.cell(0, 5, "Watch Pro | Luxury Watch Trading | Official receipt of sale.", align="C", ln=True)
    pdf.set_x(10)
    pdf.cell(0, 5, _safe(f"Invoice #{data.invoice_number} | {data.date}"), align="C")

    # Save PDF
    filename = f"invoice_{data.invoice_number}_{datetime.utcnow().strftime('%Y%m%d%H%M%S')}.pdf"
    filepath = os.path.join(INVOICES_DIR, filename)
    pdf.output(filepath)

    return FileResponse(
        filepath,
        media_type="application/pdf",
        filename=filename,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )


# ── Upload invoice/document ────────────────────────────────────────────────
class InvoiceDoc(BaseModel):
    id: int; filename: str; original_name: str; doc_type: str; uploaded_at: str; notes: str

@router.post("/finance/upload-document")
async def upload_invoice_doc(
    file: UploadFile = File(...),
    doc_type: str = "invoice",
    notes: str = "",
    watch_id: Optional[int] = None,
    db: Session = Depends(get_db)
):
    ext = os.path.splitext(file.filename or "doc")[1]
    unique_name = f"{uuid.uuid4().hex}{ext}"
    path = os.path.join(INVOICES_DIR, unique_name)
    with open(path, "wb") as f:
        shutil.copyfileobj(file.file, f)
    
    # Also attach to watch as document
    if watch_id:
        doc = models.WatchDocument(
            watch_id=watch_id,
            filename=unique_name,
            original_name=file.filename,
            doc_type=doc_type,
        )
        db.add(doc); db.commit()

    return {
        "filename": unique_name,
        "original_name": file.filename,
        "doc_type": doc_type,
        "url": f"/uploads/invoices/{unique_name}",
        "size": os.path.getsize(path),
    }


# ── Excel Export ───────────────────────────────────────────────────────────
@router.get("/finance/export-excel")
def export_excel(db: Session = Depends(get_db)):
    """Export all financial data to Excel."""
    try:
        import openpyxl
        from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
        from openpyxl.utils import get_column_letter
    except ImportError:
        raise HTTPException(500, "openpyxl not installed")

    wb = openpyxl.Workbook()

    # ── Colors ──
    GOLD_FILL = PatternFill("solid", fgColor="D4AF37")
    DARK_FILL = PatternFill("solid", fgColor="111827")
    LIGHT_FILL = PatternFill("solid", fgColor="F9FAFB")
    HEADER_FONT = Font(bold=True, color="FFFFFF")
    GOLD_FONT  = Font(bold=True, color="D4AF37")

    def style_header(cell, bg="111827"):
        cell.font = HEADER_FONT
        cell.fill = PatternFill("solid", fgColor=bg)
        cell.alignment = Alignment(horizontal="center", vertical="center")

    # ── Sheet 1: Summary ──
    ws1 = wb.active
    ws1.title = "Summary"
    summary = get_summary(db)
    ws1.column_dimensions["A"].width = 30
    ws1.column_dimensions["B"].width = 20

    headers = [["WATCH PRO — Financial Summary", ""]]
    ws1.append(["", ""])
    ws1.append(["Metric", "Value"])
    style_header(ws1["A2"], "111827"); style_header(ws1["B2"], "111827")

    rows = [
        ("Total Purchased",    f"${summary['total_purchased']:,.0f}"),
        ("Total Sold",         f"${summary['total_sold']:,.0f}"),
        ("Total Expenses",     f"${summary['total_expenses']:,.0f}"),
        ("Realized Profit",    f"${summary['realized_profit']:,.0f}"),
        ("Unrealized Profit",  f"${summary['unrealized_profit']:,.0f}"),
        ("Total Profit",       f"${summary['total_profit']:,.0f}"),
        ("Portfolio Value",    f"${summary['portfolio_value']:,.0f}"),
        ("ROI %",              f"{summary['roi_percent']:.1f}%"),
        ("Watches in Stock",   str(summary['watches_count'])),
        ("Available",          str(summary['watches_available'])),
        ("Sold",               str(summary['watches_sold'])),
    ]
    for r in rows:
        ws1.append(r)

    # ── Sheet 2: All Entries ──
    ws2 = wb.create_sheet("Transactions")
    cols = ["ID", "Date", "Type", "Watch", "Amount", "Currency", "Description", "Invoice #"]
    ws2.append(cols)
    for i, h in enumerate(cols, 1):
        style_header(ws2.cell(1, i))
        ws2.column_dimensions[get_column_letter(i)].width = [5,12,14,30,12,10,35,15][i-1]

    entries_data = list_entries(db=db)
    for e in entries_data:
        ws2.append([
            e["id"], e["date"], e["entry_type"],
            e.get("watch_name") or "—",
            abs(e["amount"]), "USD",
            e["description"], e.get("invoice_number",""),
        ])

    # ── Sheet 3: Inventory ──
    ws3 = wb.create_sheet("Inventory")
    inv_cols = ["ID","Brand","Model","Reference","Year","Condition","Purchase Price","Asking Price","Status","Serial","Box","Papers"]
    ws3.append(inv_cols)
    for i, h in enumerate(inv_cols, 1):
        style_header(ws3.cell(1, i))
        ws3.column_dimensions[get_column_letter(i)].width = [5,15,20,15,8,12,15,14,12,15,6,7][i-1]

    watches = db.query(models.Watch).all()
    for w in watches:
        ws3.append([
            w.id, w.brand, w.model, w.reference or "", w.year or "",
            w.condition or "", w.purchase_price or 0, w.asking_price or 0,
            w.status, w.serial_number or "", "✓" if w.has_box else "✗",
            "✓" if w.has_papers else "✗",
        ])

    # Write to buffer
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)

    filename = f"WatchPro_Finance_{datetime.utcnow().strftime('%Y%m%d')}.xlsx"
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )


# ══════════════════════════════════════════════════════════════════════════════
#  ISRAELI DOCUMENT GENERATION  (חשבונית מס / הצעת מחיר)
#  Hebrew RTL via python-bidi + Arial Unicode font
# ══════════════════════════════════════════════════════════════════════════════

ARIAL_UNICODE = "/Library/Fonts/Arial Unicode.ttf"
ARIAL_UNICODE_BOLD = "/Library/Fonts/Arial Bold.ttf"  # bold fallback (latin-only)
# Brush Script for digital signature — elegant cursive that ships with macOS
BRUSH_SCRIPT = "/System/Library/Fonts/Supplemental/Brush Script.ttf"
VAT_RATE = 17.0  # מע"מ ישראל
SYSTEM_DOCS_DIR = os.path.join(BASE_DIR, "uploads", "system_documents")
os.makedirs(SYSTEM_DOCS_DIR, exist_ok=True)


class IsraeliDocRequest(BaseModel):
    # Document meta
    doc_type: str = "invoice"        # "invoice" | "quote"
    doc_number: str                  # מספר חשבונית / הצעת מחיר
    doc_date: str                    # YYYY-MM-DD
    valid_until: Optional[str] = None  # for quotes only
    # Seller (your business)
    seller_name: str = "Watch Pro"
    seller_vat_number: str = ""      # מספר עוסק מורשה / ח.פ.
    seller_address: str = ""
    seller_phone: str = ""
    seller_email: str = ""
    seller_bank: str = ""            # bank account for payment
    # Buyer
    buyer_name: str
    buyer_id: str = ""               # ת.ז. / ח.פ.
    buyer_address: str = ""
    buyer_phone: str = ""
    buyer_email: str = ""
    # Watch
    watch_brand: str
    watch_model: str
    watch_reference: str = ""
    watch_year: Optional[int] = None
    watch_serial: str = ""
    watch_condition: str = ""
    has_box: bool = False
    has_papers: bool = False
    # Pricing
    price_before_vat: float          # מחיר לפני מע"מ בשקלים
    currency: str = "ILS"
    include_vat: bool = True         # True = חשבונית עם מע"מ; False = פטור / ייצוא
    customs_amount: float = 0        # מכס (אופציונלי)
    notes: str = ""
    payment_method: str = "העברה בנקאית"


def _heb(text: str) -> str:
    """Convert Hebrew string to visual RTL for fpdf2."""
    if not text:
        return ""
    try:
        from bidi.algorithm import get_display
        return get_display(str(text))
    except Exception:
        return str(text)


def _fmt_ils(amount: float) -> str:
    return f"{amount:,.2f} ₪"  # ₪ symbol


def _date_heb(iso: str) -> str:
    """Convert YYYY-MM-DD to DD/MM/YYYY."""
    try:
        parts = iso.split("-")
        return f"{parts[2]}/{parts[1]}/{parts[0]}"
    except Exception:
        return iso


def _build_israeli_pdf(data: IsraeliDocRequest) -> bytes:
    """Generate the Israeli invoice/quote PDF and return bytes."""
    from fpdf import FPDF, XPos, YPos

    is_invoice = data.doc_type == "invoice"
    doc_title = "חשבונית מס" if is_invoice else "הצעת מחיר"

    # ── Colors ──────────────────────────────────────────────────────────────
    GOLD   = (212, 175, 55)
    DARK   = (17,  24,  39)
    BLUE   = (30,  58, 138)   # official Israeli blue feel
    GRAY   = (75,  85,  99)
    LGRAY  = (243, 244, 246)
    WHITE  = (255, 255, 255)
    RED    = (185,  28,  28)
    GREEN  = (21, 128,  61)

    pdf = FPDF()
    pdf.add_page()
    pdf.set_auto_page_break(auto=True, margin=20)

    # Register Unicode font for Hebrew
    pdf.add_font("Heb",   fname=ARIAL_UNICODE,      uni=True)
    pdf.add_font("HebB",  fname=ARIAL_UNICODE,      uni=True)   # same (bold via weight)

    def cell_r(w, h, txt, fill=False, border=0, new_x=XPos.RIGHT, new_y=YPos.TOP, align="R"):
        """Right-aligned cell with Hebrew bidi transform."""
        pdf.cell(w, h, _heb(txt), border=border, fill=fill,
                 new_x=new_x, new_y=new_y, align=align)

    def multi_r(w, h, txt):
        """Right-aligned multi-cell."""
        pdf.multi_cell(w, h, _heb(txt), align="R")

    # ── Header ────────────────────────────────────────────────────────────────
    pdf.set_fill_color(*DARK)
    pdf.rect(0, 0, 210, 42, "F")

    # Gold stripe
    pdf.set_fill_color(*GOLD)
    pdf.rect(0, 42, 210, 3, "F")

    # Company name (right side for RTL)
    pdf.set_text_color(*GOLD)
    pdf.set_font("Heb", size=22)
    pdf.set_xy(10, 8)
    cell_r(130, 10, data.seller_name, align="R")

    # Subtitle
    pdf.set_text_color(*WHITE)
    pdf.set_font("Heb", size=9)
    pdf.set_xy(10, 21)
    lines = []
    if data.seller_vat_number:
        lines.append(f"עוסק מורשה מס' {data.seller_vat_number}")
    if data.seller_address:
        lines.append(data.seller_address)
    if data.seller_phone:
        lines.append(data.seller_phone)
    cell_r(130, 6, " | ".join(lines), align="R")

    # Document type box (left side, highlighted)
    box_color = GOLD if is_invoice else BLUE
    pdf.set_fill_color(*box_color)
    pdf.rect(148, 5, 55, 34, "F")
    pdf.set_text_color(*DARK if is_invoice else WHITE)
    pdf.set_font("Heb", size=14)
    pdf.set_xy(148, 9)
    cell_r(53, 8, doc_title, fill=False, align="C")
    pdf.set_font("Heb", size=10)
    pdf.set_xy(148, 19)
    cell_r(53, 6, f"מס' {data.doc_number}", fill=False, align="C")
    pdf.set_font("Heb", size=9)
    pdf.set_xy(148, 27)
    cell_r(53, 6, _date_heb(data.doc_date), fill=False, align="C")

    # ── Seller / Buyer boxes ─────────────────────────────────────────────────
    y0 = 52
    pdf.set_fill_color(*LGRAY)
    pdf.rect(10,  y0, 90, 45, "F")   # buyer (left in visual = right in RTL page)
    pdf.rect(110, y0, 90, 45, "F")   # seller (right visual = left RTL)

    # Seller block (right column)
    pdf.set_font("Heb", size=8)
    pdf.set_text_color(*GRAY)
    pdf.set_xy(110, y0 + 3)
    cell_r(88, 5, "פרטי המוכר", align="R")
    pdf.set_font("Heb", size=11)
    pdf.set_text_color(*DARK)
    pdf.set_xy(110, y0 + 10)
    cell_r(88, 6, data.seller_name, align="R")
    pdf.set_font("Heb", size=8)
    pdf.set_text_color(*GRAY)
    y_s = y0 + 18
    for line in [
        f"עוסק מורשה: {data.seller_vat_number}" if data.seller_vat_number else "",
        data.seller_address,
        data.seller_phone,
        data.seller_email,
    ]:
        if line:
            pdf.set_xy(110, y_s)
            cell_r(88, 5, line, align="R")
            y_s += 6

    # Buyer block (left column)
    pdf.set_font("Heb", size=8)
    pdf.set_text_color(*GRAY)
    pdf.set_xy(10, y0 + 3)
    cell_r(88, 5, "פרטי הלקוח / הקונה", align="R")
    pdf.set_font("Heb", size=11)
    pdf.set_text_color(*DARK)
    pdf.set_xy(10, y0 + 10)
    cell_r(88, 6, data.buyer_name, align="R")
    pdf.set_font("Heb", size=8)
    pdf.set_text_color(*GRAY)
    y_b = y0 + 18
    for line in [
        f"ת.ז. / ח.פ.: {data.buyer_id}" if data.buyer_id else "",
        data.buyer_address,
        data.buyer_phone,
        data.buyer_email,
    ]:
        if line:
            pdf.set_xy(10, y_b)
            cell_r(88, 5, line, align="R")
            y_b += 6

    # ── Items Table Header ───────────────────────────────────────────────────
    y_tbl = y0 + 52
    pdf.set_fill_color(*DARK)
    pdf.set_text_color(*WHITE)
    pdf.set_font("Heb", size=9)
    pdf.set_xy(10, y_tbl)
    col_widths = [90, 30, 25, 45]  # תיאור, רפרנס, שנה, מחיר
    headers = ["תיאור הפריט", "רפרנס", "שנה", "מחיר (לפני מע\"מ)"]
    x = 10
    for i, (w, h) in enumerate(zip(col_widths, headers)):
        pdf.set_xy(x, y_tbl)
        cell_r(w, 8, h, fill=True, border=0, align="R" if i > 0 else "R",
               new_x=XPos.RIGHT, new_y=YPos.TOP)
        x += w

    # ── Item row ─────────────────────────────────────────────────────────────
    y_row = y_tbl + 9
    pdf.set_fill_color(*LGRAY)
    pdf.set_text_color(*DARK)
    pdf.set_font("Heb", size=10)
    desc = f"{data.watch_brand} {data.watch_model}"
    acc_parts = []
    if data.has_box:    acc_parts.append("קופסה מקורית")
    if data.has_papers: acc_parts.append("תעודות")
    acc_str = " | ".join(acc_parts) if acc_parts else "ללא"

    x = 10
    row_data = [
        desc,
        data.watch_reference or "—",
        str(data.watch_year) if data.watch_year else "—",
        _fmt_ils(data.price_before_vat),
    ]
    for i, (w, val) in enumerate(zip(col_widths, row_data)):
        pdf.set_xy(x, y_row)
        cell_r(w, 9, val, fill=True, border=0,
               new_x=XPos.RIGHT, new_y=YPos.TOP)
        x += w

    # Sub-row: serial + accessories
    y_sub = y_row + 10
    pdf.set_font("Heb", size=8)
    pdf.set_text_color(*GRAY)
    pdf.set_xy(10, y_sub)
    sub_parts = []
    if data.watch_serial:
        sub_parts.append(f"מס' סידורי: {data.watch_serial}")
    sub_parts.append(f"אביזרים: {acc_str}")
    if data.watch_condition:
        cond_map = {"mint": "חדש למעשה - Mint", "excellent": "מצוין", "good": "טוב", "fair": "סביר"}
        sub_parts.append(f"מצב: {cond_map.get(data.watch_condition, data.watch_condition)}")
    cell_r(190, 5, " | ".join(sub_parts), align="R")

    # ── Gold separator ───────────────────────────────────────────────────────
    y_sep = y_sub + 10
    pdf.set_draw_color(*GOLD)
    pdf.set_line_width(0.8)
    pdf.line(10, y_sep, 200, y_sep)
    pdf.set_line_width(0.2)

    # ── Pricing Summary (right-aligned) ──────────────────────────────────────
    y_price = y_sep + 5
    pdf.set_font("Heb", size=10)

    def price_row(label, amount_ils, is_total=False, color=None):
        nonlocal y_price
        col = color or (DARK if not is_total else DARK)
        pdf.set_text_color(*col)
        pdf.set_font("Heb", size=10 if not is_total else 12)
        pdf.set_xy(110, y_price)
        cell_r(50, 7, label, align="R", new_x=XPos.RIGHT, new_y=YPos.TOP)
        pdf.set_xy(160, y_price)
        cell_r(40, 7, _fmt_ils(amount_ils), align="R")
        y_price += 8

    price_row("מחיר לפני מע\"מ:", data.price_before_vat)

    vat_amount = 0.0
    if data.include_vat:
        vat_amount = round(data.price_before_vat * VAT_RATE / 100, 2)
        price_row(f"מע\"מ {VAT_RATE:.0f}%:", vat_amount, color=RED)

    if data.customs_amount > 0:
        price_row("מכס / עלויות ייבוא:", data.customs_amount)

    total = data.price_before_vat + vat_amount + data.customs_amount

    # Total box
    pdf.set_fill_color(*GOLD)
    pdf.set_text_color(*DARK)
    pdf.set_font("Heb", size=12)
    pdf.set_xy(110, y_price + 2)
    cell_r(50, 10, "סה\"כ לתשלום:", fill=True, align="R",
           new_x=XPos.RIGHT, new_y=YPos.TOP)
    pdf.set_xy(160, y_price + 2)
    pdf.set_font("Heb", size=13)
    cell_r(40, 10, _fmt_ils(total), fill=True, align="R")
    y_price += 14

    # ── Payment info ─────────────────────────────────────────────────────────
    pdf.set_text_color(*GRAY)
    pdf.set_font("Heb", size=9)
    pdf.set_xy(110, y_price + 2)
    cell_r(90, 5, f"אמצעי תשלום: {data.payment_method}", align="R")
    if data.seller_bank:
        y_price += 6
        pdf.set_xy(110, y_price + 2)
        cell_r(90, 5, f"חשבון בנק: {data.seller_bank}", align="R")

    if not is_invoice and data.valid_until:
        y_price += 10
        pdf.set_fill_color(*BLUE)
        pdf.set_text_color(*WHITE)
        pdf.set_font("Heb", size=9)
        pdf.set_xy(110, y_price)
        cell_r(90, 7, f"הצעה בתוקף עד: {_date_heb(data.valid_until)}", fill=True, align="R")

    # ── Notes ────────────────────────────────────────────────────────────────
    if data.notes:
        y_notes = max(y_sep + 80, y_price + 15)
        pdf.set_fill_color(*LGRAY)
        pdf.rect(10, y_notes, 90, max(20, len(data.notes) // 5), "F")
        pdf.set_text_color(*GRAY)
        pdf.set_font("Heb", size=8)
        pdf.set_xy(10, y_notes + 3)
        cell_r(88, 5, "הערות:", align="R", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        pdf.set_text_color(*DARK)
        pdf.set_font("Heb", size=9)
        pdf.set_x(12)
        multi_r(86, 5, data.notes)

    # ── Signature area (both invoice and quote) ───────────────────────────────
    y_sig = 240

    # ── Digital seller signature (Brush Script font) ──────────────────────────
    brush_ok = os.path.exists(BRUSH_SCRIPT)
    if brush_ok:
        try:
            pdf.add_font("Sig", style="", fname=BRUSH_SCRIPT, uni=True)
            brush_ok = True
        except Exception:
            brush_ok = False

    # Seller signature box (right side, x=130..200)
    pdf.set_fill_color(248, 246, 240)
    pdf.rect(130, y_sig - 22, 70, 28, "F")
    pdf.set_draw_color(*GOLD)
    pdf.set_line_width(0.5)
    pdf.rect(130, y_sig - 22, 70, 28)
    # "חתימה דיגיטלית" label top-right
    pdf.set_font("Heb", size=7)
    pdf.set_text_color(180, 150, 50)
    pdf.set_xy(130, y_sig - 21)
    cell_r(68, 5, "חתימה דיגיטלית", align="R")
    # Signature in Brush Script (or Arial italic as fallback)
    if brush_ok:
        pdf.set_font("Sig", size=18)
    else:
        pdf.set_font("Heb", size=14)
    pdf.set_text_color(30, 30, 80)
    # Center the signature in the box — use Latin rendering (not bidi) for cursive effect
    sig_name = data.seller_name  # Latin or mixed — Brush Script doesn't need bidi
    pdf.set_xy(130, y_sig - 13)
    pdf.cell(70, 12, sig_name, align="C")
    # Separator line inside box
    pdf.set_draw_color(*GRAY)
    pdf.set_line_width(0.2)
    pdf.line(135, y_sig + 2, 195, y_sig + 2)
    # Authorized label
    pdf.set_font("Heb", size=7)
    pdf.set_text_color(*GRAY)
    pdf.set_xy(130, y_sig + 3)
    cell_r(68, 4, "מורשה לחתימה", align="C")

    # Buyer signature box (left side, x=10..80) — blank for client
    pdf.set_fill_color(252, 252, 252)
    pdf.set_draw_color(*GRAY)
    pdf.set_line_width(0.3)
    pdf.rect(10, y_sig - 22, 70, 28, "FD")
    pdf.set_font("Heb", size=7)
    pdf.set_text_color(*GRAY)
    pdf.set_xy(10, y_sig - 21)
    cell_r(68, 5, "חתימת הלקוח", align="R")
    pdf.line(15, y_sig + 2, 75, y_sig + 2)
    pdf.set_xy(10, y_sig + 3)
    cell_r(68, 4, "שם ותאריך", align="C")

    # ── Footer ───────────────────────────────────────────────────────────────
    pdf.set_y(272)
    pdf.set_draw_color(*GOLD)
    pdf.set_line_width(0.8)
    pdf.line(10, 272, 200, 272)
    pdf.set_font("Heb", size=8)
    pdf.set_text_color(*GRAY)
    pdf.set_xy(10, 274)
    footer_line1 = f"{data.seller_name}"
    if data.seller_vat_number:
        footer_line1 += f" | עוסק מורשה: {data.seller_vat_number}"
    if data.seller_phone:
        footer_line1 += f" | {data.seller_phone}"
    cell_r(190, 5, footer_line1, align="C",
           new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_xy(10, 280)
    cell_r(190, 5, f"מסמך מס' {data.doc_number} | {_date_heb(data.doc_date)}", align="C")

    # Output to bytes
    return bytes(pdf.output())


@router.post("/finance/generate-invoice-il")
def generate_invoice_il(data: IsraeliDocRequest, db: Session = Depends(get_db),
                        current_user: Optional[models.User] = Depends(get_current_user_optional)):
    """Generate Israeli-standard tax invoice (חשבונית מס) or price quote (הצעת מחיר) as PDF.
    Also auto-files the document in the system documents archive."""
    try:
        pdf_bytes = _build_israeli_pdf(data)
    except Exception as e:
        raise HTTPException(500, f"PDF generation error: {e}")

    from urllib.parse import quote as url_quote
    import re

    prefix = "invoice" if data.doc_type == "invoice" else "quote"
    doc_type_heb = "חשבונית מס" if data.doc_type == "invoice" else "הצעת מחיר"
    timestamp = datetime.utcnow().strftime('%Y%m%d%H%M%S')

    # Safe ASCII filename for filesystem & HTTP headers (strip/replace non-ASCII)
    # Use ASCII-only pattern — Python's \w matches Unicode by default (includes Hebrew)
    safe_doc_num = re.sub(r'[^a-zA-Z0-9\-_]', '_', data.doc_number)
    safe_buyer   = re.sub(r'[^a-zA-Z0-9\-_]', '_', data.buyer_name)[:20]
    filename = f"{prefix}_{safe_doc_num}_{timestamp}.pdf"

    # Human-readable Hebrew name for the browser download prompt (RFC 5987)
    original_name = f"{doc_type_heb} {data.doc_number} - {data.buyer_name}.pdf"
    # RFC 5987: filename*=UTF-8''<url-encoded> — lets browser show Hebrew in Save dialog
    filename_star = "UTF-8''" + url_quote(original_name, safe='')
    content_disposition = f"attachment; filename=\"{filename}\"; filename*={filename_star}"

    # Save to invoices dir (for download)
    filepath = os.path.join(INVOICES_DIR, filename)
    with open(filepath, "wb") as f:
        f.write(pdf_bytes)

    # ── Auto-file in system documents ─────────────────────────────────────────
    try:
        sys_doc_path = os.path.join(SYSTEM_DOCS_DIR, filename)
        import shutil as _sh
        _sh.copy2(filepath, sys_doc_path)

        doc_record = models.SystemDocument(
            filename=filename,
            original_name=original_name,
            file_type="pdf",
            category=prefix,
            description=(
                f"{doc_type_heb} #{data.doc_number} | {data.buyer_name} | "
                f"{data.watch_brand} {data.watch_model} | "
                f"₪{(data.price_before_vat * (1 + VAT_RATE / 100) if data.include_vat else data.price_before_vat):,.0f}"
            ),
            file_size=len(pdf_bytes),
        )
        db.add(doc_record)
        db.commit()
    except Exception as e:
        print(f"[Finance] auto-file failed: {e}")

    _log("GENERATE_DOC", original_name, {"type": data.doc_type, "buyer": data.buyer_name, "amount": data.price_before_vat}, user=current_user)

    from fastapi.responses import Response
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": content_disposition},
    )
