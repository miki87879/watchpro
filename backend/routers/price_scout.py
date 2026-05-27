"""
Multi-source luxury watch price scout.
Working sources: Reddit (15 subs), Marktplaats NL/API, 2dehands BE,
                 Kleinanzeigen DE, Blocket SE, Finn.no NO
Optional (API key required): eBay Browse API, Chrono24 Partner API
"""
from fastapi import APIRouter, HTTPException, Query, Depends
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
import asyncio, httpx, re, json, os, time, base64
from bs4 import BeautifulSoup
from sqlalchemy.orm import Session
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

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36"
UA_BOT = "WatchProDashboard/2.0 (personal watch trading; contact: user@example.com)"
TIMEOUT = httpx.Timeout(15.0, connect=8.0)

H = {"User-Agent": UA, "Accept": "text/html,*/*", "Accept-Language": "en-US,en;q=0.9"}
H_JSON = {"User-Agent": UA_BOT, "Accept": "application/json"}

class SearchResult(BaseModel):
    title: str
    price: Optional[float] = None
    price_str: str = ""
    currency: str = "USD"
    url: str
    source: str
    source_icon: str = ""
    seller: str = ""
    location: str = ""
    condition: str = ""
    year: Optional[int] = None
    image_url: str = ""
    posted_date: str = ""
    description: str = ""
    is_deal: bool = False

def parse_price(text: str, default_currency="USD"):
    if not text: return None, default_currency, ""
    raw = str(text).strip()
    currency = default_currency
    for sym, cur in [("EUR","EUR"),("€","EUR"),("GBP","GBP"),("£","GBP"),
                     ("CHF","CHF"),("SEK","SEK"),("ILS","ILS"),("₪","ILS")]:
        if sym in raw: currency = cur; break
    m = re.search(r"[\d]+(?:[.,]\d+)*", raw.replace("'","").replace(",",""))
    if m:
        try:
            val = float(m.group().replace(",",""))
            if val >= 100:
                return val, currency, raw
        except: pass
    return None, currency, raw

# ─── Helper: extract __NEXT_DATA__ listings ───────────────────────────────
def extract_next_data_listings(html: str, base_url: str, currency="EUR"):
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(html, "lxml")
    nd = soup.find("script", id="__NEXT_DATA__")
    if not nd: return []
    
    try: data = json.loads(nd.string or "")
    except: return []
    
    listings = []
    def dig(obj, depth=0):
        if depth > 12: return
        if isinstance(obj, dict):
            has_title = "title" in obj or "name" in obj
            has_price = any(k in obj for k in ["priceInfo","price","priceCents","buyNowPrice","currentPrice","amount"])
            if has_title and (has_price or "url" in obj or "vipUrl" in obj or "link" in obj):
                listings.append(obj)
            for v in obj.values():
                dig(v, depth+1)
        elif isinstance(obj, list):
            for item in obj:
                dig(item, depth+1)
    
    dig(data.get("props", data))
    
    results = []
    seen = set()
    for item in listings:
        title = item.get("title") or item.get("name") or ""
        if not title or title in seen: continue
        seen.add(title)
        
        # Price extraction
        price_raw = 0
        for key in ["priceInfo","price","priceCents","buyNowPrice","currentPrice"]:
            val = item.get(key)
            if isinstance(val, dict):
                price_raw = val.get("priceCents", val.get("amount", val.get("value", 0)))
            elif isinstance(val, (int, float)):
                price_raw = val
            if price_raw: break
        
        # Convert cents to units if needed
        if isinstance(price_raw, int) and price_raw > 100000:
            price_raw = price_raw / 100
        
        price_val = float(price_raw) if price_raw else None
        if price_val and price_val < 100: price_val = None
        
        # URL
        url_path = item.get("vipUrl") or item.get("url") or item.get("link") or ""
        if url_path and not url_path.startswith("http"):
            url_path = base_url.rstrip("/") + ("/" if not url_path.startswith("/") else "") + url_path
        
        # Image
        imgs = item.get("imageUrls") or []
        img = imgs[0] if imgs else (item.get("thumbnailUrl") or item.get("imageUrl") or "")
        if isinstance(img, dict): img = img.get("url","")
        
        # Location — handle dict, str, or missing
        loc_raw = item.get("location") or item.get("locationName") or item.get("city") or ""
        if isinstance(loc_raw, dict):
            loc_str = (loc_raw.get("cityName") or loc_raw.get("city") or
                       loc_raw.get("name") or loc_raw.get("label") or "")
        else:
            loc_str = str(loc_raw)

        # Seller — handle nested dict
        seller_raw = item.get("sellerInformation") or item.get("seller") or item.get("user") or ""
        if isinstance(seller_raw, dict):
            seller_str = (seller_raw.get("displayName") or seller_raw.get("name") or
                          seller_raw.get("username") or "")
        else:
            seller_str = str(seller_raw)

        # Image — ensure absolute URL
        img_str = str(img)
        if img_str.startswith("//"):
            img_str = "https:" + img_str
        elif img_str and not img_str.startswith("http"):
            img_str = ""

        results.append({
            "title": title,
            "price": price_val,
            "currency": currency,
            "url": url_path,
            "img": img_str,
            "location": loc_str.strip(),
            "seller": seller_str.strip(),
        })
    return results


