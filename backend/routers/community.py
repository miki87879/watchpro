from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional, List
from pydantic import BaseModel
from datetime import datetime
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import os

from database import get_db
import models

router = APIRouter()

class ContactCreate(BaseModel):
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    interests: Optional[str] = None
    notes: Optional[str] = None

class ContactUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    interests: Optional[str] = None
    notes: Optional[str] = None

class NewsletterRequest(BaseModel):
    subject: str
    body: str
    recipient_ids: Optional[List[int]] = None  # None = all contacts

def contact_to_dict(c: models.Contact) -> dict:
    return {
        "id": c.id,
        "name": c.name,
        "email": c.email,
        "phone": c.phone,
        "interests": c.interests,
        "notes": c.notes,
        "created_at": c.created_at.isoformat() if c.created_at else None,
        "last_contact_at": c.last_contact_at.isoformat() if c.last_contact_at else None,
    }

# Contacts CRUD
@router.get("/community/contacts")
def list_contacts(search: Optional[str] = None, db: Session = Depends(get_db)):
    query = db.query(models.Contact)
    if search:
        query = query.filter(
            (models.Contact.name.ilike(f"%{search}%")) |
            (models.Contact.email.ilike(f"%{search}%")) |
            (models.Contact.phone.ilike(f"%{search}%")) |
            (models.Contact.interests.ilike(f"%{search}%"))
        )
    contacts = query.order_by(models.Contact.name).all()
    return [contact_to_dict(c) for c in contacts]

@router.post("/community/contacts")
def create_contact(req: ContactCreate, db: Session = Depends(get_db)):
    contact = models.Contact(
        name=req.name,
        email=req.email,
        phone=req.phone,
        interests=req.interests,
        notes=req.notes,
    )
    db.add(contact)
    db.commit()
    db.refresh(contact)
    return contact_to_dict(contact)

@router.get("/community/contacts/{contact_id}")
def get_contact(contact_id: int, db: Session = Depends(get_db)):
    contact = db.query(models.Contact).filter(models.Contact.id == contact_id).first()
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    return contact_to_dict(contact)

@router.put("/community/contacts/{contact_id}")
def update_contact(contact_id: int, req: ContactUpdate, db: Session = Depends(get_db)):
    contact = db.query(models.Contact).filter(models.Contact.id == contact_id).first()
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")

    if req.name is not None: contact.name = req.name
    if req.email is not None: contact.email = req.email
    if req.phone is not None: contact.phone = req.phone
    if req.interests is not None: contact.interests = req.interests
    if req.notes is not None: contact.notes = req.notes

    db.commit()
    db.refresh(contact)
    return contact_to_dict(contact)

@router.delete("/community/contacts/{contact_id}")
def delete_contact(contact_id: int, db: Session = Depends(get_db)):
    contact = db.query(models.Contact).filter(models.Contact.id == contact_id).first()
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    db.delete(contact)
    db.commit()
    return {"message": "Contact deleted"}

