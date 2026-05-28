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
SYSTEM_PROMPT = """You are WatchGPT — an elite luxury watch expert, appraiser, and market analyst with encyclopaedic knowledge of every reference number, caliber, production run, and secondary-market value.

━━━ ACCURACY RULES (absolute) ━━━
• A reference number UNIQUELY identifies one model+material. Echo it exactly in "reference" field.
• Use your own training knowledge — never fabricate specs. If unsure about a field, return null.
• Never confuse reference number (model ID) with serial number (unit ID).
• Market values = actual secondary-market completed transactions, 2024-2025 data.
• investment_grade: A+=Patek Nautilus/Daytona/AP Jumbo tier (5%+/yr appreciation); A=Rolex Sub/GMT/Omega Moonwatch; B=holds retail; C=−10-25%; D=−25%+.
• PATEK FAMILY CRITICAL: 5711=Nautilus (steel integrated bracelet, octagonal porthole case). 5167/5168=Aquanaut (rubber strap, rounded octagonal). NEVER call 5711 an "Aquanaut".
• ROLEX FAMILY CRITICAL: Day-Date=day+date+gold only (128xxx/228xxx). Datejust=date only (126xxx). Submariner=ceramic bezel 300m (126610LN black, 126610LV green). Daytona=chrono (126500LN). GMT-Master II=24h bezel (126710BLNR Batman).

━━━ CONFIDENCE (0.0–1.0) ━━━
• Known reference number → 0.97–0.99. Image attached with reference = still 0.97+ (image is supplementary).
• Unknown reference → 0.55–0.75, explain in collector_notes.
• Name/free-text → 0.80–0.95. Image only → 0.65–0.90. Serial only → 0.40–0.70.

━━━ LANGUAGE ━━━
ALL text fields in Hebrew (עברית). Brand/model names, reference numbers, calibers, and enums stay as-is.

━━━ OUTPUT FORMAT (critical) ━━━
Output MUST be a single-line compact JSON — no newlines, no indentation, no spaces after colons/commas.
Every text field: EXACTLY 1 sentence (under 15 Hebrew words).
authentication_tips: exactly 2 items. red_flags: exactly 2 items. similar_models: exactly 2 items.
Do NOT add explanatory text before or after the JSON.

Respond with ONLY valid compact JSON (no markdown, no newlines). Schema:
{
  "brand": string,
  "model": string,
  "reference": string,
  "nickname": string|null,
  "confidence": float,
  "year_introduced": int|null,
  "still_in_production": bool|null,
  "serial_year": int|null,
  "case_material": string|null,
  "case_size_mm": number|null,
  "case_thickness_mm": number|null,
  "lug_width_mm": number|null,
  "movement": string|null,
  "power_reserve_hours": number|null,
  "water_resistance_m": number|null,
  "crystal": string|null,
  "bracelet": string|null,
  "clasp": string|null,
  "dial_color": string|null,
  "dial_description": string|null,
  "bezel": string|null,
  "retail_price_usd": number|null,
  "market_values": {"mint_full_set":number|null,"excellent_with_papers":number|null,"excellent_no_papers":number|null,"good":number|null,"fair":number|null},
  "investment_grade": "A+"|"A"|"B"|"C"|"D",
  "investment_reasoning": string,
  "price_trend": "rising"|"stable"|"falling",
  "price_trend_note": string,
  "best_time_to_buy": string,
  "authentication_tips": [string, string],
  "red_flags": [string, string],
  "similar_models": [{"reference":string,"nickname":string|null,"note":string},{"reference":string,"nickname":string|null,"note":string}],
  "collector_notes": string,
  "availability": string,
  "historical_significance": string,
  "box_papers_premium": string,
  "reference_image_url": string|null,
  "production_year_range": string|null,
  "year_significance_note": string|null,
  "known_variants_by_year": string|null
}"""


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
    """Parse Claude's response text into a dict. Handles markdown, leading prose, truncation."""
    raw_text = raw_text.strip()

    # 1. Strip markdown code fences
    if "```" in raw_text:
        raw_text = re.sub(r"^[\s\S]*?```(?:json)?\s*", "", raw_text, count=1)
        raw_text = re.sub(r"\s*```[\s\S]*$", "", raw_text)
        raw_text = raw_text.strip()

    # 2. Direct parse
    try:
        return json.loads(raw_text)
    except json.JSONDecodeError:
        pass

    # 3. Find the JSON object (greedy — from first { to last })
    m = re.search(r"\{[\s\S]*\}", raw_text)
    if m:
        try:
            return json.loads(m.group())
        except Exception:
            pass

    # 4. Truncated JSON recovery — append missing closing braces/brackets
    start = raw_text.find("{")
    if start != -1:
        snippet = raw_text[start:]
        # Close any open arrays/objects to make the JSON parseable
        depth_obj = snippet.count("{") - snippet.count("}")
        depth_arr = snippet.count("[") - snippet.count("]")
        # Trim any trailing partial key/value (after last comma or complete value)
        trimmed = re.sub(r',\s*"[^"]*$', "", snippet)   # remove trailing partial key
        trimmed = re.sub(r',\s*$', "", trimmed)          # remove trailing comma
        closing = "]" * max(0, depth_arr) + "}" * max(0, depth_obj)
        try:
            return json.loads(trimmed + closing)
        except Exception:
            pass

    raise HTTPException(
        status_code=422,
        detail=f"Claude returned non-JSON response: {raw_text[:600]}",
    )