# ══════════════════════════════════════════════════════════════════════════
#  SOURCE 1 — REDDIT (15 subreddits)
# ══════════════════════════════════════════════════════════════════════════
REDDIT_SUBS = [
    ("Watchexchange",   True),   # WTS/WTT classifieds
    ("rolex",           False),
    ("patekphilippe",   False),
    ("WatchHorology",   False),
    ("Watches",         False),
    ("AP",              False),
    ("IWC",             False),
    ("OmegaWatches",    False),
    ("Tudor",           False),
    ("Cartier",         False),
    ("VintageWatches",  True),   # Vintage classifieds
    ("watchmarket",     True),   # Dedicated trading sub
    ("PATEKandROLEX",   True),
    ("JapaneseWatches", False),
    ("GrandSeiko",      False),
]
SALE_MARKERS = ["[WTS]","[WTT]","FOR SALE","FS:","SELLING","WTS ","[SALE]","FS ]","[FS]"]

async def search_reddit(client: httpx.AsyncClient, query: str) -> List[SearchResult]:
    results = []
    reqs = []
    for sub, fs_only in REDDIT_SUBS:
        url = (f"https://www.reddit.com/r/{sub}/search.json"
               f"?q={query.replace(' ','+')}&restrict_sr=1&sort=new&limit=25&t=year")
        reqs.append((sub, fs_only, client.get(url, headers=H_JSON, timeout=TIMEOUT)))

    resps = await asyncio.gather(*[r[2] for r in reqs], return_exceptions=True)

    for (sub, fs_only, _), resp in zip(reqs, resps):
        try:
            if isinstance(resp, Exception) or resp.status_code != 200: continue
            posts = resp.json().get("data", {}).get("children", [])
            for post in posts:
                p = post.get("data", {})
                title = p.get("title","").strip()
                if not title: continue
                tu = title.upper()
                if fs_only and not any(m in tu for m in SALE_MARKERS): continue
                pm = re.search(r"\$([\d,]+)", title)
                pv, cur, ps = parse_price("$"+pm.group(1)) if pm else (None,"USD","")
                ts = p.get("created_utc", 0)
                date_str = datetime.utcfromtimestamp(ts).strftime("%d/%m/%Y") if ts else ""
                img = p.get("thumbnail","")
                is_deal = any(m in tu for m in ["[WTS]","FOR SALE","FS:","[FS]"])
                results.append(SearchResult(
                    title=title, price=pv, price_str=ps, currency=cur,
                    url="https://reddit.com"+p.get("permalink",""),
                    source=f"Reddit r/{sub}", source_icon="🔴",
                    seller=p.get("author",""), posted_date=date_str,
                    description=(p.get("selftext") or "")[:250],
                    image_url=img if img.startswith("http") else "",
                    is_deal=is_deal,
                ))
        except Exception as e:
            print(f"[Reddit/{sub}] {e}")
    return results


# ══════════════════════════════════════════════════════════════════════════
#  SOURCE 2 — MARKTPLAATS.NL (Netherlands)
# ══════════════════════════════════════════════════════════════════════════
async def search_marktplaats(client: httpx.AsyncClient, query: str) -> List[SearchResult]:
    results = []
    try:
        url = f"https://www.marktplaats.nl/q/{query.replace(' ', '+').replace('+', '%20')}/"
        r = await client.get(url, headers={**H, "Accept-Language": "nl-NL,nl;q=0.9"}, timeout=TIMEOUT)
        if r.status_code != 200: return results
        
        items = extract_next_data_listings(r.text, "https://www.marktplaats.nl", "EUR")
        for item in items:
            if not item["price"] or item["price"] < 200: continue
            results.append(SearchResult(
                title=item["title"], price=item["price"],
                price_str=f"€{item['price']:,.0f}", currency="EUR",
                url=item["url"], source="Marktplaats 🇳🇱", source_icon="🇳🇱",
                location=item["location"], seller=item["seller"],
                image_url=item["img"], condition="Pre-owned",
            ))
    except Exception as e:
        print(f"[Marktplaats] {e}")
    return results


# ══════════════════════════════════════════════════════════════════════════
#  SOURCE 3 — 2DEHANDS.BE (Belgium)
# ══════════════════════════════════════════════════════════════════════════
async def search_2dehands(client: httpx.AsyncClient, query: str) -> List[SearchResult]:
    results = []
    try:
        url = f"https://www.2dehands.be/q/{query.replace(' ', '-')}/"
        r = await client.get(url, headers={**H, "Accept-Language": "nl-BE,nl;q=0.9"}, timeout=TIMEOUT)
        if r.status_code != 200: return results
        
        items = extract_next_data_listings(r.text, "https://www.2dehands.be", "EUR")
        for item in items:
            if not item["price"] or item["price"] < 200: continue
            results.append(SearchResult(
                title=item["title"], price=item["price"],
                price_str=f"€{item['price']:,.0f}", currency="EUR",
                url=item["url"], source="2dehands 🇧🇪", source_icon="🇧🇪",
                location=item["location"], seller=item["seller"],
                image_url=item["img"], condition="Pre-owned",
            ))
    except Exception as e:
        print(f"[2dehands] {e}")
    return results


