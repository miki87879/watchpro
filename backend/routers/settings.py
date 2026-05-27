"""
API Key & Settings Management
GET  /api/settings/api-keys         – which keys are configured (no values exposed)
POST /api/settings/api-keys         – save one or more keys to .env
DELETE /api/settings/api-keys/{key} – remove a key from .env
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, Dict
import os, re

router = APIRouter()

# Path to the .env file (next to main.py)
ENV_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")

# ─── All configurable API integrations ──────────────────────────────────────
API_KEY_META = {
    "EBAY_CLIENT_ID": {
        "label": "eBay App ID (Client ID)",
        "service": "eBay",
        "service_icon": "🛒",
        "instructions": [
            "כנס ל-developer.ebay.com",
            "לחץ על 'Get Started' → צור חשבון מפתח (חינם)",
            "צור אפליקציה חדשה → בחר 'Production'",
            "העתק את ה-'App ID (Client ID)'",
        ],
        "link": "https://developer.ebay.com/my-keys",
        "link_label": "developer.ebay.com",
        "required_partner": "EBAY_CLIENT_SECRET",
        "description": "eBay Browse API — מאפשר חיפוש 50 מכירות פעילות בקטגוריית שעונים (31387). חינמי לחלוטין.",
    },
    "EBAY_CLIENT_SECRET": {
        "label": "eBay Cert ID (Client Secret)",
        "service": "eBay",
        "service_icon": "🛒",
        "instructions": [
            "באותו עמוד, העתק את ה-'Cert ID (Client Secret)'",
        ],
        "link": "https://developer.ebay.com/my-keys",
        "link_label": "developer.ebay.com",
        "required_partner": "EBAY_CLIENT_ID",
        "description": "נדרש יחד עם EBAY_CLIENT_ID.",
    },
    "CHRONO24_API_KEY": {
        "label": "Chrono24 Partner API Key",
        "service": "Chrono24",
        "service_icon": "🌐",
        "instructions": [
            "שלח מייל ל- api@chrono24.com",
            "ציין שאתה סוחר שעוני יוקרה ורוצה גישה ל-Partner API",
            "לאחר אישור תקבל API Key",
        ],
        "link": "mailto:api@chrono24.com",
        "link_label": "api@chrono24.com",
        "description": "Chrono24 Partner API — גישה לכל המכירות הפעילות. דורש אישור ידני.",
    },
    "ANTHROPIC_API_KEY": {
        "label": "Anthropic API Key (WatchGPT)",
        "service": "Anthropic / Claude",
        "service_icon": "🤖",
        "instructions": [
            "כנס ל-console.anthropic.com",
            "Settings → API Keys → Create Key",
        ],
        "link": "https://console.anthropic.com/settings/keys",
        "link_label": "console.anthropic.com",
        "description": "נדרש לזיהוי שעונים, מילוי אוטומטי ויצירת מודעות.",
    },
    "EXCHANGE_RATES_API_KEY": {
        "label": "Open Exchange Rates API Key",
        "service": "Exchange Rates",
        "service_icon": "💱",
        "instructions": [
            "כנס ל-openexchangerates.org",
            "הירשם → בחר תוכנית Free (1,000 בקשות/חודש)",
            "העתק את App ID שלך",
        ],
        "link": "https://openexchangerates.org/signup/free",
        "link_label": "openexchangerates.org",
        "description": "שערי מטבע מדויקים יותר עם API מאומת. ללא מפתח — משתמש ב-open.er-api.com (ציבורי, פחות מהימן).",
    },
}


def _read_env() -> Dict[str, str]:
    """Read current .env file as key→value dict."""
    env: Dict[str, str] = {}
    if not os.path.exists(ENV_PATH):
        return env
    with open(ENV_PATH, "r") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" in line:
                k, _, v = line.partition("=")
                env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def _write_env(env: Dict[str, str]) -> None:
    """Write key→value dict back to .env file."""
    lines = []
    for k, v in env.items():
        # Quote values that contain spaces
        if " " in v or not v:
            lines.append(f'{k}="{v}"')
        else:
            lines.append(f"{k}={v}")
    with open(ENV_PATH, "w") as f:
        f.write("\n".join(lines) + "\n")


@router.get("/settings/api-keys")
def get_api_keys():
    """Return which keys are configured (boolean only — never expose values)."""
    env = _read_env()
    result = []
    processed_services: set = set()

    for key, meta in API_KEY_META.items():
        service = meta["service"]
        # Group eBay Client ID + Secret into one entry
        if service in processed_services:
            continue

        # Collect all keys for this service
        service_keys = [k for k, m in API_KEY_META.items() if m["service"] == service]
        all_configured = all(env.get(k) for k in service_keys)
        any_configured = any(env.get(k) for k in service_keys)

        # Build per-key status
        key_statuses = [
            {
                "key": k,
                "label": API_KEY_META[k]["label"],
                "configured": bool(env.get(k)),
                # Show masked value: sk-ant-...xxxx
                "masked": _mask(env[k]) if env.get(k) else None,
            }
            for k in service_keys
        ]

        result.append({
            "service": service,
            "service_icon": meta["service_icon"],
            "active": all_configured,
            "partial": any_configured and not all_configured,
            "keys": key_statuses,
            "instructions": meta["instructions"],
            "link": meta["link"],
            "link_label": meta["link_label"],
            "description": meta["description"],
        })
        processed_services.add(service)

    return result


def _mask(value: str) -> str:
    if len(value) <= 8:
        return "****"
    return value[:4] + "****" + value[-4:]


class SaveKeysRequest(BaseModel):
    keys: Dict[str, str]  # {ENV_VAR_NAME: value}


@router.post("/settings/api-keys")
def save_api_keys(body: SaveKeysRequest):
    """Save API keys to .env file. Empty string = remove the key."""
    env = _read_env()

    for key, value in body.keys.items():
        if key not in API_KEY_META:
            raise HTTPException(status_code=400, detail=f"Unknown key: {key}")
        if value.strip():
            env[key] = value.strip()
        else:
            env.pop(key, None)

    _write_env(env)

    # Reload env vars into current process
    for key, value in body.keys.items():
        if value.strip():
            os.environ[key] = value.strip()
        else:
            os.environ.pop(key, None)

    return {"message": "שמור בהצלחה", "saved": list(body.keys.keys())}


@router.delete("/settings/api-keys/{key_name}")
def delete_api_key(key_name: str):
    """Remove a key from .env."""
    if key_name not in API_KEY_META:
        raise HTTPException(status_code=400, detail=f"Unknown key: {key_name}")
    env = _read_env()
    env.pop(key_name, None)
    _write_env(env)
    os.environ.pop(key_name, None)
    return {"message": f"{key_name} הוסר"}