async def call_claude(content: list, *, retries: int = 2) -> dict:
    """Call Claude API with automatic retry on transient failures."""
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY not set")

    def _sync_call():
        # Haiku = faster than Sonnet. Strict 1000-token schema keeps response short.
        client = anthropic.Anthropic(api_key=api_key, timeout=55.0)
        return client.messages.create(
            model="claude-haiku-4-5",
            max_tokens=1600,          # compact single-line JSON fits in ~900-1100 tokens
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": content}],
        )

    last_exc = None
    for attempt in range(retries + 1):
        try:
            response = await asyncio.wait_for(
                asyncio.to_thread(_sync_call),
                timeout=58.0,          # safety net below Railway's 60s gateway timeout
            )
            if not response.content:
                raise ValueError("Empty response from Claude")
            return _parse_claude_response(response.content[0].text)
        except HTTPException:
            raise  # validation errors → no retry
        except asyncio.TimeoutError:
            last_exc = Exception("timeout")
            print(f"[call_claude] attempt {attempt + 1} timed out")
        except Exception as exc:
            last_exc = exc
            print(f"[call_claude] attempt {attempt + 1} failed: {exc}")
        if attempt < retries:
            await asyncio.sleep(1.5 ** attempt)

    raise HTTPException(
        status_code=503,
        detail=f"שגיאה זמנית בשירות הזיהוי. נסה שוב בעוד מספר שניות. ({last_exc})",
    )


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
    # retries=0: one attempt only (48s timeout). User clicks "נסה שוב" if it fails.
    # Multiple retries would total 144s+ and always hit the gateway timeout.
    result = await call_claude(content, retries=0)

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


# ══════════════════════════════════════════════════════════════════════════════
#  LIVE MARKET PRICES  — GET /api/watch-id/market-prices
# ══════════════════════════════════════════════════════════════════════════════
import httpx as _httpx
import time as _time
from bs4 import BeautifulSoup as _BS
import urllib.parse as _up

# In-memory cache: key → {data, ts}
_mkt_cache: dict = {}
_MKT_TTL = 7200  # 2 hours

# FX rates cache (1 {cur} → USD)
_fx_rates: dict = {}
_fx_ts: float = 0.0

async def _refresh_fx():
    global _fx_rates, _fx_ts
    if _time.time() - _fx_ts < 3600:
        return
    try:
        async with _httpx.AsyncClient(timeout=8.0) as c:
            r = await c.get(
                "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json"
            )
            if r.status_code == 200:
                usd_map = r.json().get("usd", {})
                # usd_map[cur] = units of that currency per 1 USD
                # → 1 cur = 1/usd_map[cur] USD
                _fx_rates = {
                    k.upper(): (1.0 / v if v > 0 else None)
                    for k, v in usd_map.items()
                }
                _fx_ts = _time.time()
    except Exception:
        pass