# ══════════════════════════════════════════════════════════════════════════
#  SOURCE 4 — WILLHABEN.AT (Austria)
# ══════════════════════════════════════════════════════════════════════════
async def search_willhaben(client: httpx.AsyncClient, query: str) -> List[SearchResult]:
    results = []
    try:
        url = f"https://www.willhaben.at/iad/kaufen-und-verkaufen/marktplatz/uhren-und-schmuck?keyword={query.replace(' ','+')}"
        r = await client.get(url, headers={**H, "Accept-Language": "de-AT,de;q=0.9"}, timeout=TIMEOUT)
        if r.status_code != 200: return results
        
        # Willhaben uses a different data structure
        soup = BeautifulSoup(r.text, "lxml")
        nd = soup.find("script", id="__NEXT_DATA__")
        if not nd: return results
        data = json.loads(nd.string or "")
        
        listings = []
        def find_willhaben(obj, depth=0):
            if depth > 10: return
            if isinstance(obj, dict):
                if "heading" in obj and ("price" in obj or "advertStatus" in obj):
                    listings.append(obj)
                for v in obj.values():
                    find_willhaben(v, depth+1)
            elif isinstance(obj, list):
                for item in obj: find_willhaben(item, depth+1)
        
        find_willhaben(data)
        seen = set()
        for item in listings:
            title = item.get("heading","").strip()
            if not title or title in seen: continue
            seen.add(title)
            price_raw = item.get("price","")
            if isinstance(price_raw, dict):
                price_raw = price_raw.get("value", "")
            pv, cur, ps = parse_price(str(price_raw)+" EUR", "EUR")
            url_slug = item.get("seoUrl","") or item.get("url","")
            if url_slug and not url_slug.startswith("http"):
                url_slug = "https://www.willhaben.at" + url_slug
            imgs = item.get("allImageUrls",[]) or item.get("imageUrls",[])
            img = imgs[0] if imgs else ""
            results.append(SearchResult(
                title=title, price=pv, price_str=ps, currency="EUR",
                url=url_slug or "https://www.willhaben.at",
                source="Willhaben 🇦🇹", source_icon="🇦🇹",
                condition="Pre-owned", image_url=str(img),
            ))
    except Exception as e:
        print(f"[Willhaben] {e}")
    return results


# ══════════════════════════════════════════════════════════════════════════
#  SOURCE 5 — BLOCKET.SE (Sweden)
# ══════════════════════════════════════════════════════════════════════════
async def search_blocket(client: httpx.AsyncClient, query: str) -> List[SearchResult]:
    results = []
    try:
        url = f"https://www.blocket.se/annonser/hela_sverige/klockor?q={query.replace(' ','+')}"
        r = await client.get(url, headers={**H, "Accept-Language": "sv-SE,sv;q=0.9"}, timeout=TIMEOUT)
        if r.status_code != 200: return results
        
        soup = BeautifulSoup(r.text, "lxml")
        # Blocket uses window.__INITIAL_STATE__ or similar
        scripts = soup.find_all("script")
        listing_data = []
        for sc in scripts:
            txt = sc.string or ""
            if "subject" in txt and "price" in txt and "href" in txt:
                # Try to extract JSON from script
                m = re.search(r'"subject"\s*:\s*"([^"]+)".*?"price_value"\s*:\s*(\d+)', txt)
                if m:
                    listing_data.append((m.group(1), int(m.group(2))))
        
        # Also try JSON-LD
        for sc in soup.find_all("script", type="application/ld+json"):
            try:
                d = json.loads(sc.string or "")
                if isinstance(d, list):
                    for item in d:
                        if item.get("@type") in ["Product","Offer"]:
                            listing_data.append((item.get("name",""), item.get("price",0)))
                elif d.get("@type") in ["Product","Offer"]:
                    listing_data.append((d.get("name",""), d.get("price",0)))
            except: pass
        
        # Fallback: parse article cards
        for card in soup.select("article, [class*='ListItem'], [class*='AdCard']")[:15]:
            t = card.select_one("h2, h3, [class*='title'], [class*='subject']")
            p = card.select_one("[class*='price'], [class*='Price']")
            a = card.select_one("a[href]")
            img = card.select_one("img")
            title = t.get_text(strip=True) if t else ""
            if not title: continue
            praw = p.get_text(strip=True) if p else ""
            pv, cur, ps = parse_price(praw + " SEK", "SEK")
            href = a["href"] if a else ""
            if href and not href.startswith("http"):
                href = "https://www.blocket.se" + href
            results.append(SearchResult(
                title=title, price=pv, price_str=praw, currency="SEK",
                url=href, source="Blocket 🇸🇪", source_icon="🇸🇪",
                condition="Pre-owned",
                image_url=img.get("src","") if img else "",
            ))
    except Exception as e:
        print(f"[Blocket] {e}")
    return results


# ══════════════════════════════════════════════════════════════════════════
#  SOURCE 6 — CHRONO24  (multi-strategy: JSON-LD → __NEXT_DATA__ → HTML)
# ══════════════════════════════════════════════════════════════════════════
_C24_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Upgrade-Insecure-Requests": "1",
}

