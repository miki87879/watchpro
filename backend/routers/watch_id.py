"""
Watch Identifier & Appraiser
POST /api/watch-id/identify   – JSON body  { query, serial, image_base64 }
POST /api/watch-id/from-image – multipart file upload
"""

from fastapi import APIRouter, HTTPException, UploadFile, File, Depends
from pydantic import BaseModel
from typing import Optional
import os, base64, json, re, asyncio
import anthropic
import models
from routers.auth import get_current_user_optional

router = APIRouter()

def _log(action, resource="", details=None, user=None, success=True):
    try:
        from routers.logs import log_action
        log_action(action=action, resource=resource, details=details, user=user, success=success)
    except Exception:
        pass

# ─── Rolex serial → approximate year ────────────────────────────────────────
ROLEX_SERIAL_RANGES = [
    # (prefix_letter_or_range, year)  — letter-based post-1987 serials
    # Pre-1987 numeric ranges (approximate midpoints)
    ((       1,   10000), 1926), ((   10000,   20000), 1930), ((   20000,   30000), 1932),
    ((   30000,   40000), 1934), ((   40000,   50000), 1935), ((   50000,   70000), 1936),
    ((   70000,  100000), 1937), ((  100000,  150000), 1938), ((  150000,  200000), 1939),
    ((  200000,  250000), 1940), ((  250000,  310000), 1942), ((  310000,  370000), 1944),
    ((  370000,  450000), 1946), ((  450000,  550000), 1948), ((  550000,  650000), 1950),
    ((  650000,  780000), 1952), ((  780000,  920000), 1954), ((  920000, 1100000), 1956),
    ((1100000, 1300000), 1958), ((1300000, 1500000), 1960), ((1500000, 1700000), 1962),
    ((1700000, 1900000), 1964), ((1900000, 2100000), 1966), ((2100000, 2300000), 1968),
    ((2300000, 2700000), 1970), ((2700000, 3300000), 1972), ((3300000, 3900000), 1974),
    ((3900000, 4700000), 1976), ((4700000, 5700000), 1978), ((5700000, 6700000), 1980),
    ((6700000, 7900000), 1982), ((7900000, 9100000), 1984), ((9100000, 9999999), 1986),
]

ROLEX_LETTER_YEARS = {
    "R": 1987, "L": 1988, "E": 1989, "X": 1990, "N": 1991,
    "C": 1992, "S": 1993, "W": 1994, "T": 1995, "U": 1996,
    "A": 1997, "P": 1998, "K": 1999, "Y": 2000, "F": 2001,
    "D": 2002, "Z": 2003, "M": 2004, "V": 2005, "G": 2006,
    "B": 2007,
    # Post-2010 random serials starting with digits: no reliable table
}

# Two-letter prefix post-2010 random serials
ROLEX_2LETTER_YEARS = {
    "OD": 2010, "PE": 2010, "OE": 2011, "PF": 2011, "OF": 2012, "PG": 2012,
    "OG": 2013, "PH": 2013, "OH": 2014, "PI": 2014, "OI": 2015, "PJ": 2015,
    "LK": 2016, "MK": 2016, "NK": 2016, "0K": 2016,
    "1P": 2017, "2P": 2017, "3P": 2017, "4P": 2018, "5P": 2018, "6P": 2018,
    "7R": 2019, "8R": 2019, "9R": 2019,
}

def decode_rolex_serial(serial: str) -> Optional[int]:
    if not serial:
        return None
    s = serial.strip().upper().replace(" ", "").replace("-", "")
    if not s:
        return None

    # Two-letter prefix (random serial era 2010+)
    if len(s) >= 2 and not s[:2].isdigit():
        prefix2 = s[:2]
        if prefix2 in ROLEX_2LETTER_YEARS:
            return ROLEX_2LETTER_YEARS[prefix2]

    # Single letter prefix (1987-2009)
    if s[0].isalpha():
        return ROLEX_LETTER_YEARS.get(s[0])

    # Pure numeric (pre-1987)
    digits = re.sub(r"\D", "", s)
    if digits:
        try:
            num = int(digits)
            for (lo, hi), year in ROLEX_SERIAL_RANGES:
                if lo <= num < hi:
                    return year
        except ValueError:
            pass
    return None


