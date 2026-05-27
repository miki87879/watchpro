import { useState, useEffect } from 'react'
import { RefreshCw, TrendingUp, CheckCircle, AlertCircle, Clock, Globe } from 'lucide-react'
import api from '../api/client'
import { useCurrency } from '../context/CurrencyContext'

interface RatesData {
  base: string
  rates: Record<string, number>
  meta: Record<string, { symbol: string; name: string; flag: string }>
  supported: string[]
  cached_at: number
  source: string
  api_key_active?: boolean
}

// ILS as the base for Israeli perspective
const ILS_FOCUS = ['USD', 'EUR', 'GBP', 'CHF', 'JPY', 'AUD', 'CAD', 'HKD', 'SGD', 'NOK', 'SEK', 'DKK']

export default function ExchangeRates() {
  const [data, setData] = useState<RatesData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [lastFetch, setLastFetch] = useState<Date | null>(null)
  const { selectedCurrency, setSelectedCurrency, formatPrice } = useCurrency()

  useEffect(() => {
    fetchRates()
  }, [])

  async function fetchRates(force = false) {
    if (force) setRefreshing(true)
    else setLoading(true)
    try {
      const res = await api.get('/api/currency/rates', {
        params: force ? { bust: Date.now() } : {},
      })
      setData(res.data)
      setLastFetch(new Date())
    } catch {
      // keep existing data
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  if (loading || !data) {
    return (
      <div className="p-6 flex items-center justify-center h-64">
        <div className="text-center">
          <div className="w-10 h-10 rounded-full border-4 border-t-transparent animate-spin mx-auto mb-3"
            style={{ borderColor: 'rgba(212,175,55,0.3)', borderTopColor: '#d4af37' }} />
          <p className="text-sm" style={{ color: '#6b7280' }}>טוען שערי מטח...</p>
        </div>
      </div>
    )
  }

  const ilsRate = data.rates['ILS'] || 3.7
  const cachedAge = data.cached_at
    ? Math.round((Date.now() / 1000 - data.cached_at) / 60)
    : null

  return (
    <div className="p-6 max-w-5xl mx-auto" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Globe size={24} style={{ color: '#d4af37' }} />
            שערי מטבע חיים
          </h1>
          <p className="text-sm mt-1 flex items-center gap-2" style={{ color: '#6b7280' }}>
            מקור: <span style={{ color: '#9ca3af' }}>{data.source}</span>
            {data.api_key_active ? (
              <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(74,222,128,0.1)', color: '#4ade80' }}>
                🔑 API Key פעיל
              </span>
            ) : (
              <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(245,158,11,0.1)', color: '#f59e0b' }}>
                ⚠ ציבורי — הוסף מפתח API בהגדרות
              </span>
            )}
            · בסיס: USD
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastFetch && (
            <div className="flex items-center gap-1.5 text-xs" style={{ color: '#6b7280' }}>
              <Clock size={12} />
              {cachedAge !== null && cachedAge < 2 ? (
                <span style={{ color: '#4ade80' }}>עדכני ✓</span>
              ) : (
                <span>עודכן לפני {cachedAge} דקות</span>
              )}
            </div>
          )}
          <button
            onClick={() => fetchRates(true)}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all"
            style={{
              background: 'rgba(212,175,55,0.1)',
              border: '1px solid rgba(212,175,55,0.3)',
              color: '#d4af37',
              opacity: refreshing ? 0.6 : 1,
            }}
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
            רענן שערים
          </button>
        </div>
      </div>

      {/* ILS Focus card */}
      <div
        className="rounded-2xl p-5 mb-6"
        style={{
          background: 'linear-gradient(135deg, rgba(212,175,55,0.15) 0%, rgba(20,16,4,0.9) 100%)',
          border: '1px solid rgba(212,175,55,0.4)',
        }}
      >
        <div className="flex items-center gap-2 mb-4">
          <span className="text-2xl">🇮🇱</span>
          <div>
            <p className="font-bold text-white">שקל ישראלי (ILS)</p>
            <p className="text-xs" style={{ color: '#9ca3af' }}>השער שעל פיו עובדת האפליקציה</p>
          </div>
          <div className="mr-auto text-left">
            <p className="text-2xl font-bold" style={{ color: '#d4af37' }}>
              {ilsRate.toFixed(4)}
            </p>
            <p className="text-xs" style={{ color: '#9ca3af' }}>₪ ל-1 USD</p>
          </div>
        </div>
        {/* Quick ILS grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[1000, 5000, 10000, 50000].map((usd) => (
            <div
              key={usd}
              className="rounded-xl p-3 text-center"
              style={{ background: 'rgba(0,0,0,0.3)' }}
            >
              <p className="text-xs mb-1" style={{ color: '#6b7280' }}>${usd.toLocaleString()} USD</p>
              <p className="font-bold text-white">
                ₪{Math.round(usd * ilsRate).toLocaleString()}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* App currency indicator */}
      <div
        className="flex items-center gap-3 rounded-xl p-3 mb-6"
        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
      >
        <CheckCircle size={16} style={{ color: '#4ade80' }} />
        <p className="text-sm" style={{ color: '#9ca3af' }}>
          האפליקציה מציגה כרגע מחירים ב-
          <span style={{ color: '#d4af37', fontWeight: 600 }}>
            {' '}{data.meta[selectedCurrency]?.flag} {selectedCurrency} ({data.meta[selectedCurrency]?.symbol})
          </span>
          {' '}· לשינוי — לחץ על בורר המטבע בתפריט הצד
        </p>
      </div>

      {/* All rates table */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{ background: 'rgba(20,16,4,0.8)', border: '1px solid rgba(212,175,55,0.15)' }}
      >
        <div
          className="flex items-center gap-2 px-5 py-3"
          style={{ borderBottom: '1px solid rgba(212,175,55,0.1)', background: 'rgba(212,175,55,0.05)' }}
        >
          <TrendingUp size={16} style={{ color: '#d4af37' }} />
          <span className="font-semibold text-white text-sm">טבלת שערים מלאה (בסיס: 1 USD)</span>
        </div>

        <table className="w-full">
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              {['מטבע', 'שם', 'שער ל-1 USD', '1,000 USD =', '10,000 USD =', 'הגדר כברירת מחדל'].map((h) => (
                <th key={h} className="px-4 py-3 text-xs font-medium text-right" style={{ color: '#6b7280' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ILS_FOCUS.map((code, i) => {
              const rate = data.rates[code]
              const m = data.meta[code]
              if (!rate || !m) return null
              const isSelected = code === selectedCurrency
              const ilsEquiv = rate / ilsRate  // how many ILS per 1 unit

              return (
                <tr
                  key={code}
                  style={{
                    borderBottom: i < ILS_FOCUS.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                    background: isSelected ? 'rgba(212,175,55,0.06)' : 'transparent',
                  }}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{m.flag}</span>
                      <span className="font-bold text-white text-sm">{code}</span>
                      <span className="text-xs" style={{ color: '#d4af37' }}>{m.symbol}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm" style={{ color: '#9ca3af' }}>{m.name}</td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-white font-medium">{rate.toFixed(4)}</span>
                  </td>
                  <td className="px-4 py-3 text-sm font-mono" style={{ color: '#e5e7eb' }}>
                    {m.symbol}{(1000 * rate).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                  </td>
                  <td className="px-4 py-3 text-sm font-mono" style={{ color: '#d4af37' }}>
                    {m.symbol}{(10000 * rate).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                  </td>
                  <td className="px-4 py-3">
                    {isSelected ? (
                      <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full"
                        style={{ background: 'rgba(212,175,55,0.15)', color: '#d4af37' }}>
                        <CheckCircle size={11} /> פעיל
                      </span>
                    ) : (
                      <button
                        onClick={() => setSelectedCurrency(code)}
                        className="text-xs px-3 py-1 rounded-lg transition-all"
                        style={{ background: 'rgba(255,255,255,0.06)', color: '#9ca3af' }}
                        onMouseEnter={(e) => { (e.target as HTMLButtonElement).style.color = '#d4af37' }}
                        onMouseLeave={(e) => { (e.target as HTMLButtonElement).style.color = '#9ca3af' }}
                      >
                        הגדר
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {/* ILS row special */}
        <div
          className="px-4 py-3 flex items-center justify-between"
          style={{ borderTop: '1px solid rgba(212,175,55,0.15)', background: 'rgba(212,175,55,0.03)' }}
        >
          <div className="flex items-center gap-2">
            <span className="text-xl">🇮🇱</span>
            <span className="font-bold text-white text-sm">ILS</span>
            <span className="text-xs" style={{ color: '#d4af37' }}>₪</span>
            <span className="text-xs ml-2" style={{ color: '#9ca3af' }}>שקל ישראלי</span>
          </div>
          <div className="text-right">
            <span className="font-mono text-white font-medium">{ilsRate.toFixed(4)}</span>
            <span className="text-xs mr-2" style={{ color: '#6b7280' }}>₪ ל-1 USD</span>
          </div>
          <div className="text-sm font-mono" style={{ color: '#e5e7eb' }}>₪{(1000 * ilsRate).toLocaleString('en-US', { maximumFractionDigits: 0 })}</div>
          <div className="text-sm font-mono" style={{ color: '#d4af37' }}>₪{(10000 * ilsRate).toLocaleString('en-US', { maximumFractionDigits: 0 })}</div>
          {selectedCurrency === 'ILS' ? (
            <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full"
              style={{ background: 'rgba(212,175,55,0.15)', color: '#d4af37' }}>
              <CheckCircle size={11} /> פעיל
            </span>
          ) : (
            <button onClick={() => setSelectedCurrency('ILS')}
              className="text-xs px-3 py-1 rounded-lg"
              style={{ background: 'rgba(255,255,255,0.06)', color: '#9ca3af' }}>
              הגדר
            </button>
          )}
        </div>
      </div>

      {/* Disclaimer */}
      <div
        className="flex items-start gap-2 mt-4 p-3 rounded-xl text-xs"
        style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', color: '#6b7280' }}
      >
        <AlertCircle size={13} className="mt-0.5 flex-shrink-0" />
        <p>
          שערי המטבע מתעדכנים אחת לשעה ממקור <strong>open.er-api.com</strong> (חינמי, ללא מפתח API).
          השערים הם לפי <strong>USD כבסיס</strong> ומיועדים לאינדיקציה בלבד — לא לצורכי מסחר.
          לשערים רשמיים השתמש ב<strong>בנק ישראל</strong>.
        </p>
      </div>
    </div>
  )
}
