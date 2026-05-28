import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useDropzone } from 'react-dropzone'
import {
  Upload,
  X,
  ArrowRight,
  Save,
  Watch,
  Loader2,
  FileText,
  FileImage,
  File,
  Plus,
  Trash2,
} from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../api/client'
import { Watch as WatchType } from '../types'
import { useCurrency } from '../context/CurrencyContext'

const initialForm = {
  brand: '',
  model: '',
  reference: '',
  year: '',
  condition: 'excellent',
  purchase_price: '',
  asking_price: '',
  price_currency: 'USD',
  status: 'available',
  serial_number: '',
  has_box: false,
  has_papers: false,
  notes: '',
  purchase_date: '',
  // Tax refund
  tax_refund: false,
  tax_refund_amount: '',
  tax_refund_currency: 'USD',
  tax_refund_country: '',
  // Import duty
  import_tax: '',
  import_tax_currency: 'ILS',
  // Location
  location: 'home_safe',
  location_details: '',
}

const conditions = [
  { value: 'mint', label: 'מושלם - Mint' },
  { value: 'excellent', label: 'מצוין - Excellent' },
  { value: 'good', label: 'טוב - Good' },
  { value: 'fair', label: 'סביר - Fair' },
]

const statuses = [
  { value: 'available', label: 'זמין' },
  { value: 'reserved', label: 'שמור' },
  { value: 'sold', label: 'נמכר' },
]

const popularBrands = [
  'Rolex',
  'Patek Philippe',
  'Audemars Piguet',
  'Richard Mille',
  'Cartier',
  'IWC',
  'Omega',
  'Breitling',
  'TAG Heuer',
  'Panerai',
]

const docCategories = [
  { value: 'warranty', label: 'תעודת אחריות' },
  { value: 'invoice_tax', label: 'חשבונית מס' },
  { value: 'invoice_customs', label: 'חשבונית מכס' },
  { value: 'receipt', label: 'קבלה' },
  { value: 'certificate', label: 'תעודת אותנטיות' },
  { value: 'appraisal', label: 'הערכת שמאי' },
  { value: 'other', label: 'אחר' },
]

interface DocFile {
  file: File
  category: string
}

function getFileIcon(filename: string) {
  const ext = filename.split('.').pop()?.toLowerCase() || ''
  if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)) return <FileImage size={16} color="#d4af37" />
  if (ext === 'pdf') return <FileText size={16} color="#ef4444" />
  return <File size={16} color="#9ca3af" />
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const CURRENCIES = ['USD', 'ILS', 'EUR', 'GBP', 'CHF', 'JPY', 'AUD', 'CAD', 'HKD', 'SGD', 'NOK', 'SEK', 'DKK']
const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$', ILS: '₪', EUR: '€', GBP: '£', CHF: 'CHF', JPY: '¥',
  AUD: 'A$', CAD: 'C$', HKD: 'HK$', SGD: 'S$', NOK: 'kr', SEK: 'kr', DKK: 'kr',
}

