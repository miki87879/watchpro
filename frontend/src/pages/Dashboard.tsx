import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Package,
  TrendingUp,
  DollarSign,
  BarChart2,
  Plus,
  Search,
  FileText,
  Watch,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react'
import api from '../api/client'
import { Watch as WatchType, FinancialSummary } from '../types'

const fmt = (n: number) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

const conditionLabel: Record<string, string> = {
  mint: 'מושלם',
  excellent: 'מצוין',
  good: 'טוב',
  fair: 'סביר',
}

const statusLabel: Record<string, string> = {
  available: 'זמין',
  sold: 'נמכר',
  reserved: 'שמור',
}

const statusColors: Record<string, string> = {
  available: '#10b981',
  sold: '#ef4444',
  reserved: '#f59e0b',
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [watches, setWatches] = useState<WatchType[]>([])
  const [summary, setSummary] = useState<FinancialSummary | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.get('/api/inventory'),
      api.get('/api/finance/summary'),
    ]).then(([wRes, sRes]) => {
      setWatches(wRes.data)
      setSummary(sRes.data)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const availableCount = watches.filter(w => w.status === 'available').length
  const portfolioValue = watches
    .filter(w => w.status === 'available')
    .reduce((sum, w) => sum + (w.asking_price || 0), 0)

  const recentWatches = [...watches].slice(0, 5)

  const stats = [
    {
      label: 'סה"כ מלאי',
      value: watches.length,
      icon: Package,
      color: '#6366f1',
      bg: 'rgba(99,102,241,0.1)',
      suffix: ' שעונים',
    },
    {
      label: 'זמינים למכירה',
      value: availableCount,
      icon: Watch,
      color: '#10b981',
      bg: 'rgba(16,185,129,0.1)',
      suffix: ' שעונים',
    },
    {
      label: 'שווי תיק',
      value: fmt(portfolioValue),
      icon: DollarSign,
      color: '#d4af37',
      bg: 'rgba(212,175,55,0.1)',
      isFormatted: true,
    },
    {
      label: 'רווח כולל',
      value: summary ? fmt(summary.total_profit) : '—',
      icon: TrendingUp,
      color: summary && summary.total_profit >= 0 ? '#10b981' : '#ef4444',
      bg: summary && summary.total_profit >= 0 ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
      isFormatted: true,
      change: summary?.total_profit,
    },
  ]

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">דשבורד</h1>
          <p className="text-gray-400 text-sm mt-1">ברוך הבא ל-Watch Pro</p>
        </div>
        <button
          onClick={() => navigate('/inventory/add')}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-opacity hover:opacity-90"
          style={{ background: 'linear-gradient(135deg, #d4af37, #b8962e)', color: '#0a0e1a' }}
        >
          <Plus size={16} />
          הוסף שעון
        </button>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => {
          const Icon = stat.icon
          return (
            <div
              key={stat.label}
              className="rounded-xl p-5"
              style={{ background: '#111827', border: '1px solid #1f2937' }}
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-gray-400 text-sm font-medium">{stat.label}</span>
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: stat.bg }}
                >
                  <Icon size={18} color={stat.color} />
                </div>
              </div>
              <div className="text-2xl font-bold text-white">
                {stat.isFormatted ? stat.value : `${stat.value}${stat.suffix || ''}`}
              </div>
              {stat.change !== undefined && (
                <div
                  className="flex items-center gap-1 mt-1 text-xs font-medium"
                  style={{ color: stat.change >= 0 ? '#10b981' : '#ef4444' }}
                >
                  {stat.change >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                  {stat.change >= 0 ? 'רווח' : 'הפסד'}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          {
            label: 'הוסף שעון חדש',
            desc: 'הוסף שעון למלאי',
            icon: Plus,
            color: '#d4af37',
            bg: 'rgba(212,175,55,0.1)',
            path: '/inventory/add',
          },
          {
            label: 'חפש מחירים',
            desc: 'סרוק את Chrono24',
            icon: Search,
            color: '#6366f1',
            bg: 'rgba(99,102,241,0.1)',
            path: '/price-scout',
          },
          {
            label: 'צור מודעה',
            desc: 'AI בעברית ואנגלית',
            icon: FileText,
            color: '#10b981',
            bg: 'rgba(16,185,129,0.1)',
            path: '/ads',
          },
        ].map((action) => {
          const Icon = action.icon
          return (
            <button
              key={action.label}
              onClick={() => navigate(action.path)}
              className="flex items-center gap-4 p-5 rounded-xl text-right transition-all hover:scale-[1.02]"
              style={{
                background: '#111827',
                border: '1px solid #1f2937',
              }}
            >
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: action.bg }}
              >
                <Icon size={22} color={action.color} />
              </div>
              <div>
                <div className="font-semibold text-white text-sm">{action.label}</div>
                <div className="text-gray-400 text-xs mt-0.5">{action.desc}</div>
              </div>
            </button>
          )
        })}
      </div>

      {/* Recent Watches */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">שעונים אחרונים</h2>
          <button
            onClick={() => navigate('/inventory')}
            className="text-sm font-medium transition-colors"
            style={{ color: '#d4af37' }}
          >
            הצג הכל ←
          </button>
        </div>

        {loading ? (
          <div className="text-center py-12 text-gray-500">טוען...</div>
        ) : recentWatches.length === 0 ? (
          <div
            className="rounded-xl p-8 text-center"
            style={{ background: '#111827', border: '1px solid #1f2937' }}
          >
            <Watch size={40} color="#374151" className="mx-auto mb-3" />
            <p className="text-gray-400">אין שעונים במלאי עדיין</p>
            <button
              onClick={() => navigate('/inventory/add')}
              className="mt-4 px-6 py-2 rounded-xl text-sm font-semibold"
              style={{ background: 'linear-gradient(135deg, #d4af37, #b8962e)', color: '#0a0e1a' }}
            >
              הוסף שעון ראשון
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
            {recentWatches.map((watch) => (
              <div
                key={watch.id}
                onClick={() => navigate(`/inventory/${watch.id}`)}
                className="rounded-xl overflow-hidden cursor-pointer transition-all hover:scale-[1.02]"
                style={{ background: '#111827', border: '1px solid #1f2937' }}
              >
                {/* Photo */}
                <div
                  className="h-36 flex items-center justify-center"
                  style={{ background: '#1f2937' }}
                >
                  {watch.primary_photo ? (
                    <img
                      src={`http://localhost:8000${watch.primary_photo}`}
                      alt={`${watch.brand} ${watch.model}`}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Watch size={36} color="#374151" />
                  )}
                </div>
                {/* Info */}
                <div className="p-3">
                  <div className="text-xs font-medium mb-0.5" style={{ color: '#d4af37' }}>
                    {watch.brand}
                  </div>
                  <div className="text-sm font-semibold text-white truncate">{watch.model}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{watch.reference}</div>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-sm font-bold text-white">
                      ${watch.asking_price?.toLocaleString()}
                    </span>
                    <span
                      className="text-xs px-2 py-0.5 rounded-full font-medium"
                      style={{
                        color: statusColors[watch.status],
                        background: `${statusColors[watch.status]}18`,
                      }}
                    >
                      {statusLabel[watch.status]}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Financial Snapshot */}
      {summary && (
        <div
          className="rounded-xl p-6"
          style={{ background: '#111827', border: '1px solid #1f2937' }}
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">סיכום פיננסי</h2>
            <button
              onClick={() => navigate('/finance')}
              className="text-sm font-medium"
              style={{ color: '#d4af37' }}
            >
              פרטים נוספים ←
            </button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'סה"כ השקעה', value: fmt(summary.total_invested), color: '#ef4444' },
              { label: 'סה"כ מכירות', value: fmt(summary.total_sales), color: '#10b981' },
              { label: 'רווח ממומש', value: fmt(summary.total_profit), color: summary.total_profit >= 0 ? '#10b981' : '#ef4444' },
              { label: 'שווי תיק לא ממומש', value: fmt(summary.portfolio_value), color: '#d4af37' },
            ].map((item) => (
              <div key={item.label} className="text-center">
                <div className="text-xl font-bold" style={{ color: item.color }}>
                  {item.value}
                </div>
                <div className="text-xs text-gray-400 mt-1">{item.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
