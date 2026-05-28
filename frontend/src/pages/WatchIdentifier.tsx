import { useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Scan, Upload, X, ChevronDown, ChevronUp,
  TrendingUp, TrendingDown, Minus, ShieldCheck,
  AlertTriangle, Star, DollarSign, Info,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────
interface SimilarModel {
  reference: string
  nickname: string | null
  note: string
}

interface WatchResult {
  brand: string
  model: string
  reference: string
  nickname: string | null
  confidence: number
  year_introduced: number | null
  still_in_production: boolean | null
  serial_year: number | null
  case_material: string | null
  case_size_mm: number | null
  case_thickness_mm: number | null
  lug_width_mm: number | null
  movement: string | null
  power_reserve_hours: number | null
  water_resistance_m: number | null
  crystal: string | null
  bracelet: string | null
  clasp: string | null
  dial_color: string | null
  dial_description: string | null
  bezel: string | null
  retail_price_usd: number | null
  market_values: {
    mint_full_set: number | null
    excellent_with_papers: number | null
    excellent_no_papers: number | null
    good: number | null
    fair: number | null
  }
  investment_grade: 'A+' | 'A' | 'B' | 'C' | 'D'
  investment_reasoning: string
  price_trend: 'rising' | 'stable' | 'falling'
  price_trend_note: string
  best_time_to_buy: string
  authentication_tips: string[]
  red_flags: string[]
  similar_models: SimilarModel[]
  collector_notes: string
  availability: string
  historical_significance: string
  box_papers_premium: string
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

// ─── Component ────────────────────────────────────────────────────────────────
export default function WatchIdentifier() {
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)

  const [query, setQuery] = useState('')
  const [queryType, setQueryType] = useState<'reference' | 'serial' | 'name'>('reference')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<WatchResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [authOpen, setAuthOpen] = useState(false)
  const [notesOpen, setNotesOpen] = useState(false)
  const [dots, setDots] = useState('.')

  const INPUT_MODES = [
    { key: 'reference' as const, label: '# רפרנס', placeholder: 'לדוגמה: 126610LN / 5711/1A / 15500ST / 127235' },
    { key: 'serial'    as const, label: '🔢 סידורי', placeholder: 'לדוגמה: T123456 / G234567 / 2T654321 (Rolex)' },
    { key: 'name'      as const, label: '📝 שם חופשי', placeholder: 'לדוגמה: Rolex Submariner, Patek Nautilus' },
  ]
  const currentMode = INPUT_MODES.find(m => m.key === queryType)!

  // Animated dots for loading
  const startDots = () => {
    let count = 1
    const interval = setInterval(() => {
      count = (count % 3) + 1
      setDots('.'.repeat(count))
    }, 500)
    return interval
  }

  const handleFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('יש להעלות קובץ תמונה בלבד (JPEG, PNG, WebP)')
      return
    }
    setImageFile(file)
    const reader = new FileReader()
    reader.onload = (e) => setImagePreview(e.target?.result as string)
    reader.readAsDataURL(file)
    setError(null)
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [])

  const identify = async () => {
    if (!query.trim() && !imageFile) {
      setError('יש להזין שם שעון או להעלות תמונה')
      return
    }
    setError(null)
    setResult(null)
    setLoading(true)
    const interval = startDots()

    try {
      let imageBase64: string | null = null
      if (imageFile) {
        imageBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result as string)
          reader.onerror = reject
          reader.readAsDataURL(imageFile)
        })
      }

      const payload = {
        query: queryType !== 'serial' ? query.trim() || null : null,
        serial: queryType === 'serial' ? query.trim() || null : null,
        image_base64: imageBase64,
        query_type: query.trim() ? queryType : null,
      }

      const apiBase = import.meta.env.VITE_API_URL ?? ''
      const res = await fetch(`${apiBase}/api/watch-id/identify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }))
        throw new Error(err.detail || `שגיאת שרת ${res.status}`)
      }

      const data: WatchResult = await res.json()
      setResult(data)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.includes('422') || msg.includes('non-JSON')) {
        setError('לא ניתן לזהות את השעון. נסה לספק פרטים מדויקים יותר.')
      } else {
        setError(msg)
      }
    } finally {
      clearInterval(interval)
      setLoading(false)
    }
  }

  const clearImage = () => {
    setImageFile(null)
    setImagePreview(null)
    if (fileRef.current) fileRef.current.value = ''
  }

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
              border: `1px solid ${BORDER}`,
              fontSize: '15px',
            }}
            onFocus={(e) => (e.target.style.borderColor = GOLD)}
            onBlur={(e) => (e.target.style.borderColor = BORDER)}
          />
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
            <div className="flex flex-wrap items-start justify-between gap-4">
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

          {/* 3b. Market Value Grid */}
          <div>
            <h3 className="text-sm font-semibold mb-3" style={{ color: '#9ca3af' }}>
              שווי שוק (USD)
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
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
          </div>

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
              onClick={() =>
                navigate('/inventory/add', {
                  state: {
                    prefill: {
                      brand: result.brand,
                      model: result.model,
                      reference: result.reference,
                    },
                  },
                })
              }
              className="flex-1 py-3 rounded-xl font-semibold transition-all hover:opacity-80 flex items-center justify-center gap-2"
              style={{
                background: 'linear-gradient(135deg, #d4af37, #b8962e)',
                color: NAVY,
                minWidth: '160px',
              }}
            >
              הוסף למלאי
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
        </div>
      )}
    </div>
  )
}