# Newsletter
@router.post("/community/newsletter/send")
def send_newsletter(req: NewsletterRequest, db: Session = Depends(get_db)):
    # Get recipients
    if req.recipient_ids:
        contacts = db.query(models.Contact).filter(
            models.Contact.id.in_(req.recipient_ids),
            models.Contact.email.isnot(None),
        ).all()
    else:
        contacts = db.query(models.Contact).filter(models.Contact.email.isnot(None)).all()

    if not contacts:
        raise HTTPException(status_code=400, detail="No contacts with email addresses found")

    # SMTP config
    smtp_host = os.environ.get("SMTP_HOST", "smtp.gmail.com")
    smtp_port = int(os.environ.get("SMTP_PORT", "587"))
    smtp_user = os.environ.get("SMTP_USER", "")
    smtp_pass = os.environ.get("SMTP_PASS", "")
    from_email = os.environ.get("FROM_EMAIL", smtp_user)

    sent_count = 0
    errors = []

    if not smtp_user or not smtp_pass:
        # Log without actually sending (demo mode)
        log = models.EmailLog(
            subject=req.subject,
            body=req.body,
            recipients_count=len(contacts),
            sent_at=datetime.utcnow(),
        )
        db.add(log)
        # Update last contact
        for c in contacts:
            c.last_contact_at = datetime.utcnow()
        db.commit()
        return {
            "sent": len(contacts),
            "errors": 0,
            "message": f"Demo mode: Would send to {len(contacts)} contacts",
            "recipients": [c.email for c in contacts],
        }

    try:
        server = smtplib.SMTP(smtp_host, smtp_port)
        server.starttls()
        server.login(smtp_user, smtp_pass)

        for contact in contacts:
            try:
                msg = MIMEMultipart("alternative")
                msg["Subject"] = req.subject
                msg["From"] = from_email
                msg["To"] = contact.email

                # Plain text
                text_part = MIMEText(req.body, "plain", "utf-8")
                # HTML part
                html_body = f"""
                <html>
                <body dir="rtl" style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
                    <div style="background: linear-gradient(135deg, #0a0e1a, #1f2937); padding: 20px; border-radius: 8px; margin-bottom: 20px; text-align: center;">
                        <h1 style="color: #d4af37; margin: 0;">⌚ Watch Pro</h1>
                    </div>
                    <div style="padding: 20px; white-space: pre-wrap;">{req.body}</div>
                    <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #888; text-align: center;">
                        שלח על ידי Watch Pro Dashboard
                    </div>
                </body>
                </html>
                """
                html_part = MIMEText(html_body, "html", "utf-8")
                msg.attach(text_part)
                msg.attach(html_part)

                server.sendmail(from_email, contact.email, msg.as_string())
                sent_count += 1
                contact.last_contact_at = datetime.utcnow()
            except Exception as e:
                errors.append(f"{contact.email}: {str(e)}")

        server.quit()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"SMTP error: {str(e)}")

    # Log the email
    log = models.EmailLog(
        subject=req.subject,
        body=req.body,
        recipients_count=sent_count,
        sent_at=datetime.utcnow(),
    )
    db.add(log)
    db.commit()

    return {
        "sent": sent_count,
        "errors": len(errors),
        "error_details": errors,
        "message": f"Newsletter sent to {sent_count} contacts",
    }

@router.get("/community/newsletter/logs")
def get_email_logs(db: Session = Depends(get_db)):
    logs = db.query(models.EmailLog).order_by(models.EmailLog.sent_at.desc()).all()
    return [
        {
            "id": l.id,
            "subject": l.subject,
            "body": l.body[:200] + "..." if l.body and len(l.body) > 200 else l.body,
            "recipients_count": l.recipients_count,
            "sent_at": l.sent_at.isoformat() if l.sent_at else None,
        }
        for l in logs
    ]

@router.get("/community/newsletter/templates")
def get_newsletter_templates():
    return {
        "templates": [
            {
                "id": "new_arrival",
                "name": "שעון חדש במלאי",
                "subject": "🆕 שעון חדש הגיע - Watch Pro",
                "body": """שלום {name},

שמחים לבשר על הגעת שעון חדש למלאי שלנו!

✨ {brand} {model}
💰 מחיר: {price}
📦 מצב: {condition}

השעון זמין לרכישה מיידית.
לפרטים נוספים ולתמונות, צרו איתנו קשר.

בברכה,
צוות Watch Pro
📱 מוזמנים לכתוב בוואטסאפ

---
לביטול הרשמה - השב 'הסר'""",
            },
            {
                "id": "price_drop",
                "name": "הנחה מיוחדת",
                "subject": "💸 מחיר מיוחד ל-24 שעות - Watch Pro",
                "body": """שלום {name},

הזדמנות מיוחדת שלא כדאי לפספס!

⌚ {brand} {model}
❌ מחיר ישן: {old_price}
✅ מחיר מיוחד: {new_price}
⏰ ההצעה בתוקף ל-24 שעות בלבד

אל תחמיצו - מלאי מוגבל!

לפרטים נוספים צרו קשר מיידי.

בברכה,
Watch Pro Team""",
            },
            {
                "id": "newsletter",
                "name": "ניוזלטר חודשי",
                "subject": "📰 חדשות מעולם השעונים - Watch Pro",
                "body": """שלום {name},

ניוזלטר חודשי מ-Watch Pro 🕐

📊 שוק השעונים החודש:
• טרנד ראשון בשוק
• טרנד שני בשוק

⌚ שעונים חמים במלאי:
• שעון 1 - מחיר
• שעון 2 - מחיר

💡 טיפ החודש:
[הוסף תוכן כאן]

🤝 מוזמנים לבקר בסטודיו שלנו

בברכה,
צוות Watch Pro""",
            },
        ]
    }