# ─── Reference-number pattern detection ─────────────────────────────────────
_REF_PATTERNS = [
    re.compile(r'^\d{5,6}[A-Z]{0,4}$'),                  # Rolex: 126610LN, 127235
    re.compile(r'^\d{4}/\d{1,2}[A-Z]?$'),                 # Patek: 5711/1A
    re.compile(r'^\d{5}[A-Z]{2}\.\w+$'),                  # AP full: 15500ST.OO.1220ST.01
    re.compile(r'^\d{5}[A-Z]{2}$'),                       # AP short: 15500ST
    re.compile(r'^\d{3}\.\d{2}\.\d{2}\.\d{2}\.\d{2}\.\d{3}$'),  # Omega: 310.30.42.50.01.001
    re.compile(r'^[A-Z]{1,3}\d{4,6}$'),                   # IWC: IW500401
    re.compile(r'^\d{6}-\d{4}$'),                          # JLC: 1368420
]

def detect_reference(text: str) -> bool:
    """Return True if text looks like a standalone reference number."""
    t = text.strip().upper().replace(" ", "")
    return any(p.match(t) for p in _REF_PATTERNS)


# ─── Pydantic models ─────────────────────────────────────────────────────────
class IdentifyRequest(BaseModel):
    query: Optional[str] = None
    serial: Optional[str] = None
    image_base64: Optional[str] = None
    query_type: Optional[str] = None   # "reference" | "serial" | "name" — hint from frontend