export default function AddWatch() {
  const navigate = useNavigate()
  const { id } = useParams()
  const isEdit = Boolean(id)
  const { meta: currencyMeta } = useCurrency()

  const [form, setForm] = useState(initialForm)
  const [files, setFiles] = useState<File[]>([])
  const [previews, setPreviews] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [fetchingWatch, setFetchingWatch] = useState(isEdit)

  // Auto-fill state
  const [autoFillQuery, setAutoFillQuery] = useState('')
  const [autoFillLoading, setAutoFillLoading] = useState(false)
  const [autoFillSuccess, setAutoFillSuccess] = useState<{ brand: string; model: string } | null>(null)
  const [autoFillError, setAutoFillError] = useState<string | null>(null)

  // Historical ILS rate preview
  const [ilsRate, setIlsRate] = useState<{ rate: number; date: string; source: string } | null>(null)
  const [ilsRateLoading, setIlsRateLoading] = useState(false)

  // Document upload state
  const [docFiles, setDocFiles] = useState<DocFile[]>([])
  const docInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!isEdit || !id) return
    api
      .get(`/api/inventory/${id}`)
      .then((res) => {
        const w: WatchType = res.data
        setForm({
          brand: w.brand || '',
          model: w.model || '',
          reference: w.reference || '',
          year: w.year?.toString() || '',
          condition: w.condition || 'excellent',
          purchase_price: w.purchase_price?.toString() || '',
          asking_price: w.asking_price?.toString() || '',
          price_currency: w.price_currency || 'USD',
          status: w.status || 'available',
          serial_number: w.serial_number || '',
          has_box: w.has_box || false,
          has_papers: w.has_papers || false,
          notes: w.notes || '',
          purchase_date: w.purchase_date ? w.purchase_date.split('T')[0] : '',
          tax_refund: w.tax_refund || false,
          tax_refund_amount: w.tax_refund_amount?.toString() || '',
          tax_refund_currency: w.tax_refund_currency || 'USD',
          tax_refund_country: w.tax_refund_country || '',
          import_tax: w.import_tax?.toString() || '',
          import_tax_currency: w.import_tax_currency || 'ILS',
          location: w.location || 'home_safe',
          location_details: w.location_details || '',
        })
      })
      .catch(() => toast.error('שגיאה בטעינת השעון'))
      .finally(() => setFetchingWatch(false))
  }, [id, isEdit])

  const onDrop = useCallback((acceptedFiles: File[]) => {
    setFiles((prev) => [...prev, ...acceptedFiles])
    acceptedFiles.forEach((file) => {
      const reader = new FileReader()
      reader.onload = (e) => setPreviews((prev) => [...prev, e.target?.result as string])
      reader.readAsDataURL(file)
    })
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.jpg', '.jpeg', '.png', '.webp'] },
    multiple: true,
  })

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index))
    setPreviews((prev) => prev.filter((_, i) => i !== index))
  }

  const set = (key: keyof typeof form, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  // Fetch historical ILS rate when purchase date + currency change
  useEffect(() => {
    const currency = form.price_currency
    const date = form.purchase_date
    const price = parseFloat(form.purchase_price)

    if (!date || !currency || currency === 'ILS' || !price || price <= 0) {
      setIlsRate(null)
      return
    }

    let cancelled = false
    setIlsRateLoading(true)
    api.get('/api/currency/historical', { params: { currency, date } })
      .then((res) => {
        if (!cancelled && res.data.rate_to_ils) {
          setIlsRate({ rate: res.data.rate_to_ils, date: res.data.date, source: res.data.source })
        } else if (!cancelled) {
          setIlsRate(null)
        }
      })
      .catch(() => { if (!cancelled) setIlsRate(null) })
      .finally(() => { if (!cancelled) setIlsRateLoading(false) })

    return () => { cancelled = true }
  }, [form.purchase_date, form.price_currency, form.purchase_price])

  // Auto-fill handler
  const handleAutoFill = async () => {
    if (!autoFillQuery.trim()) return
    setAutoFillLoading(true)
    setAutoFillSuccess(null)
    setAutoFillError(null)
    try {
      // quick-fill uses Haiku (5x faster, ~50x cheaper than Sonnet)
      const res = await api.post('/api/watch-id/quick-fill', { query: autoFillQuery })
      const result = res.data
      setForm((prev) => ({
        ...prev,
        brand: result.brand || prev.brand,
        model: result.model || prev.model,
        reference: result.reference || prev.reference,
        year: result.year_introduced?.toString() || prev.year,
        notes: [
          result.case_material ? `חומר קייס: ${result.case_material}` : '',
          result.movement ? `מנגנון: ${result.movement}` : '',
          result.water_resistance_m ? `עמידות למים: ${result.water_resistance_m}מ'` : '',
          result.retail_price_usd ? `מחיר קטלוגי: $${result.retail_price_usd.toLocaleString()}` : '',
          result.brief_notes ? result.brief_notes : '',
        ]
          .filter(Boolean)
          .join(' | '),
        asking_price:
          result.market_value_excellent
            ? result.market_value_excellent.toString()
            : result.market_values?.excellent_no_papers
            ? result.market_values.excellent_no_papers.toString()
            : prev.asking_price,
      }))
      setAutoFillSuccess({ brand: result.brand, model: result.model })
    } catch (err: any) {
      setAutoFillError(err.response?.data?.detail || 'לא ניתן היה לזהות את השעון')
    } finally {
      setAutoFillLoading(false)
    }
  }

  // Document file picker
  const handleDocFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files
    if (!picked) return
    const newDocs: DocFile[] = Array.from(picked).map((f) => ({ file: f, category: 'other' }))
    setDocFiles((prev) => [...prev, ...newDocs])
    // Reset input so same file can be re-added
    e.target.value = ''
  }

  const removeDoc = (index: number) => {
    setDocFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const updateDocCategory = (index: number, category: string) => {
    setDocFiles((prev) => prev.map((d, i) => (i === index ? { ...d, category } : d)))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.brand || !form.model) {
      toast.error('מותג ודגם הם שדות חובה')
      return
    }
    setLoading(true)

    try {
      const formData = new FormData()
      Object.entries(form).forEach(([k, v]) => {
        if (v !== '' && v !== null && v !== undefined) {
          formData.append(k, v.toString())
        }
      })

      let watchId: number
      if (isEdit && id) {
        const res = await api.put(`/api/inventory/${id}`, formData)
        watchId = res.data.id
        toast.success('השעון עודכן בהצלחה')
      } else {
        const res = await api.post('/api/inventory', formData)
        watchId = res.data.id
        toast.success('השעון נוסף בהצלחה')
      }

      // Upload photos
      if (files.length > 0) {
        const photoData = new FormData()
        files.forEach((f) => photoData.append('files', f))
        await api.post(`/api/inventory/${watchId}/photos`, photoData)
      }

      // Upload documents
      for (const doc of docFiles) {
        const docData = new FormData()
        docData.append('file', doc.file)
        docData.append('category', doc.category)
        docData.append('watch_id', watchId.toString())
        try {
          await api.post('/api/documents/upload', docData)
        } catch {
          toast.error(`שגיאה בהעלאת מסמך: ${doc.file.name}`)
        }
      }

      navigate(`/inventory/${watchId}`)
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'שגיאה בשמירת השעון')
    } finally {
      setLoading(false)
    }
  }

  if (fetchingWatch) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">טוען...</div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate(-1)}
          className="p-2 rounded-xl transition-colors hover:bg-gray-800"
          style={{ color: '#9ca3af' }}
        >
          <ArrowRight size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-white">
            {isEdit ? 'עריכת שעון' : 'הוספת שעון חדש'}
          </h1>
          <p className="text-gray-400 text-sm mt-0.5">
            {isEdit ? 'עדכן את פרטי השעון' : 'הוסף שעון חדש למלאי'}
          </p>
        </div>
      </div>

      {/* ─── Auto-fill Card ─── */}
      <div
        className="rounded-xl p-6 mb-6"
        style={{ background: '#111827', border: '1px solid #1f2937' }}
      >
        <h2 className="text-base font-semibold text-white mb-1">
          מצא שעון אוטומטית 🤖
        </h2>
        <p className="text-xs text-gray-500 mb-4">
          הכנס רפרנס, שם דגם או מספר סידורי ו-WatchGPT ימלא את הפרטים אוטומטית
        </p>

        <div className="flex gap-3">
          <input
            value={autoFillQuery}
            onChange={(e) => setAutoFillQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAutoFill()}
            placeholder="הכנס רפרנס, שם דגם או מספר סידורי..."
            className="flex-1 px-4 py-2.5 rounded-xl text-sm text-white placeholder-gray-600 outline-none"
            style={{ background: '#1f2937', border: '1px solid #374151' }}
          />
          <button
            type="button"
            onClick={handleAutoFill}
            disabled={autoFillLoading || !autoFillQuery.trim()}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-50 flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, #d4af37, #b8962e)', color: '#0a0e1a' }}
          >
            {autoFillLoading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                WatchGPT מאתר נתונים...
              </>
            ) : (
              <>
                <Watch size={16} />
                מלא אוטומטית
              </>
            )}
          </button>
        </div>

        {/* Success bar */}
        {autoFillSuccess && (
          <div
            className="mt-3 px-4 py-2.5 rounded-xl text-sm font-medium"
            style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)', color: '#10b981' }}
          >
            ✅ נמצא: {autoFillSuccess.brand} {autoFillSuccess.model} — פרטים מולאו אוטומטית
          </div>
        )}

        {/* Error bar */}
        {autoFillError && (
          <div
            className="mt-3 px-4 py-2.5 rounded-xl text-sm font-medium"
            style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444' }}
          >
            ❌ {autoFillError}
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main info */}
          <div className="lg:col-span-2 space-y-4">
            <div
              className="rounded-xl p-6 space-y-4"
              style={{ background: '#111827', border: '1px solid #1f2937' }}
            >
              <h2 className="text-base font-semibold text-white mb-2">פרטי השעון</h2>

              {/* Brand */}
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1.5">מותג *</label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {popularBrands.slice(0, 5).map((b) => (
                    <button
                      key={b}
                      type="button"
                      onClick={() => set('brand', b)}
                      className="px-3 py-1 rounded-lg text-xs font-medium transition-all"
                      style={
                        form.brand === b
                          ? {
                              background: 'rgba(212,175,55,0.2)',
                              color: '#d4af37',
                              border: '1px solid #d4af37',
                            }
                          : {
                              background: '#1f2937',
                              color: '#9ca3af',
                              border: '1px solid #374151',
                            }
                      }
                    >
                      {b}
                    </button>
                  ))}
                </div>
                <input
                  value={form.brand}
                  onChange={(e) => set('brand', e.target.value)}
                  placeholder="שם המותג"
                  required
                  className="w-full px-4 py-2.5 rounded-xl text-sm text-white placeholder-gray-600 outline-none"
                  style={{ background: '#1f2937', border: '1px solid #374151' }}
                />
              </div>

              {/* Model */}
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1.5">דגם *</label>
                <input
                  value={form.model}
                  onChange={(e) => set('model', e.target.value)}
                  placeholder="שם הדגם (למשל: Submariner)"
                  required
                  className="w-full px-4 py-2.5 rounded-xl text-sm text-white placeholder-gray-600 outline-none"
                  style={{ background: '#1f2937', border: '1px solid #374151' }}
                />
              </div>

              {/* Reference + Year */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1.5">רפרנס</label>
                  <input
                    value={form.reference}
                    onChange={(e) => set('reference', e.target.value)}
                    placeholder="126610LN"
                    className="w-full px-4 py-2.5 rounded-xl text-sm text-white placeholder-gray-600 outline-none"
                    style={{ background: '#1f2937', border: '1px solid #374151' }}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1.5">שנה</label>
                  <input
                    type="number"
                    value={form.year}
                    onChange={(e) => set('year', e.target.value)}
                    placeholder="2022"
                    min="1900"
                    max="2026"
                    className="w-full px-4 py-2.5 rounded-xl text-sm text-white placeholder-gray-600 outline-none"
                    style={{ background: '#1f2937', border: '1px solid #374151' }}
                  />
                </div>
              </div>

              {/* Condition */}
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1.5">מצב</label>
                <div className="grid grid-cols-4 gap-2">
                  {conditions.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => set('condition', c.value)}
                      className="py-2 px-3 rounded-xl text-xs font-medium transition-all text-center"
                      style={
                        form.condition === c.value
                          ? {
                              background: 'rgba(212,175,55,0.2)',
                              color: '#d4af37',
                              border: '1px solid #d4af37',
                            }
                          : {
                              background: '#1f2937',
                              color: '#9ca3af',
                              border: '1px solid #374151',
                            }
                      }
                    >
                      {c.label.split(' - ')[0]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Serial */}
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1.5">מספר סריאלי</label>
                <input
                  value={form.serial_number}
                  onChange={(e) => set('serial_number', e.target.value)}
                  placeholder="מספר הסריאל"
                  className="w-full px-4 py-2.5 rounded-xl text-sm text-white placeholder-gray-600 outline-none"
                  style={{ background: '#1f2937', border: '1px solid #374151' }}
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1.5">הערות</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => set('notes', e.target.value)}
                  placeholder="הערות נוספות על השעון..."
                  rows={3}
                  className="w-full px-4 py-2.5 rounded-xl text-sm text-white placeholder-gray-600 outline-none resize-none"
                  style={{ background: '#1f2937', border: '1px solid #374151' }}
                />
              </div>
            </div>

            {/* ─── Tax Refund + Import Duty Card ─── */}
            <div className="rounded-xl p-6" style={{ background: '#111827', border: '1px solid #1f2937' }}>
              <h2 className="text-base font-semibold text-white mb-4">💰 מיסים ומכס</h2>

              {/* Tax refund toggle */}
              <label className="flex items-center gap-3 cursor-pointer mb-4">
                <div
                  onClick={() => set('tax_refund', !form.tax_refund)}
                  className="w-10 h-5 rounded-full relative transition-colors cursor-pointer"
                  style={{ background: form.tax_refund ? '#d4af37' : '#374151' }}
                >
                  <div
                    className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all"
                    style={{ left: form.tax_refund ? '1.4rem' : '0.125rem' }}
                  />
                </div>
                <div>
                  <span className="text-sm font-medium text-white">קיבלתי החזר מס (Tax Refund)</span>
                  <p className="text-xs text-gray-500 mt-0.5">רכשתי בחו"ל וקיבלתי החזר מע"מ כתייר</p>
                </div>
              </label>

              {form.tax_refund && (
                <div className="grid grid-cols-3 gap-3 mb-4 p-4 rounded-xl" style={{ background: '#0d1520', border: '1px solid #d4af3730' }}>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">סכום ההחזר</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.tax_refund_amount}
                      onChange={(e) => set('tax_refund_amount', e.target.value)}
                      placeholder="0"
                      className="w-full px-3 py-2 rounded-xl text-sm text-white placeholder-gray-600 outline-none"
                      style={{ background: '#1f2937', border: '1px solid #374151' }}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">מטבע</label>
                    <select
                      value={form.tax_refund_currency}
                      onChange={(e) => set('tax_refund_currency', e.target.value)}
                      className="w-full px-3 py-2 rounded-xl text-sm text-white outline-none"
                      style={{ background: '#1f2937', border: '1px solid #374151' }}
                    >
                      {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">מדינה</label>
                    <input
                      type="text"
                      value={form.tax_refund_country}
                      onChange={(e) => set('tax_refund_country', e.target.value)}
                      placeholder="לדוג׳ שוויץ, צרפת..."
                      className="w-full px-3 py-2 rounded-xl text-sm text-white placeholder-gray-600 outline-none"
                      style={{ background: '#1f2937', border: '1px solid #374151' }}
                    />
                  </div>
                </div>
              )}

              {/* Import duty */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">מכס ששולם בישראל</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.import_tax}
                    onChange={(e) => set('import_tax', e.target.value)}
                    placeholder="0"
                    className="w-full px-3 py-2 rounded-xl text-sm text-white placeholder-gray-600 outline-none"
                    style={{ background: '#1f2937', border: '1px solid #374151' }}
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">מטבע מכס</label>
                  <select
                    value={form.import_tax_currency}
                    onChange={(e) => set('import_tax_currency', e.target.value)}
                    className="w-full px-3 py-2 rounded-xl text-sm text-white outline-none"
                    style={{ background: '#1f2937', border: '1px solid #374151' }}
                  >
                    {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* ─── Location Card ─── */}
            <div className="rounded-xl p-6" style={{ background: '#111827', border: '1px solid #1f2937' }}>
              <h2 className="text-base font-semibold text-white mb-4">📍 מיקום השעון</h2>
              <div className="flex gap-3 mb-3">
                {[
                  { value: 'home_safe', label: '🔒 כספת ביתית' },
                  { value: 'other', label: '📦 מקום אחר' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => set('location', opt.value)}
                    className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-all"
                    style={{
                      background: form.location === opt.value ? '#d4af37' : '#1f2937',
                      color: form.location === opt.value ? '#0a0e1a' : '#9ca3af',
                      border: `1px solid ${form.location === opt.value ? '#d4af37' : '#374151'}`,
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {form.location === 'other' && (
                <input
                  type="text"
                  value={form.location_details}
                  onChange={(e) => set('location_details', e.target.value)}
                  placeholder="לדוג׳ כספת משרד, אחסון מקצועי, אצל שמאי..."
                  className="w-full px-4 py-2.5 rounded-xl text-sm text-white placeholder-gray-600 outline-none"
                  style={{ background: '#1f2937', border: '1px solid #374151' }}
                />
              )}
            </div>

            {/* Photos */}
            <div
              className="rounded-xl p-6"
              style={{ background: '#111827', border: '1px solid #1f2937' }}
            >
              <h2 className="text-base font-semibold text-white mb-4">תמונות</h2>
              <div
                {...getRootProps()}
                className="border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all"
                style={{
                  borderColor: isDragActive ? '#d4af37' : '#374151',
                  background: isDragActive ? 'rgba(212,175,55,0.05)' : 'transparent',
                }}
              >
                <input {...getInputProps()} />
                <Upload size={32} color="#6b7280" className="mx-auto mb-3" />
                <p className="text-gray-400 text-sm">
                  {isDragActive ? 'שחרר כאן' : 'גרור תמונות לכאן או לחץ לבחירה'}
                </p>
                <p className="text-gray-600 text-xs mt-1">JPG, PNG, WEBP עד 10MB</p>
              </div>

              {previews.length > 0 && (
                <div className="grid grid-cols-4 gap-3 mt-4">
                  {previews.map((src, i) => (
                    <div key={i} className="relative group">
                      <img src={src} alt="" className="w-full h-20 object-cover rounded-lg" />
                      <button
                        type="button"
                        onClick={() => removeFile(i)}
                        className="absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{ background: '#ef4444' }}
                      >
                        <X size={12} color="white" />
                      </button>
                      {i === 0 && (
                        <div
                          className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded text-xs"
                          style={{ background: '#d4af37', color: '#0a0e1a' }}
                        >
                          ראשית
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ─── Documents Card ─── */}
            <div
              className="rounded-xl p-6"
              style={{ background: '#111827', border: '1px solid #1f2937' }}
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold text-white">📋 מסמכים ותעודות</h2>
                <button
                  type="button"
                  onClick={() => docInputRef.current?.click()}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all"
                  style={{
                    background: 'rgba(212,175,55,0.12)',
                    color: '#d4af37',
                    border: '1px solid rgba(212,175,55,0.3)',
                  }}
                >
                  <Plus size={15} />
                  הוסף מסמך
                </button>
                <input
                  ref={docInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.jpg,.jpeg,.png,.webp,.xlsx,.xls,.doc,.docx,.csv,.txt"
                  className="hidden"
                  onChange={handleDocFileChange}
                />
              </div>

              {docFiles.length === 0 ? (
                <div
                  className="rounded-xl p-6 text-center border-2 border-dashed"
                  style={{ borderColor: '#374151' }}
                >
                  <FileText size={28} color="#4b5563" className="mx-auto mb-2" />
                  <p className="text-gray-500 text-sm">אין מסמכים עדיין — לחץ "הוסף מסמך" להעלאה</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {docFiles.map((doc, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 px-4 py-3 rounded-xl"
                      style={{ background: '#1f2937', border: '1px solid #374151' }}
                    >
                      {/* Icon */}
                      <div className="flex-shrink-0">{getFileIcon(doc.file.name)}</div>

                      {/* Filename + size */}
                      <div className="flex-1 min-w-0">
                        <div
                          className="text-sm text-white truncate"
                          title={doc.file.name}
                        >
                          {doc.file.name}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          {formatFileSize(doc.file.size)}
                        </div>
                      </div>

                      {/* Category dropdown */}
                      <select
                        value={doc.category}
                        onChange={(e) => updateDocCategory(i, e.target.value)}
                        className="text-xs px-3 py-1.5 rounded-lg outline-none flex-shrink-0"
                        style={{
                          background: '#111827',
                          color: '#d1d5db',
                          border: '1px solid #374151',
                        }}
                      >
                        {docCategories.map((cat) => (
                          <option key={cat.value} value={cat.value}>
                            {cat.label}
                          </option>
                        ))}
                      </select>

                      {/* Remove */}
                      <button
                        type="button"
                        onClick={() => removeDoc(i)}
                        className="flex-shrink-0 p-1.5 rounded-lg transition-colors hover:bg-red-500/20"
                        style={{ color: '#6b7280' }}
                      >
                        <X size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right panel */}
          <div className="space-y-4">
            {/* Pricing */}
            <div
              className="rounded-xl p-6 space-y-4"
              style={{ background: '#111827', border: '1px solid #1f2937' }}
            >
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-base font-semibold text-white">מחירים</h2>
                {/* Currency selector for this watch's prices */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">מטבע:</span>
                  <select
                    value={form.price_currency}
                    onChange={(e) => set('price_currency', e.target.value)}
                    className="px-2.5 py-1 rounded-lg text-xs font-bold outline-none cursor-pointer"
                    style={{ background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.3)', color: '#d4af37' }}
                  >
                    {CURRENCIES.map((c) => (
                      <option key={c} value={c} style={{ background: '#1f2937', color: '#fff' }}>
                        {currencyMeta[c]?.flag || ''} {c} {CURRENCY_SYMBOLS[c]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1.5">
                  מחיר קנייה ({CURRENCY_SYMBOLS[form.price_currency] || form.price_currency})
                </label>
                <input
                  type="number"
                  value={form.purchase_price}
                  onChange={(e) => set('purchase_price', e.target.value)}
                  placeholder="0"
                  min="0"
                  className="w-full px-4 py-2.5 rounded-xl text-sm text-white placeholder-gray-600 outline-none"
                  style={{ background: '#1f2937', border: '1px solid #374151' }}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1.5">
                  מחיר מבוקש ({CURRENCY_SYMBOLS[form.price_currency] || form.price_currency})
                </label>
                <input
                  type="number"
                  value={form.asking_price}
                  onChange={(e) => set('asking_price', e.target.value)}
                  placeholder="0"
                  min="0"
                  className="w-full px-4 py-2.5 rounded-xl text-sm text-white placeholder-gray-600 outline-none"
                  style={{ background: '#1f2937', border: '1px solid #374151' }}
                />
              </div>

              {form.purchase_price && form.asking_price && (
                <div
                  className="rounded-lg p-3 text-center"
                  style={{
                    background: 'rgba(212,175,55,0.08)',
                    border: '1px solid rgba(212,175,55,0.2)',
                  }}
                >
                  <div className="text-xs text-gray-400">רווח פוטנציאלי</div>
                  <div className="text-lg font-bold mt-0.5" style={{ color: '#d4af37' }}>
                    {CURRENCY_SYMBOLS[form.price_currency] || form.price_currency}
                    {(
                      parseFloat(form.asking_price) - parseFloat(form.purchase_price)
                    ).toLocaleString()}
                  </div>
                  <div className="text-xs text-gray-500">
                    {Math.round(
                      ((parseFloat(form.asking_price) - parseFloat(form.purchase_price)) /
                        parseFloat(form.purchase_price)) *
                        100,
                    )}
                    %
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1.5">
                  תאריך רכישה
                </label>
                <input
                  type="date"
                  value={form.purchase_date}
                  onChange={(e) => set('purchase_date', e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl text-sm text-white outline-none"
                  style={{ background: '#1f2937', border: '1px solid #374151' }}
                />
              </div>
            </div>

            {/* Historical ILS rate preview */}
            {(ilsRateLoading || ilsRate) && form.price_currency !== 'ILS' && form.purchase_price && form.purchase_date && (
              <div
                className="rounded-xl p-4 flex items-center gap-3"
                style={{ background: 'rgba(212,175,55,0.07)', border: '1px solid rgba(212,175,55,0.25)' }}
              >
                <span style={{ fontSize: 20 }}>📅</span>
                {ilsRateLoading ? (
                  <div className="flex items-center gap-2">
                    <Loader2 size={14} className="animate-spin" style={{ color: '#d4af37' }} />
                    <span className="text-xs" style={{ color: '#9ca3af' }}>שולף שער היסטורי...</span>
                  </div>
                ) : ilsRate ? (
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs" style={{ color: '#9ca3af' }}>
                        שער ב-{new Date(ilsRate.date).toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' })}
                        {ilsRate.source === 'latest' && <span className="mr-1 text-xs" style={{ color: '#f59e0b' }}>(שער נוכחי)</span>}
                      </span>
                      <span className="text-xs font-mono" style={{ color: '#d4af37' }}>
                        1 {form.price_currency} = ₪{ilsRate.rate.toFixed(4)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-xs font-semibold" style={{ color: '#d1d5db' }}>מחיר קנייה בשקלים</span>
                      <span className="text-base font-bold" style={{ color: '#d4af37' }}>
                        ₪{Math.round(parseFloat(form.purchase_price) * ilsRate.rate).toLocaleString('he-IL')}
                      </span>
                    </div>
                  </div>
                ) : null}
              </div>
            )}

            {/* Status */}
            <div
              className="rounded-xl p-6 space-y-4"
              style={{ background: '#111827', border: '1px solid #1f2937' }}
            >
              <h2 className="text-base font-semibold text-white mb-2">סטטוס ואביזרים</h2>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1.5">סטטוס</label>
                <div className="space-y-2">
                  {statuses.map((s) => (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => set('status', s.value)}
                      className="w-full py-2 px-4 rounded-xl text-sm font-medium transition-all text-right"
                      style={
                        form.status === s.value
                          ? {
                              background: 'rgba(212,175,55,0.2)',
                              color: '#d4af37',
                              border: '1px solid #d4af37',
                            }
                          : {
                              background: '#1f2937',
                              color: '#9ca3af',
                              border: '1px solid #374151',
                            }
                      }
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Box & Papers */}
              <div className="space-y-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <div
                    onClick={() => set('has_box', !form.has_box)}
                    className="w-5 h-5 rounded flex items-center justify-center transition-all cursor-pointer"
                    style={{
                      background: form.has_box ? '#d4af37' : 'transparent',
                      border: `2px solid ${form.has_box ? '#d4af37' : '#374151'}`,
                    }}
                  >
                    {form.has_box && (
                      <span className="text-xs font-bold text-gray-900">✓</span>
                    )}
                  </div>
                  <span className="text-sm text-gray-300">יש קופסה מקורית</span>
                </label>

                <label className="flex items-center gap-3 cursor-pointer">
                  <div
                    onClick={() => set('has_papers', !form.has_papers)}
                    className="w-5 h-5 rounded flex items-center justify-center transition-all cursor-pointer"
                    style={{
                      background: form.has_papers ? '#d4af37' : 'transparent',
                      border: `2px solid ${form.has_papers ? '#d4af37' : '#374151'}`,
                    }}
                  >
                    {form.has_papers && (
                      <span className="text-xs font-bold text-gray-900">✓</span>
                    )}
                  </div>
                  <span className="text-sm text-gray-300">יש תעודת אחריות/ניירות</span>
                </label>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold transition-opacity disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg, #d4af37, #b8962e)', color: '#0a0e1a' }}
            >
              {loading ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  שומר...
                </>
              ) : (
                <>
                  <Save size={18} />
                  {isEdit ? 'עדכן שעון' : 'הוסף שעון'}
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