async def search_chrono24(client: httpx.AsyncClient, query: str) -> List[SearchResult]:
    results = []
    q_enc = query.replace(" ", "+")
    url = (
        f"https://www.chrono24.com/search/index.htm"
        f"?dosearch=dosearch&query={q_enc}"
        f"&watchTypes=2"          # 2 = for sale
        f"&resultview=list"
        f"&pageSize=60"
        f"&sortorder=1"           # newest first
    )
    try:
        r = await client.get(url, headers=_C24_HEADERS,
                             timeout=httpx.Timeout(20.0, connect=10.0))
        if r.status_code != 200:
            print(f"[Chrono24] HTTP {r.status_code}")
            return results
        html = r.text
        soup = BeautifulSoup(html, "lxml")

        # ── Strategy 1: JSON-LD Product/ItemList ──────────────────────────
        for tag in soup.find_all("script", type="application/ld+json"):
            try:
                data = json.loads(tag.string or "")
            except Exception:
                continue
            items = []
            if isinstance(data, list):
                items = data
            elif data.get("@type") == "ItemList":
                items = [e.get("item", e) for e in data.get("itemListElement", [])]
            elif data.get("@type") in ("Product", "Offer"):
                items = [data]

            for item in items:
                if not isinstance(item, dict): continue
                name = item.get("name","").strip()
                if not name: continue
                offers = item.get("offers", item if "price" in item else {})
                if isinstance(offers, list): offers = offers[0] if offers else {}
                price_raw = offers.get("price") if isinstance(offers, dict) else None
                currency = (offers.get("priceCurrency","USD") if isinstance(offers, dict) else "USD")
                pv = float(price_raw) if price_raw else None
                img = (item.get("image") or "")
                if isinstance(img, list): img = img[0] if img else ""
                if isinstance(img, dict): img = img.get("url","")
                link = item.get("url","") or item.get("@id","")
                if link and not link.startswith("http"):
                    link = "https://www.chrono24.com" + link
                results.append(SearchResult(
                    title=name,
                    price=pv,
                    price_str=f"${pv:,.0f}" if pv else "",
                    currency=currency,
                    url=link or url,
                    source="Chrono24", source_icon="🌐",
                    image_url=str(img),
                    condition="Pre-owned",
                ))
            if results:
                break   # JSON-LD worked

        # ── Strategy 2: parse watch cards from HTML ────────────────────────
        if not results:
            selectors = [
                "article[data-id]",
                "[data-article-id]",
                ".js-article-item",
                ".article-item",
                ".wsp-card",
                "[class*='ArticleItem']",
                "[class*='articleItem']",
            ]
            cards = []
            for sel in selectors:
                cards = soup.select(sel)
                if cards: break

            # Fallback: any article or section that contains a price
            if not cards:
                cards = [
                    el for el in soup.select("article, .js-item, [class*='listing']")
                    if el.select_one("[class*='price'], [class*='Price']")
                ]

            seen = set()
            for card in cards[:30]:
                t_el = card.select_one(
                    "h2, h3, [class*='title'], [class*='model'], [class*='name']"
                )
                title = t_el.get_text(strip=True) if t_el else ""
                if not title or title in seen or len(title) < 5:
                    continue
                seen.add(title)

                p_el = card.select_one("[class*='price'], [class*='Price']")
                praw = p_el.get_text(strip=True) if p_el else ""
                pv, cur, ps = parse_price(praw)

                a_el = card.select_one("a[href]")
                href = a_el["href"] if a_el else ""
                if href and not href.startswith("http"):
                    href = "https://www.chrono24.com" + href

                img_el = card.select_one(
                    "img[src], img[data-src], img[data-lazy], [class*='image'] img"
                )
                img = ""
                if img_el:
                    img = (img_el.get("src") or img_el.get("data-src")
                           or img_el.get("data-lazy") or "")

                seller_el = card.select_one("[class*='dealer'], [class*='seller']")
                seller = seller_el.get_text(strip=True) if seller_el else ""

                results.append(SearchResult(
                    title=title, price=pv, price_str=praw, currency=cur,
                    url=href or url,
                    source="Chrono24", source_icon="🌐",
                    image_url=img, seller=seller,
                    condition="Pre-owned",
                ))

    except Exception as e:
        print(f"[Chrono24] {e}")
    return results


# ══════════════════════════════════════════════════════════════════════════
#  SOURCE 7 — EBAY
# ══════════════════════════════════════════════════════════════════════════
async def search_ebay(client: httpx.AsyncClient, query: str) -> List[SearchResult]:
    results = []
    try:
        r = await client.get(
            f"https://www.ebay.com/sch/i.html?_nkw={query.replace(' ','+')}& _sacat=31387&LH_BIN=1&_sop=15",
            headers=H, timeout=TIMEOUT
        )
        if r.status_code != 200: return results
        soup = BeautifulSoup(r.text, "lxml")
        for item in soup.select(".s-item:not(.s-item--placeholder)")[:12]:
            t = item.select_one(".s-item__title")
            p = item.select_one(".s-item__price")
            a = item.select_one("a.s-item__link")
            img = item.select_one("img")
            title = t.get_text(strip=True) if t else ""
            if not title or "Shop on eBay" in title: continue
            praw = p.get_text(strip=True) if p else ""
            pv, cur, ps = parse_price(praw)
            results.append(SearchResult(
                title=title, price=pv, price_str=praw, currency=cur,
                url=a["href"] if a else "",
                source="eBay", source_icon="🛒",
                image_url=img.get("src","") if img else "",
            ))
    except Exception as e:
        print(f"[eBay] {e}")
    return results


