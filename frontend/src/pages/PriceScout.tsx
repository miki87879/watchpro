import { useState, useEffect } from 'react'
import { Search, Star, Trash2, Bell, BellOff, ExternalLink, Filter, RefreshCw, TrendingDown, Globe, Watch } from 'lucide-react'
import api from '../api/client'
import toast from 'react-hot-toast'
import { useCurrency } from '../context/CurrencyContext'
import CurrencySelector from '../components/CurrencySelector'

interface SearchResult {
  title: string
  price: number | null
  price_str: string
  currency: string
  url: string
  source: string
  source_icon: string
  seller: string
  location: string
  condition: string
  image_url: string
  posted_date: string
  description: string
}

interface SourceStat {
  count: number
  error: string | null
}

interface SearchResponse {
  query: string
  total_found: number
  sources_searched: number
  source_stats: Record<string, SourceStat>
  results: SearchResult[]
}

interface SavedListing {
  id: number
  brand: string
  model: string
  price: number | null
  url: string
  source: string
  notes: string
  saved_at: string
}

interface PriceAlert {
  id: number
  brand: string
  model: string
  reference: string | null
  target_price: number
  active: boolean
}

interface Source {
  key: string
  name: string
  icon: string
  type: string
}

interface BlockedSource {
  key: string
  name: string
  icon: string
  url_template: string
  reason: string
}

const SOURCE_COLORS: Record<string, string> = {
  'Chrono24': 'bg-blue-900 text-blue-300 border-blue-700',
  'eBay': 'bg-yellow-900 text-yellow-300 border-yellow-700',
  'Bob\'s Watches': 'bg-purple-900 text-purple-300 border-purple-700',
  'Watchfinder': 'bg-red-900 text-red-300 border-red-700',
  'Crown & Caliber': 'bg-green-900 text-green-300 border-green-700',
  'The RealReal': 'bg-pink-900 text-pink-300 border-pink-700',
  'WatchRecon': 'bg-indigo-900 text-indigo-300 border-indigo-700',
  'WatchUSeek': 'bg-cyan-900 text-cyan-300 border-cyan-700',
  'TimeZone Forum': 'bg-orange-900 text-orange-300 border-orange-700',
  'ThePurists Forum': 'bg-teal-900 text-teal-300 border-teal-700',
  'Luxury Bazaar': 'bg-amber-900 text-amber-300 border-amber-700',
}

function getSourceColor(source: string) {
  for (const [key, cls] of Object.entries(SOURCE_COLORS)) {
    if (source.startsWith(key) || source.includes(key)) return cls
  }
  if (source.includes('Reddit')) return 'bg-orange-900 text-orange-300 border-orange-700'
  return 'bg-gray-800 text-gray-300 border-gray-600'
}

// Currency symbols for source prices (before conversion)
const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$', EUR: '€', GBP: '£', CHF: 'CHF ', ILS: '₪',
  NOK: 'kr', SEK: 'kr', DKK: 'kr', JPY: '¥', AUD: 'A$', CAD: 'C$',
}

function formatSourcePrice(price: number | null, currency: string, priceStr: string) {
  if (!price && !priceStr) return '—'
  if (priceStr && !price) return priceStr
  const sym = CURRENCY_SYMBOLS[currency] || currency + ' '
  return `${sym}${price?.toLocaleString()}`
}