_FX_FALLBACK = {
    "EUR": 1.09, "GBP": 1.28, "CHF": 1.12, "ILS": 0.27,
    "SEK": 0.095, "NOK": 0.094, "DKK": 0.145, "AED": 0.272,
    "JPY": 0.0066, "AUD": 0.65, "CAD": 0.74, "HKD": 0.128,
    "SGD": 0.74, "CNY": 0.138,
}

def _to_usd(amount: float, currency: str) -> float:
    cur = currency.upper()
    if cur == "USD":
        return amount
    rate = _fx_rates.get(cur) or _FX_FALLBACK.get(cur, 1.0)
    return amount * rate

def _parse_price_str(txt: str):
    """Return (amount: float, currency: str) or (None, 'USD')."""
    if not txt:
        return None, "USD"
    txt = txt.strip()
    # Detect currency
    cur = "USD"
    for sym, c in [("€", "EUR"), ("£", "GBP"), ("CHF", "CHF"), ("¥", "JPY"),
                   ("kr", "SEK"), ("₪", "ILS"), ("A$", "AUD"), ("C$", "CAD"),
                   ("HK$", "HKD"), ("S$", "SGD")]:
        if sym in txt:
            cur = c
            break
    # Extract number
    m = re.search(r"[\d]+(?:[.,]\d+)*", txt.replace(",", "").replace("'", ""))
    if m:
        try:
            val = float(m.group().replace(",", ""))
            if val >= 100:
                return val, cur
        except Exception:
            pass
    return None, cur

_eBay_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)
_eBay_H = {
    "User-Agent": _eBay_UA,
    "Accept-Language": "en-US,en;q=0.9",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}

# Known luxury watch brand keywords — used for relevance filtering
_WATCH_BRANDS = {
    "rolex", "patek", "philippe", "nautilus", "omega", "cartier",
    "breitling", "iwc", "panerai", "hublot", "audemars", "piguet",
    "vacheron", "constantin", "lange", "jaeger", "lecoultre", "grand seiko",
    "tudor", "longines", "zenith", "tag heuer", "bulgari", "richard mille",
    "blancpain", "chopard", "breguet", "glashutte", "nomos", "oris",
    "frederique", "constant", "bell", "ross", "montblanc", "tissot",
    "daytona", "submariner", "speedmaster", "aquanaut", "royal oak",
}

def _is_relevant(title: str, brand: str, model: str) -> bool:
    """
    Returns True if the listing title is relevant to the watch we're looking for.
    Requires the title to contain at least one meaningful keyword from brand/model.
    """
    t = title.lower()
    # Check brand words (e.g. "Patek", "Philippe", "Rolex")
    for word in brand.lower().split():
        if len(word) >= 4 and word in t:
            return True
    # Check model words (first 2 meaningful words, skip short ones)
    for word in model.lower().split()[:3]:
        if len(word) >= 4 and word in t:
            return True
    # Check generic watch brand keywords
    for kw in _WATCH_BRANDS:
        if kw in t:
            return True
    return False

