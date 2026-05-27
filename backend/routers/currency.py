"""
Live currency exchange rates — cached in memory, refreshed every hour.
GET /api/currency/rates  – returns rates relative to USD

Sources (in priority order):
  1. openexchangerates.org  — if EXCHANGE_RATES_API_KEY is set (most accurate, free 1K req/mo)
  2. open.er-api.com        — free public fallback (no key required, updates daily)
  3. FALLBACK_RATES dict    — hardcoded approximations if both fail
"""
from fastapi import APIRouter
import httpx, time, os
from typing import Dict

router = APIRouter()

# ─── Cache ────────────────────────────────────────────────────────────────────
_cache: Dict[str, float] = {}
_last_fetch: float = 0
_cache_source: str = ""
_CACHE_TTL = 3600  # 1 hour

SUPPORTED_CURRENCIES = ["USD", "EUR", "GBP", "ILS", "CHF", "JPY", "AUD", "CAD", "HKD", "SGD", "NOK", "SEK", "DKK"]

FALLBACK_RATES = {
    "USD": 1.0,
    "EUR": 0.92,
    "GBP": 0.79,
    "ILS": 3.73,
    "CHF": 0.90,
    "JPY": 149.5,
    "AUD": 1.53,
    "CAD": 1.36,
    "HKD": 7.82,
    "SGD": 1.34,
    "NOK": 10.5,
    "SEK": 10.4,
    "DKK": 6.88,
}

CURRENCY_META = {
    "USD": {"symbol": "$",  "name": "US Dollar",           "flag": "🇺🇸"},
    "EUR": {"symbol": "€",  "name": "Euro",                "flag": "🇪🇺"},
    "GBP": {"symbol": "£",  "name": "British Pound",       "flag": "🇬🇧"},
    "ILS": {"symbol": "₪",  "name": "שקל ישראלי",          "flag": "🇮🇱"},
    "CHF": {"symbol": "CHF","name": "Swiss Franc",         "flag": "🇨🇭"},
    "JPY": {"symbol": "¥",  "name": "Japanese Yen",        "flag": "🇯🇵"},
    "AUD": {"symbol": "A$", "name": "Australian Dollar",   "flag": "🇦🇺"},
    "CAD": {"symbol": "C$", "name": "Canadian Dollar",     "flag": "🇨🇦"},
    "HKD": {"symbol": "HK$","name": "Hong Kong Dollar",    "flag": "🇭🇰"},
    "SGD": {"symbol": "S$", "name": "Singapore Dollar",    "flag": "🇸🇬"},
    "NOK": {"symbol": "kr", "name": "Norwegian Krone",     "flag": "🇳🇴"},
    "SEK": {"symbol": "kr", "name": "Swedish Krona",       "flag": "🇸🇪"},
    "DKK": {"symbol": "kr", "name": "Danish Krone",        "flag": "🇩🇰"},
}


def _extract(raw: Dict, keys: list) -> Dict[str, float]:
    """Pick only supported currencies from a raw rates dict."""
    result = {cur: float(raw[cur]) for cur in keys if cur in raw}
    result["USD"] = 1.0
    return result


async def _fetch_rates() -> Dict[str, float]:
    global _cache, _last_fetch, _cache_source
    now = time.time()
    if _cache and (now - _last_fetch) < _CACHE_TTL:
        return _cache

    api_key = os.environ.get("EXCHANGE_RATES_API_KEY", "")

    # ── 1. openexchangerates.org (if key configured) ───────────────────────────
    if api_key:
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                r = await client.get(
                    "https://openexchangerates.org/api/latest.json",
                    params={"app_id": api_key, "symbols": ",".join(SUPPORTED_CURRENCIES)},
                )
                if r.status_code == 200:
                    data = r.json()
                    _cache = _extract(data.get("rates", {}), SUPPORTED_CURRENCIES)
                    _last_fetch = now
                    _cache_source = "openexchangerates.org"
                    return _cache
                else:
                    print(f"[Currency] openexchangerates error {r.status_code}: {r.text[:100]}")
        except Exception as e:
            print(f"[Currency] openexchangerates fetch failed: {e}")

    # ── 2. open.er-api.com (free public) ─────────────────────────────────────
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            r = await client.get("https://open.er-api.com/v6/latest/USD")
            if r.status_code == 200:
                data = r.json()
                _cache = _extract(data.get("rates", {}), SUPPORTED_CURRENCIES)
                _last_fetch = now
                _cache_source = "open.er-api.com"
                return _cache
    except Exception as e:
        print(f"[Currency] open.er-api.com fetch failed: {e}")

    # ── 3. Fallback hardcoded rates ───────────────────────────────────────────
    if not _cache:
        _cache = dict(FALLBACK_RATES)
        _cache_source = "fallback"
    return _cache


@router.get("/currency/rates")
async def get_rates(bust: str = ""):
    """Return live rates. Pass ?bust=1 to force-refresh cache."""
    global _cache, _last_fetch
    if bust:
        _last_fetch = 0  # force refresh
    rates = await _fetch_rates()
    api_key_configured = bool(os.environ.get("EXCHANGE_RATES_API_KEY", ""))
    return {
        "base": "USD",
        "rates": rates,
        "meta": CURRENCY_META,
        "supported": SUPPORTED_CURRENCIES,
        "cached_at": _last_fetch,
        "source": _cache_source or "open.er-api.com",
        "api_key_active": api_key_configured,
    }
