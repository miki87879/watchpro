import { useState, useEffect } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts'
import { Plus, Trash2, Download, FileText, Upload, TrendingUp, TrendingDown, DollarSign, Package, X, Printer } from 'lucide-react'
import api from '../api/client'
import toast from 'react-hot-toast'
import { useCurrency } from '../context/CurrencyContext'
import CurrencySelector from '../components/CurrencySelector'

interface Summary {
  total_purchased: number; total_sold: number; total_expenses: number
  realized_profit: number; unrealized_profit: number; total_profit: number
  portfolio_value: number; portfolio_cost: number
  watches_count: number; watches_available: number; watches_sold: number; watches_reserved: number
  roi_percent: number
}
interface Entry {
  id: number; watch_id: number|null; watch_name: string|null
  entry_type: string; amount: number; description: string; date: string
  invoice_number: string|null; currency: string
}
interface MonthData { month: string; purchases: number; sales: number; expenses: number; profit: number }
interface Watch { id: number; brand: string; model: string }

const TYPE_LABELS: Record<string, string> = {
  purchase: 'רכישה', sale: 'מכירה', expense: 'הוצאה', customs: 'מכס', shipping: 'משלוח', repair: 'תיקון'
}
const TYPE_COLORS: Record<string, string> = {
  purchase: 'bg-red-900/40 text-red-400 border-red-700',
  sale: 'bg-green-900/40 text-green-400 border-green-700',
  expense: 'bg-yellow-900/40 text-yellow-400 border-yellow-700',
  customs: 'bg-orange-900/40 text-orange-400 border-orange-700',
  shipping: 'bg-blue-900/40 text-blue-400 border-blue-700',
  repair: 'bg-purple-900/40 text-purple-400 border-purple-700',
}