async def _ebay_sold(client: "_httpx.AsyncClient", query: str, brand: str = "", model: str = "") -> list:
    """Scrape eBay *completed + sold* listings (actual transaction prices)."""
    results = []
    try:
        url = (
            "https://www.ebay.com/sch/i.html?"
            + _up.urlencode({
                "_nkw": query, "_sacat": "31387",
                "LH_Complete": "1", "LH_Sold": "1",
                "_sop": "15",   # newest first
                "_ipg": "60",
            })
        )
        r = await client.get(url, headers=_eBay_H, timeout=_httpx.Timeout(18.0))
        if r.status_code != 200:
            return results
        soup = _BS(r.text, "lxml")
        for item in soup.select(".s-item:not(.s-item--placeholder)")[:40]:
            t_el = item.select_one(".s-item__title")
            p_el = item.select_one(".s-item__price")
            a_el = item.select_one("a.s-item__link")
            date_el = item.select_one(".s-item__caption .POSITIVE, .s-item__endtime, .s-item__caption")

            if not t_el or not p_el:
                continue
            title = t_el.get_text(strip=True)
            if "Shop on eBay" in title or not title:
                continue

            # Relevance check — must mention brand or known watch keyword
            if brand and not _is_relevant(title, brand, model):
                continue

            price_txt = p_el.get_text(strip=True)
            # Handle price ranges like "$8,000 to $9,000" — take lower bound
            if " to " in price_txt:
                price_txt = price_txt.split(" to ")[0]

            amount, cur = _parse_price_str(price_txt)
            if not amount or amount < 500:
                continue

            link = a_el.get("href", "") if a_el else ""
            date = date_el.get_text(strip=True) if date_el else ""

            results.append({
                "title": title,
                "price_usd": round(_to_usd(amount, cur), 0),
                "price_local": amount,
                "currency": cur,
                "source": "eBay Sold",
                "source_icon": "🛒",
                "url": link,
                "date": date,
                "type": "sold",
            })
    except Exception as e:
        print(f"[Market/eBay-sold] {e}")
    return results


async def _ebay_active_api(client: "_httpx.AsyncClient", query: str, brand: str = "", model: str = "") -> list:
    """eBay Browse API — active listings. Requires API key."""
    from routers.price_scout import _get_ebay_token
    results = []
    try:
        token = await _get_ebay_token()
        if not token:
            return results
        r = await client.get(
            "https://api.ebay.com/buy/browse/v1/item_summary/search",
            params={
                "q": query,
                "category_ids": "31387",
                "filter": "conditionIds:{3000|4000|5000}",
                "sort": "price",
                "limit": "30",
            },
            headers={
                "Authorization": f"Bearer {token}",
                "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
            },
            timeout=_httpx.Timeout(15.0),
        )
        if r.status_code == 200:
            for item in r.json().get("itemSummaries", []):
                title = item.get("title", "").strip()
                if brand and not _is_relevant(title, brand, model):
                    continue
                price_info = item.get("price", {})
                try:
                    amount = float(price_info.get("value", 0))
                except Exception:
                    continue
                cur = price_info.get("currency", "USD")
                url = item.get("itemWebUrl", "")
                if amount < 500:
                    continue
                results.append({
                    "title": title,
                    "price_usd": round(_to_usd(amount, cur), 0),
                    "price_local": amount,
                    "currency": cur,
                    "source": "eBay Active",
                    "source_icon": "🛒",
                    "url": url,
                    "date": "",
                    "type": "active",
                })
    except Exception as e:
        print(f"[Market/eBay-API] {e}")
    return results


async def _chrono24_listings(client: "_httpx.AsyncClient", query: str, brand: str = "", model: str = "") -> list:
    """Chrono24 public search — try JSON output."""
    results = []
    try:
        r = await client.get(
            "https://www.chrono24.com/search/index.htm",
            params={
                "dosearch": "dosearch",
                "query": query,
                "watchTypes": "2",
                "resultview": "list",
                "pageSize": "30",
                "sortorder": "1",
                "output": "json",
            },
            headers={
                "User-Agent": _eBay_UA,
                "Accept": "application/json, text/javascript, */*",
                "Referer": "https://www.chrono24.com/",
                "X-Requested-With": "XMLHttpRequest",
            },
            timeout=_httpx.Timeout(18.0),
        )
        if r.status_code == 200:
            data = r.json()
            for item in (data.get("listings") or data.get("articleItems") or [])[:20]:
                title = item.get("title") or item.get("name") or ""
                price_raw = (
                    item.get("price") or item.get("priceFormatted") or
                    item.get("displayPrice") or ""
                )
                if not title:
                    continue
                if brand and not _is_relevant(title, brand, model):
                    continue
                amount, cur = _parse_price_str(str(price_raw))
                if not amount or amount < 500:
                    continue
                link = item.get("detailPageUrl") or item.get("url") or ""
                if link and not link.startswith("http"):
                    link = "https://www.chrono24.com" + link
                results.append({
                    "title": title,
                    "price_usd": round(_to_usd(amount, cur), 0),
                    "price_local": amount,
                    "currency": cur,
                    "source": "Chrono24",
                    "source_icon": "🌐",
                    "url": link,
                    "date": "",
                    "type": "active",
                })
    except Exception as e:
        print(f"[Market/Chrono24] {e}")
    return results