// ─── Result Card with hover summary ──────────────────────────────────────────
function ResultCard({
  result,
  onSave,
  convertPrice,
}: {
  result: SearchResult
  onSave: () => void
  convertPrice: (amount: number | null | undefined, src?: string) => string
}) {
  const [imgError, setImgError] = useState(false)
  const [hovered, setHovered] = useState(false)

  const priceFormatted = result.price
    ? convertPrice(result.price, result.currency)
    : result.price_str || '—'

  const srcPrice = result.price
    ? formatSourcePrice(result.price, result.currency, result.price_str)
    : result.price_str || '—'

  return (
    <div
      className="bg-[#111827] border border-[#1f2937] rounded-xl overflow-hidden hover:border-[#d4af37]/40 transition-all group relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Image area — always 160px tall */}
      <div className="h-40 overflow-hidden bg-[#0a0e1a] flex items-center justify-center relative">
        {!imgError && result.image_url ? (
          <img
            src={result.image_url}
            alt={result.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            onError={() => setImgError(true)}
            referrerPolicy="no-referrer"
            crossOrigin="anonymous"
          />
        ) : (
          <div className="flex flex-col items-center gap-2 opacity-20">
            <Watch size={36} color="#d4af37" />
            <span className="text-xs text-gray-500">{result.source_icon}</span>
          </div>
        )}
        {/* Source badge overlay */}
        <span
          className="absolute top-2 right-2 text-xs px-2 py-0.5 rounded-full"
          style={{ background: 'rgba(0,0,0,0.7)', color: '#d4af37', border: '1px solid rgba(212,175,55,0.3)' }}
        >
          {result.source_icon} {result.source.split(' ')[0]}
        </span>
      </div>

      {/* Hover quick-summary overlay */}
      {hovered && (
        <div
          className="absolute inset-0 rounded-xl flex flex-col justify-end p-3 pointer-events-none"
          style={{
            background: 'linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.7) 50%, transparent 100%)',
            zIndex: 10,
          }}
        >
          <p className="text-white text-sm font-semibold leading-tight mb-1 line-clamp-2">{result.title}</p>
          <div className="flex items-center justify-between">
            <span className="text-xl font-bold" style={{ color: '#d4af37' }}>{priceFormatted}</span>
            {priceFormatted !== srcPrice && (
              <span className="text-xs" style={{ color: '#6b7280' }}>{srcPrice}</span>
            )}
          </div>
          <div className="flex gap-2 mt-1 flex-wrap">
            {result.condition && (
              <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.1)', color: '#9ca3af' }}>
                {result.condition}
              </span>
            )}
            {result.location && <span className="text-xs" style={{ color: '#6b7280' }}>📍 {result.location}</span>}
            {result.posted_date && <span className="text-xs" style={{ color: '#6b7280' }}>📅 {result.posted_date}</span>}
          </div>
          {result.description && (
            <p className="text-xs mt-1 line-clamp-2" style={{ color: '#9ca3af' }}>{result.description}</p>
          )}
        </div>
      )}

      <div className="p-4">
        {/* Title */}
        <h3 className="font-semibold text-white text-sm leading-tight mb-2 line-clamp-2">
          {result.title}
        </h3>

        {/* Meta */}
        <div className="flex flex-wrap gap-1.5 text-xs text-gray-400 mb-3">
          {result.condition && (
            <span className="bg-[#1f2937] px-2 py-0.5 rounded">{result.condition}</span>
          )}
          {result.location && <span>📍 {result.location}</span>}
          {result.seller && <span>👤 {result.seller}</span>}
        </div>

        {/* Price + actions */}
        <div className="flex items-center justify-between">
          <div>
            <div className={`text-xl font-bold ${result.price ? 'text-[#d4af37]' : 'text-gray-500'}`}>
              {priceFormatted}
            </div>
            {priceFormatted !== srcPrice && result.price && (
              <div className="text-xs" style={{ color: '#6b7280' }}>{srcPrice}</div>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onSave}
              className="p-2 rounded-lg bg-[#1f2937] text-gray-400 hover:text-[#d4af37] hover:bg-[#d4af37]/10 transition-colors"
              title="שמור"
            >
              <Star className="w-4 h-4" />
            </button>
            <a
              href={result.url}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-lg bg-[#1f2937] text-gray-400 hover:text-blue-400 hover:bg-blue-400/10 transition-colors"
              title="פתח קישור"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function PriceScout() {
  const { formatPrice: convertPrice } = useCurrency()
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [searchData, setSearchData] = useState<SearchResponse | null>(null)
  const [savedListings, setSavedListings] = useState<SavedListing[]>([])
  const [alerts, setAlerts] = useState<PriceAlert[]>([])
  const [allSources, setAllSources] = useState<Source[]>([])
  const [blockedSources, setBlockedSources] = useState<BlockedSource[]>([])
  const [selectedSources, setSelectedSources] = useState<string[]>([])
  const [filterSource, setFilterSource] = useState('all')
  const [sortBy, setSortBy] = useState<'price' | 'source'>('price')
  const [activeTab, setActiveTab] = useState<'results' | 'saved' | 'alerts'>('results')
  const [showSourceFilter, setShowSourceFilter] = useState(false)
  const [newAlert, setNewAlert] = useState({ brand: '', model: '', reference: '', target_price: '' })

  useEffect(() => {
    loadSaved()
    loadAlerts()
    loadSources()
  }, [])

  async function loadSources() {
    try {
      const r = await api.get('/api/price-scout/sources')
      setAllSources(r.data.sources)
      setBlockedSources(r.data.blocked || [])
    } catch {}
  }

  async function loadSaved() {
    try {
      const r = await api.get('/api/price-scout/saved')
      setSavedListings(r.data)
    } catch {}
  }

  async function loadAlerts() {
    try {
      const r = await api.get('/api/price-scout/alerts')
      setAlerts(r.data)
    } catch {}
  }

  async function doSearch() {
    if (!query.trim()) return
    setLoading(true)
    setSearchData(null)
    setActiveTab('results')
    try {
      const src = selectedSources.length > 0 ? selectedSources.join(',') : 'all'
      const r = await api.get('/api/price-scout/search', {
        params: { query, sources: src, sort_by: sortBy, max_results: 150 }
      })
      setSearchData(r.data)
      const found = r.data.total_found
      toast.success(`נמצאו ${found} תוצאות מ-${r.data.sources_searched} מקורות!`)
    } catch (err: any) {
      toast.error('שגיאה בחיפוש')
    }
    setLoading(false)
  }

  async function saveListing(result: SearchResult) {
    try {
      await api.post('/api/price-scout/saved', {
        model: result.title,
        price: result.price,
        url: result.url,
        source: result.source,
      })
      toast.success('נשמר! ⭐')
      loadSaved()
    } catch {
      toast.error('שגיאה בשמירה')
    }
  }

  async function deleteSaved(id: number) {
    try {
      await api.delete(`/api/price-scout/saved/${id}`)
      loadSaved()
      toast.success('הוסר')
    } catch {}
  }

  async function createAlert() {
    if (!newAlert.brand || !newAlert.model || !newAlert.target_price) {
      toast.error('מלא מותג, דגם ומחיר יעד')
      return
    }
    try {
      await api.post('/api/price-scout/alerts', {
        ...newAlert,
        target_price: parseFloat(newAlert.target_price),
      })
      setNewAlert({ brand: '', model: '', reference: '', target_price: '' })
      loadAlerts()
      toast.success('התראה נוצרה!')
    } catch {
      toast.error('שגיאה ביצירת התראה')
    }
  }

  async function deleteAlert(id: number) {
    try {
      await api.delete(`/api/price-scout/alerts/${id}`)
      loadAlerts()
      toast.success('התראה הוסרה')
    } catch {}
  }

  const results = searchData?.results || []
  const filteredResults = filterSource === 'all'
    ? results
    : results.filter(r => r.source.includes(filterSource))

  const sourceBreakdown = results.reduce((acc, r) => {
    const s = r.source.split(' ')[0]
    acc[s] = (acc[s] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  const cheapest = results.filter(r => r.price).sort((a, b) => (a.price || 0) - (b.price || 0))[0]

  function toggleSource(key: string) {
    setSelectedSources(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    )
  }

  return (
    <div className="p-6 min-h-screen" dir="rtl">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-white mb-1">🔍 איתור מחירים</h1>
          <p className="text-gray-400">חיפוש בו-זמני ב-7 מקורות פעילים | Reddit · Kleinanzeigen 🇩🇪 · Marktplaats 🇳🇱 · 2dehands 🇧🇪 · Blocket 🇸🇪 · Finn.no 🇳🇴 · ועוד</p>
        </div>
        <CurrencySelector />
      </div>

      {/* Search Bar */}
      <div className="bg-[#111827] border border-[#1f2937] rounded-2xl p-5 mb-5">
        <div className="flex gap-3 mb-4">
          <div className="flex-1 relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && doSearch()}
              placeholder="חפש לפי דגם, מספר רפרנס... (לדוג׳: Rolex Submariner 126610)"
              className="w-full bg-[#1f2937] border border-[#374151] rounded-xl py-3 pr-10 pl-4 text-white placeholder-gray-500 focus:outline-none focus:border-[#d4af37] transition-colors text-right"
            />
          </div>
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as any)}
            className="bg-[#1f2937] border border-[#374151] rounded-xl px-4 text-gray-300 focus:outline-none focus:border-[#d4af37]"
          >
            <option value="price">מיון: מחיר</option>
            <option value="source">מיון: מקור</option>
          </select>
          <button
            onClick={() => setShowSourceFilter(!showSourceFilter)}
            className={`flex items-center gap-2 px-4 py-3 rounded-xl border transition-colors ${
              selectedSources.length > 0
                ? 'bg-[#d4af37]/20 border-[#d4af37] text-[#d4af37]'
                : 'border-[#374151] text-gray-400 hover:border-[#d4af37] hover:text-[#d4af37]'
            }`}
          >
            <Filter className="w-4 h-4" />
            {selectedSources.length > 0 ? `${selectedSources.length} מקורות` : 'מקורות'}
          </button>
          <button
            onClick={doSearch}
            disabled={loading || !query.trim()}
            className="bg-[#d4af37] text-black font-bold px-8 py-3 rounded-xl hover:bg-[#e8c547] transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            {loading ? 'מחפש...' : 'חפש'}
          </button>
        </div>

        {/* Source Filter Panel */}
        {showSourceFilter && (
          <div className="pt-4 border-t border-[#1f2937]">
            <p className="text-sm text-gray-400 mb-3">
              בחר מקורות (ריק = כל המקורות):
            </p>
            <div className="flex flex-wrap gap-2">
              {allSources.map(src => (
                <button
                  key={src.key}
                  onClick={() => toggleSource(src.key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border transition-all ${
                    selectedSources.includes(src.key)
                      ? 'bg-[#d4af37] text-black border-[#d4af37] font-semibold'
                      : 'bg-[#1f2937] text-gray-300 border-[#374151] hover:border-[#d4af37]'
                  }`}
                >
                  <span>{src.icon}</span>
                  <span>{src.name}</span>
                  <span className="text-xs opacity-60">({src.type})</span>
                </button>
              ))}
            </div>
            {selectedSources.length > 0 && (
              <button
                onClick={() => setSelectedSources([])}
                className="mt-2 text-xs text-gray-500 hover:text-gray-300 underline"
              >
                נקה בחירה
              </button>
            )}
          </div>
        )}
      </div>

      {/* Stats bar (after search) */}
      {searchData && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          <div className="bg-[#111827] border border-[#1f2937] rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-[#d4af37]">{searchData.total_found}</div>
            <div className="text-xs text-gray-400 mt-1">תוצאות סה"כ</div>
          </div>
          <div className="bg-[#111827] border border-[#1f2937] rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-white">{searchData.sources_searched}</div>
            <div className="text-xs text-gray-400 mt-1">מקורות נסרקו</div>
          </div>
          {cheapest && (
            <div className="bg-green-900/30 border border-green-700/50 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-green-400">
                {formatSourcePrice(cheapest.price, cheapest.currency, cheapest.price_str)}
              </div>
              <div className="text-xs text-gray-400 mt-1">הזול ביותר ({cheapest.source})</div>
            </div>
          )}
          <div className="bg-[#111827] border border-[#1f2937] rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-blue-400">
              {Object.values(searchData.source_stats).filter(s => s.count > 0).length}
            </div>
            <div className="text-xs text-gray-400 mt-1">מקורות עם תוצאות</div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-5">
        {[
          { key: 'results', label: `תוצאות${searchData ? ` (${filteredResults.length})` : ''}` },
          { key: 'saved',   label: `שמורים (${savedListings.length})` },
          { key: 'alerts',  label: `התראות (${alerts.length})` },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as any)}
            className={`px-5 py-2.5 rounded-xl font-medium transition-all ${
              activeTab === tab.key
                ? 'bg-[#d4af37] text-black'
                : 'bg-[#111827] text-gray-400 border border-[#1f2937] hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── RESULTS TAB ───────────────────────────────────────────────── */}
      {activeTab === 'results' && (
        <>
          {loading && (
            <div className="text-center py-20">
              <RefreshCw className="w-10 h-10 animate-spin text-[#d4af37] mx-auto mb-4" />
              <p className="text-white text-lg font-semibold">מחפש ב-7 מקורות במקביל...</p>
              <p className="text-gray-400 mt-2">Reddit · Kleinanzeigen 🇩🇪 · Marktplaats 🇳🇱 · 2dehands 🇧🇪 · Blocket 🇸🇪 · Finn.no 🇳🇴 · ועוד</p>
            </div>
          )}

          {!loading && !searchData && (
            <div className="text-center py-24">
              <Globe className="w-16 h-16 text-[#d4af37] mx-auto mb-4 opacity-60" />
              <h2 className="text-xl font-semibold text-white mb-2">חפש שעון בכל העולם</h2>
              <p className="text-gray-500 max-w-md mx-auto">
                המנוע מחפש בו-זמנית ב-7 מקורות: Reddit (15 סאבים), Kleinanzeigen 🇩🇪, Marktplaats 🇳🇱, 2dehands 🇧🇪, Blocket 🇸🇪, Finn.no 🇳🇴, ועוד
              </p>
              <div className="flex flex-wrap justify-center gap-2 mt-6">
                {['Rolex Submariner', 'Patek 5711', 'AP Royal Oak 15500', 'Daytona 116500'].map(q => (
                  <button
                    key={q}
                    onClick={() => { setQuery(q); }}
                    className="bg-[#1f2937] border border-[#374151] text-gray-300 px-4 py-2 rounded-full text-sm hover:border-[#d4af37] hover:text-[#d4af37] transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {!loading && searchData && (
            <>
              {/* Source breakdown */}
              <div className="bg-[#111827] border border-[#1f2937] rounded-xl p-4 mb-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-300">תוצאות לפי מקור</h3>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setFilterSource('all')}
                      className={`text-xs px-2 py-1 rounded ${filterSource === 'all' ? 'bg-[#d4af37] text-black' : 'text-gray-400 hover:text-white'}`}
                    >
                      הכל
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(searchData.source_stats).map(([name, stat]) => (
                    <button
                      key={name}
                      onClick={() => setFilterSource(filterSource === name.split(' ')[0] ? 'all' : name.split(' ')[0])}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border transition-all ${
                        stat.error
                          ? 'border-red-800 text-red-400 opacity-50 cursor-not-allowed'
                          : filterSource === name.split(' ')[0]
                            ? 'bg-[#d4af37] text-black border-[#d4af37]'
                            : getSourceColor(name) + ' border cursor-pointer'
                      }`}
                    >
                      <span className="font-bold">{stat.count}</span>
                      <span>{name}</span>
                      {stat.error && <span title={stat.error}>⚠️</span>}
                    </button>
                  ))}
                </div>
              </div>

              {/* Blocked sources — manual search links */}
              {blockedSources.length > 0 && (
                <div className="bg-[#111827] border border-[#1f2937] rounded-xl p-4 mb-5">
                  <h3 className="text-sm font-semibold text-gray-400 mb-3 flex items-center gap-2">
                    <span>🔒</span>
                    <span>אתרים שחוסמים גישה אוטומטית — חפש ידנית</span>
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {blockedSources.map(src => (
                      <a
                        key={src.key}
                        href={src.url_template.replace('{q}', encodeURIComponent(searchData!.query))}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={src.reason}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border border-[#374151] text-gray-500 hover:border-[#d4af37] hover:text-[#d4af37] transition-all"
                      >
                        <span>{src.icon}</span>
                        <span>{src.name}</span>
                        <ExternalLink className="w-3 h-3 opacity-60" />
                      </a>
                    ))}
                  </div>
                  <p className="text-xs text-gray-600 mt-2">לחץ לפתיחה ישירה באתר המקורי עם אותו חיפוש</p>
                </div>
              )}

              {/* Results grid */}
              {filteredResults.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  לא נמצאו תוצאות עבור "{searchData.query}"
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {filteredResults.map((result, i) => (
                    <ResultCard
                      key={i}
                      result={result}
                      onSave={() => saveListing(result)}
                      convertPrice={convertPrice}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ── SAVED TAB ─────────────────────────────────────────────────── */}
      {activeTab === 'saved' && (
        <div className="bg-[#111827] border border-[#1f2937] rounded-xl overflow-hidden">
          {savedListings.length === 0 ? (
            <div className="text-center py-16 text-gray-500">
              <Star className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>אין מציאות שמורות עדיין</p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#1f2937] text-right">
                  <th className="px-4 py-3 text-xs text-gray-400 font-medium">כותרת</th>
                  <th className="px-4 py-3 text-xs text-gray-400 font-medium">מקור</th>
                  <th className="px-4 py-3 text-xs text-gray-400 font-medium">מחיר</th>
                  <th className="px-4 py-3 text-xs text-gray-400 font-medium">תאריך</th>
                  <th className="px-4 py-3 text-xs text-gray-400 font-medium">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {savedListings.map(item => (
                  <tr key={item.id} className="border-b border-[#1f2937] hover:bg-[#1f2937]/40 transition-colors">
                    <td className="px-4 py-3 text-white text-sm">{item.model || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${getSourceColor(item.source)}`}>
                        {item.source}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[#d4af37] font-bold">
                      {item.price ? `$${item.price.toLocaleString()}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">
                      {new Date(item.saved_at).toLocaleDateString('he-IL')}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <a href={item.url} target="_blank" rel="noopener noreferrer"
                          className="p-1.5 rounded bg-[#1f2937] text-gray-400 hover:text-blue-400 transition-colors">
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                        <button onClick={() => deleteSaved(item.id)}
                          className="p-1.5 rounded bg-[#1f2937] text-gray-400 hover:text-red-400 transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── ALERTS TAB ────────────────────────────────────────────────── */}
      {activeTab === 'alerts' && (
        <div className="space-y-4">
          {/* Create alert */}
          <div className="bg-[#111827] border border-[#1f2937] rounded-xl p-5">
            <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
              <Bell className="w-4 h-4 text-[#d4af37]" /> הוסף התראת מחיר
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <input
                value={newAlert.brand}
                onChange={e => setNewAlert({ ...newAlert, brand: e.target.value })}
                placeholder="מותג (Rolex)"
                className="bg-[#1f2937] border border-[#374151] rounded-lg px-3 py-2 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-[#d4af37]"
              />
              <input
                value={newAlert.model}
                onChange={e => setNewAlert({ ...newAlert, model: e.target.value })}
                placeholder="דגם (Submariner)"
                className="bg-[#1f2937] border border-[#374151] rounded-lg px-3 py-2 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-[#d4af37]"
              />
              <input
                value={newAlert.reference}
                onChange={e => setNewAlert({ ...newAlert, reference: e.target.value })}
                placeholder="רפרנס (126610LN)"
                className="bg-[#1f2937] border border-[#374151] rounded-lg px-3 py-2 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-[#d4af37]"
              />
              <input
                type="number"
                value={newAlert.target_price}
                onChange={e => setNewAlert({ ...newAlert, target_price: e.target.value })}
                placeholder="מחיר יעד ($)"
                className="bg-[#1f2937] border border-[#374151] rounded-lg px-3 py-2 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-[#d4af37]"
              />
            </div>
            <button
              onClick={createAlert}
              className="mt-3 bg-[#d4af37] text-black font-semibold px-6 py-2 rounded-lg hover:bg-[#e8c547] transition-colors text-sm"
            >
              + צור התראה
            </button>
          </div>

          {/* Alert list */}
          {alerts.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <BellOff className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>אין התראות פעילות</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {alerts.map(alert => (
                <div key={alert.id} className="bg-[#111827] border border-[#1f2937] rounded-xl p-4 flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-white">
                      {alert.brand} {alert.model}
                      {alert.reference && <span className="text-gray-400 mr-2 text-sm">({alert.reference})</span>}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <TrendingDown className="w-3.5 h-3.5 text-green-400" />
                      <span className="text-sm text-gray-400">
                        התרע כשמחיר מתחת ל-
                        <span className="text-[#d4af37] font-bold mr-1">${alert.target_price.toLocaleString()}</span>
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => deleteAlert(alert.id)}
                    className="p-2 rounded-lg bg-[#1f2937] text-gray-400 hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