# ══════════════════════════════════════════════════════════════════════════
#  SOURCE 8 — WATCHUSEEK FORUM
# ══════════════════════════════════════════════════════════════════════════
async def search_watchuseek(client: httpx.AsyncClient, query: str) -> List[SearchResult]:
    results = []
    try:
        r = await client.get(
            f"https://www.watchuseek.com/search/?q={query.replace(' ','+')}& t=post&o=date",
            headers=H, timeout=TIMEOUT
        )
        if r.status_code != 200: return results
        soup = BeautifulSoup(r.text, "lxml")
        for item in soup.select(".contentRow, .structItem")[:12]:
            t = item.select_one("h3 a, h2 a, [class*='title'] a")
            if not t: continue
            title = t.get_text(strip=True)
            href = t.get("href","")
            if href and not href.startswith("http"):
                href = "https://www.watchuseek.com" + href
            pm = re.search(r"\$([\d,]+)", title)
            pv, cur, ps = parse_price("$"+pm.group(1)) if pm else (None,"USD","")
            results.append(SearchResult(
                title=title, price=pv, price_str=ps, currency=cur,
                url=href, source="WatchUSeek", source_icon="⌚",
            ))
    except Exception as e:
        print(f"[WatchUSeek] {e}")
    return results


# ══════════════════════════════════════════════════════════════════════════
#  SOURCE 9 — BOB'S WATCHES
# ══════════════════════════════════════════════════════════════════════════
async def search_bobs(client: httpx.AsyncClient, query: str) -> List[SearchResult]:
    results = []
    try:
        r = await client.get(
            f"https://www.bobswatches.com/rolex-watches?search={query.replace(' ','+')}",
            headers=H, timeout=TIMEOUT
        )
        if r.status_code != 200: return results
        soup = BeautifulSoup(r.text, "lxml")
        for card in soup.select(".product-item, [class*='product']")[:8]:
            t = card.select_one("h2, h3, [class*='name']")
            p = card.select_one("[class*='price']")
            a = card.select_one("a[href]")
            img = card.select_one("img")
            title = t.get_text(strip=True) if t else ""
            if not title: continue
            praw = p.get_text(strip=True) if p else ""
            pv, cur, ps = parse_price(praw)
            href = a["href"] if a else ""
            if href and not href.startswith("http"):
                href = "https://www.bobswatches.com" + href
            results.append(SearchResult(
                title=title, price=pv, price_str=praw, currency=cur,
                url=href, source="Bob's Watches", source_icon="🏆",
                condition="Pre-owned",
                image_url=img.get("src","") if img else "",
            ))
    except Exception as e:
        print(f"[Bob's] {e}")
    return results


# ══════════════════════════════════════════════════════════════════════════
#  SOURCE 10 — WATCHFINDER (UK)
# ══════════════════════════════════════════════════════════════════════════
async def search_watchfinder(client: httpx.AsyncClient, query: str) -> List[SearchResult]:
    results = []
    try:
        r = await client.get(
            f"https://www.watchfinder.com/search?q={query.replace(' ','+')}",
            headers=H, timeout=TIMEOUT
        )
        if r.status_code != 200: return results
        soup = BeautifulSoup(r.text, "lxml")
        for card in soup.select("[class*='WatchCard'], [class*='watch-card'], .product")[:8]:
            t = card.select_one("h3, h2, [class*='title']")
            p = card.select_one("[class*='price']")
            a = card.select_one("a[href]")
            img = card.select_one("img")
            title = t.get_text(strip=True) if t else ""
            if not title: continue
            praw = p.get_text(strip=True) if p else ""
            pv, cur, ps = parse_price(praw)
            href = a["href"] if a else ""
            if href and not href.startswith("http"):
                href = "https://www.watchfinder.com" + href
            results.append(SearchResult(
                title=title, price=pv, price_str=praw, currency=cur,
                url=href, source="Watchfinder", source_icon="🇬🇧",
                condition="Pre-owned",
                image_url=(img.get("src") or img.get("data-src","")) if img else "",
            ))
    except Exception as e:
        print(f"[Watchfinder] {e}")
    return results


# ══════════════════════════════════════════════════════════════════════════
#  SOURCE 11 — KLEINANZEIGEN.DE (Germany)
# ══════════════════════════════════════════════════════════════════════════
async def search_kleinanzeigen(client: httpx.AsyncClient, query: str) -> List[SearchResult]:
    results = []
    try:
        # Build URL — category 200 = Uhren & Schmuck
        q_enc = query.replace(" ", "+")
        url = f"https://www.kleinanzeigen.de/s-uhren/{q_enc}/k0c200"
        r = await client.get(url, headers={**H, "Accept-Language": "de-DE,de;q=0.9"}, timeout=TIMEOUT)
        if r.status_code != 200: return results

        soup = BeautifulSoup(r.text, "lxml")
        articles = soup.select("article[data-adid]")
        seen = set()
        for art in articles:
            # Title from JSON-LD inside the article
            ld_tag = art.select_one('script[type="application/ld+json"]')
            if ld_tag:
                try: ld = json.loads(ld_tag.string or "{}")
                except: ld = {}
            else:
                ld = {}
            title = ld.get("title","").strip() or art.select_one("h2")
            if hasattr(title, "get_text"): title = title.get_text(strip=True)
            if not title or title in seen: continue
            seen.add(title)

            # Price — appears as e.g. "14.500 € VB" or "4.990 € VB5.500 €"
            price_el = art.select_one('[class*="price"], [class*="Price"]')
            price_txt = price_el.get_text(strip=True) if price_el else ""
            # Normalize: "14.500 € VB" → "14500 EUR"
            clean = price_txt.replace(".","").replace(",",".")
            m = re.search(r"(\d[\d.]*)", clean.replace("€",""))
            pv = float(m.group(1)) if m else None
            if pv and pv < 100: pv = None

            # URL
            href = art.get("data-href","")
            if href and not href.startswith("http"):
                href = "https://www.kleinanzeigen.de" + href

            # Image
            img_el = art.select_one("img[src]")
            img = img_el.get("src","") if img_el else ""

            # Location
            loc_el = art.select_one('[class*="location"], [class*="Location"]')
            location = loc_el.get_text(strip=True) if loc_el else ""

            results.append(SearchResult(
                title=title,
                price=pv,
                price_str=f"€{pv:,.0f}" if pv else price_txt,
                currency="EUR",
                url=href,
                source="Kleinanzeigen 🇩🇪",
                source_icon="🇩🇪",
                location=location,
                image_url=img,
                condition="Pre-owned",
                description=ld.get("description","")[:200],
            ))
    except Exception as e:
        print(f"[Kleinanzeigen] {e}")
    return results


