import { useState, useRef, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Scan, Upload, X, ChevronDown, ChevronUp,
  TrendingUp, TrendingDown, Minus, ShieldCheck,
  AlertTriangle, Star, DollarSign, Info,
  ExternalLink, RefreshCw, Activity,
} from 'lucide-react'
import { useWatchSearch, clearWatchCache } from '../context/WatchSearchContext'
import type { WatchResult } from '../context/WatchSearchContext'

// ─── Live Market Types ────────────────────────────────────────────────────────
interface MarketListing {
  title: string
  price_usd: number
  price_local: number
  currency: string
  source: string
  source_icon: string
  url: string
  date: string
  type: 'sold' | 'active'
}
interface MarketStats {
  count: number
  min: number | null
  max: number | null
  median: number | null
  avg: number | null
  p25: number | null
  p75: number | null
}
interface MarketData {
  query: string
  stats: MarketStats
  listings: MarketListing[]
  sold_count: number
  sources_hit: string[]
  fetched_at: string
  from_cache: boolean
}
interface LiveMarketState {
  loading: boolean
  data: MarketData | null
  error: string | null
}

// ─── Market price cache (localStorage, 2h TTL) ────────────────────────────────
const MKT_CACHE_TTL = 2 * 60 * 60 * 1000
function mktCacheKey(brand: string, model: string, ref: string) {
  return `mkt_${brand}_${model}_${ref}`.toLowerCase().replace(/\s+/g, '_')
}
function readMktCache(key: string): MarketData | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const { ts, data } = JSON.parse(raw)
    if (Date.now() - ts > MKT_CACHE_TTL) { localStorage.removeItem(key); return null }
    return data
  } catch { return null }
}
function writeMktCache(key: string, data: MarketData) {
  try { localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data })) } catch {}
}
function clearAllMktCache() {
  const keys: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k && k.startsWith('mkt_')) keys.push(k)
  }
  keys.forEach(k => localStorage.removeItem(k))
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const GOLD = '#d4af37'
const CARD_BG = '#111827'
const BORDER = '#1f2937'
const NAVY = '#0a0e1a'

const fmt$ = (n: number | null | undefined) =>
  n != null ? `$${n.toLocaleString('en-US')}` : '—'

const gradeColor = (g: string) => {
  if (g === 'A+') return '#d4af37'
  if (g === 'A') return '#22c55e'
  if (g === 'B') return '#3b82f6'
  if (g === 'C') return '#f59e0b'
  return '#ef4444'
}

const QUICK = [
  'Rolex Submariner 126610LN',
  'Patek Philippe Nautilus 5711/1A',
  'AP Royal Oak 15500ST',
  'Rolex Daytona 116500LN',
  'Omega Speedmaster 311.30.42.30.01.005',
]