async def _marktplaats_listings(client: "_httpx.AsyncClient", query: str, brand: str = "", model: str = "") -> list:
    """Marktplaats (NL) — European market prices. query should be brand+model, NOT reference alone."""
    results = []
    try:
        r = await client.get(
            "https://www.marktplaats.nl/lrp/api/search",
            params={
                "q": query,
                "l1CategoryId": "385",
                "l2CategoryId": "396",
                "limit": "30",
                "sortBy": "SORT_INDEX",
                "sortOrder": "DECREASING",
            },
            headers={
                "User-Agent": _eBay_UA,
                "Accept": "application/json",
                "Accept-Language": "nl-NL,nl;q=0.9",
            },
            timeout=_httpx.Timeout(15.0),
        )
        if r.status_code == 200:
            for listing in r.json().get("listings", [])[:20]:
                title = listing.get("title", "").strip()
                if not title:
                    continue
                # Relevance check — title must mention brand or model
                if not _is_relevant(title, brand, model):
                    continue
                pc = listing.get("priceInfo", {}).get("priceCents", 0)
                if not pc:
                    continue
                amount = pc / 100.0
                if amount < 800:
                    continue
                vip = listing.get("vipUrl", "")
                if vip and not vip.startswith("http"):
                    vip = "https://www.marktplaats.nl" + vip
                results.append({
                    "title": title,
                    "price_usd": round(_to_usd(amount, "EUR"), 0),
                    "price_local": amount,
                    "currency": "EUR",
                    "source": "Marktplaats 🇳🇱",
                    "source_icon": "🇳🇱",
                    "url": vip,
                    "date": "",
                    "type": "active",
                })
    except Exception as e:
        print(f"[Market/Marktplaats] {e}")
    return results


async def _reddit_prices(client: "_httpx.AsyncClient", query: str, brand: str = "", model: str = "") -> list:
    """Reddit WatchExchange — community seller prices."""
    results = []
    try:
        r = await client.get(
            f"https://www.reddit.com/r/Watchexchange/search.json"
            f"?q={_up.quote(query)}&restrict_sr=1&sort=new&limit=25&t=year",
            headers={
                "User-Agent": "WatchProApp/2.0 (watch price research)",
                "Accept": "application/json",
            },
            timeout=_httpx.Timeout(12.0),
        )
        if r.status_code == 200:
            for post in r.json().get("data", {}).get("children", []):
                p = post.get("data", {})
                title = p.get("title", "").strip()
                if not title:
                    continue
                # Only [WTS] posts have prices
                if not any(m in title.upper() for m in ["[WTS]", "WTS ", "[FS]", "FOR SALE"]):
                    continue
                if brand and not _is_relevant(title, brand, model):
                    continue
                m = re.search(r"\$([\d,]+)", title)
                if not m:
                    continue
                try:
                    amount = float(m.group(1).replace(",", ""))
                except Exception:
                    continue
                if amount < 500:
                    continue
                url = "https://reddit.com" + p.get("permalink", "")
                results.append({
                    "title": title,
                    "price_usd": round(amount, 0),
                    "price_local": amount,
                    "currency": "USD",
                    "source": "Reddit WatchExchange",
                    "source_icon": "🔴",
                    "url": url,
                    "date": "",
                    "type": "active",
                })
    except Exception as e:
        print(f"[Market/Reddit] {e}")
    return results