# ─── Claude prompt ───────────────────────────────────────────────────────────
SYSTEM_PROMPT = """You are WatchGPT — the world's most precise luxury watch expert, appraiser, and market analyst.
You have encyclopaedic, fact-checked knowledge of every watch brand, model, reference number, movement caliber, production run dates, factory pricing, and secondary-market transaction history as of mid-2025.

━━━ REFERENCE NUMBER ACCURACY PROTOCOL (highest priority) ━━━
A reference number UNIQUELY identifies one specific watch model + material combination.
When you receive a reference number, these rules are absolute:
• Use YOUR OWN trained knowledge to look up the reference — do not guess or fabricate specs.
• Do NOT confuse a reference number with a serial number:
  - Reference (model number): identifies the model, e.g., 126610LN = Submariner Date steel/black
  - Serial (production number): identifies the unit, used only for approximate year of manufacture
• The "reference" field in your JSON must echo the input reference exactly.
• If the reference maps to a known watch: confidence = 0.95–0.99.
• If the reference is not in your training knowledge: confidence = 0.50–0.70, set collector_notes to
  explain the uncertainty, and do NOT fabricate specifications.

━━━ CRITICAL ROLEX MODEL DISTINCTIONS (never confuse these) ━━━
■ DAY-DATE ("President"):
  - ALWAYS displays BOTH: day-of-week spelled out at 12 o'clock AND date at 3 o'clock.
  - Only manufactured in precious metals (18ct gold, platinum) — never steel.
  - Signature bracelet: President (but Jubilee also available).
  - Reference series: 128xxx (36mm current gen), 228xxx (40mm current gen), 118xxx/119xxx (older).
  - Examples: 128238 = yellow gold, 128235 = Everose gold, 128239 = white gold, 228238 = 40mm yellow.

■ DATEJUST:
  - Displays DATE ONLY at 3 o'clock — NO day-of-week display.
  - Available in steel (Oystersteel), two-tone (Rolesor), or full gold/Everose.
  - Bracelets: Oyster, Jubilee, President (gold versions).
  - Reference series 36mm: 126xxx (current gen) — e.g., 126200, 126231, 126234, 126235.
  - Reference series 41mm: 126xxx — e.g., 126300, 126331, 126334.
  - Reference 126235 = Datejust 36, full 18ct Everose gold, fluted bezel, Jubilee bracelet.

■ SUBMARINER DATE: Ceramic bezel, 300m WR, date at 3. Refs: 126610LN (black), 126610LV (green Kermit).
■ SUBMARINER (no-date): No date window. Ref: 124060.
■ DAYTONA: Chronograph, 3 subdials. Refs: 126500LN (steel/black), 126515LN (Everose).
■ GMT-MASTER II: 24h bezel + extra hand. Refs: 126710BLNR (Batman), 126711CHNR (Sprite two-tone).
■ EXPLORER I: Clean 3-6-9 dial, 36mm or 42mm. Refs: 124270 (36mm), 226570 (42mm).
■ EXPLORER II: 24h bezel, date. Ref: 226570.

• If the reference is ambiguous or unknown to you, lower confidence to 0.55–0.75 and explain clearly
  in collector_notes. NEVER override your uncertainty with fabricated certainty.

━━━ CONFIDENCE CALIBRATION (critical) ━━━
confidence reflects identification certainty (0.0–1.0):
• Reference number provided AND it is a known model in your training data → confidence MUST be 0.97–0.99.
  Do NOT lower confidence because an image is also attached. The reference number is the ground truth;
  the image is supplementary for physical-condition details only.
• Reference number provided but NOT in your training data → 0.55–0.75, explain in collector_notes.
• Name/free-text search only → 0.80–0.95 depending on uniqueness of the model name.
• Image only → 0.65–0.90 depending on image quality and model distinctiveness.
• Serial number only → 0.40–0.70 (serial alone cannot identify the model).
NEVER average down a reference-based confidence because of low image quality or image ambiguity.

━━━ GENERAL ACCURACY RULES ━━━
1. Reference numbers, caliber numbers, dimensions, and retail prices must be factually exact — never approximate or fabricated.
2. Market values must reflect actual completed transactions (WatchCharts, Chrono24, Bob's, WatchBox data), not estimates. Use 2024-2025 data.
3. If you are less than 90% certain of a technical spec, omit that field (return null) rather than guess.
4. investment_grade must follow this rubric:
   A+ = Consistent 5%+ annual appreciation + high liquidity (Patek 5711, Rolex Daytona, AP 15202)
   A  = Stable premium + reliable resale (Rolex Sub, GMT, Explorer, AP 15500, Omega Moonwatch)
   B  = Holds retail value ±10% over 3 years
   C  = Depreciates 10-25% from retail
   D  = Depreciates >25% or illiquid

━━━ VINTAGE & YEAR-SPECIFIC ACCURACY PROTOCOL (critical for high-value assessments) ━━━
For many luxury watches the production year is AS IMPORTANT as the reference number.
You must document year-specific variations with expert-level precision.

ROLEX VINTAGE (pre-2000) — key year-sensitive variations:
• Dial generations: gilt/gold-text dials (1950s–mid 1960s) → matte dials (mid 1960s–1983) → glossy dials (1984+)
  "Tropical" dials (brown/chocolate patina on formerly black dials): command 2–10× premiums regardless of reference.
• Crown / winding-crown evolution: wide crown (pre-1953) → small crown (1953–1959) → crown guards (1959+)
• Submariner 5512/5513: early non-meters-first dials (pre-1967) → meters-first → "SWISS" only feet variants
• Submariner 1680: "Red Sub" (red SUBMARINER text 1969–1979) vs standard text — significant premium
• Daytona 6239/6241/6262/6263/6264/6265 "Paul Newman": exotic dial = exceptional ($300k–$1M+)
• Explorer 1016: matte (1963–1988) vs glossy (1988–1991) — generation premium
• GMT-Master 1675: earlier "Pepsi" (red/blue) vs later "Coke" (red/black); Mk I/II/III/IV dial variations
• Movement caliber milestones: Sub 1030→1560/1570→3000→3135→3235; Daytona Valjoux 72→Cal 4030→Cal 4130
• Rolex "Exclamation Mark" dials (pre-Swiss Made marking): highest vintage premium

PATEK PHILIPPE year-critical references:
• Nautilus 3700 (1976–1990, original): A-series dial first generation highest premium; later gens lower
• 5711/1A: white vs blue dial eras; final production (2021) commands strong premium
• Calatrava 96/570/3796: hand-finishing and dial variations by decade

AUDEMARS PIGUET ROYAL OAK:
• 5402 "Jumbo" (1972–2012): A-series (1972-1976) = maximum premium; caliber 2121 throughout
• 15202 "Jumbo" ultra-thin (current): still caliber 2121
• 15400/15500: larger case, caliber 3120/4302 — different tier

OMEGA SPEEDMASTER — the most year-critical luxury watch:
• Caliber 321 era (CK2998/2915/105.002/105.003/105.012, 1957–1968): MAXIMUM premium — $30k–$80k+
• "Ed White" 105.003 (1965 first US spacewalk): special significance
• Pre-moon certification models (105.012-66, 145.012-67): next tier
• Caliber 861 (1969–1996): standard moonwatch, significantly lower vs 321
• Caliber 1861 (1996–2020): modern; caliber 3861 (2020+): Co-Axial Master Chronometer
• ST105.003/ST145.022: specific reference numbering reveals exact era

IWC MARK SERIES: Mark XI (military), Mark XII, Mark XV, Mark XVI, Mark XVII — each era distinct value

JAEGER-LECOULTRE REVERSO:
• Grande Taille / Classique / Squadra: exact year determines case dimensions and movement generation
• Original 1931 era pieces: museum quality

MANDATORY new fields in your response:
- production_year_range: The actual production span of this reference, e.g. "1959–1984" or "2020–present"
- year_significance_note: Hebrew text (2–4 sentences). For vintage/year-sensitive watches: explain WHICH years/sub-variants are most valuable and WHY (dial type, serial range, caliber version). For modern watches with stable production: state that year has minimal impact on value.
- known_variants_by_year: Hebrew text listing the most important year-specific sub-variants for this reference (e.g., "לוח gilt עד 1967 — פרמיה של 50-100%; לוח matte 1967-1983 — ערך שוק סטנדרטי; לוח glossy 1984+ — פרמיה נמוכה יותר"). Null if not applicable (e.g., modern reference with single variant).

CRITICAL LANGUAGE RULE: All text fields in the JSON must be written in fluent, natural Hebrew (עברית).
- Brand names, model names, reference numbers, caliber names stay as-is (Rolex, Submariner, 126610LN, Calibre 3235).
- Enum values stay as-is: price_trend ("rising"/"stable"/"falling"), investment_grade (A+/A/B/C/D).
- Every other string field MUST be in Hebrew: case_material, dial_description, investment_reasoning,
  authentication_tips, red_flags, collector_notes, availability, historical_significance,
  box_papers_premium, best_time_to_buy, price_trend_note, similar_models[].note, movement, crystal,
  bracelet, clasp, dial_color, bezel, year_significance_note, known_variants_by_year.

Respond with ONLY valid JSON, no prose, no markdown fences. Schema:
{
  "brand": string,
  "model": string,
  "reference": string,
  "nickname": string|null,
  "confidence": float,
  "year_introduced": int|null,
  "still_in_production": bool|null,
  "serial_year": int|null,
  "case_material": string(Hebrew)|null,
  "case_size_mm": number|null,
  "case_thickness_mm": number|null,
  "lug_width_mm": number|null,
  "movement": string(Hebrew)|null,
  "power_reserve_hours": number|null,
  "water_resistance_m": number|null,
  "crystal": string(Hebrew)|null,
  "bracelet": string(Hebrew)|null,
  "clasp": string(Hebrew)|null,
  "dial_color": string(Hebrew)|null,
  "dial_description": string(Hebrew)|null,
  "bezel": string(Hebrew)|null,
  "retail_price_usd": number|null,
  "market_values": {
    "mint_full_set": number|null,
    "excellent_with_papers": number|null,
    "excellent_no_papers": number|null,
    "good": number|null,
    "fair": number|null
  },
  "investment_grade": "A+"|"A"|"B"|"C"|"D",
  "investment_reasoning": string(Hebrew),
  "price_trend": "rising"|"stable"|"falling",
  "price_trend_note": string(Hebrew),
  "best_time_to_buy": string(Hebrew),
  "authentication_tips": [string(Hebrew)],
  "red_flags": [string(Hebrew)],
  "similar_models": [{"reference": string, "nickname": string|null, "note": string(Hebrew)}],
  "collector_notes": string(Hebrew),
  "availability": string(Hebrew),
  "historical_significance": string(Hebrew),
  "box_papers_premium": string(Hebrew),
  "reference_image_url": string|null,
  "production_year_range": string|null,
  "year_significance_note": string(Hebrew)|null,
  "known_variants_by_year": string(Hebrew)|null
}
IMPORTANT — reference_image_url: Provide a direct publicly-accessible image URL of this exact watch reference (e.g. from Wikimedia Commons, manufacturer press kit, or Hodinkee). Must be a real, working .jpg/.png URL. Set null if uncertain."""


