from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
import anthropic
import os

router = APIRouter()

class AdGenerateRequest(BaseModel):
    brand: str
    model: str
    reference: Optional[str] = None
    year: Optional[int] = None
    condition: str = "excellent"
    asking_price: float
    has_box: bool = False
    has_papers: bool = False
    serial_number: Optional[str] = None
    notes: Optional[str] = None
    platform: str = "general"  # general, whatsapp, facebook, instagram, yad2

class AdGenerateResponse(BaseModel):
    hebrew: str
    english: str

PLATFORM_STYLES = {
    "general": "professional luxury watch dealer advertisement",
    "whatsapp": "short WhatsApp message style (2-3 paragraphs max)",
    "facebook": "Facebook Marketplace listing with emojis",
    "instagram": "Instagram caption with relevant hashtags",
    "yad2": "Yad2 Israeli marketplace listing in Hebrew",
}

@router.post("/ads/generate", response_model=AdGenerateResponse)
def generate_ad(req: AdGenerateRequest):
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY not configured")

    client = anthropic.Anthropic(api_key=api_key)

    platform_style = PLATFORM_STYLES.get(req.platform, PLATFORM_STYLES["general"])

    accessories = []
    if req.has_box:
        accessories.append("original box")
    if req.has_papers:
        accessories.append("papers/warranty card")

    accessories_str = ", ".join(accessories) if accessories else "no box/papers"

    prompt = f"""You are a luxury watch expert and copywriter. Write a {platform_style} for the following watch.

Watch Details:
- Brand: {req.brand}
- Model: {req.model}
- Reference: {req.reference or 'N/A'}
- Year: {req.year or 'N/A'}
- Condition: {req.condition}
- Price: ${req.asking_price:,.0f} USD
- Accessories: {accessories_str}
- Serial: {req.serial_number or 'N/A'}
- Additional Notes: {req.notes or 'N/A'}

Please write TWO versions of the advertisement:

1. HEBREW VERSION: Write a compelling Hebrew advertisement. Use proper Hebrew for luxury watch market in Israel. Include emojis if appropriate for the platform. Make it sound authentic and professional for the Israeli market.

2. ENGLISH VERSION: Write a compelling English advertisement. Professional and luxury-focused language. Highlight the watch's prestige and investment value.

Format your response EXACTLY as:
HEBREW:
[Hebrew ad text here]

ENGLISH:
[English ad text here]

Make both versions compelling, accurate to the details provided, and appropriate for the {req.platform} platform."""

    try:
        message = client.messages.create(
            model="claude-haiku-4-5",   # Haiku — fast & cheap for ad copy
            max_tokens=1500,
            messages=[
                {"role": "user", "content": prompt}
            ]
        )

        response_text = message.content[0].text

        # Parse Hebrew and English sections
        hebrew = ""
        english = ""

        if "HEBREW:" in response_text and "ENGLISH:" in response_text:
            parts = response_text.split("ENGLISH:")
            hebrew_part = parts[0].replace("HEBREW:", "").strip()
            english_part = parts[1].strip() if len(parts) > 1 else ""
            hebrew = hebrew_part
            english = english_part
        else:
            # Fallback: split in half
            lines = response_text.split("\n")
            mid = len(lines) // 2
            hebrew = "\n".join(lines[:mid]).strip()
            english = "\n".join(lines[mid:]).strip()

        return AdGenerateResponse(hebrew=hebrew, english=english)

    except anthropic.APIError as e:
        raise HTTPException(status_code=500, detail=f"Claude API error: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating ad: {str(e)}")

@router.get("/ads/templates")
def get_templates():
    return {
        "templates": [
            {
                "id": "whatsapp",
                "name": "WhatsApp",
                "description": "הודעה קצרה לוואטסאפ",
                "icon": "MessageCircle",
            },
            {
                "id": "facebook",
                "name": "Facebook Marketplace",
                "description": "מודעה לפייסבוק מרקטפלייס",
                "icon": "Facebook",
            },
            {
                "id": "instagram",
                "name": "Instagram",
                "description": "פוסט לאינסטגרם עם האשטגים",
                "icon": "Instagram",
            },
            {
                "id": "yad2",
                "name": "יד2",
                "description": "מודעה לאתר יד2",
                "icon": "ShoppingBag",
            },
            {
                "id": "general",
                "name": "כללי",
                "description": "מודעה מקצועית כללית",
                "icon": "FileText",
            },
        ]
    }