# ══════════════════════════════════════════════════════════════════════════
#  SOURCE 12 — FINN.NO 🇳🇴  (Norway's largest classifieds — works reliably)
# ══════════════════════════════════════════════════════════════════════════
async def search_finn(client: httpx.AsyncClient, query: str) -> List[SearchResult]:
    """Finn.no — Norway's biggest classifieds. Returns full article cards with images."""
    results = []
    try:
        url = (f"https://www.finn.no/bap/forsale/search.html"
               f"?q={query.replace(' ','+')}&sort=RELEVANCE")
        r = await client.get(
            url,
            headers={**H, "Accept-Language": "nb-NO,nb;q=0.9"},
            timeout=TIMEOUT,
        )
        if r.status_code != 200:
            return results

        soup = BeautifulSoup(r.text, "lxml")
        seen = set()
        for art in soup.select("article"):
            # Title
            t_el = art.select_one("h2, h3, [class*='title']")
            title = t_el.get_text(strip=True) if t_el else ""
            if not title or title in seen or len(title) < 5:
                continue
            seen.add(title)

            # Link
            a_el = art.select_one("a[href]")
            href = a_el["href"] if a_el else ""
            if href and not href.startswith("http"):
                href = "https://www.finn.no" + href

            # Image — first img in article
            img_el = art.select_one("img[src]")
            img = img_el["src"] if img_el else ""

            # Price — "165 000 kr" pattern in article text
            full_text = art.get_text(" ", strip=True)
            pm = re.search(r"([\d\s\xa0]+)\s*kr", full_text)
            price_txt = ""
            pv = None
            if pm:
                price_txt = pm.group(0).strip()
                raw_num = re.sub(r"[\s\xa0]", "", pm.group(1))
                try:
                    pv = float(raw_num)
                    if pv < 100: pv = None
                except ValueError:
                    pass

            results.append(SearchResult(
                title=title,
                price=pv,
                price_str=price_txt,
                currency="NOK",
                url=href,
                source="Finn.no 🇳🇴",
                source_icon="🇳🇴",
                image_url=img,
                condition="Pre-owned",
            ))
    except Exception as e:
        print(f"[Finn.no] {e}")
    return results


# ══════════════════════════════════════════════════════════════════════════
#  SOURCE 13 — MARKTPLAATS JSON API (faster, richer data)
# ══════════════════════════════════════════════════════════════════════════
async def search_marktplaats_api(client: httpx.AsyncClient, query: str) -> List[SearchResult]:
    """Use Marktplaats's internal JSON API for cleaner results."""
    results = []
    try:
        url = (f"https://www.marktplaats.nl/lrp/api/search"
               f"?q={query.replace(' ','+')}"
               f"&l1CategoryId=385&l2CategoryId=396"  # Sieraden > Horloges
               f"&limit=30&sortBy=SORT_INDEX&sortOrder=DECREASING")
        r = await client.get(url, headers={**H, "Accept": "application/json",
                                           "Accept-Language": "nl-NL,nl;q=0.9"}, timeout=TIMEOUT)
        if r.status_code != 200: return results
        data = r.json()
        for listing in data.get("listings", []):
            title = listing.get("title","").strip()
            if not title: continue
            pc = listing.get("priceInfo",{}).get("priceCents",0)
            pv = pc / 100.0 if pc else None
            if pv and pv < 100: pv = None
            loc = listing.get("location",{})
            city = loc.get("cityName","") if isinstance(loc,dict) else ""
            imgs = listing.get("imageUrls",[])
            img = imgs[0] if imgs else ""
            if img.startswith("//"): img = "https:" + img
            vip = listing.get("vipUrl","")
            if vip and not vip.startswith("http"):
                vip = "https://www.marktplaats.nl" + vip
            seller_info = listing.get("sellerInformation",{})
            seller = seller_info.get("sellerName","") if isinstance(seller_info,dict) else ""
            results.append(SearchResult(
                title=title,
                price=pv,
                price_str=f"€{pv:,.0f}" if pv else "",
                currency="EUR",
                url=vip or "https://www.marktplaats.nl",
                source="Marktplaats 🇳🇱",
                source_icon="🇳🇱",
                location=city,
                seller=seller,
                image_url=img,
                condition="Pre-owned",
            ))
    except Exception as e:
        print(f"[Marktplaats API] {e}")
    return results


# ══════════════════════════════════════════════════════════════════════════
#  SOURCE A — EBAY BROWSE API  (requires EBAY_CLIENT_ID + EBAY_CLIENT_SECRET)
# ══════════════════════════════════════════════════════════════════════════
_ebay_token_cache: dict = {"token": None, "expires_at": 0.0}