def build_user_message(query: Optional[str], serial: Optional[str],
                       serial_year: Optional[int], image_base64: Optional[str],
                       query_type: Optional[str] = None) -> list:
    parts = []

    text_lines = [
        "זהה והעריך שעון יוקרה זה. ענה אך ורק ב-JSON תקין בעברית.",
        "חשוב: כל שדות הטקסט (הסברים, טיפים, הערות) יהיו בעברית תקינה ומלאה.",
    ]
    if query:
        # Auto-detect if query looks like a reference number (when frontend doesn't specify)
        is_ref = (query_type == "reference") or (not query_type and detect_reference(query))
        if is_ref:
            text_lines.append(
                f"⚑ מספר רפרנס מדויק: {query}\n"
                f"  → זהו מספר רפרנס — מזהה ייחודי לחלוטין של דגם + חומר ספציפיים.\n"
                f"  → זהה את השעון על פי הרפרנס בלבד מתוך הידע שלך.\n"
                f"  → אם הרפרנס ידוע לך: קבע confidence = 0.97–0.99. "
                f"תמונה מצורפת = עזר לתיאור מצב בלבד, לא תורידי confidence.\n"
                f"  → אל תתחלף עם רפרנסים דומים (127235 ≠ 126235 ≠ 128235)."
            )
        elif query_type == "serial":
            text_lines.append(
                f"מספר סידורי: {query} — השתמש רק לאמידת שנת ייצור, לא לזיהוי הדגם."
            )
        else:
            text_lines.append(f"שם/מותג/דגם השעון: {query}")
    if serial:
        text_lines.append(f"מספר סידורי: {serial}")
    if serial_year:
        text_lines.append(f"שנת ייצור משוערת (לפי מספר סידורי Rolex): כ-{serial_year}")
    if image_base64:
        text_lines.append("תמונת השעון מצורפת — השתמש בה לזיהוי מדויק.")

    text_block = {"type": "text", "text": "\n".join(text_lines)}
    parts.append(text_block)

    if image_base64:
        # Strip data URL prefix if present
        b64 = image_base64
        media_type = "image/jpeg"
        if "," in b64:
            header, b64 = b64.split(",", 1)
            if "png" in header:
                media_type = "image/png"
            elif "webp" in header:
                media_type = "image/webp"
            elif "gif" in header:
                media_type = "image/gif"
        parts.append({
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": media_type,
                "data": b64,
            },
        })

    return parts


