import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search, Watch, Filter, ChevronDown, Package, TrendingUp, Edit2, Eye } from 'lucide-react'
import api from '../api/client'
import { Watch as WatchType } from '../types'
import toast from 'react-hot-toast'
import { useCurrency } from '../context/CurrencyContext'
import CurrencySelector from '../components/CurrencySelector'

const statusLabel: Record<string, string> = {
  available: 'זמין',
  sold: 'נמכר',
  reserved: 'שמור',
}

const statusColors: Record<string, { text: string; bg: string }> = {
  available: { text: '#10b981', bg: 'rgba(16,185,129,0.12)' },
  sold: { text: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
  reserved: { text: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
}

const conditionLabel: Record<string, string> = {
  mint: 'מושלם',
  excellent: 'מצוין',
  good: 'טוב',
  fair: 'סביר',
}

const conditionColors: Record<string, string> = {
  mint: '#a855f7',
  excellent: '#6366f1',
  good: '#3b82f6',
  fair: '#f59e0b',
}

export default function Inventory() {
  const navigate = useNavigate()
  const { formatPrice } = useCurrency()
  const [watches, setWatches] = useState<WatchType[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [brandFilter, setBrandFilter] = useState<string>('')
  const [brands, setBrands] = useState<string[]>([])

  const fetchWatches = () => {
    const params: Record<string, string> = {}
    if (search) params.search = search
    if (statusFilter) params.status = statusFilter
    if (brandFilter) params.brand = brandFilter

    api.get('/api/inventory', { params })
      .then(res => setWatches(res.data))
      .catch(() => toast.error('שגיאה בטעינת המלאי'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    api.get('/api/inventory/brands/list')
      .then(res => setBrands(res.data))
      .catch(() => {})
  }, [])

  useEffect(() => {
    setLoading(true)
    const timer = setTimeout(fetchWatches, 300)
    return () => clearTimeout(timer)
  }, [search, statusFilter, brandFilter])

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">מלאי שעונים</h1>
          <p className="text-gray-400 text-sm mt-1">{watches.length} שעונים סה"כ</p>
        </div>
        <div className="flex items-center gap-3">
          <CurrencySelector />
          <button
            onClick={() => navigate('/inventory/add')}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-opacity hover:opacity-90"
            style={{ background: 'linear-gradient(135deg, #d4af37, #b8962e)', color: '#0a0e1a' }}
          >
            <Plus size={16} />
            הוסף שעון
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-48">
          <Search size={16} color="#6b7280" className="absolute top-1/2 -translate-y-1/2 right-3" />
          <input
            type="text"
            placeholder="חיפוש לפי מותג, דגם, רפרנס..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-4 pr-10 py-2.5 rounded-xl text-sm text-white placeholder-gray-500 outline-none focus:ring-1"
            style={{
              background: '#111827',
              border: '1px solid #1f2937',
              // @ts-ignore
              '--tw-ring-color': '#d4af37',
            }}
          />
        </div>

        {/* Status filter */}
        <div className="flex gap-2">
          {[
            { value: '', label: 'הכל' },
            { value: 'available', label: 'זמין' },
            { value: 'reserved', label: 'שמור' },
            { value: 'sold', label: 'נמכר' },
          ].map(opt => (
            <button
              key={opt.value}
              onClick={() => setStatusFilter(opt.value)}
              className="px-4 py-2 rounded-xl text-sm font-medium transition-all"
              style={
                statusFilter === opt.value
                  ? { background: 'linear-gradient(135deg, #d4af37, #b8962e)', color: '#0a0e1a' }
                  : { background: '#111827', border: '1px solid #1f2937', color: '#9ca3af' }
              }
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Brand filter */}
        {brands.length > 0 && (
          <div className="relative">
            <select
              value={brandFilter}
              onChange={e => setBrandFilter(e.target.value)}
              className="appearance-none pl-8 pr-4 py-2.5 rounded-xl text-sm outline-none cursor-pointer"
              style={{
                background: '#111827',
                border: '1px solid #1f2937',
                color: brandFilter ? '#d4af37' : '#9ca3af',
              }}
            >
              <option value="">כל המותגים</option>
              {brands.map(b => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
            <ChevronDown size={14} color="#6b7280" className="absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        )}
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="rounded-xl h-64 animate-pulse" style={{ background: '#111827' }} />
          ))}
        </div>
      ) : watches.length === 0 ? (
        <div
          className="rounded-xl p-16 text-center"
          style={{ background: '#111827', border: '1px solid #1f2937' }}
        >
          <Watch size={48} color="#374151" className="mx-auto mb-4" />
          <p className="text-gray-400 text-lg mb-2">אין שעונים</p>
          <p className="text-gray-600 text-sm mb-6">
            {search || statusFilter || brandFilter ? 'לא נמצאו שעונים בחיפוש זה' : 'המלאי שלך ריק'}
          </p>
          {!search && !statusFilter && !brandFilter && (
            <button
              onClick={() => navigate('/inventory/add')}
              className="px-6 py-2.5 rounded-xl font-semibold text-sm"
              style={{ background: 'linear-gradient(135deg, #d4af37, #b8962e)', color: '#0a0e1a' }}
            >
              הוסף שעון ראשון
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {watches.map(watch => (
            <WatchCard
              key={watch.id}
              watch={watch}
              onClick={() => navigate(`/inventory/${watch.id}`)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function WatchCard({ watch, onClick }: { watch: WatchType; onClick: () => void }) {
  const { formatPrice } = useCurrency()
  const sc = statusColors[watch.status] || statusColors.available
  const cc = conditionColors[watch.condition] || conditionColors.excellent
  const [hovered, setHovered] = useState(false)
  const [imgError, setImgError] = useState(false)

  // Calculate profit if sold or potential profit
  const profit = watch.sold_price
    ? watch.sold_price - watch.purchase_price
    : watch.asking_price - watch.purchase_price

  const imageUrl = watch.primary_photo
    ? watch.primary_photo.startsWith('http')
      ? watch.primary_photo
      : `http://localhost:8000${watch.primary_photo}`
    : null

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="rounded-xl overflow-hidden cursor-pointer transition-all hover:scale-[1.02] relative"
      style={{
        background: '#111827',
        border: hovered ? '1px solid rgba(212,175,55,0.5)' : '1px solid #1f2937',
        transition: 'all 0.2s ease',
      }}
    >
      {/* Image */}
      <div
        className="relative h-48 flex items-center justify-center overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #1a2035, #1f2937)' }}
      >
        {imageUrl && !imgError ? (
          <img
            src={imageUrl}
            alt={`${watch.brand} ${watch.model}`}
            className="w-full h-full object-cover transition-transform duration-300"
            style={{ transform: hovered ? 'scale(1.05)' : 'scale(1)' }}
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="flex flex-col items-center gap-2">
            <Watch size={48} color="#374151" />
            <span className="text-xs text-gray-600">אין תמונה</span>
          </div>
        )}

        {/* Hover summary overlay */}
        <div
          className="absolute inset-0 flex flex-col justify-end p-3"
          style={{
            background: hovered
              ? 'linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.6) 50%, transparent 100%)'
              : 'transparent',
            transition: 'background 0.2s',
          }}
        >
          {hovered && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xl font-bold" style={{ color: '#d4af37' }}>
                  {formatPrice(watch.asking_price, watch.price_currency || 'USD')}
                </span>
                {watch.purchase_price > 0 && (
                  <span className={`text-xs flex items-center gap-1 ${profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    <TrendingUp size={11} />
                    {profit >= 0 ? '+' : ''}{formatPrice(profit, watch.price_currency || 'USD')}
                  </span>
                )}
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {watch.has_box && (
                  <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(99,102,241,0.2)', color: '#818cf8' }}>📦 קופסה</span>
                )}
                {watch.has_papers && (
                  <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(16,185,129,0.2)', color: '#34d399' }}>📄 תעודה</span>
                )}
                {watch.year && (
                  <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.1)', color: '#9ca3af' }}>{watch.year}</span>
                )}
              </div>
              {watch.notes && (
                <p className="text-xs mt-1 line-clamp-1" style={{ color: '#9ca3af' }}>{watch.notes}</p>
              )}
              <div className="flex gap-2 mt-2">
                <span className="text-xs flex items-center gap-1" style={{ color: '#d4af37' }}>
                  <Eye size={11} /> לחץ לפרטים מלאים
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Status badge */}
        <div
          className="absolute top-3 left-3 px-2.5 py-1 rounded-full text-xs font-semibold"
          style={{ color: sc.text, background: sc.bg, backdropFilter: 'blur(4px)' }}
        >
          {statusLabel[watch.status]}
        </div>
        {/* Brand badge */}
        <div
          className="absolute top-3 right-3 px-2.5 py-1 rounded-full text-xs font-semibold"
          style={{ color: '#d4af37', background: 'rgba(212,175,55,0.15)', backdropFilter: 'blur(4px)' }}
        >
          {watch.brand}
        </div>
      </div>

      {/* Info */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="min-w-0">
            <h3 className="font-semibold text-white text-base truncate">{watch.model}</h3>
            {watch.reference && (
              <p className="text-gray-500 text-xs mt-0.5">{watch.reference}</p>
            )}
          </div>
          <span
            className="text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0"
            style={{ color: cc, background: `${cc}18` }}
          >
            {conditionLabel[watch.condition] || watch.condition}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <div className="text-lg font-bold text-white">
              {formatPrice(watch.asking_price, watch.price_currency || 'USD')}
            </div>
            {watch.purchase_price > 0 && (
              <div className="text-xs text-gray-500 mt-0.5">
                עלות: {formatPrice(watch.purchase_price, watch.price_currency || 'USD')}
              </div>
            )}
          </div>
          <div className="flex gap-1.5">
            {watch.has_box && (
              <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(99,102,241,0.1)', color: '#818cf8' }}>
                קופסה
              </span>
            )}
            {watch.has_papers && (
              <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(16,185,129,0.1)', color: '#34d399' }}>
                תעודה
              </span>
            )}
          </div>
        </div>

        {watch.year && (
          <div className="mt-2 text-xs text-gray-600">{watch.year}</div>
        )}
      </div>
    </div>
  )
}