async def _get_ebay_token() -> Optional[str]:
    """OAuth 2.0 Client Credentials flow — token cached for ~2h."""
    client_id     = os.environ.get("EBAY_CLIENT_ID", "").strip()
    client_secret = os.environ.get("EBAY_CLIENT_SECRET", "").strip()
    if not client_id or not client_secret:
        return None

    now = time.time()
    if _ebay_token_cache["token"] and now < _ebay_token_cache["expires_at"] - 120:
        return _ebay_token_cache["token"]

    creds = base64.b64encode(f"{client_id}:{client_secret}".encode()).decode()
    try:
        async with httpx.AsyncClient() as c:
            r = await c.post(
                "https://api.ebay.com/identity/v1/oauth2/token",
                headers={"Authorization": f"Basic {creds}",
                         "Content-Type": "application/x-www-form-urlencoded"},
                data={"grant_type": "client_credentials",
                      "scope": "https://api.ebay.com/oauth/api_scope"},
                timeout=httpx.Timeout(12.0),
            )
        if r.status_code == 200:
            d = r.json()
            _ebay_token_cache["token"]      = d["access_token"]
            _ebay_token_cache["expires_at"] = now + d.get("expires_in", 7200)
            print("[eBay] Token refreshed ✅")
            return _ebay_token_cache["token"]
        print(f"[eBay Token] HTTP {r.status_code}: {r.text[:200]}")
    except Exception as e:
        print(f"[eBay Token] {e}")
    return None


async def search_ebay_api(client: httpx.AsyncClient, query: str) -> List[SearchResult]:
    """eBay Browse API — free official API, 50 listings per call."""
    results = []
    token = await _get_ebay_token()
    if not token:
        return results          # silently skip if no API key configured

    try:
        r = await client.get(
            "https://api.ebay.com/buy/browse/v1/item_summary/search",
            params={
                "q": query,
                "category_ids": "31387",         # Watches
                "filter": "conditionIds:{3000|4000|5000|6000}",  # used conditions
                "sort": "price",
                "limit": "50",
            },
            headers={
                "Authorization": f"Bearer {token}",
                "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
                "Content-Type": "application/json",
            },
            timeout=TIMEOUT,
        )
        if r.status_code == 401:
            # Token expired — clear cache and retry once
            _ebay_token_cache["token"] = None
            _ebay_token_cache["expires_at"] = 0.0
            new_token = await _get_ebay_token()
            if not new_token: return results
            r = await client.get(
                "https://api.ebay.com/buy/browse/v1/item_summary/search",
                params={"q": query, "category_ids": "31387",
                        "filter": "conditionIds:{3000|4000|5000|6000}",
                        "sort": "price", "limit": "50"},
                headers={"Authorization": f"Bearer {new_token}",
                         "X-EBAY-C-MARKETPLACE-ID": "EBAY_US"},
                timeout=TIMEOUT,
            )
        if r.status_code != 200:
            print(f"[eBay API] HTTP {r.status_code}")
            return results

        for item in r.json().get("itemSummaries", []):
            title = item.get("title", "").strip()
            if not title: continue
            price_info = item.get("price", {})
            try:   pv = float(price_info.get("value", 0))
            except: pv = None
            currency  = price_info.get("currency", "USD")
            image     = item.get("image", {}).get("imageUrl", "")
            seller    = item.get("seller", {}).get("username", "")
            condition = item.get("condition", "")
            url       = item.get("itemWebUrl", "")
            loc       = item.get("itemLocation", {})
            loc_str   = ", ".join(filter(None, [loc.get("city",""), loc.get("country","")]))
            results.append(SearchResult(
                title=title, price=pv,
                price_str=f"${pv:,.0f}" if pv else "",
                currency=currency, url=url,
                source="eBay 🛒", source_icon="🛒",
                seller=seller, location=loc_str,
                condition=condition, image_url=image,
            ))
    except Exception as e:
        print(f"[eBay API] {e}")
    return results


# ══════════════════════════════════════════════════════════════════════════
#  SOURCE REGISTRY  (only sources that actually return results)
# ══════════════════════════════════════════════════════════════════════════
_BASE_SOURCES = {
    "reddit":          ("Reddit (15 subs)",       search_reddit,          "🔴", "forum"),
    "marktplaats_api": ("Marktplaats API 🇳🇱",    search_marktplaats_api, "🇳🇱", "classifieds"),
    "marktplaats":     ("Marktplaats 🇳🇱",        search_marktplaats,     "🇳🇱", "classifieds"),
    "kleinanzeigen":   ("Kleinanzeigen 🇩🇪",      search_kleinanzeigen,   "🇩🇪", "classifieds"),
    "2dehands":        ("2dehands 🇧🇪",           search_2dehands,        "🇧🇪", "classifieds"),
    "blocket":         ("Blocket 🇸🇪",            search_blocket,         "🇸🇪", "classifieds"),
    "finn":            ("Finn.no 🇳🇴",            search_finn,            "🇳🇴", "classifieds"),
}

def _get_all_sources() -> dict:
    """Build active sources dict — adds eBay if API key is configured."""
    sources = dict(_BASE_SOURCES)
    if os.environ.get("EBAY_CLIENT_ID") and os.environ.get("EBAY_CLIENT_SECRET"):
        sources["ebay_api"] = ("eBay 🛒", search_ebay_api, "🛒", "marketplace")
    return sources