def _parse_claude_response(raw_text: str) -> dict:
    raw_text = raw_text.strip()
    # Strip markdown code fences if Claude wrapped the JSON anyway
    if raw_text.startswith("```"):
        raw_text = re.sub(r"^```(?:json)?\s*", "", raw_text)
        raw_text = re.sub(r"\s*```$", "", raw_text)
    try:
        return json.loads(raw_text)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", raw_text, re.DOTALL)
        if m:
            try:
                return json.loads(m.group())
            except Exception:
                pass
        raise HTTPException(
            status_code=422,
            detail=f"Claude returned non-JSON response: {raw_text[:300]}",
        )


async def call_claude(content: list) -> dict:
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY not set")

    def _sync_call():
        client = anthropic.Anthropic(api_key=api_key)
        return client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=4096,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": content}],
        )

    # Run blocking Anthropic call in a thread so the event loop stays free
    response = await asyncio.to_thread(_sync_call)
    return _parse_claude_response(response.content[0].text)


# ─── Endpoints ───────────────────────────────────────────────────────────────

@router.post("/watch-id/identify")
async def identify_watch(body: IdentifyRequest):
    if not body.query and not body.serial and not body.image_base64:
        raise HTTPException(
            status_code=400,
            detail="At least one of 'query', 'serial', or 'image_base64' is required",
        )

    serial_year: Optional[int] = None
    # If query_type is "serial", route text to the serial decoder too
    effective_serial = body.serial
    effective_query = body.query
    if body.query_type == "serial" and body.query and not body.serial:
        effective_serial = body.query
        effective_query = None
    if effective_serial:
        serial_year = decode_rolex_serial(effective_serial)

    content = build_user_message(effective_query, effective_serial, serial_year, body.image_base64, body.query_type)
    result = await call_claude(content)

    # Inject our decoded serial_year if Claude left it null
    if serial_year and not result.get("serial_year"):
        result["serial_year"] = serial_year

    # Enforce confidence floor when user explicitly provided a valid reference number.
    # Claude systematically hedges when an image is also present — we correct that here.
    if body.query_type == "reference" and body.query and detect_reference(body.query.strip()):
        if result.get("confidence", 0) < 0.97:
            result["confidence"] = 0.97

    _log("WATCH_IDENTIFY", body.query or body.serial or "image", {"brand": result.get("brand"), "model": result.get("model")})
    return result


