import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowRight, Edit, Trash2, Watch, Upload, X, Download,
  FileText, DollarSign, Calendar, Tag, Box, ScrollText,
  ChevronLeft, ChevronRight,
} from 'lucide-react'
import { useDropzone } from 'react-dropzone'
import toast from 'react-hot-toast'
import api from '../api/client'
import { Watch as WatchType } from '../types'

const statusLabel: Record<string, string> = { available: 'זמין', sold: 'נמכר', reserved: 'שמור' }

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$', ILS: '₪', EUR: '€', GBP: '£', CHF: 'CHF', JPY: '¥',
  AUD: 'A$', CAD: 'C$', HKD: 'HK$', SGD: 'S$', NOK: 'kr', SEK: 'kr', DKK: 'kr',
}
const symOf = (currency?: string) => CURRENCY_SYMBOLS[currency || 'USD'] ?? currency ?? '$'
const fmtPrice = (n: number | undefined | null, currency?: string) =>
  n != null ? `${symOf(currency)}${n.toLocaleString('en-US')}` : '—'
const statusColors: Record<string, { text: string; bg: string }> = {
  available: { text: '#10b981', bg: 'rgba(16,185,129,0.12)' },
  sold: { text: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
  reserved: { text: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
}
const conditionLabel: Record<string, string> = { mint: 'מושלם', excellent: 'מצוין', good: 'טוב', fair: 'סביר' }

export default function WatchDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [watch, setWatch] = useState<WatchType | null>(null)
  const [loading, setLoading] = useState(true)
  const [photoIdx, setPhotoIdx] = useState(0)
  const [showSoldModal, setShowSoldModal] = useState(false)
  const [soldPrice, setSoldPrice] = useState('')
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [uploadingDoc, setUploadingDoc] = useState(false)

  const fetchWatch = () => {
    if (!id) return
    api.get(`/api/inventory/${id}`)
      .then(res => setWatch(res.data))
      .catch(() => toast.error('שגיאה בטעינת השעון'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchWatch() }, [id])

  const { getRootProps: getPhotoProps, getInputProps: getPhotoInput } = useDropzone({
    accept: { 'image/*': [] },
    onDrop: async (files) => {
      if (!id) return
      setUploadingPhoto(true)
      const fd = new FormData()
      files.forEach(f => fd.append('files', f))
      try {
        const res = await api.post(`/api/inventory/${id}/photos`, fd)
        setWatch(res.data)
        toast.success('תמונות הועלו בהצלחה')
      } catch { toast.error('שגיאה בהעלאת תמונות') }
      finally { setUploadingPhoto(false) }
    },
  })

  const { getRootProps: getDocProps, getInputProps: getDocInput } = useDropzone({
    accept: { 'application/pdf': [], 'image/*': [] },
    multiple: false,
    onDrop: async (files) => {
      if (!id || !files[0]) return
      setUploadingDoc(true)
      const fd = new FormData()
      fd.append('file', files[0])
      fd.append('doc_type', 'document')
      try {
        const res = await api.post(`/api/inventory/${id}/documents`, fd)
        setWatch(res.data)
        toast.success('מסמך הועלה בהצלחה')
      } catch { toast.error('שגיאה בהעלאת מסמך') }
      finally { setUploadingDoc(false) }
    },
  })

  const deletePhoto = async (photoId: number) => {
    if (!id) return
    try {
      const res = await api.delete(`/api/inventory/${id}/photos/${photoId}`)
      setWatch(res.data)
      setPhotoIdx(0)
      toast.success('תמונה נמחקה')
    } catch { toast.error('שגיאה במחיקת תמונה') }
  }

  const deleteDoc = async (docId: number) => {
    if (!id) return
    try {
      const res = await api.delete(`/api/inventory/${id}/documents/${docId}`)
      setWatch(res.data)
      toast.success('מסמך נמחק')
    } catch { toast.error('שגיאה במחיקת מסמך') }
  }

  const refreshIlsRate = async () => {
    if (!id) return
    try {
      const res = await api.post(`/api/inventory/${id}/refresh-rate`)
      setWatch(prev => prev ? { ...prev, purchase_price_ils: res.data.purchase_price_ils, purchase_rate_to_ils: res.data.purchase_rate_to_ils } : prev)
      toast.success('שער עודכן בהצלחה')
    } catch { toast.error('לא ניתן לשלוף שער') }
  }

  const deleteWatch = async () => {
    if (!id || !confirm('האם למחוק את השעון?')) return
    try {
      await api.delete(`/api/inventory/${id}`)
      toast.success('השעון נמחק')
      navigate('/inventory')
    } catch { toast.error('שגיאה במחיקה') }
  }

  const markSold = async () => {
    if (!id) return
    const fd = new FormData()
    fd.append('status', 'sold')
    if (soldPrice) fd.append('sold_price', soldPrice)
    try {
      const res = await api.patch(`/api/inventory/${id}/status`, fd)
      setWatch(res.data)
      setShowSoldModal(false)
      toast.success('השעון סומן כנמכר')
    } catch { toast.error('שגיאה') }
  }

  const changeStatus = async (status: string) => {
    if (!id) return
    if (status === 'sold') { setShowSoldModal(true); return }
    const fd = new FormData()
    fd.append('status', status)
    try {
      const res = await api.patch(`/api/inventory/${id}/status`, fd)
      setWatch(res.data)
      toast.success('סטטוס עודכן')
    } catch { toast.error('שגיאה') }
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-gray-400">טוען...</div>
  }

  if (!watch) {
    return <div className="flex items-center justify-center h-64 text-gray-400">שעון לא נמצא</div>
  }

  const photos = watch.photos || []
  const documents = watch.documents || []
  const currentPhoto = photos[photoIdx]
  const sc = statusColors[watch.status] || statusColors.available
  const profit = watch.sold_price
    ? watch.sold_price - (watch.purchase_price || 0)
    : watch.asking_price - (watch.purchase_price || 0)

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/inventory')} className="p-2 rounded-xl hover:bg-gray-800 text-gray-400">
            <ArrowRight size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-white">{watch.brand} {watch.model}</h1>
            <p className="text-gray-400 text-sm mt-0.5">{watch.reference}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => navigate(`/ads?watch=${watch.id}`)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium"
            style={{ background: '#1f2937', color: '#9ca3af', border: '1px solid #374151' }}
          >
            <FileText size={14} />
            צור מודעה
          </button>
          <button
            onClick={() => navigate(`/inventory/edit/${watch.id}`)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium"
            style={{ background: '#1f2937', color: '#d4af37', border: '1px solid #374151' }}
          >
            <Edit size={14} />
            עריכה
          </button>
          <button
            onClick={deleteWatch}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium"
            style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}
          >
            <Trash2 size={14} />
            מחיקה
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Photo Gallery */}
        <div>
          <div
            className="relative rounded-xl overflow-hidden mb-3"
            style={{ background: '#1f2937', aspectRatio: '4/3' }}
          >
            {photos.length > 0 && currentPhoto ? (
              <>
                <img
                  src={`${import.meta.env.VITE_API_URL ?? ""}${currentPhoto.url}`}
                  alt={`${watch.brand} ${watch.model}`}
                  className="w-full h-full object-contain"
                />
                {photos.length > 1 && (
                  <>
                    <button
                      onClick={() => setPhotoIdx(i => (i - 1 + photos.length) % photos.length)}
                      className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center"
                      style={{ background: 'rgba(0,0,0,0.6)' }}
                    >
                      <ChevronLeft size={16} color="white" />
                    </button>
                    <button
                      onClick={() => setPhotoIdx(i => (i + 1) % photos.length)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center"
                      style={{ background: 'rgba(0,0,0,0.6)' }}
                    >
                      <ChevronRight size={16} color="white" />
                    </button>
                    <div className="absolute bottom-2 right-1/2 translate-x-1/2 px-2 py-0.5 rounded-full text-xs" style={{ background: 'rgba(0,0,0,0.6)', color: 'white' }}>
                      {photoIdx + 1}/{photos.length}
                    </div>
                  </>
                )}
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-3">
                <Watch size={56} color="#374151" />
                <span className="text-gray-500 text-sm">אין תמונה</span>
              </div>
            )}
          </div>

          {/* Thumbnails */}
          {photos.length > 0 && (
            <div className="flex gap-2 mb-3 overflow-x-auto">
              {photos.map((p, i) => (
                <div key={p.id} className="relative flex-shrink-0 group">
                  <img
                    src={`${import.meta.env.VITE_API_URL ?? ""}${p.url}`}
                    alt=""
                    onClick={() => setPhotoIdx(i)}
                    className="w-16 h-16 object-cover rounded-lg cursor-pointer"
                    style={{ border: `2px solid ${i === photoIdx ? '#d4af37' : 'transparent'}` }}
                  />
                  <button
                    onClick={() => deletePhoto(p.id)}
                    className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ background: '#ef4444' }}
                  >
                    <X size={10} color="white" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Upload photos */}
          <div
            {...getPhotoProps()}
            className="border-dashed border-2 rounded-xl p-4 text-center cursor-pointer transition-colors"
            style={{ borderColor: '#374151' }}
          >
            <input {...getPhotoInput()} />
            <Upload size={20} color="#6b7280" className="mx-auto mb-1" />
            <p className="text-gray-500 text-xs">
              {uploadingPhoto ? 'מעלה...' : 'לחץ להעלאת תמונות'}
            </p>
          </div>
        </div>

        {/* Details */}
        <div className="space-y-4">
          {/* Status & Price */}
          <div
            className="rounded-xl p-5"
            style={{ background: '#111827', border: '1px solid #1f2937' }}
          >
            <div className="flex items-center justify-between mb-4">
              <span
                className="px-3 py-1.5 rounded-full text-sm font-semibold"
                style={{ color: sc.text, background: sc.bg }}
              >
                {statusLabel[watch.status]}
              </span>
              <div className="flex gap-2">
                {['available', 'reserved', 'sold'].filter(s => s !== watch.status).map(s => (
                  <button
                    key={s}
                    onClick={() => changeStatus(s)}
                    className="px-3 py-1 rounded-lg text-xs font-medium"
                    style={{ background: '#1f2937', color: '#9ca3af', border: '1px solid #374151' }}
                  >
                    סמן {statusLabel[s]}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-gray-500 mb-0.5">מחיר קנייה</div>
                <div className="text-lg font-bold text-white">
                  {fmtPrice(watch.purchase_price, watch.price_currency)}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-0.5">{watch.status === 'sold' ? 'מחיר מכירה' : 'מחיר מבוקש'}</div>
                <div className="text-lg font-bold" style={{ color: '#d4af37' }}>
                  {fmtPrice(watch.status === 'sold' ? watch.sold_price : watch.asking_price, watch.price_currency)}
                </div>
              </div>
            </div>

            {watch.purchase_price > 0 && (
              <div
                className="mt-3 rounded-lg p-3 flex items-center justify-between"
                style={{ background: profit >= 0 ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)' }}
              >
                <span className="text-sm text-gray-400">
                  {watch.status === 'sold' ? 'רווח ממומש' : 'רווח פוטנציאלי'}
                </span>
                <span className="text-sm font-bold" style={{ color: profit >= 0 ? '#10b981' : '#ef4444' }}>
                  {profit >= 0 ? '+' : ''}{fmtPrice(profit, watch.price_currency)}
                </span>
              </div>
            )}

            {/* Historical ILS rate at purchase */}
            {watch.purchase_price_ils != null && watch.purchase_rate_to_ils != null && (
              <div
                className="mt-3 rounded-xl p-4 space-y-2"
                style={{ background: 'rgba(212,175,55,0.06)', border: '1px solid rgba(212,175,55,0.2)' }}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <span style={{ color: '#d4af37', fontSize: 13 }}>📅</span>
                    <span className="text-xs font-semibold" style={{ color: '#d4af37' }}>
                      שער המטבע ביום הרכישה
                      {watch.purchase_date && (
                        <span className="font-normal" style={{ color: '#9ca3af' }}>
                          {' '}({new Date(watch.purchase_date).toLocaleDateString('he-IL', { day:'numeric', month:'long', year:'numeric' })})
                        </span>
                      )}
                    </span>
                  </div>
                  <button
                    onClick={refreshIlsRate}
                    className="text-xs px-2 py-0.5 rounded-lg transition-all hover:opacity-80"
                    style={{ background: 'rgba(212,175,55,0.15)', color: '#d4af37', border: '1px solid rgba(212,175,55,0.3)' }}
                  >
                    רענן שער
                  </button>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">שער</span>
                  <span className="text-sm font-semibold text-white">
                    1 {watch.price_currency || 'USD'} = ₪{watch.purchase_rate_to_ils.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">מחיר קנייה בשקלים</span>
                  <span className="text-base font-bold" style={{ color: '#d4af37' }}>
                    ₪{Math.round(watch.purchase_price_ils).toLocaleString('he-IL')}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Watch info */}
          <div
            className="rounded-xl p-5"
            style={{ background: '#111827', border: '1px solid #1f2937' }}
          >
            <h3 className="text-sm font-semibold text-gray-400 mb-3">פרטי השעון</h3>
            <div className="space-y-3">
              {[
                { icon: Tag, label: 'מותג', value: watch.brand },
                { icon: Watch, label: 'דגם', value: watch.model },
                { icon: Tag, label: 'רפרנס', value: watch.reference },
                { icon: Calendar, label: 'שנה', value: watch.year?.toString() },
                { icon: Tag, label: 'מצב', value: conditionLabel[watch.condition] || watch.condition },
                { icon: Tag, label: 'מספר סריאלי', value: watch.serial_number },
                { icon: Box, label: 'קופסה', value: watch.has_box ? '✓ כן' : '✗ לא' },
                { icon: ScrollText, label: 'ניירות', value: watch.has_papers ? '✓ כן' : '✗ לא' },
              ].filter(item => item.value).map(item => {
                const Icon = item.icon
                return (
                  <div key={item.label} className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-gray-500 text-sm">
                      <Icon size={14} />
                      {item.label}
                    </div>
                    <span className="text-sm text-white font-medium">{item.value}</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Notes */}
          {watch.notes && (
            <div
              className="rounded-xl p-5"
              style={{ background: '#111827', border: '1px solid #1f2937' }}
            >
              <h3 className="text-sm font-semibold text-gray-400 mb-2">הערות</h3>
              <p className="text-sm text-gray-300 leading-relaxed">{watch.notes}</p>
            </div>
          )}

          {/* Documents */}
          <div
            className="rounded-xl p-5"
            style={{ background: '#111827', border: '1px solid #1f2937' }}
          >
            <h3 className="text-sm font-semibold text-gray-400 mb-3">מסמכים</h3>
            {documents.length === 0 ? (
              <p className="text-gray-600 text-sm mb-3">אין מסמכים</p>
            ) : (
              <div className="space-y-2 mb-3">
                {documents.map(doc => (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between rounded-lg p-2"
                    style={{ background: '#1f2937' }}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText size={14} color="#6b7280" />
                      <span className="text-xs text-gray-300 truncate">{doc.original_name}</span>
                    </div>
                    <div className="flex gap-1.5 flex-shrink-0">
                      <a
                        href={`${import.meta.env.VITE_API_URL ?? ""}${doc.url}`}
                        target="_blank"
                        rel="noreferrer"
                        className="p-1 rounded"
                        style={{ color: '#d4af37' }}
                      >
                        <Download size={14} />
                      </a>
                      <button
                        onClick={() => deleteDoc(doc.id)}
                        className="p-1 rounded"
                        style={{ color: '#ef4444' }}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div
              {...getDocProps()}
              className="border-dashed border-2 rounded-xl p-3 text-center cursor-pointer"
              style={{ borderColor: '#374151' }}
            >
              <input {...getDocInput()} />
              <p className="text-gray-500 text-xs">
                {uploadingDoc ? 'מעלה...' : 'לחץ להעלאת מסמך (PDF/תמונה)'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Sold price modal */}
      {showSoldModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="rounded-2xl p-6 w-80" style={{ background: '#111827', border: '1px solid #1f2937' }}>
            <h3 className="text-lg font-semibold text-white mb-4">סמן כנמכר</h3>
            <div className="mb-4">
              <label className="block text-sm text-gray-400 mb-1.5">מחיר מכירה ($)</label>
              <input
                type="number"
                value={soldPrice}
                onChange={e => setSoldPrice(e.target.value)}
                placeholder={watch.asking_price?.toString()}
                className="w-full px-4 py-2.5 rounded-xl text-sm text-white outline-none"
                style={{ background: '#1f2937', border: '1px solid #374151' }}
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowSoldModal(false)}
                className="flex-1 py-2 rounded-xl text-sm font-medium"
                style={{ background: '#1f2937', color: '#9ca3af' }}
              >
                ביטול
              </button>
              <button
                onClick={markSold}
                className="flex-1 py-2 rounded-xl text-sm font-semibold"
                style={{ background: 'linear-gradient(135deg, #d4af37, #b8962e)', color: '#0a0e1a' }}
              >
                אשר
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