# Keep a module-level alias for backward compatibility
ALL_SOURCES = _get_all_sources()

# Sites that block automated scraping — shown in UI as manual-search links
BLOCKED_SOURCES = {
    "chrono24":    ("Chrono24",       "🌐", "https://www.chrono24.com/search/index.htm?dosearch=dosearch&query={q}",   "HTTP 403 — חוסם גישה אוטומטית"),
    "ebay":        ("eBay",           "🛒", "https://www.ebay.com/sch/i.html?_nkw={q}&_sacat=31387",                  "HTTP 403 — חוסם גישה אוטומטית"),
    "watchfinder": ("Watchfinder",    "🇬🇧","https://www.watchfinder.com/search?q={q}",                               "JavaScript rendering — לא נגיש"),
    "bobs":        ("Bob's Watches",  "🏆", "https://www.bobswatches.com/rolex-watches?search={q}",                   "JavaScript rendering — לא נגיש"),
    "gumtree":     ("Gumtree",        "🇬🇧","https://www.gumtree.com/search?search_category=watches&q={q}",           "CAPTCHA — הגנת בוטים"),
    "watchuseek":  ("WatchUSeek",     "⌚", "https://www.watchuseek.com/search/?q={q}&t=post",                        "CAPTCHA — הגנת בוטים"),
    "willhaben":   ("Willhaben",      "🇦🇹","https://www.willhaben.at/iad/kaufen-und-verkaufen/marktplatz/uhren-und-schmuck?keyword={q}", "CAPTCHA — הגנת בוטים"),
}

@router.get("/price-scout/search")
async def search_all(
    query: str = Query(..., min_length=1),
    sources: Optional[str] = Query(None),
    sort_by: str = Query("price"),
    max_results: int = Query(200),
    db: Session = Depends(get_db),
    current_user: Optional[models.User] = Depends(get_current_user_optional),
):
    current_sources = _get_all_sources()
    if sources and sources != "all":
        keys = [s.strip() for s in sources.split(",")]
        active = {k: v for k, v in current_sources.items() if k in keys}
    else:
        active = current_sources

    limits = httpx.Limits(max_keepalive_connections=20, max_connections=30)
    async with httpx.AsyncClient(limits=limits, follow_redirects=True) as client:
        tasks = [fn(client, query) for name, fn, *_ in active.values()]
        raw = await asyncio.gather(*tasks, return_exceptions=True)

    all_results: List[SearchResult] = []
    source_stats = {}
    for (key, (name, fn, icon, stype)), outcome in zip(active.items(), raw):
        if isinstance(outcome, Exception):
            source_stats[name] = {"count": 0, "error": str(outcome)[:80], "icon": icon}
        else:
            source_stats[name] = {"count": len(outcome), "error": None, "icon": icon}
            all_results.extend(outcome)

    if sort_by == "price":
        all_results.sort(key=lambda x: (not x.is_deal, x.price is None, x.price or 0))
    elif sort_by == "source":
        all_results.sort(key=lambda x: x.source)

    _log("PRICE_SCOUT", query, {"results": len(all_results), "sources": len(active)}, user=current_user)
    return {
        "query": query,
        "total_found": len(all_results),
        "sources_searched": len(active),
        "source_stats": source_stats,
        "results": [r.dict() for r in all_results[:max_results]],
    }

@router.get("/price-scout/sources")
def get_sources():
    current = _get_all_sources()
    return {
        "sources": [
            {"key": k, "name": name, "icon": icon, "type": stype}
            for k, (name, fn, icon, stype) in current.items()
        ],
        "blocked": [
            {"key": k, "name": name, "icon": icon, "url_template": url_tmpl, "reason": reason}
            for k, (name, icon, url_tmpl, reason) in BLOCKED_SOURCES.items()
        ],
    }

# ─── Alerts & Saved ────────────────────────────────────────────────────────
class AlertCreate(BaseModel):
    brand: str; model: str; reference: Optional[str]=None; target_price: float

@router.get("/price-scout/alerts")
def list_alerts(db: Session = Depends(get_db)):
    return db.query(models.PriceAlert).filter_by(active=True).all()

@router.post("/price-scout/alerts")
def create_alert(data: AlertCreate, db: Session = Depends(get_db)):
    a = models.PriceAlert(**data.dict()); db.add(a); db.commit(); db.refresh(a); return a

@router.delete("/price-scout/alerts/{alert_id}")
def delete_alert(alert_id: int, db: Session = Depends(get_db)):
    a = db.query(models.PriceAlert).get(alert_id)
    if not a: raise HTTPException(404,"Not found")
    db.delete(a); db.commit(); return {"ok": True}

class SaveListing(BaseModel):
    brand: str=""; model: str=""; price: Optional[float]=None; url: str; source: str; notes: str=""

@router.get("/price-scout/saved")
def list_saved(db: Session = Depends(get_db)):
    return db.query(models.SavedListing).order_by(models.SavedListing.saved_at.desc()).all()

@router.post("/price-scout/saved")
def save_listing(data: SaveListing, db: Session = Depends(get_db)):
    l = models.SavedListing(**data.dict()); db.add(l); db.commit(); db.refresh(l); return l

@router.delete("/price-scout/saved/{listing_id}")
def delete_saved(listing_id: int, db: Session = Depends(get_db)):
    l = db.query(models.SavedListing).get(listing_id)
    if not l: raise HTTPException(404,"Not found")
    db.delete(l); db.commit(); return {"ok": True}