# ─── Watch image lookup via Wikimedia Commons ────────────────────────────────

@router.get("/watch-id/watch-image")
async def get_watch_image(brand: str, model: str, reference: str = ""):
    """
    Search Wikimedia Commons for a real watch image.
    Returns { image_url: str | null }
    Strategy:
    1. Search Commons file namespace with brand+model+reference
    2. Fallback: brand+model only
    3. Return the first valid image URL
    """
    import httpx

    async def _search_commons(query: str) -> Optional[str]:
        async with httpx.AsyncClient(timeout=8.0) as client:
            # Step 1: search the File namespace
            search_r = await client.get(
                "https://commons.wikimedia.org/w/api.php",
                params={
                    "action": "query",
                    "list": "search",
                    "srnamespace": "6",        # File namespace only
                    "format": "json",
                    "srsearch": query,
                    "srlimit": "8",
                    "srprop": "title",
                },
                headers={"User-Agent": "WatchProApp/1.0 (watch management app)"},
            )
            results = search_r.json().get("query", {}).get("search", [])
            if not results:
                return None

            # Step 2: get actual image URL from first results
            titles = "|".join(r["title"] for r in results[:5])
            info_r = await client.get(
                "https://commons.wikimedia.org/w/api.php",
                params={
                    "action": "query",
                    "titles": titles,
                    "prop": "imageinfo",
                    "iiprop": "url|mime|size",
                    "iiurlwidth": "500",   # request a 500px thumbnail
                    "format": "json",
                },
                headers={"User-Agent": "WatchProApp/1.0 (watch management app)"},
            )
            pages = info_r.json().get("query", {}).get("pages", {})
            for page in pages.values():
                for info in page.get("imageinfo", []):
                    mime = info.get("mime", "")
                    if mime.startswith("image/") and "svg" not in mime:
                        # Prefer thumbnail URL (resized), fall back to original
                        url = info.get("thumburl") or info.get("url", "")
                        if url:
                            return url
        return None

    try:
        # Try specific query first
        specific = f"{brand} {model} {reference}".strip()
        url = await _search_commons(specific)

        # Fallback: brand + model without reference
        if not url and reference:
            url = await _search_commons(f"{brand} {model}")

        return {"image_url": url}
    except Exception:
        return {"image_url": None}