def _compute_stats(prices_usd: list) -> dict:
    if not prices_usd:
        return {"count": 0, "min": None, "max": None, "median": None, "avg": None}
    s = sorted(prices_usd)
    n = len(s)
    # Remove extreme outliers: keep within 4x of median
    med_raw = s[n // 2]
    s = [p for p in s if med_raw * 0.15 <= p <= med_raw * 5.0]
    if not s:
        s = sorted(prices_usd)
    n = len(s)
    return {
        "count": n,
        "min": int(s[0]),
        "max": int(s[-1]),
        "median": int(s[n // 2]),
        "avg": int(sum(s) / n),
        "p25": int(s[n // 4]),
        "p75": int(s[(n * 3) // 4]),
    }


@router.get("/watch-id/market-prices")
async def get_market_prices(brand: str, model: str, reference: str = ""):
    """
    Fetch live market prices from multiple sources.
    Returns aggregated stats (min/max/median) and recent listings.
    Results cached for 2 hours.
    """
    await _refresh_fx()

    cache_key = f"{brand}|{model}|{reference}".lower().strip()
    cached = _mkt_cache.get(cache_key)
    if cached and _time.time() - cached["ts"] < _MKT_TTL:
        return cached["data"]

    ref = reference.strip()
    brand = brand.strip()
    model = model.strip()

    # Query strategy per source:
    # - eBay (watch category 31387): brand + model + reference  → most specific
    # - Chrono24 (watch-only site): brand + model (+ ref if short)
    # - Marktplaats / Reddit: brand + model ONLY (ref number causes false matches)
    ebay_query      = f"{brand} {model} {ref}".strip() if ref else f"{brand} {model}"
    broad_query     = f"{brand} {model}".strip()       # for general marketplaces

    limits = _httpx.Limits(max_keepalive_connections=10, max_connections=15)
    async with _httpx.AsyncClient(
        limits=limits,
        follow_redirects=True,
        timeout=_httpx.Timeout(18.0),
    ) as client:
        tasks = [
            _ebay_sold(client, ebay_query, brand, model),
            _ebay_active_api(client, ebay_query, brand, model),
            _chrono24_listings(client, broad_query, brand, model),
            # Marktplaats removed — category IDs returned aquarium equipment instead of watches
            _reddit_prices(client, broad_query, brand, model),
        ]
        raw = await asyncio.gather(*tasks, return_exceptions=True)

    all_listings = []
    sources_hit = []
    for result in raw:
        if isinstance(result, list) and result:
            all_listings.extend(result)
            src = result[0].get("source", "")
            if src not in sources_hit:
                sources_hit.append(src)

    # Sort: sold listings first (most credible), then by price
    sold_listings = [l for l in all_listings if l.get("type") == "sold"]
    active_listings = [l for l in all_listings if l.get("type") == "active"]
    sold_listings.sort(key=lambda x: x["price_usd"])
    active_listings.sort(key=lambda x: x["price_usd"])

    combined = sold_listings + active_listings

    # Compute stats (prefer sold prices for accuracy)
    sold_prices = [l["price_usd"] for l in sold_listings if l["price_usd"]]
    all_prices  = [l["price_usd"] for l in combined if l["price_usd"]]

    stats = _compute_stats(sold_prices if len(sold_prices) >= 3 else all_prices)

    result_data = {
        "query": ebay_query,
        "stats": stats,
        "listings": combined[:20],       # cap at 20 for the UI
        "sold_count": len(sold_listings),
        "sources_hit": sources_hit,
        "fetched_at": _time.strftime("%d/%m/%Y %H:%M", _time.gmtime()),
        "from_cache": False,
    }

    _mkt_cache[cache_key] = {"data": result_data, "ts": _time.time()}
    return result_data


@router.delete("/watch-id/market-prices/cache")
async def clear_market_cache(brand: str = "", model: str = "", reference: str = ""):
    """Clear server-side market price cache.
    Pass brand+model+reference to clear a single entry; call with no params to wipe all."""
    if brand or model or reference:
        key = f"{brand}|{model}|{reference}".lower()
        removed = _mkt_cache.pop(key, None)
        return {"cleared": 1 if removed else 0, "key": key}
    count = len(_mkt_cache)
    _mkt_cache.clear()
    return {"cleared": count}


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