export default function Finance() {
  const { formatPrice } = useCurrency()
  const fmt = (n: number) => formatPrice(n)
  const [summary, setSummary] = useState<Summary|null>(null)
  const [entries, setEntries] = useState<Entry[]>([])
  const [monthly, setMonthly] = useState<MonthData[]>([])
  const [watches, setWatches] = useState<Watch[]>([])
  const [filterType, setFilterType] = useState('all')
  const [period, setPeriod] = useState(6)
  const [activeTab, setActiveTab] = useState<'entries'|'invoices'|'upload'>('entries')
  const [showAddModal, setShowAddModal] = useState(false)
  const [showInvoiceModal, setShowInvoiceModal] = useState(false)
  const [showIsraeliModal, setShowIsraeliModal] = useState(false)
  const [israeliDocType, setIsraeliDocType] = useState<'invoice' | 'quote'>('invoice')
  const [israeliForm, setIsraeliForm] = useState({
    doc_number: `חשב-${new Date().getFullYear()}-${String(Math.floor(Math.random()*900)+100)}`,
    doc_date: new Date().toISOString().split('T')[0],
    valid_until: '',
    // Seller
    seller_name: 'Watch Pro', seller_vat_number: '', seller_address: '', seller_phone: '', seller_email: '', seller_bank: '',
    // Buyer
    buyer_name: '', buyer_id: '', buyer_address: '', buyer_phone: '', buyer_email: '',
    // Watch
    watch_brand: '', watch_model: '', watch_reference: '', watch_year: '', watch_serial: '', watch_condition: 'excellent',
    has_box: false, has_papers: false,
    // Pricing
    price_before_vat: '', currency: 'ILS', include_vat: true, customs_amount: '',
    notes: '', payment_method: 'העברה בנקאית',
  })
  const [uploadFile, setUploadFile] = useState<File|null>(null)
  const [uploadType, setUploadType] = useState('invoice')
  const [uploading, setUploading] = useState(false)
  const [generatingInvoice, setGeneratingInvoice] = useState(false)
  const [exportingExcel, setExportingExcel] = useState(false)

  const [newEntry, setNewEntry] = useState({
    watch_id: '', entry_type: 'purchase', amount: '', date: '', description: '', currency: 'USD'
  })

  const [invoiceForm, setInvoiceForm] = useState({
    invoice_number: `INV-${new Date().getFullYear()}-${String(Math.floor(Math.random()*900)+100)}`,
    date: new Date().toISOString().split('T')[0],
    seller_name: 'Watch Pro', seller_address: '', seller_phone: '', seller_email: '',
    buyer_name: '', buyer_address: '', buyer_phone: '',
    watch_brand: '', watch_model: '', watch_reference: '', watch_year: '',
    watch_serial: '', watch_condition: 'mint',
    has_box: false, has_papers: false,
    price: '', currency: 'USD', payment_method: 'Bank Transfer',
    notes: '', include_customs: false, customs_amount: '', vat_percent: '0',
  })

  useEffect(() => { loadAll() }, [period])

  async function loadAll() {
    try {
      const [s, e, m, w] = await Promise.all([
        api.get('/api/finance/summary'),
        api.get('/api/finance/entries'),
        api.get(`/api/finance/monthly?months=${period}`),
        api.get('/api/inventory'),
      ])
      setSummary(s.data); setEntries(e.data); setMonthly(m.data); setWatches(w.data)
    } catch { toast.error('שגיאה בטעינת נתונים') }
  }

  async function addEntry() {
    if (!newEntry.amount || !newEntry.entry_type) return toast.error('מלא סוג וסכום')
    try {
      await api.post('/api/finance/entries', {
        ...newEntry,
        watch_id: newEntry.watch_id ? parseInt(newEntry.watch_id) : null,
        amount: parseFloat(newEntry.amount),
      })
      toast.success('✅ רשומה נוספה')
      setShowAddModal(false)
      setNewEntry({ watch_id:'', entry_type:'purchase', amount:'', date:'', description:'', currency:'USD' })
      loadAll()
    } catch { toast.error('שגיאה בהוספה') }
  }

  async function deleteEntry(id: number) {
    try {
      await api.delete(`/api/finance/entries/${id}`)
      setEntries(entries.filter(e => e.id !== id))
      toast.success('הוסר')
    } catch {}
  }

  async function generateInvoice() {
    if (!invoiceForm.buyer_name || !invoiceForm.watch_brand || !invoiceForm.price) {
      return toast.error('מלא לפחות: שם קונה, מותג שעון ומחיר')
    }
    setGeneratingInvoice(true)
    try {
      const r = await api.post('/api/finance/generate-invoice', {
        ...invoiceForm,
        price: parseFloat(invoiceForm.price),
        watch_year: invoiceForm.watch_year ? parseInt(invoiceForm.watch_year) : null,
        customs_amount: parseFloat(invoiceForm.customs_amount || '0'),
        vat_percent: parseFloat(invoiceForm.vat_percent || '0'),
      }, { responseType: 'blob' })
      const url = URL.createObjectURL(r.data)
      const a = document.createElement('a')
      a.href = url; a.download = `invoice_${invoiceForm.invoice_number}.pdf`; a.click()
      toast.success('📄 חשבונית הורדה!')
      setShowInvoiceModal(false)
    } catch { toast.error('שגיאה ביצירת חשבונית') }
    setGeneratingInvoice(false)
  }

  async function generateIsraeliDoc() {
    if (!israeliForm.buyer_name || !israeliForm.watch_brand || !israeliForm.price_before_vat) {
      return toast.error('נא למלא: שם לקוח, מותג שעון ומחיר')
    }
    setGeneratingInvoice(true)
    try {
      const payload = {
        ...israeliForm,
        doc_type: israeliDocType,
        price_before_vat: parseFloat(israeliForm.price_before_vat),
        customs_amount: parseFloat(israeliForm.customs_amount || '0'),
        watch_year: israeliForm.watch_year ? parseInt(israeliForm.watch_year) : null,
        valid_until: israeliForm.valid_until || null,
      }
      const r = await api.post('/api/finance/generate-invoice-il', payload, { responseType: 'blob' })
      const url = URL.createObjectURL(r.data)
      const a = document.createElement('a')
      const prefix = israeliDocType === 'invoice' ? 'חשבונית' : 'הצעת_מחיר'
      a.href = url; a.download = `${prefix}_${israeliForm.doc_number}.pdf`; a.click()
      toast.success(israeliDocType === 'invoice' ? '📄 חשבונית מס הורדה!' : '📋 הצעת מחיר הורדה!')
      setShowIsraeliModal(false)
    } catch (e: any) {
      // Blob responseType — parse error text from blob if available
      let msg = 'שגיאה ביצירת המסמך'
      try {
        if (e?.response?.data instanceof Blob) {
          const text = await e.response.data.text()
          const parsed = JSON.parse(text)
          if (parsed?.detail) msg = parsed.detail
        } else if (e?.response?.data?.detail) {
          msg = e.response.data.detail
        }
      } catch {}
      toast.error(msg)
    }
    setGeneratingInvoice(false)
  }

  async function exportExcel() {
    setExportingExcel(true)
    try {
      const r = await api.get('/api/finance/export-excel', { responseType: 'blob' })
      const url = URL.createObjectURL(r.data)
      const a = document.createElement('a')
      a.href = url; a.download = `WatchPro_Finance_${new Date().toISOString().slice(0,10)}.xlsx`; a.click()
      toast.success('📊 Excel הורד!')
    } catch { toast.error('שגיאה בייצוא') }
    setExportingExcel(false)
  }

  async function uploadDocument() {
    if (!uploadFile) return toast.error('בחר קובץ')
    setUploading(true)
    const form = new FormData()
    form.append('file', uploadFile)
    form.append('doc_type', uploadType)
    try {
      await api.post('/api/finance/upload-document', form, { headers: { 'Content-Type': 'multipart/form-data' } })
      toast.success('📎 מסמך הועלה!')
      setUploadFile(null)
    } catch { toast.error('שגיאה בהעלאה') }
    setUploading(false)
  }

  const filtered = filterType === 'all' ? entries : entries.filter(e => e.entry_type === filterType)
  const s = summary

  return (
    <div className="p-6 min-h-screen" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-white mb-1">💰 חשבונות</h1>
          <p className="text-gray-400">מעקב רווח והפסד, חשבוניות ומסמכים</p>
        </div>
        <div className="flex gap-2 items-center">
          <CurrencySelector />
          <button
            onClick={() => { setIsraeliDocType('invoice'); setShowIsraeliModal(true) }}
            className="flex items-center gap-2 font-semibold px-4 py-2.5 rounded-xl transition-colors text-sm"
            style={{ background: 'linear-gradient(135deg, #d4af37, #b8962e)', color: '#0a0a0a' }}
          >
            <FileText className="w-4 h-4" /> 🇮🇱 חשבונית מס
          </button>
          <button
            onClick={() => { setIsraeliDocType('quote'); setShowIsraeliModal(true) }}
            className="flex items-center gap-2 font-semibold px-4 py-2.5 rounded-xl transition-colors text-sm"
            style={{ background: 'rgba(59,130,246,0.15)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.3)' }}
          >
            <FileText className="w-4 h-4" /> 📋 הצעת מחיר
          </button>
          <button onClick={() => setShowInvoiceModal(true)}
            className="flex items-center gap-2 bg-[#1f2937] border border-[#374151] text-gray-300 font-semibold px-4 py-2.5 rounded-xl hover:border-gray-500 transition-colors text-sm">
            <Printer className="w-4 h-4" /> Invoice (EN)
          </button>
          <button onClick={exportExcel} disabled={exportingExcel}
            className="flex items-center gap-2 bg-green-700 text-white font-semibold px-4 py-2.5 rounded-xl hover:bg-green-600 transition-colors text-sm disabled:opacity-60">
            <Download className="w-4 h-4" /> {exportingExcel ? 'מייצא...' : 'ייצוא Excel'}
          </button>
          <button onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 bg-[#111827] border border-[#374151] text-white px-4 py-2.5 rounded-xl hover:border-[#d4af37] transition-colors text-sm">
            <Plus className="w-4 h-4" /> הוסף רשומה
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      {s && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'שווי תיק', value: fmt(s.portfolio_value), icon: Package, color: 'text-[#d4af37]', sub: `עלות: ${fmt(s.portfolio_cost)}` },
            { label: 'רווח ממומש', value: fmt(s.realized_profit), icon: s.realized_profit >= 0 ? TrendingUp : TrendingDown, color: s.realized_profit >= 0 ? 'text-green-400' : 'text-red-400', sub: `ROI: ${s.roi_percent}%` },
            { label: 'סה"כ מכירות', value: fmt(s.total_sold), icon: DollarSign, color: 'text-blue-400', sub: `${s.watches_sold} שעונים נמכרו` },
            { label: 'סה"כ השקעה', value: fmt(s.total_purchased), icon: DollarSign, color: 'text-red-400', sub: `הוצאות: ${fmt(s.total_expenses)}` },
          ].map((card, i) => (
            <div key={i} className="bg-[#111827] border border-[#1f2937] rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-gray-400 text-sm">{card.label}</span>
                <card.icon className={`w-5 h-5 ${card.color}`} />
              </div>
              <div className={`text-2xl font-bold ${card.color}`}>{card.value}</div>
              <div className="text-xs text-gray-500 mt-1">{card.sub}</div>
            </div>
          ))}
        </div>
      )}

      {/* Inventory mini stats */}
      {s && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { label: 'שעונים במלאי', value: s.watches_count, color: 'text-white' },
            { label: 'זמינים למכירה', value: s.watches_available, color: 'text-green-400' },
            { label: 'שמורים', value: s.watches_reserved, color: 'text-yellow-400' },
          ].map((item, i) => (
            <div key={i} className="bg-[#111827] border border-[#1f2937] rounded-xl p-4 text-center">
              <div className={`text-3xl font-bold ${item.color}`}>{item.value}</div>
              <div className="text-xs text-gray-400 mt-1">{item.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Chart */}
      <div className="bg-[#111827] border border-[#1f2937] rounded-xl p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-semibold">ביצועים חודשיים</h3>
          <div className="flex gap-2">
            {[3, 6, 12].map(m => (
              <button key={m} onClick={() => setPeriod(m)}
                className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${period===m ? 'bg-[#d4af37] text-black font-bold' : 'bg-[#1f2937] text-gray-400 hover:text-white'}`}>
                {m} חודשים
              </button>
            ))}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={monthly} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis dataKey="month" tick={{ fill: '#6b7280', fontSize: 11 }} />
            <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
            <Tooltip formatter={(v: number) => [`$${v.toLocaleString()}`, '']} contentStyle={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 8 }} labelStyle={{ color: '#d4af37' }} />
            <Legend wrapperStyle={{ color: '#9ca3af', fontSize: 12 }} />
            <Bar dataKey="sales" name="מכירות" fill="#22c55e" radius={[3,3,0,0]} />
            <Bar dataKey="purchases" name="רכישות" fill="#ef4444" radius={[3,3,0,0]} />
            <Bar dataKey="profit" name="רווח" fill="#d4af37" radius={[3,3,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-5">
        {[
          { key: 'entries', label: `רשומות (${filtered.length})` },
          { key: 'invoices', label: 'יצירת חשבוניות' },
          { key: 'upload', label: 'העלאת מסמכים' },
        ].map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key as any)}
            className={`px-5 py-2.5 rounded-xl font-medium transition-all text-sm ${activeTab===tab.key ? 'bg-[#d4af37] text-black' : 'bg-[#111827] text-gray-400 border border-[#1f2937] hover:text-white'}`}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── ENTRIES TAB ──────────────────────────────────────────────── */}
      {activeTab === 'entries' && (
        <>
          <div className="flex gap-2 mb-4 flex-wrap">
            {['all', 'purchase', 'sale', 'expense', 'customs', 'shipping', 'repair'].map(t => (
              <button key={t} onClick={() => setFilterType(t)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${filterType===t ? 'bg-[#d4af37] text-black border-[#d4af37]' : 'border-[#374151] text-gray-400 hover:border-[#d4af37]'}`}>
                {t === 'all' ? 'הכל' : TYPE_LABELS[t]}
              </button>
            ))}
          </div>

          <div className="bg-[#111827] border border-[#1f2937] rounded-xl overflow-hidden">
            {filtered.length === 0 ? (
              <div className="text-center py-16 text-gray-500">
                <DollarSign className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p>אין רשומות</p>
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#1f2937]">
                    {['תאריך','סוג','שעון','תיאור','סכום','פעולות'].map(h => (
                      <th key={h} className="px-4 py-3 text-xs text-gray-400 font-medium text-right">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(entry => (
                    <tr key={entry.id} className="border-b border-[#1f2937] hover:bg-[#1f2937]/40 transition-colors">
                      <td className="px-4 py-3 text-gray-400 text-sm">{entry.date}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${TYPE_COLORS[entry.entry_type] || 'bg-gray-800 text-gray-400 border-gray-600'}`}>
                          {TYPE_LABELS[entry.entry_type] || entry.entry_type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-300 text-sm">{entry.watch_name || '—'}</td>
                      <td className="px-4 py-3 text-gray-300 text-sm max-w-xs truncate">{entry.description}</td>
                      <td className={`px-4 py-3 font-bold text-sm ${entry.entry_type === 'sale' ? 'text-green-400' : 'text-red-400'}`}>
                        {entry.entry_type === 'sale' ? '+' : '-'}{formatPrice(Math.abs(entry.amount))}
                      </td>
                      <td className="px-4 py-3">
                        <button onClick={() => deleteEntry(entry.id)}
                          className="p-1.5 rounded bg-[#1f2937] text-gray-400 hover:text-red-400 transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-[#1f2937]">
                    <td colSpan={4} className="px-4 py-3 text-sm font-bold text-gray-300">סה"כ</td>
                    <td className="px-4 py-3 font-bold text-[#d4af37]">
                      {fmt(filtered.reduce((sum, e) => sum + (e.entry_type === 'sale' ? e.amount : -Math.abs(e.amount)), 0))}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        </>
      )}

      {/* ── INVOICES TAB ─────────────────────────────────────────────── */}
      {activeTab === 'invoices' && (
        <div className="bg-[#111827] border border-[#1f2937] rounded-xl p-6">
          <div className="flex items-center gap-3 mb-5">
            <FileText className="w-6 h-6 text-[#d4af37]" />
            <div>
              <h3 className="text-white font-semibold">יצירת חשבונית מכר PDF</h3>
              <p className="text-gray-400 text-sm">חשבונית מקצועית עם לוגו Watch Pro בפורמט PDF</p>
            </div>
          </div>
          <button onClick={() => setShowInvoiceModal(true)}
            className="bg-[#d4af37] text-black font-bold px-8 py-3 rounded-xl hover:bg-[#e8c547] transition-colors flex items-center gap-2">
            <Printer className="w-5 h-5" /> פתח טופס חשבונית
          </button>
          <div className="mt-6 p-4 bg-[#0a0e1a] rounded-xl border border-[#1f2937]">
            <h4 className="text-gray-300 font-medium mb-3">מה כוללת החשבונית:</h4>
            <ul className="text-gray-400 text-sm space-y-1.5">
              {['לוגו Watch Pro מעוצב בסגנון יוקרה','פרטי מוכר וקונה','פרטי השעון המלאים (מותג, דגם, רפרנס, שנה, מצב)','מחיר + מע"מ + מכס (אופציונלי)','מספר חשבונית ייחודי','הערות ותנאי תשלום'].map(item => (
                <li key={item} className="flex items-center gap-2">
                  <span className="text-[#d4af37]">✓</span> {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* ── UPLOAD TAB ──────────────────────────────────────────────── */}
      {activeTab === 'upload' && (
        <div className="bg-[#111827] border border-[#1f2937] rounded-xl p-6">
          <div className="flex items-center gap-3 mb-5">
            <Upload className="w-6 h-6 text-[#d4af37]" />
            <div>
              <h3 className="text-white font-semibold">העלאת מסמכים פיננסיים</h3>
              <p className="text-gray-400 text-sm">חשבוניות, אישורי מכס, קבלות תשלום ועוד</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-gray-400 mb-2 block">סוג מסמך</label>
              <select value={uploadType} onChange={e => setUploadType(e.target.value)}
                className="w-full bg-[#1f2937] border border-[#374151] rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-[#d4af37]">
                <option value="invoice">חשבונית רכישה</option>
                <option value="sale_invoice">חשבונית מכירה</option>
                <option value="customs">אישור מכס / ייבוא</option>
                <option value="payment">אישור תשלום</option>
                <option value="certificate">תעודת אמינות</option>
                <option value="shipping">אישור משלוח</option>
                <option value="insurance">ביטוח</option>
                <option value="other">אחר</option>
              </select>
            </div>
            <div>
              <label className="text-sm text-gray-400 mb-2 block">קובץ (PDF, תמונה)</label>
              <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp"
                onChange={e => setUploadFile(e.target.files?.[0] || null)}
                className="w-full bg-[#1f2937] border border-[#374151] rounded-lg px-3 py-2 text-white text-sm file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:bg-[#d4af37] file:text-black file:text-xs file:font-semibold" />
            </div>
          </div>
          {uploadFile && (
            <div className="mt-3 flex items-center gap-2 text-sm text-gray-300">
              <FileText className="w-4 h-4 text-[#d4af37]" />
              <span>{uploadFile.name}</span>
              <span className="text-gray-500">({(uploadFile.size/1024).toFixed(0)} KB)</span>
            </div>
          )}
          <button onClick={uploadDocument} disabled={!uploadFile || uploading}
            className="mt-4 bg-[#d4af37] text-black font-semibold px-6 py-2.5 rounded-xl hover:bg-[#e8c547] transition-colors disabled:opacity-50 flex items-center gap-2">
            <Upload className="w-4 h-4" /> {uploading ? 'מעלה...' : 'העלה מסמך'}
          </button>
        </div>
      )}

      {/* ── ADD ENTRY MODAL ─────────────────────────────────────────── */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[#111827] border border-[#1f2937] rounded-2xl p-6 w-full max-w-lg">
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-white font-bold text-lg">הוסף רשומה פיננסית</h3>
              <button onClick={() => setShowAddModal(false)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">סוג</label>
                  <select value={newEntry.entry_type} onChange={e => setNewEntry({...newEntry, entry_type: e.target.value})}
                    className="w-full bg-[#1f2937] border border-[#374151] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#d4af37]">
                    {Object.entries(TYPE_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">סכום ($)</label>
                  <input type="number" value={newEntry.amount} onChange={e => setNewEntry({...newEntry, amount: e.target.value})}
                    placeholder="0"
                    className="w-full bg-[#1f2937] border border-[#374151] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#d4af37]" />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">שעון קשור (אופציונלי)</label>
                <select value={newEntry.watch_id} onChange={e => setNewEntry({...newEntry, watch_id: e.target.value})}
                  className="w-full bg-[#1f2937] border border-[#374151] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#d4af37]">
                  <option value="">— ללא שעון —</option>
                  {watches.map(w => <option key={w.id} value={w.id}>{w.brand} {w.model}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">תיאור</label>
                <input value={newEntry.description} onChange={e => setNewEntry({...newEntry, description: e.target.value})}
                  placeholder="פרטי העסקה..."
                  className="w-full bg-[#1f2937] border border-[#374151] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#d4af37]" />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">תאריך</label>
                <input type="date" value={newEntry.date} onChange={e => setNewEntry({...newEntry, date: e.target.value})}
                  className="w-full bg-[#1f2937] border border-[#374151] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#d4af37]" />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={addEntry} className="flex-1 bg-[#d4af37] text-black font-bold py-2.5 rounded-xl hover:bg-[#e8c547]">
                הוסף
              </button>
              <button onClick={() => setShowAddModal(false)} className="flex-1 bg-[#1f2937] text-gray-300 py-2.5 rounded-xl hover:bg-[#374151]">
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── INVOICE MODAL ───────────────────────────────────────────── */}
      {showInvoiceModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-[#111827] border border-[#1f2937] rounded-2xl p-6 w-full max-w-2xl my-4">
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-white font-bold text-lg flex items-center gap-2">
                <Printer className="w-5 h-5 text-[#d4af37]" /> יצירת חשבונית מכר PDF
              </h3>
              <button onClick={() => setShowInvoiceModal(false)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-5">
              {/* Invoice meta */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">מספר חשבונית</label>
                  <input value={invoiceForm.invoice_number} onChange={e => setInvoiceForm({...invoiceForm, invoice_number: e.target.value})}
                    className="w-full bg-[#1f2937] border border-[#374151] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#d4af37]" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">תאריך</label>
                  <input type="date" value={invoiceForm.date} onChange={e => setInvoiceForm({...invoiceForm, date: e.target.value})}
                    className="w-full bg-[#1f2937] border border-[#374151] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#d4af37]" />
                </div>
              </div>

              {/* Seller */}
              <div className="border border-[#1f2937] rounded-xl p-4">
                <h4 className="text-gray-300 font-medium mb-3 text-sm">📤 פרטי המוכר</h4>
                <div className="grid grid-cols-2 gap-3">
                  {[['שם', 'seller_name'], ['כתובת', 'seller_address'], ['טלפון', 'seller_phone'], ['אימייל', 'seller_email']].map(([label, key]) => (
                    <div key={key}>
                      <label className="text-xs text-gray-500 mb-1 block">{label}</label>
                      <input value={(invoiceForm as any)[key]} onChange={e => setInvoiceForm({...invoiceForm, [key]: e.target.value})}
                        className="w-full bg-[#0a0e1a] border border-[#374151] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#d4af37]" />
                    </div>
                  ))}
                </div>
              </div>

              {/* Buyer */}
              <div className="border border-[#1f2937] rounded-xl p-4">
                <h4 className="text-gray-300 font-medium mb-3 text-sm">📥 פרטי הקונה</h4>
                <div className="grid grid-cols-2 gap-3">
                  {[['שם *', 'buyer_name'], ['כתובת', 'buyer_address'], ['טלפון', 'buyer_phone']].map(([label, key]) => (
                    <div key={key}>
                      <label className="text-xs text-gray-500 mb-1 block">{label}</label>
                      <input value={(invoiceForm as any)[key]} onChange={e => setInvoiceForm({...invoiceForm, [key]: e.target.value})}
                        className="w-full bg-[#0a0e1a] border border-[#374151] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#d4af37]" />
                    </div>
                  ))}
                </div>
              </div>

              {/* Watch */}
              <div className="border border-[#1f2937] rounded-xl p-4">
                <h4 className="text-gray-300 font-medium mb-3 text-sm">⌚ פרטי השעון</h4>
                <div className="grid grid-cols-3 gap-3">
                  {[['מותג *', 'watch_brand'], ['דגם *', 'watch_model'], ['רפרנס', 'watch_reference'],
                    ['שנה', 'watch_year'], ['מספר סידורי', 'watch_serial']].map(([label, key]) => (
                    <div key={key}>
                      <label className="text-xs text-gray-500 mb-1 block">{label}</label>
                      <input value={(invoiceForm as any)[key]} onChange={e => setInvoiceForm({...invoiceForm, [key]: e.target.value})}
                        className="w-full bg-[#0a0e1a] border border-[#374151] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#d4af37]" />
                    </div>
                  ))}
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">מצב</label>
                    <select value={invoiceForm.watch_condition} onChange={e => setInvoiceForm({...invoiceForm, watch_condition: e.target.value})}
                      className="w-full bg-[#0a0e1a] border border-[#374151] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#d4af37]">
                      {['mint','excellent','good','fair'].map(c => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
                <div className="flex gap-4 mt-3">
                  <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                    <input type="checkbox" checked={invoiceForm.has_box} onChange={e => setInvoiceForm({...invoiceForm, has_box: e.target.checked})}
                      className="w-4 h-4 accent-[#d4af37]" /> קופסא מקורית
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                    <input type="checkbox" checked={invoiceForm.has_papers} onChange={e => setInvoiceForm({...invoiceForm, has_papers: e.target.checked})}
                      className="w-4 h-4 accent-[#d4af37]" /> תעודות אחריות
                  </label>
                </div>
              </div>

              {/* Pricing */}
              <div className="border border-[#1f2937] rounded-xl p-4">
                <h4 className="text-gray-300 font-medium mb-3 text-sm">💰 תמחור</h4>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">מחיר *</label>
                    <input type="number" value={invoiceForm.price} onChange={e => setInvoiceForm({...invoiceForm, price: e.target.value})}
                      placeholder="0"
                      className="w-full bg-[#0a0e1a] border border-[#374151] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#d4af37]" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">מטבע</label>
                    <select value={invoiceForm.currency} onChange={e => setInvoiceForm({...invoiceForm, currency: e.target.value})}
                      className="w-full bg-[#0a0e1a] border border-[#374151] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#d4af37]">
                      {['USD','EUR','GBP','ILS','CHF'].map(c => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">אמצעי תשלום</label>
                    <select value={invoiceForm.payment_method} onChange={e => setInvoiceForm({...invoiceForm, payment_method: e.target.value})}
                      className="w-full bg-[#0a0e1a] border border-[#374151] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#d4af37]">
                      {['Bank Transfer','Cash','PayPal','Crypto','Credit Card','Bit / PayBox'].map(m => <option key={m}>{m}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">מע"מ %</label>
                    <input type="number" value={invoiceForm.vat_percent} onChange={e => setInvoiceForm({...invoiceForm, vat_percent: e.target.value})}
                      placeholder="0"
                      className="w-full bg-[#0a0e1a] border border-[#374151] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#d4af37]" />
                  </div>
                  <div>
                    <label className="flex items-center gap-2 text-xs text-gray-500 mb-1 cursor-pointer">
                      <input type="checkbox" checked={invoiceForm.include_customs} onChange={e => setInvoiceForm({...invoiceForm, include_customs: e.target.checked})}
                        className="accent-[#d4af37]" /> כלול מכס
                    </label>
                    <input type="number" value={invoiceForm.customs_amount} disabled={!invoiceForm.include_customs}
                      onChange={e => setInvoiceForm({...invoiceForm, customs_amount: e.target.value})}
                      placeholder="סכום מכס"
                      className="w-full bg-[#0a0e1a] border border-[#374151] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#d4af37] disabled:opacity-50" />
                  </div>
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-400 mb-1 block">הערות</label>
                <textarea value={invoiceForm.notes} onChange={e => setInvoiceForm({...invoiceForm, notes: e.target.value})}
                  rows={2} placeholder="הערות נוספות לחשבונית..."
                  className="w-full bg-[#1f2937] border border-[#374151] rounded-lg px-3 py-2 text-white text-sm resize-none focus:outline-none focus:border-[#d4af37]" />
              </div>
            </div>

            <div className="flex gap-3 mt-5">
              <button onClick={generateInvoice} disabled={generatingInvoice}
                className="flex-1 bg-[#d4af37] text-black font-bold py-3 rounded-xl hover:bg-[#e8c547] flex items-center justify-center gap-2 disabled:opacity-60">
                <Download className="w-4 h-4" />
                {generatingInvoice ? 'יוצר PDF...' : 'הורד חשבונית PDF'}
              </button>
              <button onClick={() => setShowInvoiceModal(false)}
                className="px-6 bg-[#1f2937] text-gray-300 py-3 rounded-xl hover:bg-[#374151]">
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Israeli Invoice / Quote Modal ─────────────────────────────────── */}
      {showIsraeliModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto" style={{ background: 'rgba(0,0,0,0.75)' }}>
          <div className="w-full max-w-2xl rounded-2xl my-4" style={{ background: '#141004', border: '1px solid rgba(212,175,55,0.3)' }} dir="rtl">
            {/* Modal header */}
            <div className="flex items-center justify-between p-5" style={{ borderBottom: '1px solid rgba(212,175,55,0.15)' }}>
              <div>
                <h2 className="text-lg font-bold text-white">
                  {israeliDocType === 'invoice' ? '🇮🇱 חשבונית מס ישראלית' : '📋 הצעת מחיר'}
                </h2>
                <p className="text-xs mt-0.5" style={{ color: '#6b7280' }}>
                  {israeliDocType === 'invoice' ? 'חשבונית מס כולל מע"מ 17% לפי תקן ישראלי' : 'הצעת מחיר ללקוח עם שורת חתימה'}
                </p>
              </div>
              <button onClick={() => setShowIsraeliModal(false)} style={{ color: '#6b7280' }}>
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-5 max-h-[70vh] overflow-y-auto">
              {/* Doc type toggle */}
              <div className="flex gap-2">
                {(['invoice', 'quote'] as const).map((t) => (
                  <button key={t} onClick={() => setIsraeliDocType(t)}
                    className="flex-1 py-2 rounded-xl text-sm font-semibold transition-all"
                    style={{
                      background: israeliDocType === t ? 'linear-gradient(135deg, #d4af37, #b8962e)' : 'rgba(255,255,255,0.05)',
                      color: israeliDocType === t ? '#0a0a0a' : '#9ca3af',
                    }}>
                    {t === 'invoice' ? '🧾 חשבונית מס' : '📋 הצעת מחיר'}
                  </button>
                ))}
              </div>

              {/* Doc meta */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs mb-1" style={{ color: '#9ca3af' }}>
                    {israeliDocType === 'invoice' ? 'מספר חשבונית' : 'מספר הצעה'}
                  </label>
                  <input value={israeliForm.doc_number} onChange={e => setIsraeliForm({...israeliForm, doc_number: e.target.value})}
                    className="w-full px-3 py-2 rounded-lg text-white text-sm outline-none"
                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(212,175,55,0.2)' }} />
                </div>
                <div>
                  <label className="block text-xs mb-1" style={{ color: '#9ca3af' }}>תאריך</label>
                  <input type="date" value={israeliForm.doc_date} onChange={e => setIsraeliForm({...israeliForm, doc_date: e.target.value})}
                    className="w-full px-3 py-2 rounded-lg text-white text-sm outline-none"
                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(212,175,55,0.2)' }} />
                </div>
                {israeliDocType === 'quote' && (
                  <div>
                    <label className="block text-xs mb-1" style={{ color: '#9ca3af' }}>בתוקף עד</label>
                    <input type="date" value={israeliForm.valid_until} onChange={e => setIsraeliForm({...israeliForm, valid_until: e.target.value})}
                      className="w-full px-3 py-2 rounded-lg text-white text-sm outline-none"
                      style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(212,175,55,0.2)' }} />
                  </div>
                )}
              </div>

              {/* Seller */}
              <div>
                <p className="text-xs font-semibold mb-2" style={{ color: '#d4af37' }}>פרטי המוכר (העסק שלך)</p>
                <div className="grid grid-cols-2 gap-3">
                  {[['שם העסק *', 'seller_name'], ['מספר עוסק מורשה / ח.פ.', 'seller_vat_number'], ['כתובת', 'seller_address'], ['טלפון', 'seller_phone'], ['אימייל', 'seller_email'], ['פרטי חשבון בנק', 'seller_bank']].map(([label, key]) => (
                    <div key={key}>
                      <label className="block text-xs mb-1" style={{ color: '#9ca3af' }}>{label}</label>
                      <input value={(israeliForm as any)[key]} onChange={e => setIsraeliForm({...israeliForm, [key]: e.target.value})}
                        className="w-full px-3 py-2 rounded-lg text-white text-sm outline-none"
                        style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(212,175,55,0.2)' }} />
                    </div>
                  ))}
                </div>
              </div>

              {/* Buyer */}
              <div>
                <p className="text-xs font-semibold mb-2" style={{ color: '#60a5fa' }}>פרטי הלקוח / הקונה</p>
                <div className="grid grid-cols-2 gap-3">
                  {[['שם מלא *', 'buyer_name'], ['ת.ז. / ח.פ.', 'buyer_id'], ['כתובת', 'buyer_address'], ['טלפון', 'buyer_phone'], ['אימייל', 'buyer_email']].map(([label, key]) => (
                    <div key={key}>
                      <label className="block text-xs mb-1" style={{ color: '#9ca3af' }}>{label}</label>
                      <input value={(israeliForm as any)[key]} onChange={e => setIsraeliForm({...israeliForm, [key]: e.target.value})}
                        className="w-full px-3 py-2 rounded-lg text-white text-sm outline-none"
                        style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(212,175,55,0.2)' }} />
                    </div>
                  ))}
                </div>
              </div>

              {/* Watch */}
              <div>
                <p className="text-xs font-semibold mb-2" style={{ color: '#a78bfa' }}>פרטי השעון</p>
                <div className="grid grid-cols-2 gap-3">
                  {[['מותג *', 'watch_brand'], ['דגם *', 'watch_model'], ['רפרנס', 'watch_reference'], ['שנה', 'watch_year'], ['מספר סידורי', 'watch_serial']].map(([label, key]) => (
                    <div key={key}>
                      <label className="block text-xs mb-1" style={{ color: '#9ca3af' }}>{label}</label>
                      <input value={(israeliForm as any)[key]} onChange={e => setIsraeliForm({...israeliForm, [key]: e.target.value})}
                        className="w-full px-3 py-2 rounded-lg text-white text-sm outline-none"
                        style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(212,175,55,0.2)' }} />
                    </div>
                  ))}
                  <div className="flex gap-4 items-center pt-4">
                    {[['has_box', '📦 קופסה'], ['has_papers', '📄 תעודות']].map(([k, label]) => (
                      <label key={k} className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={(israeliForm as any)[k]} onChange={e => setIsraeliForm({...israeliForm, [k]: e.target.checked})}
                          className="w-4 h-4 accent-yellow-500" />
                        <span className="text-sm text-white">{label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              {/* Pricing */}
              <div>
                <p className="text-xs font-semibold mb-2" style={{ color: '#4ade80' }}>תמחור (₪)</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs mb-1" style={{ color: '#9ca3af' }}>מחיר לפני מע"מ (₪) *</label>
                    <input type="number" value={israeliForm.price_before_vat} onChange={e => setIsraeliForm({...israeliForm, price_before_vat: e.target.value})}
                      className="w-full px-3 py-2 rounded-lg text-white text-sm outline-none"
                      style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(212,175,55,0.2)' }} />
                  </div>
                  <div>
                    <label className="block text-xs mb-1" style={{ color: '#9ca3af' }}>מכס / עלויות ייבוא (₪)</label>
                    <input type="number" value={israeliForm.customs_amount} onChange={e => setIsraeliForm({...israeliForm, customs_amount: e.target.value})}
                      className="w-full px-3 py-2 rounded-lg text-white text-sm outline-none"
                      style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(212,175,55,0.2)' }} />
                  </div>
                  <div>
                    <label className="block text-xs mb-1" style={{ color: '#9ca3af' }}>אמצעי תשלום</label>
                    <select value={israeliForm.payment_method} onChange={e => setIsraeliForm({...israeliForm, payment_method: e.target.value})}
                      className="w-full px-3 py-2 rounded-lg text-white text-sm outline-none"
                      style={{ background: 'rgba(20,16,4,0.95)', border: '1px solid rgba(212,175,55,0.2)' }}>
                      <option>העברה בנקאית</option>
                      <option>מזומן</option>
                      <option>כרטיס אשראי</option>
                      <option>ביט / PayBox</option>
                      <option>PayPal</option>
                      <option>Wire Transfer</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-3 pt-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={israeliForm.include_vat} onChange={e => setIsraeliForm({...israeliForm, include_vat: e.target.checked})}
                        className="w-4 h-4 accent-yellow-500" />
                      <span className="text-sm text-white">כולל מע"מ 17%</span>
                    </label>
                  </div>
                </div>

                {/* Live total preview */}
                {israeliForm.price_before_vat && (
                  <div className="mt-3 rounded-xl p-3" style={{ background: 'rgba(212,175,55,0.08)', border: '1px solid rgba(212,175,55,0.2)' }}>
                    <div className="flex justify-between text-sm">
                      <span style={{ color: '#9ca3af' }}>מחיר לפני מע"מ:</span>
                      <span className="text-white">₪{parseFloat(israeliForm.price_before_vat || '0').toLocaleString()}</span>
                    </div>
                    {israeliForm.include_vat && (
                      <div className="flex justify-between text-sm">
                        <span style={{ color: '#9ca3af' }}>מע"מ 17%:</span>
                        <span style={{ color: '#f87171' }}>+₪{(parseFloat(israeliForm.price_before_vat || '0') * 0.17).toLocaleString('en-US', { maximumFractionDigits: 2 })}</span>
                      </div>
                    )}
                    {israeliForm.customs_amount && parseFloat(israeliForm.customs_amount) > 0 && (
                      <div className="flex justify-between text-sm">
                        <span style={{ color: '#9ca3af' }}>מכס:</span>
                        <span style={{ color: '#f87171' }}>+₪{parseFloat(israeliForm.customs_amount).toLocaleString()}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-base font-bold mt-1 pt-1" style={{ borderTop: '1px solid rgba(212,175,55,0.2)' }}>
                      <span style={{ color: '#d4af37' }}>סה"כ לתשלום:</span>
                      <span style={{ color: '#d4af37' }}>
                        ₪{(parseFloat(israeliForm.price_before_vat || '0') * (israeliForm.include_vat ? 1.17 : 1) + parseFloat(israeliForm.customs_amount || '0')).toLocaleString('en-US', { maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs mb-1" style={{ color: '#9ca3af' }}>הערות</label>
                <textarea value={israeliForm.notes} onChange={e => setIsraeliForm({...israeliForm, notes: e.target.value})}
                  rows={2} className="w-full px-3 py-2 rounded-lg text-white text-sm outline-none resize-none"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(212,175,55,0.2)' }} />
              </div>
            </div>

            {/* Footer */}
            <div className="flex gap-3 p-5" style={{ borderTop: '1px solid rgba(212,175,55,0.1)' }}>
              <button onClick={generateIsraeliDoc} disabled={generatingInvoice}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm disabled:opacity-60"
                style={{ background: 'linear-gradient(135deg, #d4af37, #b8962e)', color: '#0a0a0a' }}>
                <Download className="w-4 h-4" />
                {generatingInvoice ? 'יוצר PDF...' : (israeliDocType === 'invoice' ? 'הורד חשבונית מס PDF' : 'הורד הצעת מחיר PDF')}
              </button>
              <button onClick={() => setShowIsraeliModal(false)}
                className="px-5 py-3 rounded-xl text-sm" style={{ background: 'rgba(255,255,255,0.06)', color: '#9ca3af' }}>
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