# ─── Quick-fill endpoint ─────────────────────────────────────────────────────
QUICK_FILL_SYSTEM = """You are a luxury watch reference database. Given a reference number, return a compact JSON to pre-fill an inventory form. Accuracy is CRITICAL — never guess or hallucinate model names.

━━━ PATEK PHILIPPE FAMILY DISTINCTIONS (never confuse) ━━━
• NAUTILUS: refs 5711, 5712, 5726, 5980, 5990, 5726A — integrated steel bracelet, octagonal porthole bezel
• AQUANAUT: refs 5167, 5168, 5164, 5969 — rubber strap, rounded octagonal case, sporty look
• CALATRAVA: refs 5196, 5227, 6000 — round dress watch, no complications
• COMPLICATIONS: refs 5270, 5204, 5396, 5905 — various complications
5711/1A = Nautilus (NOT Aquanaut). 5167A = Aquanaut. Never swap these.

━━━ ROLEX FAMILY DISTINCTIONS (never confuse) ━━━
• DATEJUST 36: 126xxx refs — date only at 3, no day display
• DAY-DATE: 128xxx refs — day + date, precious metals only
• SUBMARINER: 126610LN (black), 126610LV (green), 124060 (no-date)
• DAYTONA: 126500LN, 126515LN, 116500LN
• GMT-MASTER II: 126710BLNR (Batman), 126710BLRO (Pepsi), 126711CHNR

━━━ GENERAL ACCURACY RULES ━━━
• A reference number UNIQUELY identifies one model. Look it up precisely.
• If uncertain about model name, return what you know for certain and leave unsure fields null.
• NEVER fabricate or approximate a model name — return the exact official name.
• market_value_excellent = secondary market value in USD for excellent condition (2024-2025 data)

Respond ONLY with valid JSON (no markdown):
{
  "brand": string,
  "model": string,
  "reference": string,
  "year_introduced": int|null,
  "case_material": string|null,
  "movement": string|null,
  "water_resistance_m": number|null,
  "retail_price_usd": number|null,
  "market_value_excellent": number|null,
  "dial_description": string|null,
  "brief_notes": string|null
}
All text fields in Hebrew except brand/model/reference names."""

@router.post("/watch-id/quick-fill")
async def quick_fill(body: IdentifyRequest):
    """Lightweight auto-fill for AddWatch form. Uses Haiku (fast & cheap)."""
    if not body.query and not body.serial:
        raise HTTPException(status_code=400, detail="query or serial required")

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY not set")

    serial_year: Optional[int] = None
    if body.serial:
        serial_year = decode_rolex_serial(body.serial)

    lines = []
    if body.query:
        lines.append(f"Reference/Model: {body.query}")
    if body.serial:
        lines.append(f"Serial: {body.serial}")
    if serial_year:
        lines.append(f"Approx. year (Rolex serial decode): {serial_year}")
    prompt = "\n".join(lines)

    def _sync():
        client = anthropic.Anthropic(api_key=api_key)
        return client.messages.create(
            model="claude-sonnet-4-6",   # ← Sonnet: accurate model identification
            max_tokens=800,
            system=QUICK_FILL_SYSTEM,
            messages=[{"role": "user", "content": prompt}],
        )

    response = await asyncio.to_thread(_sync)
    result = _parse_claude_response(response.content[0].text)
    if serial_year and not result.get("year_introduced"):
        result["year_introduced"] = serial_year
    return result


@router.post("/watch-id/from-image")
async def identify_from_image(file: UploadFile = File(...)):
    allowed = {"image/jpeg", "image/png", "image/webp", "image/gif"}
    if file.content_type not in allowed:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: {file.content_type}. Use JPEG, PNG, WebP or GIF.",
        )

    raw_bytes = await file.read()
    if len(raw_bytes) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image too large. Maximum 10 MB.")

    b64 = base64.b64encode(raw_bytes).decode()
    media_type = file.content_type or "image/jpeg"

    content = [
        {"type": "text", "text": "זהה והעריך שעון יוקרה זה מהתמונה. ענה אך ורק ב-JSON תקין. כל שדות הטקסט יהיו בעברית תקינה ומלאה."},
        {
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": media_type,
                "data": b64,
            },
        },
    ]

    result = await call_claude(content)
    return result