// ─── Report generation ────────────────────────────────────────────────────────
function generateReport(result: WatchResult, imagePreview: string | null): void {
  const fmtVal = (n: number | null | undefined) =>
    n != null ? `$${n.toLocaleString('en-US')}` : '—'

  const specsRows = [
    ['קוטר קייס', result.case_size_mm ? `${result.case_size_mm} מ"מ` : null],
    ['עובי קייס', result.case_thickness_mm ? `${result.case_thickness_mm} מ"מ` : null],
    ['רוחב אוזניות', result.lug_width_mm ? `${result.lug_width_mm} מ"מ` : null],
    ['חומר קייס', result.case_material],
    ['תנועה', result.movement],
    ['עתודת כוח', result.power_reserve_hours ? `${result.power_reserve_hours} שעות` : null],
    ['עמידות למים', result.water_resistance_m ? `${result.water_resistance_m} מ\'` : null],
    ['קריסטל', result.crystal],
    ['צמיד', result.bracelet],
    ['אבזם', result.clasp],
    ['צבע ציפוי', result.dial_color],
    ['לוח', result.dial_description],
    ['לוח הרים', result.bezel],
    ['מחיר קמעונאי', result.retail_price_usd ? fmtVal(result.retail_price_usd) : null],
  ].filter(([, v]) => v != null)

  const trendLabel =
    result.price_trend === 'rising' ? '↑ עולה' :
    result.price_trend === 'falling' ? '↓ יורד' : '— יציב'

  const html = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${result.brand} ${result.model} Ref. ${result.reference} - Watch Pro Report</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #111827;
      color: #d1d5db;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      direction: rtl;
      padding: 40px 24px;
      max-width: 900px;
      margin: 0 auto;
    }
    h1 { color: #d4af37; font-size: 1.8rem; margin-bottom: 6px; }
    h2 { color: #d4af37; font-size: 1.1rem; margin: 32px 0 12px; border-bottom: 1px solid #374151; padding-bottom: 6px; }
    .subtitle { color: #9ca3af; font-size: 0.95rem; margin-bottom: 32px; }
    .hero { display: flex; gap: 28px; align-items: flex-start; margin-bottom: 32px; }
    .hero img { width: 200px; height: 200px; object-fit: cover; border-radius: 12px; border: 1px solid #374151; flex-shrink: 0; }
    .hero-info { flex: 1; }
    .hero-info h1 { font-size: 2rem; }
    .ref { font-size: 1.2rem; color: #9ca3af; font-family: monospace; margin: 4px 0 16px; }
    .badge {
      display: inline-block;
      padding: 3px 10px;
      border-radius: 999px;
      font-size: 0.75rem;
      background: rgba(212,175,55,0.15);
      color: #d4af37;
      margin-left: 8px;
    }
    .confidence {
      font-size: 0.9rem;
      color: #9ca3af;
      margin-top: 12px;
    }
    .market-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; margin-bottom: 8px; }
    .market-cell { background: #0d1117; border: 1px solid #1f2937; border-radius: 10px; padding: 14px; text-align: center; }
    .market-cell .label { font-size: 0.72rem; color: #6b7280; margin-bottom: 6px; }
    .market-cell .value { font-size: 1.1rem; font-weight: bold; }
    .specs-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
    .spec-cell { background: #0d1117; border: 1px solid #1f2937; border-radius: 8px; padding: 10px 14px; }
    .spec-cell .label { font-size: 0.72rem; color: #6b7280; margin-bottom: 2px; }
    .spec-cell .value { font-size: 0.9rem; color: #d1d5db; }
    .invest-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 12px; }
    .invest-cell { background: #0d1117; border-radius: 8px; padding: 12px 14px; }
    .invest-cell .label { font-size: 0.72rem; color: #6b7280; margin-bottom: 4px; }
    .invest-cell .value { font-size: 0.9rem; color: #d1d5db; }
    .grade-box {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 56px; height: 56px;
      border-radius: 10px;
      font-size: 1.4rem;
      font-weight: bold;
      float: right;
      margin-left: 16px;
    }
    .reasoning { font-size: 0.9rem; line-height: 1.6; color: #9ca3af; }
    .list-items { list-style: none; padding: 0; }
    .list-items li { padding: 6px 0; font-size: 0.9rem; border-bottom: 1px solid #1f2937; }
    .list-items li:last-child { border-bottom: none; }
    .notes-box { background: #0d1117; border-radius: 8px; padding: 14px; font-size: 0.9rem; line-height: 1.7; color: #9ca3af; }
    .footer { margin-top: 40px; text-align: center; font-size: 0.75rem; color: #4b5563; }
  </style>
</head>
<body>
  <div class="hero">
    ${imagePreview ? `<img src="${imagePreview}" alt="${result.brand} ${result.model}" />` : ''}
    <div class="hero-info">
      <h1>${result.brand} ${result.model}${result.nickname ? `<span class="badge">"${result.nickname}"</span>` : ''}</h1>
      <p class="ref">Ref. ${result.reference}</p>
      ${result.year_introduced ? `<span style="background:#1f2937;color:#9ca3af;padding:3px 10px;border-radius:6px;font-size:0.8rem;margin-left:6px;">הוצג: ${result.year_introduced}</span>` : ''}
      ${result.serial_year ? `<span style="background:#1f2937;color:#9ca3af;padding:3px 10px;border-radius:6px;font-size:0.8rem;margin-left:6px;">שנת ייצור: ${result.serial_year}</span>` : ''}
      ${result.still_in_production != null ? `<span style="background:${result.still_in_production ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)'};color:${result.still_in_production ? '#22c55e' : '#ef4444'};padding:3px 10px;border-radius:6px;font-size:0.8rem;">${result.still_in_production ? 'בייצור' : 'הופסק'}</span>` : ''}
      <p class="confidence">רמת ביטחון: <strong style="color:#d4af37;">${Math.round(result.confidence * 100)}%</strong></p>
    </div>
  </div>

  ${(result.production_year_range || result.year_significance_note || result.known_variants_by_year) ? `
  <h2>שנה ווריאנטים</h2>
  ${result.production_year_range ? `<p style="color:#d4af37;font-size:0.95rem;margin-bottom:10px;">תקופת ייצור: <strong>${result.production_year_range}</strong></p>` : ''}
  ${result.year_significance_note ? `
  <div class="notes-box" style="margin-bottom:10px;">
    <div style="font-size:0.72rem;color:#6b7280;margin-bottom:4px;">משמעות שנת הייצור</div>
    ${result.year_significance_note}
  </div>` : ''}
  ${result.known_variants_by_year ? `
  <div class="notes-box">
    <div style="font-size:0.72rem;color:#6b7280;margin-bottom:4px;">וריאנטים לפי שנה</div>
    ${result.known_variants_by_year}
  </div>` : ''}` : ''}

  <h2>שווי שוק (USD)</h2>
  <div class="market-grid">
    <div class="market-cell">
      <div class="label">Full Set מושלם</div>
      <div class="value" style="color:#22c55e;">${fmtVal(result.market_values.mint_full_set)}</div>
    </div>
    <div class="market-cell">
      <div class="label">מצוין + תעודות</div>
      <div class="value" style="color:#84cc16;">${fmtVal(result.market_values.excellent_with_papers)}</div>
    </div>
    <div class="market-cell">
      <div class="label">מצוין</div>
      <div class="value" style="color:#d4af37;">${fmtVal(result.market_values.excellent_no_papers)}</div>
    </div>
    <div class="market-cell">
      <div class="label">טוב</div>
      <div class="value" style="color:#f59e0b;">${fmtVal(result.market_values.good)}</div>
    </div>
    <div class="market-cell">
      <div class="label">סביר</div>
      <div class="value" style="color:#f97316;">${fmtVal(result.market_values.fair)}</div>
    </div>
  </div>

  <h2>מפרט טכני</h2>
  <div class="specs-grid">
    ${specsRows.map(([label, value]) => `
    <div class="spec-cell">
      <div class="label">${label}</div>
      <div class="value">${value}</div>
    </div>`).join('')}
  </div>

  <h2>ניתוח השקעה</h2>
  <div style="overflow:hidden;margin-bottom:12px;">
    <div class="grade-box" style="border:2px solid ${gradeColor(result.investment_grade)};background:${gradeColor(result.investment_grade)}22;color:${gradeColor(result.investment_grade)};">
      ${result.investment_grade}
    </div>
    <p class="reasoning">${result.investment_reasoning}</p>
  </div>
  <div class="invest-grid">
    <div class="invest-cell">
      <div class="label">מגמת מחיר</div>
      <div class="value">${trendLabel} — ${result.price_trend_note}</div>
    </div>
    <div class="invest-cell">
      <div class="label">עיתוי לרכישה</div>
      <div class="value">${result.best_time_to_buy}</div>
    </div>
    <div class="invest-cell">
      <div class="label">פרמיית קופסה + תעודות</div>
      <div class="value" style="color:#d4af37;">${result.box_papers_premium}</div>
    </div>
  </div>
  ${result.availability ? `<div class="notes-box" style="margin-top:8px;">${result.availability}</div>` : ''}

  ${result.authentication_tips.length > 0 ? `
  <h2>נקודות בדיקה (אימות)</h2>
  <ul class="list-items">
    ${result.authentication_tips.map(t => `<li style="color:#22c55e;">✓ ${t}</li>`).join('')}
  </ul>` : ''}

  ${result.red_flags.length > 0 ? `
  <h2>דגלים אדומים</h2>
  <ul class="list-items">
    ${result.red_flags.map(f => `<li style="color:#ef4444;">⚠ ${f}</li>`).join('')}
  </ul>` : ''}

  ${result.collector_notes || result.historical_significance ? `
  <h2>הערות קולקטורים</h2>
  ${result.collector_notes ? `<div class="notes-box">${result.collector_notes}</div>` : ''}
  ${result.historical_significance ? `
  <div class="notes-box" style="margin-top:10px;">
    <div style="font-size:0.72rem;color:#6b7280;margin-bottom:4px;">משמעות היסטורית</div>
    ${result.historical_significance}
  </div>` : ''}` : ''}

  <div style="margin-top:32px;text-align:center;">
    <button onclick="window.print()" style="background:#d4af37;color:#0a0e1a;border:none;padding:10px 28px;border-radius:8px;font-size:0.9rem;font-weight:bold;cursor:pointer;">
      🖨️ הדפס / שמור כ-PDF
    </button>
  </div>
  <div class="footer" style="margin-top:16px;">
    נוצר על-ידי Watch Pro · ${new Date().toLocaleDateString('he-IL')}
  </div>
</body>
</html>`

  const blob = new Blob([html], { type: 'text/html' })
  const url = URL.createObjectURL(blob)

  // Open in new tab for preview + trigger download
  window.open(url, '_blank')

  // Also trigger file download
  const a = document.createElement('a')
  a.href = url
  a.download = `${result.brand}-${result.model}-${result.reference}.html`.replace(/\s+/g, '-')
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function WatchIdentifier() {
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)

  // Context (loading, result, error, imagePreview, fromCache)
  const { loading, result, error, imagePreview: ctxImagePreview, fromCache, startSearch } = useWatchSearch()

  // Local state
  const [query, setQuery] = useState('')
  const [queryType, setQueryType] = useState<'reference' | 'serial' | 'name'>('reference')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [authOpen, setAuthOpen] = useState(false)
  const [notesOpen, setNotesOpen] = useState(false)
  const [dots, setDots] = useState('.')
  // Auto-fetched watch image from Wikimedia Commons (fallback when no uploaded image)
  const [commonsImage, setCommonsImage] = useState<string | null>(null)
  const [commonsLoading, setCommonsLoading] = useState(false)
  // Live market prices
  const [liveMarket, setLiveMarket] = useState<LiveMarketState>({ loading: false, data: null, error: null })

  // Animated dots: driven by context.loading
  useEffect(() => {
    if (!loading) {
      setDots('.')
      return
    }
    let count = 1
    const interval = setInterval(() => {
      count = (count % 3) + 1
      setDots('.'.repeat(count))
    }, 500)
    return () => clearInterval(interval)
  }, [loading])

  const INPUT_MODES = [
    { key: 'reference' as const, label: '# רפרנס', placeholder: 'לדוגמה: 126610LN / 5711/1A / 15500ST / 126235' },
    { key: 'serial'    as const, label: '🔢 סידורי', placeholder: 'לדוגמה: T123456 / G234567 / 2T654321 (Rolex)' },
    { key: 'name'      as const, label: '📝 שם חופשי', placeholder: 'לדוגמה: Rolex Datejust 36, Patek Nautilus' },
  ]
  const currentMode = INPUT_MODES.find(m => m.key === queryType)!

  const looksLikeReference = queryType === 'serial' && query.trim().length >= 5 && (
    /^\d{5,6}[A-Z]{0,4}$/i.test(query.trim()) ||
    /^\d{4}\/\d{1,2}[A-Z]?$/i.test(query.trim()) ||
    /^\d{5}[A-Z]{2}/i.test(query.trim())
  )

  const handleFile = (file: File) => {
    if (!file.type.startsWith('image/')) return
    setImageFile(file)
    const reader = new FileReader()
    reader.onload = (e) => setImagePreview(e.target?.result as string)
    reader.readAsDataURL(file)
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [])

  const identify = async () => {
    if (!query.trim() && !imageFile) return

    let imageBase64: string | null = null
    if (imageFile) {
      imageBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(imageFile)
      })
    }

    startSearch({
      query,
      queryType,
      imageBase64,
      imagePreview: imagePreview,
    })
  }

  const clearImage = () => {
    setImageFile(null)
    setImagePreview(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  // Use imagePreview from local state (new upload) or from context (previous search)
  const displayImage = imagePreview ?? ctxImagePreview

  // When result appears and there's no uploaded image → fetch from Wikimedia Commons
  useEffect(() => {
    if (!result || displayImage) {
      setCommonsImage(null)
      setCommonsLoading(false)
      return
    }
    setCommonsImage(null)
    setCommonsLoading(true)
    const apiBase = import.meta.env.VITE_API_URL ?? ''
    fetch(
      `${apiBase}/api/watch-id/watch-image?brand=${encodeURIComponent(result.brand)}&model=${encodeURIComponent(result.model)}&reference=${encodeURIComponent(result.reference)}`
    )
      .then(r => r.json())
      .then(data => setCommonsImage(data.image_url ?? null))
      .catch(() => setCommonsImage(null))
      .finally(() => setCommonsLoading(false))
  }, [result?.brand, result?.model, result?.reference, displayImage])

  // Live market prices: auto-fetch when result appears
  const fetchLiveMarket = async (brand: string, model: string, reference: string, force = false) => {
    const key = mktCacheKey(brand, model, reference)
    if (!force) {
      const cached = readMktCache(key)
      if (cached) {
        setLiveMarket({ loading: false, data: { ...cached, from_cache: true }, error: null })
        return
      }
    }
    setLiveMarket({ loading: true, data: null, error: null })
    const apiBase = import.meta.env.VITE_API_URL ?? ''
    try {
      const res = await fetch(
        `${apiBase}/api/watch-id/market-prices?brand=${encodeURIComponent(brand)}&model=${encodeURIComponent(model)}&reference=${encodeURIComponent(reference)}`
      )
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: MarketData = await res.json()
      writeMktCache(key, data)
      setLiveMarket({ loading: false, data, error: null })
    } catch (e) {
      setLiveMarket({ loading: false, data: null, error: 'לא ניתן לשלוף מחירים חיים כרגע' })
    }
  }

  useEffect(() => {
    if (!result) {
      setLiveMarket({ loading: false, data: null, error: null })
      return
    }
    fetchLiveMarket(result.brand, result.model, result.reference)
  }, [result?.brand, result?.model, result?.reference])

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      className="min-h-screen p-6 space-y-6"
      style={{ background: NAVY, direction: 'rtl', fontFamily: 'inherit' }}
    >
      {/* Page Header */}
      <div className="flex items-center gap-3 mb-2">
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: 'linear-gradient(135deg, #d4af37, #b8962e)' }}
        >
          <Scan size={24} color={NAVY} />
        </div>
        <div>
          <h1 className="text-2xl font-bold" style={{ color: GOLD }}>
            זיהוי ואמידת שעון
          </h1>
          <p className="text-sm" style={{ color: '#9ca3af' }}>
            מנוע ה-AI המתקדם של Watch Pro — מזהה, מאפיין ומעריך שווי
          </p>
        </div>
      </div>

      {/* ── Section 1: Input ── */}
      <div
        className="rounded-2xl p-6 space-y-4"
        style={{ background: CARD_BG, border: `1px solid ${BORDER}` }}
      >
        {/* Text input */}
        <div>
          {/* Input type selector */}
          <div className="flex gap-1 p-1 rounded-xl mb-3" style={{ background: '#0d1117' }}>
            {INPUT_MODES.map(m => (
              <button
                key={m.key}
                onClick={() => { setQueryType(m.key); setQuery('') }}
                className="flex-1 py-2 rounded-lg text-xs font-semibold transition-all"
                style={{
                  background: queryType === m.key ? '#1f2937' : 'transparent',
                  color: queryType === m.key ? GOLD : '#6b7280',
                  border: queryType === m.key ? `1px solid rgba(212,175,55,0.3)` : '1px solid transparent',
                }}
              >
                {m.label}
              </button>
            ))}
          </div>

          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && identify()}
            placeholder={currentMode.placeholder}
            className="w-full rounded-xl px-4 py-3 text-white placeholder-gray-500 outline-none transition-all"
            style={{
              background: '#0d1117',
              border: `1px solid ${looksLikeReference ? '#f59e0b' : BORDER}`,
              fontSize: '15px',
            }}
            onFocus={(e) => (e.target.style.borderColor = looksLikeReference ? '#f59e0b' : GOLD)}
            onBlur={(e) => (e.target.style.borderColor = looksLikeReference ? '#f59e0b' : BORDER)}
          />

          {looksLikeReference && (
            <div
              className="mt-2 rounded-xl px-4 py-3 flex items-center justify-between gap-3"
              style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.4)' }}
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span style={{ fontSize: 16, flexShrink: 0 }}>⚠️</span>
                <p className="text-xs" style={{ color: '#fbbf24' }}>
                  <strong>{query.trim()}</strong> נראה כמו <strong>מספר רפרנס</strong> — לא מספר סידורי.
                  מספרי סידורי של Rolex מתחילים באות (T, G, M…) או בשני תווים.
                </p>
              </div>
              <button
                onClick={() => setQueryType('reference')}
                className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
                style={{ background: '#f59e0b', color: '#000' }}
              >
                עבור לרפרנס ←
              </button>
            </div>
          )}
        </div>

        {/* Quick suggestions — only for reference mode */}
        {queryType === 'reference' && (
        <div className="flex flex-wrap gap-2">
          {QUICK.map((q) => (
            <button
              key={q}
              onClick={() => { setQueryType('reference'); setQuery(q) }}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:opacity-80"
              style={{
                background: '#1f2937',
                color: '#9ca3af',
                border: `1px solid ${BORDER}`,
              }}
            >
              {q}
            </button>
          ))}
        </div>
        )}

        {/* Drag & drop zone */}
        {!imagePreview ? (
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => fileRef.current?.click()}
            className="rounded-xl flex flex-col items-center justify-center gap-2 cursor-pointer transition-all"
            style={{
              border: `2px dashed ${dragging ? GOLD : '#374151'}`,
              background: dragging ? 'rgba(212,175,55,0.05)' : '#0d1117',
              padding: '2rem',
              minHeight: '120px',
            }}
          >
            <Upload size={28} color={dragging ? GOLD : '#6b7280'} />
            <p className="text-sm" style={{ color: '#9ca3af' }}>
              גרור תמונה לכאן או{' '}
              <span style={{ color: GOLD }}>לחץ להעלאה</span>
            </p>
            <p className="text-xs" style={{ color: '#4b5563' }}>
              JPEG, PNG, WebP — עד 10 MB
            </p>
          </div>
        ) : (
          <div className="relative inline-block">
            <img
              src={imagePreview}
              alt="תצוגה מקדימה"
              className="rounded-xl object-cover"
              style={{ maxHeight: '180px', maxWidth: '100%', border: `1px solid ${BORDER}` }}
            />
            <button
              onClick={clearImage}
              className="absolute top-2 left-2 rounded-full p-1 flex items-center justify-center"
              style={{ background: '#111827', border: `1px solid ${BORDER}` }}
            >
              <X size={14} color="#9ca3af" />
            </button>
            <p className="mt-1 text-xs" style={{ color: '#6b7280' }}>{imageFile?.name}</p>
          </div>
        )}

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        />

        {/* Submit button */}
        <button
          onClick={identify}
          disabled={loading}
          className="w-full py-3.5 rounded-xl font-bold text-base transition-all flex items-center justify-center gap-2"
          style={{
            background: loading
              ? '#374151'
              : 'linear-gradient(135deg, #d4af37, #b8962e)',
            color: loading ? '#9ca3af' : NAVY,
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          <Scan size={18} />
          זהה שעון
        </button>
      </div>

      {/* ── Section 2: Loading ── */}
      {loading && (
        <div
          className="rounded-2xl p-8 flex flex-col items-center gap-4"
          style={{ background: CARD_BG, border: `1px solid ${BORDER}` }}
        >
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center animate-spin"
            style={{
              border: `3px solid ${BORDER}`,
              borderTopColor: GOLD,
            }}
          />
          <p className="text-lg font-semibold" style={{ color: GOLD }}>
            Claude AI מנתח את השעון{dots}
          </p>
          <p className="text-sm" style={{ color: '#6b7280' }}>
            מאגר הידע שלנו כולל אלפי מודלים, רפרנסים ועסקאות שוק
          </p>
        </div>
      )}

      {/* ── Error state ── */}
      {error && !loading && (
        <div
          className="rounded-2xl p-5 flex items-start gap-3"
          style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)' }}
        >
          <AlertTriangle size={20} color="#ef4444" className="flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-sm" style={{ color: '#ef4444' }}>
              לא ניתן לזהות
            </p>
            <p className="text-sm mt-0.5" style={{ color: '#9ca3af' }}>{error}</p>
            <p className="text-xs mt-2" style={{ color: '#6b7280' }}>
              נסה לספק מספר רפרנס מדויק, שם מותג ודגם, או תמונה ברורה יותר.
            </p>
          </div>
        </div>
      )}

      {/* ── Section 3: Results ── */}
      {result && !loading && (
        <div className="space-y-4">

          {/* 3a. Hero card */}
          <div
            className="rounded-2xl p-6"
            style={{
              background: 'linear-gradient(135deg, #0d1b2e 0%, #111827 100%)',
              border: `1px solid ${GOLD}`,
            }}
          >
            {/* Cache badge */}
            {fromCache && (
              <div className="flex justify-end mb-3">
                <span
                  className="text-xs px-3 py-1 rounded-full font-medium"
                  style={{ background: 'rgba(212,175,55,0.15)', color: GOLD, border: `1px solid rgba(212,175,55,0.3)` }}
                >
                  📦 תוצאה שמורה
                </span>
              </div>
            )}

            {/* Watch image — uploaded photo takes priority, then Wikimedia Commons */}
            {(() => {
              const src = displayImage ?? commonsImage
              if (!src && !commonsLoading) return null
              return (
                <div className="mb-5 flex justify-center">
                  {commonsLoading && !src ? (
                    <div
                      className="rounded-xl flex items-center justify-center"
                      style={{ width: 200, height: 150, background: '#0d1117', border: `1px solid ${BORDER}` }}
                    >
                      <div className="flex flex-col items-center gap-2">
                        <div
                          className="w-6 h-6 rounded-full animate-spin"
                          style={{ border: `2px solid ${BORDER}`, borderTopColor: GOLD }}
                        />
                        <span className="text-xs" style={{ color: '#6b7280' }}>טוען תמונה...</span>
                      </div>
                    </div>
                  ) : src ? (
                    <img
                      src={src}
                      alt={`${result.brand} ${result.model}`}
                      className="rounded-xl object-contain"
                      style={{
                        maxHeight: 260,
                        maxWidth: '100%',
                        border: `1px solid ${BORDER}`,
                        background: '#0d1117',
                      }}
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                    />
                  ) : null}
                </div>
              )
            })()}

            <div className="flex flex-wrap items-start justify-between gap-4">
              {/* Brand/model text */}
              <div className="flex items-start gap-4 flex-1">
                <div className="space-y-1 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-2xl font-bold" style={{ color: GOLD }}>
                      {result.brand} {result.model}
                    </h2>
                    {result.nickname && (
                      <span
                        className="px-2 py-0.5 rounded-full text-xs font-medium"
                        style={{ background: 'rgba(212,175,55,0.15)', color: GOLD }}
                      >
                        "{result.nickname}"
                      </span>
                    )}
                  </div>
                  <p className="text-lg font-mono" style={{ color: '#d1d5db' }}>
                    Ref. {result.reference}
                  </p>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {result.year_introduced && (
                      <span className="text-xs px-2 py-1 rounded-lg" style={{ background: '#1f2937', color: '#9ca3af' }}>
                        הוצג: {result.year_introduced}
                      </span>
                    )}
                    {result.serial_year && (
                      <span className="text-xs px-2 py-1 rounded-lg" style={{ background: '#1f2937', color: '#9ca3af' }}>
                        שנת ייצור משוערת: {result.serial_year}
                      </span>
                    )}
                    {result.still_in_production != null && (
                      <span
                        className="text-xs px-2 py-1 rounded-lg font-semibold"
                        style={{
                          background: result.still_in_production
                            ? 'rgba(34,197,94,0.15)'
                            : 'rgba(239,68,68,0.15)',
                          color: result.still_in_production ? '#22c55e' : '#ef4444',
                        }}
                      >
                        {result.still_in_production ? 'בייצור' : 'הופסק'}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Confidence badge */}
              <div className="flex flex-col items-center gap-2 min-w-[96px]">
                <div
                  className="w-20 h-20 rounded-full flex items-center justify-center"
                  style={{
                    background: `conic-gradient(${GOLD} ${result.confidence * 360}deg, #1f2937 0deg)`,
                  }}
                >
                  <div
                    className="w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold"
                    style={{ background: '#0d1b2e', color: GOLD }}
                  >
                    {Math.round(result.confidence * 100)}%
                  </div>
                </div>
                <span className="text-xs" style={{ color: '#9ca3af' }}>ביטחון</span>
                {/* Confidence bar */}
                <div className="w-20 h-1.5 rounded-full overflow-hidden" style={{ background: '#1f2937' }}>
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${result.confidence * 100}%`,
                      background: result.confidence > 0.85
                        ? '#22c55e'
                        : result.confidence > 0.6
                        ? GOLD
                        : '#f59e0b',
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* 3b. LIVE Market Prices Panel */}
          <div
            className="rounded-2xl overflow-hidden"
            style={{ border: `1px solid rgba(34,197,94,0.35)`, background: 'linear-gradient(135deg,#061a0e,#0d1b14)' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid rgba(34,197,94,0.15)' }}>
              <div className="flex items-center gap-2">
                <Activity size={16} color="#22c55e" />
                <span className="font-bold text-sm" style={{ color: '#22c55e' }}>מחירי שוק חיים</span>
                {liveMarket.data?.from_cache && (
                  <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(34,197,94,0.12)', color: '#86efac' }}>
                    📦 שמור
                  </span>
                )}
                {!liveMarket.loading && liveMarket.data && (
                  <span className="text-xs" style={{ color: '#4b7a5e' }}>
                    עודכן {liveMarket.data.fetched_at}
                  </span>
                )}
              </div>
              <button
                onClick={() => result && fetchLiveMarket(result.brand, result.model, result.reference, true)}
                disabled={liveMarket.loading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all font-medium text-xs"
                style={liveMarket.data?.from_cache
                  ? { background: 'rgba(34,197,94,0.2)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.4)' }
                  : { background: 'rgba(34,197,94,0.08)', color: '#4b7a5e', border: '1px solid rgba(34,197,94,0.15)' }}
                title="רענן מחירים מהשוק"
              >
                <RefreshCw size={13} className={liveMarket.loading ? 'animate-spin' : ''} />
                {liveMarket.data?.from_cache ? 'רענן' : '🔄'}
              </button>
            </div>

            <div className="px-5 py-4 space-y-4">
              {/* Loading */}
              {liveMarket.loading && (
                <div className="flex items-center gap-3 py-2">
                  <RefreshCw size={16} color="#22c55e" className="animate-spin flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium" style={{ color: '#86efac' }}>שולף מחירים חיים מהשוק...</p>
                    <p className="text-xs" style={{ color: '#4b7a5e' }}>eBay Sold · Chrono24 · Marktplaats · Reddit</p>
                  </div>
                </div>
              )}

              {/* Error */}
              {liveMarket.error && !liveMarket.loading && (
                <p className="text-xs" style={{ color: '#6b7280' }}>{liveMarket.error}</p>
              )}

              {/* Stats */}
              {liveMarket.data && !liveMarket.loading && (() => {
                const { stats, listings, sold_count, sources_hit } = liveMarket.data
                const hasPrices = stats.count > 0 && stats.min != null && stats.max != null && stats.median != null

                return (
                  <>
                    {/* Source badges */}
                    <div className="flex flex-wrap gap-1.5">
                      {sources_hit.map(s => (
                        <span key={s} className="text-xs px-2 py-0.5 rounded-full"
                          style={{ background: 'rgba(34,197,94,0.1)', color: '#86efac', border: '1px solid rgba(34,197,94,0.2)' }}>
                          {s}
                        </span>
                      ))}
                      {sold_count > 0 && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
                          style={{ background: 'rgba(34,197,94,0.2)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.4)' }}>
                          ✓ {sold_count} מכירות שהושלמו
                        </span>
                      )}
                    </div>

                    {hasPrices ? (
                      <>
                        {/* Stats grid */}
                        <div className="grid grid-cols-3 gap-3">
                          {[
                            { label: 'מינימום', value: stats.min!, color: '#f59e0b' },
                            { label: 'חציון (מדויק)', value: stats.median!, color: '#22c55e' },
                            { label: 'מקסימום', value: stats.max!, color: '#60a5fa' },
                          ].map(({ label, value, color }) => (
                            <div key={label} className="rounded-xl p-3 text-center"
                              style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.06)' }}>
                              <p className="text-xs mb-1" style={{ color: '#6b7280' }}>{label}</p>
                              <p className="text-lg font-bold" style={{ color }}>${value.toLocaleString()}</p>
                            </div>
                          ))}
                        </div>

                        {/* Visual range bar */}
                        {stats.min != null && stats.max != null && stats.median != null && stats.min !== stats.max && (
                          <div>
                            <div className="relative h-3 rounded-full overflow-hidden" style={{ background: '#1a2e1a' }}>
                              {/* Full range */}
                              <div className="absolute inset-y-0 rounded-full" style={{ background: 'rgba(34,197,94,0.2)', left: '0%', right: '0%' }} />
                              {/* IQR band */}
                              {stats.p25 != null && stats.p75 != null && (() => {
                                const range = stats.max! - stats.min!
                                const left = ((stats.p25! - stats.min!) / range) * 100
                                const width = ((stats.p75! - stats.p25!) / range) * 100
                                return (
                                  <div className="absolute inset-y-0 rounded-full"
                                    style={{ background: 'rgba(34,197,94,0.5)', left: `${left}%`, width: `${width}%` }} />
                                )
                              })()}
                              {/* Median marker */}
                              {(() => {
                                const pct = ((stats.median! - stats.min!) / (stats.max! - stats.min!)) * 100
                                return (
                                  <div className="absolute inset-y-0 w-1 rounded-full"
                                    style={{ background: '#22c55e', left: `${pct}%`, transform: 'translateX(-50%)' }} />
                                )
                              })()}
                            </div>
                            <div className="flex justify-between text-xs mt-0.5" style={{ color: '#4b7a5e' }}>
                              <span>${stats.min!.toLocaleString()}</span>
                              <span style={{ color: '#22c55e' }}>⬆ חציון ${stats.median!.toLocaleString()}</span>
                              <span>${stats.max!.toLocaleString()}</span>
                            </div>
                          </div>
                        )}

                        <p className="text-xs" style={{ color: '#4b7a5e' }}>
                          {stats.count} תוצאות · ממוצע: ${stats.avg?.toLocaleString()} · כל המחירים ב-USD
                        </p>
                      </>
                    ) : (
                      <p className="text-sm" style={{ color: '#4b7a5e' }}>
                        לא נמצאו מחירים מספיקים לחישוב סטטיסטיקה לשאילתה זו
                      </p>
                    )}

                    {/* Recent listings */}
                    {listings.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-xs font-semibold" style={{ color: '#4b7a5e' }}>עסקאות אחרונות</p>
                        {listings.slice(0, 8).map((l, i) => (
                          <a
                            key={i}
                            href={l.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 rounded-lg px-3 py-2 transition-all hover:bg-green-900/20 group"
                            style={{ background: 'rgba(0,0,0,0.2)' }}
                          >
                            <span className="text-xs flex-shrink-0">{l.source_icon}</span>
                            <span className="text-xs flex-1 truncate" style={{ color: '#9ca3af' }}>{l.title}</span>
                            <span className="text-xs font-bold flex-shrink-0"
                              style={{ color: l.type === 'sold' ? '#22c55e' : '#60a5fa' }}>
                              ${l.price_usd.toLocaleString()}
                              {l.type === 'sold' && <span style={{ color: '#4b7a5e', fontWeight: 400 }}> ✓</span>}
                            </span>
                            <ExternalLink size={11} color="#374151" className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </a>
                        ))}
                      </div>
                    )}
                  </>
                )
              })()}
            </div>
          </div>

          {/* 3b-2. AI Estimate (Claude) — secondary reference */}
          <details className="group">
            <summary
              className="flex items-center gap-2 cursor-pointer select-none rounded-xl px-4 py-3 transition-all hover:opacity-80"
              style={{ background: CARD_BG, border: `1px solid ${BORDER}`, color: '#6b7280', fontSize: 13 }}
            >
              <span>🤖</span>
              <span>הערכת AI (Claude) — לפי נתוני אימון</span>
              <ChevronDown size={14} className="mr-auto group-open:rotate-180 transition-transform" />
            </summary>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mt-2">
              {[
                { label: 'Full Set מושלם', key: 'mint_full_set', color: '#22c55e' },
                { label: 'מצוין + תעודות', key: 'excellent_with_papers', color: '#84cc16' },
                { label: 'מצוין', key: 'excellent_no_papers', color: GOLD },
                { label: 'טוב', key: 'good', color: '#f59e0b' },
                { label: 'סביר', key: 'fair', color: '#f97316' },
              ].map(({ label, key, color }) => (
                <div
                  key={key}
                  className="rounded-xl p-4 text-center"
                  style={{ background: CARD_BG, border: `1px solid ${BORDER}` }}
                >
                  <p className="text-xs mb-1" style={{ color: '#6b7280' }}>{label}</p>
                  <p className="text-lg font-bold" style={{ color }}>
                    {fmt$(result.market_values[key as keyof typeof result.market_values])}
                  </p>
                </div>
              ))}
            </div>
          </details>

          {/* Investment grade */}
          <div
            className="rounded-2xl p-5 flex items-center gap-4"
            style={{ background: CARD_BG, border: `1px solid ${BORDER}` }}
          >
            <div
              className="w-16 h-16 rounded-xl flex items-center justify-center text-2xl font-bold flex-shrink-0"
              style={{
                background: `${gradeColor(result.investment_grade)}22`,
                border: `2px solid ${gradeColor(result.investment_grade)}`,
                color: gradeColor(result.investment_grade),
              }}
            >
              {result.investment_grade}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <Star size={14} color={GOLD} fill={GOLD} />
                <span className="text-sm font-semibold" style={{ color: '#d1d5db' }}>
                  דירוג השקעה
                </span>
              </div>
              <p className="text-sm mt-1" style={{ color: '#9ca3af' }}>
                {result.investment_reasoning}
              </p>
            </div>
            <div className="flex flex-col items-center gap-1 flex-shrink-0">
              {result.price_trend === 'rising' && <TrendingUp size={24} color="#22c55e" />}
              {result.price_trend === 'falling' && <TrendingDown size={24} color="#ef4444" />}
              {result.price_trend === 'stable' && <Minus size={24} color={GOLD} />}
              <span className="text-xs" style={{ color: '#6b7280' }}>
                {result.price_trend === 'rising' ? 'עולה' : result.price_trend === 'falling' ? 'יורד' : 'יציב'}
              </span>
            </div>
          </div>

          {/* 3c. Specs Grid */}
          <div>
            <h3 className="text-sm font-semibold mb-3" style={{ color: '#9ca3af' }}>
              מפרט טכני
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'קוטר קייס', value: result.case_size_mm ? `${result.case_size_mm} מ"מ` : null },
                { label: 'עובי קייס', value: result.case_thickness_mm ? `${result.case_thickness_mm} מ"מ` : null },
                { label: 'רוחב אוזניות', value: result.lug_width_mm ? `${result.lug_width_mm} מ"מ` : null },
                { label: 'חומר קייס', value: result.case_material },
                { label: 'תנועה', value: result.movement },
                { label: 'עתודת כוח', value: result.power_reserve_hours ? `${result.power_reserve_hours} שעות` : null },
                { label: 'עמידות למים', value: result.water_resistance_m ? `${result.water_resistance_m} מ\'` : null },
                { label: 'קריסטל', value: result.crystal },
                { label: 'צמיד', value: result.bracelet },
                { label: 'אבזם', value: result.clasp },
                { label: 'צבע ציפוי', value: result.dial_color },
                { label: 'לוח', value: result.dial_description },
                { label: 'לוח הרים', value: result.bezel },
                { label: 'מחיר קמעונאי', value: result.retail_price_usd ? fmt$(result.retail_price_usd) : null },
              ].filter((s) => s.value).map(({ label, value }) => (
                <div
                  key={label}
                  className="rounded-xl p-3"
                  style={{ background: '#0d1117', border: `1px solid ${BORDER}` }}
                >
                  <p className="text-xs mb-0.5" style={{ color: '#6b7280' }}>{label}</p>
                  <p className="text-sm font-medium" style={{ color: '#d1d5db' }}>{value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* 3c-2. Year & Vintage Significance */}
          {(result.production_year_range || result.year_significance_note || result.known_variants_by_year) && (
            <div
              className="rounded-2xl p-5 space-y-3"
              style={{ background: CARD_BG, border: '1px solid rgba(212,175,55,0.35)' }}
            >
              <div className="flex items-center gap-2 mb-1">
                <span style={{ fontSize: 16 }}>🗓️</span>
                <h3 className="font-semibold text-sm" style={{ color: GOLD }}>שנה ווריאנטים</h3>
                {result.production_year_range && (
                  <span
                    className="text-xs px-2 py-0.5 rounded-full"
                    style={{ background: 'rgba(212,175,55,0.12)', color: GOLD, border: '1px solid rgba(212,175,55,0.3)' }}
                  >
                    {result.production_year_range}
                  </span>
                )}
              </div>

              {result.year_significance_note && (
                <div className="rounded-xl p-3" style={{ background: '#0d1117' }}>
                  <p className="text-xs mb-1" style={{ color: '#6b7280' }}>משמעות שנת הייצור</p>
                  <p className="text-sm leading-relaxed" style={{ color: '#d1d5db' }}>
                    {result.year_significance_note}
                  </p>
                </div>
              )}

              {result.known_variants_by_year && (
                <div className="rounded-xl p-3" style={{ background: '#0d1117' }}>
                  <p className="text-xs mb-1" style={{ color: '#6b7280' }}>וריאנטים ידועים לפי שנה</p>
                  <p className="text-sm leading-relaxed" style={{ color: '#d1d5db' }}>
                    {result.known_variants_by_year}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* 3d. Investment Analysis */}
          <div
            className="rounded-2xl p-5 space-y-3"
            style={{ background: CARD_BG, border: `1px solid ${BORDER}` }}
          >
            <div className="flex items-center gap-2 mb-1">
              <DollarSign size={16} color={GOLD} />
              <h3 className="font-semibold" style={{ color: GOLD }}>ניתוח השקעה</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="rounded-xl p-3" style={{ background: '#0d1117' }}>
                <p className="text-xs mb-1" style={{ color: '#6b7280' }}>מגמת מחיר</p>
                <div className="flex items-center gap-1">
                  {result.price_trend === 'rising' && <TrendingUp size={14} color="#22c55e" />}
                  {result.price_trend === 'falling' && <TrendingDown size={14} color="#ef4444" />}
                  {result.price_trend === 'stable' && <Minus size={14} color={GOLD} />}
                  <p className="text-sm font-medium" style={{ color: '#d1d5db' }}>{result.price_trend_note}</p>
                </div>
              </div>
              <div className="rounded-xl p-3" style={{ background: '#0d1117' }}>
                <p className="text-xs mb-1" style={{ color: '#6b7280' }}>עיתוי לרכישה</p>
                <p className="text-sm font-medium" style={{ color: '#d1d5db' }}>{result.best_time_to_buy}</p>
              </div>
              <div className="rounded-xl p-3" style={{ background: '#0d1117' }}>
                <p className="text-xs mb-1" style={{ color: '#6b7280' }}>פרמיית קופסה + תעודות</p>
                <p className="text-sm font-medium" style={{ color: GOLD }}>{result.box_papers_premium}</p>
              </div>
            </div>
            {result.availability && (
              <div className="flex items-start gap-2 rounded-xl p-3" style={{ background: '#0d1117' }}>
                <Info size={14} color="#6b7280" className="flex-shrink-0 mt-0.5" />
                <p className="text-sm" style={{ color: '#9ca3af' }}>{result.availability}</p>
              </div>
            )}
          </div>

          {/* 3e. Authentication Guide */}
          <div
            className="rounded-2xl overflow-hidden"
            style={{ border: `1px solid ${BORDER}` }}
          >
            <button
              onClick={() => setAuthOpen(!authOpen)}
              className="w-full px-5 py-4 flex items-center justify-between transition-all hover:opacity-80"
              style={{ background: CARD_BG }}
            >
              <div className="flex items-center gap-2">
                <ShieldCheck size={16} color={GOLD} />
                <span className="font-semibold" style={{ color: GOLD }}>מדריך אימות</span>
              </div>
              {authOpen ? <ChevronUp size={16} color="#9ca3af" /> : <ChevronDown size={16} color="#9ca3af" />}
            </button>
            {authOpen && (
              <div className="px-5 pb-5 space-y-4" style={{ background: CARD_BG }}>
                {result.authentication_tips.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold mb-2" style={{ color: '#22c55e' }}>
                      נקודות בדיקה
                    </p>
                    <ul className="space-y-2">
                      {result.authentication_tips.map((tip, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm" style={{ color: '#d1d5db' }}>
                          <ShieldCheck size={13} color="#22c55e" className="flex-shrink-0 mt-0.5" />
                          {tip}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {result.red_flags.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold mb-2" style={{ color: '#ef4444' }}>
                      דגלים אדומים
                    </p>
                    <ul className="space-y-2">
                      {result.red_flags.map((flag, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm" style={{ color: '#d1d5db' }}>
                          <AlertTriangle size={13} color="#ef4444" className="flex-shrink-0 mt-0.5" />
                          {flag}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 3f. Similar Models */}
          {result.similar_models.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-3" style={{ color: '#9ca3af' }}>
                דגמים דומים
              </h3>
              <div className="flex gap-3 overflow-x-auto pb-2">
                {result.similar_models.map((m) => (
                  <div
                    key={m.reference}
                    className="rounded-xl p-4 flex-shrink-0 min-w-[160px] cursor-pointer transition-all hover:opacity-80"
                    style={{ background: CARD_BG, border: `1px solid ${BORDER}` }}
                    onClick={() => setQuery(m.reference)}
                  >
                    <p className="font-mono text-sm font-bold" style={{ color: GOLD }}>
                      {m.reference}
                    </p>
                    {m.nickname && (
                      <p className="text-xs mt-0.5" style={{ color: '#9ca3af' }}>
                        "{m.nickname}"
                      </p>
                    )}
                    <p className="text-xs mt-1.5" style={{ color: '#6b7280' }}>{m.note}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 3g. Collector Notes */}
          {(result.collector_notes || result.historical_significance) && (
            <div
              className="rounded-2xl overflow-hidden"
              style={{ border: `1px solid ${BORDER}` }}
            >
              <button
                onClick={() => setNotesOpen(!notesOpen)}
                className="w-full px-5 py-4 flex items-center justify-between transition-all hover:opacity-80"
                style={{ background: CARD_BG }}
              >
                <div className="flex items-center gap-2">
                  <Info size={16} color="#9ca3af" />
                  <span className="font-semibold" style={{ color: '#d1d5db' }}>הערות קולקטורים</span>
                </div>
                {notesOpen ? <ChevronUp size={16} color="#9ca3af" /> : <ChevronDown size={16} color="#9ca3af" />}
              </button>
              {notesOpen && (
                <div className="px-5 pb-5 space-y-3" style={{ background: CARD_BG }}>
                  {result.collector_notes && (
                    <p className="text-sm leading-relaxed" style={{ color: '#d1d5db' }}>
                      {result.collector_notes}
                    </p>
                  )}
                  {result.historical_significance && (
                    <div className="rounded-xl p-3" style={{ background: '#0d1117' }}>
                      <p className="text-xs mb-1" style={{ color: '#6b7280' }}>משמעות היסטורית</p>
                      <p className="text-sm" style={{ color: '#9ca3af' }}>
                        {result.historical_significance}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Section 4: Action buttons */}
          <div className="flex flex-wrap gap-3 pt-2">
            <button
              onClick={() => {
                const noteLines: string[] = []
                if (result.dial_description) noteLines.push(`לוח: ${result.dial_description}`)
                if (result.bezel) noteLines.push(`לוח הרים: ${result.bezel}`)
                if (result.bracelet) noteLines.push(`צמיד: ${result.bracelet}`)
                if (result.case_material) noteLines.push(`קייס: ${result.case_material}`)
                if (result.movement) noteLines.push(`מנגנון: ${result.movement}`)
                if (result.crystal) noteLines.push(`קריסטל: ${result.crystal}`)
                if (result.power_reserve_hours) noteLines.push(`עתודת כוח: ${result.power_reserve_hours} שעות`)
                if (result.water_resistance_m) noteLines.push(`עמידות למים: ${result.water_resistance_m} מ'`)
                if (result.collector_notes) noteLines.push(`\nהערות: ${result.collector_notes}`)

                navigate('/inventory/add', {
                  state: {
                    prefill: {
                      brand: result.brand,
                      model: result.model,
                      reference: result.reference,
                      year: result.year_introduced?.toString() || '',
                      notes: noteLines.join('\n'),
                      asking_price: (
                        result.market_values.excellent_no_papers ??
                        result.market_values.excellent_with_papers ??
                        ''
                      ).toString(),
                      price_currency: 'USD',
                    },
                  },
                })
              }}
              className="flex-1 py-3 rounded-xl font-semibold transition-all hover:opacity-80 flex items-center justify-center gap-2"
              style={{
                background: 'linear-gradient(135deg, #d4af37, #b8962e)',
                color: NAVY,
                minWidth: '160px',
              }}
            >
              הוסף למלאי
            </button>

            {/* Report button (feature 3) */}
            <button
              onClick={() => generateReport(result, displayImage)}
              className="flex-1 py-3 rounded-xl font-semibold transition-all hover:opacity-80 flex items-center justify-center gap-2"
              style={{
                background: '#1f2937',
                color: '#d1d5db',
                border: `1px solid ${BORDER}`,
                minWidth: '120px',
              }}
            >
              📄 דוח
            </button>

            <button
              onClick={() =>
                navigate('/price-scout', {
                  state: { query: `${result.brand} ${result.model} ${result.reference}`.trim() },
                })
              }
              className="flex-1 py-3 rounded-xl font-semibold transition-all hover:opacity-80 flex items-center justify-center gap-2"
              style={{
                background: '#1f2937',
                color: '#d1d5db',
                border: `1px solid ${BORDER}`,
                minWidth: '160px',
              }}
            >
              חפש מחיר בשוק
            </button>
          </div>

          {/* Clear cache links */}
          <div className="flex justify-end gap-4 pt-1">
            <button
              onClick={() => {
                clearAllMktCache()
                if (result) fetchLiveMarket(result.brand, result.model, result.reference, true)
              }}
              className="text-xs transition-all hover:opacity-80"
              style={{ color: '#4b5563', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              נקה cache מחירים
            </button>
            <button
              onClick={() => {
                clearWatchCache()
              }}
              className="text-xs transition-all hover:opacity-80"
              style={{ color: '#4b5563', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              נקה שמור
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
