import { useState, useEffect, useCallback, useRef } from 'react'
import { useDropzone } from 'react-dropzone'
import {
  FolderOpen,
  Upload,
  X,
  Trash2,
  Download,
  Search,
  FileText,
  FileImage,
  File,
  ShieldCheck,
  Receipt,
  Truck,
  Star,
  Scale,
  ClipboardList,
  Image,
  Loader2,
  FilePlus,
  ChevronDown,
  Watch,
  CheckCircle,
  Building2,
  User,
  Printer,
} from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../api/client'

// ─── Types ────────────────────────────────────────────────────────────────────

interface DocumentItem {
  id: number
  original_name: string
  category: string
  file_size: number
  download_url: string
  created_at: string
  watch_label?: string
  description?: string
}

interface InventoryWatch {
  id: number
  brand: string
  model: string
  reference: string | null
  serial_number: string | null
  year: number | null
  condition: string
  asking_price: number | null
  purchase_price: number | null
  price_currency: string
  has_box: boolean
  has_papers: boolean
  status: string
  primary_photo: string | null
  notes: string | null
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORIES = [
  { value: 'all', label: 'הכל', emoji: '📁' },
  { value: 'warranty', label: 'תעודת אחריות', emoji: '🛡️' },
  { value: 'invoice_tax', label: 'חשבונית מס', emoji: '🧾' },
  { value: 'invoice_customs', label: 'חשבונית מכס', emoji: '🚢' },
  { value: 'receipt', label: 'קבלה', emoji: '💳' },
  { value: 'certificate', label: 'תעודת אותנטיות', emoji: '⭐' },
  { value: 'appraisal', label: 'הערכת שמאי', emoji: '⚖️' },
  { value: 'contract', label: 'חוזה/הסכם', emoji: '📝' },
  { value: 'image', label: 'תמונה', emoji: '🖼️' },
  { value: 'other', label: 'אחר', emoji: '📎' },
]

const UPLOAD_CATEGORIES = CATEGORIES.filter((c) => c.value !== 'all')

const DOC_CURRENCIES = ['USD', 'EUR', 'GBP', 'ILS', 'CHF', 'AED', 'JPY']

const CONDITION_LABELS: Record<string, string> = {
  mint: 'מושלם (Mint)',
  excellent: 'מצוין (Excellent)',
  very_good: 'טוב מאוד (Very Good)',
  good: 'טוב (Good)',
  fair: 'סביר (Fair)',
  poor: 'ירוד (Poor)',
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$', EUR: '€', GBP: '£', ILS: '₪', CHF: 'CHF', AED: 'AED', JPY: '¥',
}

function genDocNumber(type: 'invoice' | 'quote'): string {
  const prefix = type === 'invoice' ? 'INV' : 'QT'
  const d = new Date()
  const ds = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  return `${prefix}-${ds}-${Math.floor(Math.random() * 900) + 100}`
}

function todayFormatted(): string {
  const d = new Date()
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

// ─── Document HTML Generator ─────────────────────────────────────────────────

function buildDocumentHTML(opts: {
  docType: 'invoice' | 'quote'
  docNumber: string
  docDate: string
  validUntil: string
  seller: { name: string; address: string; phone: string; email: string; taxId: string }
  buyer: { name: string; address: string; phone: string; email: string }
  watch: InventoryWatch
  price: string
  currency: string
  notes: string
  apiBase: string
}): string {
  const { docType, docNumber, docDate, validUntil, seller, buyer, watch, price, currency, notes, apiBase } = opts
  const sym = CURRENCY_SYMBOLS[currency] || currency
  const isInvoice = docType === 'invoice'
  const title = isInvoice ? 'חשבונית מס' : 'הצעת מחיר'
  const condLabel = CONDITION_LABELS[watch.condition] || watch.condition

  const photoSrc = watch.primary_photo ? `${apiBase}${watch.primary_photo}` : null

  const priceNum = parseFloat(price) || 0
  const vatRate = currency === 'ILS' ? 0.17 : 0
  const vatAmt = Math.round(priceNum * vatRate * 100) / 100
  const total = Math.round((priceNum + vatAmt) * 100) / 100

  const photoBlock = photoSrc
    ? `<div style="text-align:center;margin-bottom:24px">
        <img src="${photoSrc}" alt="${watch.brand} ${watch.model}"
          style="max-height:220px;max-width:100%;border-radius:10px;border:1px solid #e5e7eb;object-fit:contain" />
      </div>`
    : ''

  const validRow = !isInvoice
    ? `<tr><td style="color:#6b7280;padding:2px 0">בתוקף עד:</td><td style="font-weight:600;padding:2px 0 2px 16px">${validUntil}</td></tr>`
    : ''

  const vatRow = vatAmt > 0
    ? `<tr><td style="padding:6px 12px;color:#6b7280">מע"מ 17%</td>
         <td style="padding:6px 12px;text-align:left">${sym}${vatAmt.toLocaleString()}</td></tr>
       <tr style="background:#f0fdf4">
         <td style="padding:8px 12px;font-weight:700;color:#166534">סה"כ לתשלום</td>
         <td style="padding:8px 12px;text-align:left;font-weight:700;color:#166534">${sym}${total.toLocaleString()}</td>
       </tr>`
    : ''

  return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
<meta charset="UTF-8"/>
<title>${title} ${docNumber}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box }
  body { font-family:'Segoe UI',Arial,sans-serif; background:#f9fafb; color:#111827; font-size:14px; padding:32px 20px }
  @media print { body { background:white; padding:0 } .no-print { display:none } }
  .page { max-width:820px; margin:0 auto; background:white; border-radius:12px; overflow:hidden; box-shadow:0 2px 16px rgba(0,0,0,.08) }
  .header { background:linear-gradient(135deg,#0d1117,#1f2937); color:white; padding:32px 40px; display:flex; justify-content:space-between; align-items:flex-start }
  .logo { font-size:24px; font-weight:800; color:#d4af37; letter-spacing:.5px }
  .logo-sub { color:#9ca3af; font-size:12px; margin-top:3px }
  .doc-meta { text-align:left }
  .doc-type { font-size:22px; font-weight:700; color:white; margin-bottom:6px }
  .doc-num { color:#d4af37; font-size:14px; font-weight:600 }
  .doc-date { color:#9ca3af; font-size:12px; margin-top:3px }
  .body { padding:32px 40px }
  .parties { display:grid; grid-template-columns:1fr 1fr; gap:24px; margin-bottom:28px }
  .party-card { background:#f9fafb; border:1px solid #e5e7eb; border-radius:8px; padding:16px }
  .party-title { font-size:11px; text-transform:uppercase; letter-spacing:1px; color:#9ca3af; margin-bottom:8px; font-weight:600 }
  .party-name { font-size:15px; font-weight:700; color:#111827; margin-bottom:4px }
  .party-detail { font-size:12px; color:#6b7280; line-height:1.7 }
  .section-title { font-size:12px; font-weight:700; color:#6b7280; text-transform:uppercase; letter-spacing:.8px; margin-bottom:12px; padding-bottom:6px; border-bottom:2px solid #f3f4f6 }
  .watch-card { border:1px solid #e5e7eb; border-radius:10px; overflow:hidden; margin-bottom:24px }
  .watch-card-header { background:#f3f4f6; padding:12px 16px; display:flex; justify-content:space-between; align-items:center }
  .watch-title { font-weight:700; font-size:16px; color:#111827 }
  .watch-ref { color:#6b7280; font-size:12px }
  .watch-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:0 }
  .watch-field { padding:12px 16px; border-top:1px solid #e5e7eb }
  .watch-field:nth-child(3n+2) { border-left:1px solid #e5e7eb; border-right:1px solid #e5e7eb }
  .field-label { font-size:10px; text-transform:uppercase; color:#9ca3af; letter-spacing:.6px; margin-bottom:2px }
  .field-value { font-size:13px; font-weight:600; color:#111827 }
  .badge { display:inline-block; padding:2px 8px; border-radius:99px; font-size:11px; font-weight:600 }
  .badge-green { background:#dcfce7; color:#166534 }
  .badge-gray { background:#f3f4f6; color:#6b7280 }
  .price-table { width:100%; border-collapse:collapse; margin-bottom:24px }
  .price-table td { padding:6px 12px }
  .price-table tr:first-child { background:#f9fafb }
  .price-table tr:first-child td { padding:10px 12px }
  .price-subtotal { font-size:15px; font-weight:700 }
  .price-currency { color:#9ca3af; font-size:11px; margin-right:4px }
  .notes-box { background:#fffbeb; border:1px solid #fde68a; border-radius:8px; padding:14px 16px; margin-bottom:24px }
  .notes-label { font-size:11px; font-weight:700; color:#92400e; margin-bottom:4px; text-transform:uppercase; letter-spacing:.6px }
  .notes-text { font-size:13px; color:#78350f; line-height:1.6 }
  .sig-row { display:grid; grid-template-columns:1fr 1fr; gap:32px; margin-top:32px }
  .sig-box { border-top:2px solid #e5e7eb; padding-top:8px }
  .sig-label { font-size:11px; color:#9ca3af }
  .footer { background:#f9fafb; border-top:1px solid #e5e7eb; padding:16px 40px; text-align:center; font-size:11px; color:#9ca3af }
  .print-btn { position:fixed; bottom:24px; left:50%; transform:translateX(-50%); background:#d4af37; color:#0a0e1a; border:none; padding:12px 32px; border-radius:99px; font-size:15px; font-weight:700; cursor:pointer; box-shadow:0 4px 16px rgba(212,175,55,.4); display:flex; align-items:center; gap:8px }
  .print-btn:hover { background:#b8962e }
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div>
      <div class="logo">⌚ Watch Pro</div>
      <div class="logo-sub">ניהול שעוני יוקרה</div>
    </div>
    <div class="doc-meta">
      <div class="doc-type">${title}</div>
      <div class="doc-num">${docNumber}</div>
      <div class="doc-date">
        <table style="font-size:12px;color:#9ca3af;margin-top:6px">
          <tr><td style="color:#6b7280;padding:2px 0">תאריך:</td><td style="font-weight:600;padding:2px 0 2px 16px">${docDate}</td></tr>
          ${validRow}
        </table>
      </div>
    </div>
  </div>

  <div class="body">
    <div class="parties">
      <div class="party-card">
        <div class="party-title">🏢 מוכר / ספק</div>
        <div class="party-name">${seller.name || '—'}</div>
        <div class="party-detail">
          ${seller.address ? seller.address + '<br/>' : ''}
          ${seller.phone ? '📞 ' + seller.phone + '<br/>' : ''}
          ${seller.email ? '✉️ ' + seller.email + '<br/>' : ''}
          ${seller.taxId ? 'ח.פ. / ע.מ.: ' + seller.taxId : ''}
        </div>
      </div>
      <div class="party-card">
        <div class="party-title">👤 קונה / לקוח</div>
        <div class="party-name">${buyer.name || '—'}</div>
        <div class="party-detail">
          ${buyer.address ? buyer.address + '<br/>' : ''}
          ${buyer.phone ? '📞 ' + buyer.phone + '<br/>' : ''}
          ${buyer.email ? '✉️ ' + buyer.email : ''}
        </div>
      </div>
    </div>

    <div class="section-title">⌚ פרטי השעון</div>
    ${photoBlock}
    <div class="watch-card">
      <div class="watch-card-header">
        <div>
          <div class="watch-title">${watch.brand} ${watch.model}</div>
          ${watch.reference ? `<div class="watch-ref">רפרנס: ${watch.reference}</div>` : ''}
        </div>
        <span class="badge badge-green">${condLabel}</span>
      </div>
      <div class="watch-grid">
        ${watch.serial_number ? `<div class="watch-field"><div class="field-label">מספר סידורי</div><div class="field-value">${watch.serial_number}</div></div>` : ''}
        ${watch.year ? `<div class="watch-field"><div class="field-label">שנת ייצור</div><div class="field-value">${watch.year}</div></div>` : ''}
        <div class="watch-field">
          <div class="field-label">קופסה מקורית</div>
          <div class="field-value">${watch.has_box ? '<span class="badge badge-green">✓ כן</span>' : '<span class="badge badge-gray">✗ לא</span>'}</div>
        </div>
        <div class="watch-field">
          <div class="field-label">ניירות מקוריים</div>
          <div class="field-value">${watch.has_papers ? '<span class="badge badge-green">✓ כן</span>' : '<span class="badge badge-gray">✗ לא</span>'}</div>
        </div>
        ${watch.notes ? `<div class="watch-field" style="grid-column:span 3"><div class="field-label">הערות על השעון</div><div class="field-value" style="font-weight:400;color:#6b7280">${watch.notes}</div></div>` : ''}
      </div>
    </div>

    <div class="section-title">💰 ${isInvoice ? 'פירוט תשלום' : 'פירוט מחיר'}</div>
    <table class="price-table" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
      <tr>
        <td style="font-weight:600">${watch.brand} ${watch.model}${watch.reference ? ' – ' + watch.reference : ''}</td>
        <td style="text-align:left" class="price-subtotal">
          <span class="price-currency">${currency}</span>${sym}${priceNum.toLocaleString()}
        </td>
      </tr>
      ${vatRow}
      ${vatAmt === 0 ? `<tr style="background:#f0f9ff"><td style="padding:8px 12px;font-weight:700;color:#0369a1">סה"כ</td>
        <td style="padding:8px 12px;text-align:left;font-weight:700;color:#0369a1">${sym}${total.toLocaleString()}</td></tr>` : ''}
    </table>

    ${notes ? `<div class="notes-box"><div class="notes-label">📝 הערות</div><div class="notes-text">${notes}</div></div>` : ''}

    <div class="sig-row">
      <div class="sig-box"><div class="sig-label">חתימת המוכר ✍️</div></div>
      <div class="sig-box"><div class="sig-label">חתימת הקונה ✍️</div></div>
    </div>
  </div>

  <div class="footer">
    מסמך זה הופק ע"י Watch Pro &nbsp;|&nbsp; ${docDate} &nbsp;|&nbsp; ${docNumber}
  </div>
</div>

<button class="print-btn no-print" onclick="window.print()">🖨️ &nbsp; הדפס / שמור PDF</button>
</body>
</html>`
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatFileSize(bytes: number): string {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatTotalSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function formatDate(iso: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

function getCategoryLabel(value: string): string {
  return CATEGORIES.find((c) => c.value === value)?.label ?? value
}

function getCategoryEmoji(value: string): string {
  return CATEGORIES.find((c) => c.value === value)?.emoji ?? '📎'
}

function getFileTypeBadge(filename: string): string {
  const ext = filename.split('.').pop()?.toUpperCase() || '?'
  return ext
}

function getFileTypeBadgeColor(filename: string): { background: string; color: string } {
  const ext = filename.split('.').pop()?.toLowerCase() || ''
  if (ext === 'pdf') return { background: 'rgba(239,68,68,0.2)', color: '#ef4444' }
  if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext))
    return { background: 'rgba(59,130,246,0.2)', color: '#60a5fa' }
  if (['xlsx', 'xls', 'csv'].includes(ext))
    return { background: 'rgba(16,185,129,0.2)', color: '#34d399' }
  if (['doc', 'docx'].includes(ext))
    return { background: 'rgba(139,92,246,0.2)', color: '#a78bfa' }
  return { background: 'rgba(107,114,128,0.2)', color: '#9ca3af' }
}

function FileIcon({ filename, size = 40 }: { filename: string; size?: number }) {
  const ext = filename.split('.').pop()?.toLowerCase() || ''
  const props = { size, strokeWidth: 1.5 }
  if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext))
    return <FileImage {...props} color="#60a5fa" />
  if (ext === 'pdf') return <FileText {...props} color="#ef4444" />
  return <File {...props} color="#9ca3af" />
}

// ─── Create Document Modal ───────────────────────────────────────────────────

const SELLER_KEY = 'watchpro_seller_info'

interface SellerInfo { name: string; address: string; phone: string; email: string; taxId: string }
interface BuyerInfo  { name: string; address: string; phone: string; email: string }

function loadSeller(): SellerInfo {
  try { return JSON.parse(localStorage.getItem(SELLER_KEY) || '{}') } catch { return {} as SellerInfo }
}

interface CreateDocModalProps { onClose: () => void }

function CreateDocumentModal({ onClose }: CreateDocModalProps) {
  const [docType, setDocType]       = useState<'invoice' | 'quote'>('invoice')
  const [watches, setWatches]       = useState<InventoryWatch[]>([])
  const [watchSearch, setWatchSearch] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [dropOpen, setDropOpen]     = useState(false)
  const dropRef = useRef<HTMLDivElement>(null)

  const selected = watches.find((w) => w.id === selectedId) ?? null

  // Price / currency (pre-filled from watch, editable)
  const [price, setPrice]       = useState('')
  const [currency, setCurrency] = useState('USD')

  // Seller info (persisted)
  const [seller, setSeller] = useState<SellerInfo>(() => {
    const s = loadSeller()
    return { name: s.name||'', address: s.address||'', phone: s.phone||'', email: s.email||'', taxId: s.taxId||'' }
  })

  // Buyer info
  const [buyer, setBuyer] = useState<BuyerInfo>({ name: '', address: '', phone: '', email: '' })
  const [notes, setNotes] = useState('')
  const [docNumber] = useState(() => genDocNumber(docType))

  // Valid-until date (for quotes): default +30 days
  const [validUntil, setValidUntil] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 30)
    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`
  })

  useEffect(() => {
    api.get('/api/inventory')
      .then((res) => {
        const items: InventoryWatch[] = (res.data?.items ?? res.data ?? []).map((w: any) => ({
          id: w.id, brand: w.brand, model: w.model,
          reference: w.reference ?? null, serial_number: w.serial_number ?? null,
          year: w.year ?? null, condition: w.condition ?? 'excellent',
          asking_price: w.asking_price ?? null, purchase_price: w.purchase_price ?? null,
          price_currency: w.price_currency ?? 'USD',
          has_box: !!w.has_box, has_papers: !!w.has_papers,
          status: w.status ?? 'available', primary_photo: w.primary_photo ?? null,
          notes: w.notes ?? null,
        }))
        setWatches(items)
      })
      .catch(() => {})
  }, [])

  // Auto-fill price/currency when watch changes
  useEffect(() => {
    if (!selected) return
    setPrice(String(selected.asking_price ?? selected.purchase_price ?? ''))
    setCurrency(selected.price_currency ?? 'USD')
  }, [selected])

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setDropOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const saveSeller = (updated: SellerInfo) => {
    setSeller(updated)
    localStorage.setItem(SELLER_KEY, JSON.stringify(updated))
  }

  const filteredWatches = watches.filter((w) => {
    const q = watchSearch.toLowerCase()
    return !q || `${w.brand} ${w.model} ${w.reference ?? ''} ${w.serial_number ?? ''}`.toLowerCase().includes(q)
  })

  const handleGenerate = () => {
    if (!selected) { toast.error('יש לבחור שעון מהמלאי'); return }
    if (!price)    { toast.error('יש להזין מחיר'); return }

    const apiBase = (import.meta as any).env?.VITE_API_URL ?? ''
    const html = buildDocumentHTML({
      docType, docNumber, docDate: todayFormatted(), validUntil,
      seller, buyer, watch: selected, price, currency, notes, apiBase,
    })
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const url  = URL.createObjectURL(blob)

    // Open in new tab
    const win = window.open(url, '_blank')
    if (!win) toast.error('אפשר חלוניות פופ-אפ בדפדפן ונסה שוב')

    // Trigger download
    const a = document.createElement('a')
    a.href = url
    a.download = `${docNumber}.html`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 5000)

    toast.success('המסמך נוצר בהצלחה!')
    onClose()
  }

  const inputCls = "w-full px-3 py-2 rounded-xl text-sm text-white placeholder-gray-600 outline-none"
  const inputStyle = { background: '#1f2937', border: '1px solid #374151' }
  const labelCls = "block text-xs font-medium text-gray-400 mb-1"

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full max-w-2xl rounded-2xl my-6 flex flex-col gap-5"
        style={{ background: '#111827', border: '1px solid #1f2937', padding: '24px' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FilePlus size={20} style={{ color: '#d4af37' }} />
            <h2 className="text-lg font-bold text-white">יצירת מסמך חדש</h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-800" style={{ color: '#6b7280' }}>
            <X size={18} />
          </button>
        </div>

        {/* Doc type */}
        <div>
          <div className={labelCls}>סוג מסמך</div>
          <div className="flex gap-3">
            {([['invoice','🧾 חשבונית מס'],['quote','💬 הצעת מחיר']] as const).map(([v, lbl]) => (
              <button
                key={v}
                onClick={() => setDocType(v)}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all"
                style={docType === v
                  ? { background: 'rgba(212,175,55,0.2)', color: '#d4af37', border: '1px solid #d4af37' }
                  : { background: '#1f2937', color: '#9ca3af', border: '1px solid #374151' }}
              >
                {lbl}
              </button>
            ))}
          </div>
        </div>

        {/* Watch picker */}
        <div>
          <div className={labelCls}>
            <Watch size={11} className="inline ml-1" />בחר שעון מהמלאי
          </div>
          <div className="relative" ref={dropRef}>
            <button
              onClick={() => setDropOpen((p) => !p)}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm transition-all"
              style={{ background: '#1f2937', border: `1px solid ${selected ? '#d4af37' : '#374151'}`, color: selected ? '#d4af37' : '#9ca3af' }}
            >
              <span className="truncate">
                {selected ? `${selected.brand} ${selected.model}${selected.reference ? ' – ' + selected.reference : ''}` : '— בחר שעון —'}
              </span>
              <ChevronDown size={16} style={{ flexShrink: 0, transform: dropOpen ? 'rotate(180deg)' : '', transition: 'transform .2s' }} />
            </button>

            {dropOpen && (
              <div
                className="absolute z-10 w-full mt-1 rounded-xl overflow-hidden shadow-2xl"
                style={{ background: '#1a2035', border: '1px solid #374151', maxHeight: 280 }}
              >
                <div className="p-2" style={{ borderBottom: '1px solid #374151' }}>
                  <div className="relative">
                    <Search size={13} color="#6b7280" className="absolute top-1/2 right-3 -translate-y-1/2" />
                    <input
                      autoFocus
                      value={watchSearch}
                      onChange={(e) => setWatchSearch(e.target.value)}
                      placeholder="חפש שעון..."
                      className="w-full pr-8 pl-3 py-1.5 rounded-lg text-sm text-white placeholder-gray-600 outline-none"
                      style={{ background: '#111827', border: '1px solid #374151' }}
                    />
                  </div>
                </div>
                <div className="overflow-y-auto" style={{ maxHeight: 220 }}>
                  {filteredWatches.length === 0 ? (
                    <div className="px-4 py-6 text-center text-sm text-gray-500">אין שעונים</div>
                  ) : filteredWatches.map((w) => (
                    <button
                      key={w.id}
                      onClick={() => { setSelectedId(w.id); setDropOpen(false); setWatchSearch('') }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-all hover:bg-gray-700 text-right"
                      style={{ color: w.id === selectedId ? '#d4af37' : '#e5e7eb' }}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{w.brand} {w.model}</div>
                        {w.reference && <div className="text-xs text-gray-500">רפרנס: {w.reference}</div>}
                      </div>
                      {w.asking_price && (
                        <span className="text-xs flex-shrink-0" style={{ color: '#d4af37' }}>
                          {CURRENCY_SYMBOLS[w.price_currency] || ''}{w.asking_price.toLocaleString()}
                        </span>
                      )}
                      {w.id === selectedId && <CheckCircle size={14} style={{ color: '#d4af37', flexShrink: 0 }} />}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Auto-filled watch summary card */}
          {selected && (
            <div
              className="mt-2 rounded-xl px-4 py-3 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 text-xs"
              style={{ background: 'rgba(212,175,55,0.07)', border: '1px solid rgba(212,175,55,0.2)' }}
            >
              {selected.year       && <div><span className="text-gray-500">שנה: </span><span className="text-white font-medium">{selected.year}</span></div>}
              {selected.serial_number && <div><span className="text-gray-500">סריאל: </span><span className="text-white font-medium">{selected.serial_number}</span></div>}
              <div><span className="text-gray-500">מצב: </span><span className="text-white font-medium">{CONDITION_LABELS[selected.condition] || selected.condition}</span></div>
              <div>
                <span className={selected.has_box ? 'text-green-400' : 'text-gray-500'}>קופסה {selected.has_box ? '✓' : '✗'}</span>
                {' '}<span className={selected.has_papers ? 'text-green-400' : 'text-gray-500'}>ניירות {selected.has_papers ? '✓' : '✗'}</span>
              </div>
            </div>
          )}
        </div>

        {/* Price row */}
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <label className={labelCls}>מחיר</label>
            <input
              type="number" min="0" value={price} onChange={(e) => setPrice(e.target.value)}
              placeholder="0" className={inputCls} style={inputStyle}
            />
          </div>
          <div>
            <label className={labelCls}>מטבע</label>
            <select value={currency} onChange={(e) => setCurrency(e.target.value)}
              className={inputCls} style={inputStyle}>
              {DOC_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        {/* Valid until (quotes only) */}
        {docType === 'quote' && (
          <div>
            <label className={labelCls}>בתוקף עד</label>
            <input type="text" value={validUntil} onChange={(e) => setValidUntil(e.target.value)}
              placeholder="DD/MM/YYYY" className={inputCls} style={inputStyle} />
          </div>
        )}

        {/* ── Seller info ── */}
        <div className="rounded-xl p-4 space-y-3" style={{ background: '#0d1117', border: '1px solid #1f2937' }}>
          <div className="flex items-center gap-2 mb-1">
            <Building2 size={14} style={{ color: '#d4af37' }} />
            <span className="text-xs font-semibold text-gray-300 uppercase tracking-wider">פרטי המוכר / העסק</span>
            <span className="text-xs text-gray-600">(נשמרים אוטומטית)</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>שם עסק / שם מלא</label>
              <input value={seller.name} onChange={(e) => saveSeller({...seller, name: e.target.value})}
                placeholder="Watch Pro Ltd." className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label className={labelCls}>ח.פ. / ע.מ.</label>
              <input value={seller.taxId} onChange={(e) => saveSeller({...seller, taxId: e.target.value})}
                placeholder="123456789" className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label className={labelCls}>טלפון</label>
              <input value={seller.phone} onChange={(e) => saveSeller({...seller, phone: e.target.value})}
                placeholder="050-0000000" className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label className={labelCls}>אימייל</label>
              <input value={seller.email} onChange={(e) => saveSeller({...seller, email: e.target.value})}
                placeholder="info@watchpro.co.il" className={inputCls} style={inputStyle} />
            </div>
            <div className="col-span-2">
              <label className={labelCls}>כתובת</label>
              <input value={seller.address} onChange={(e) => saveSeller({...seller, address: e.target.value})}
                placeholder="רחוב, עיר, מיקוד" className={inputCls} style={inputStyle} />
            </div>
          </div>
        </div>

        {/* ── Buyer info ── */}
        <div className="rounded-xl p-4 space-y-3" style={{ background: '#0d1117', border: '1px solid #1f2937' }}>
          <div className="flex items-center gap-2 mb-1">
            <User size={14} style={{ color: '#60a5fa' }} />
            <span className="text-xs font-semibold text-gray-300 uppercase tracking-wider">פרטי הקונה / הלקוח</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>שם מלא</label>
              <input value={buyer.name} onChange={(e) => setBuyer({...buyer, name: e.target.value})}
                placeholder="ישראל ישראלי" className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label className={labelCls}>טלפון</label>
              <input value={buyer.phone} onChange={(e) => setBuyer({...buyer, phone: e.target.value})}
                placeholder="050-0000000" className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label className={labelCls}>אימייל</label>
              <input value={buyer.email} onChange={(e) => setBuyer({...buyer, email: e.target.value})}
                placeholder="buyer@email.com" className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label className={labelCls}>כתובת</label>
              <input value={buyer.address} onChange={(e) => setBuyer({...buyer, address: e.target.value})}
                placeholder="רחוב, עיר" className={inputCls} style={inputStyle} />
            </div>
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className={labelCls}>הערות נוספות</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
            placeholder="תנאי תשלום, אחריות, הערות כלליות..."
            rows={2} className={`${inputCls} resize-none`} style={inputStyle} />
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-1">
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium text-gray-400 hover:text-white transition-colors"
            style={{ background: '#1f2937', border: '1px solid #374151' }}>
            ביטול
          </button>
          <button
            onClick={handleGenerate}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90"
            style={{ background: 'linear-gradient(135deg,#d4af37,#b8962e)', color: '#0a0e1a' }}
          >
            <Printer size={16} />
            צור מסמך
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Upload Modal ─────────────────────────────────────────────────────────────

interface UploadModalProps {
  onClose: () => void
  onSuccess: () => void
}

function UploadModal({ onClose, onSuccess }: UploadModalProps) {
  const [droppedFile, setDroppedFile] = useState<File | null>(null)
  const [category, setCategory] = useState('other')
  const [description, setDescription] = useState('')
  const [watchId, setWatchId] = useState('')
  const [watches, setWatches] = useState<InventoryWatch[]>([])
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    api
      .get('/api/inventory')
      .then((res) => {
        const items: InventoryWatch[] = (res.data?.items ?? res.data ?? []).map((w: any) => ({
          id: w.id,
          brand: w.brand,
          model: w.model,
        }))
        setWatches(items)
      })
      .catch(() => {})
  }, [])

  const onDrop = useCallback((accepted: File[]) => {
    if (accepted.length > 0) setDroppedFile(accepted[0])
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
  })

  const handleUpload = async () => {
    if (!droppedFile) {
      toast.error('יש לבחור קובץ')
      return
    }
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', droppedFile)
      fd.append('category', category)
      if (description) fd.append('description', description)
      if (watchId) fd.append('watch_id', watchId)
      await api.post('/api/documents/upload', fd)
      toast.success('המסמך הועלה בהצלחה')
      onSuccess()
      onClose()
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'שגיאה בהעלאת המסמך')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full max-w-lg rounded-2xl p-6 space-y-5"
        style={{ background: '#111827', border: '1px solid #1f2937' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">העלאת מסמך</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-gray-800 transition-colors"
            style={{ color: '#6b7280' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Dropzone */}
        {droppedFile ? (
          <div
            className="flex items-center gap-3 px-4 py-3 rounded-xl"
            style={{ background: '#1f2937', border: '1px solid #374151' }}
          >
            <FileIcon filename={droppedFile.name} size={22} />
            <div className="flex-1 min-w-0">
              <div className="text-sm text-white truncate">{droppedFile.name}</div>
              <div className="text-xs text-gray-500">{formatFileSize(droppedFile.size)}</div>
            </div>
            <button
              onClick={() => setDroppedFile(null)}
              className="text-gray-500 hover:text-red-400 transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        ) : (
          <div
            {...getRootProps()}
            className="border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all"
            style={{
              borderColor: isDragActive ? '#d4af37' : '#374151',
              background: isDragActive ? 'rgba(212,175,55,0.05)' : 'transparent',
            }}
          >
            <input {...getInputProps()} />
            <Upload size={32} color={isDragActive ? '#d4af37' : '#4b5563'} className="mx-auto mb-3" />
            <p className="text-sm font-medium text-gray-300">
              {isDragActive ? 'שחרר את הקובץ כאן' : 'גרור קובץ לכאן'}
            </p>
            <p className="text-xs text-gray-600 mt-1">או לחץ לבחירה ממחשב</p>
          </div>
        )}

        {/* Category */}
        <div>
          <label className="block text-sm font-medium text-gray-400 mb-1.5">קטגוריה</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl text-sm text-white outline-none"
            style={{ background: '#1f2937', border: '1px solid #374151' }}
          >
            {UPLOAD_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.emoji} {c.label}
              </option>
            ))}
          </select>
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-gray-400 mb-1.5">
            תיאור <span className="text-gray-600 font-normal">(אופציונלי)</span>
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="הוסף תיאור למסמך..."
            rows={2}
            className="w-full px-4 py-2.5 rounded-xl text-sm text-white placeholder-gray-600 outline-none resize-none"
            style={{ background: '#1f2937', border: '1px solid #374151' }}
          />
        </div>

        {/* Watch */}
        <div>
          <label className="block text-sm font-medium text-gray-400 mb-1.5">
            שייך לשעון <span className="text-gray-600 font-normal">(אופציונלי)</span>
          </label>
          <select
            value={watchId}
            onChange={(e) => setWatchId(e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl text-sm text-white outline-none"
            style={{ background: '#1f2937', border: '1px solid #374151' }}
          >
            <option value="">— ללא שיוך —</option>
            {watches.map((w) => (
              <option key={w.id} value={w.id}>
                {w.brand} {w.model}
              </option>
            ))}
          </select>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-1">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium text-gray-400 transition-colors hover:text-white"
            style={{ background: '#1f2937', border: '1px solid #374151' }}
          >
            ביטול
          </button>
          <button
            onClick={handleUpload}
            disabled={!droppedFile || uploading}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #d4af37, #b8962e)', color: '#0a0e1a' }}
          >
            {uploading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                מעלה...
              </>
            ) : (
              <>
                <Upload size={16} />
                העלה
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Document Card ────────────────────────────────────────────────────────────

interface DocCardProps {
  doc: DocumentItem
  onDelete: (id: number) => void
}

function DocCard({ doc, onDelete }: DocCardProps) {
  const badgeStyle = getFileTypeBadgeColor(doc.original_name)

  return (
    <div
      className="rounded-xl p-4 flex flex-col gap-3 group transition-all hover:border-gray-600"
      style={{ background: '#111827', border: '1px solid #1f2937' }}
    >
      {/* Top row: icon + file type badge */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: '#1f2937' }}
          >
            <span className="text-2xl leading-none">{getCategoryEmoji(doc.category)}</span>
          </div>
          <span
            className="px-2 py-0.5 rounded text-xs font-bold"
            style={badgeStyle}
          >
            {getFileTypeBadge(doc.original_name)}
          </span>
        </div>
        {/* Delete */}
        <button
          onClick={() => onDelete(doc.id)}
          className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg transition-all hover:bg-red-500/20"
          style={{ color: '#6b7280' }}
          title="מחק מסמך"
        >
          <Trash2 size={15} />
        </button>
      </div>

      {/* Filename */}
      <div>
        <div
          className="text-sm font-medium text-white leading-tight truncate"
          title={doc.original_name}
        >
          {doc.original_name}
        </div>
        <div className="text-xs mt-0.5" style={{ color: '#d4af37' }}>
          {getCategoryLabel(doc.category)}
        </div>
      </div>

      {/* Meta */}
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>{formatDate(doc.created_at)}</span>
        <span>{formatFileSize(doc.file_size)}</span>
      </div>

      {/* Watch badge */}
      {doc.watch_label && (
        <div
          className="px-2.5 py-1 rounded-lg text-xs font-medium truncate"
          style={{ background: 'rgba(212,175,55,0.12)', color: '#d4af37', border: '1px solid rgba(212,175,55,0.2)' }}
          title={doc.watch_label}
        >
          ⌚ {doc.watch_label}
        </div>
      )}

      {/* Download */}
      <a
        href={doc.download_url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-medium transition-all hover:opacity-80"
        style={{ background: '#1f2937', color: '#9ca3af', border: '1px solid #374151' }}
      >
        <Download size={13} />
        הורד
      </a>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Documents() {
  const [docs, setDocs] = useState<DocumentItem[]>([])
  const [loading, setLoading] = useState(true)
  const [activeCategory, setActiveCategory] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [showUpload, setShowUpload] = useState(false)
  const [showCreate, setShowCreate] = useState(false)

  const fetchDocs = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, string> = {}
      if (activeCategory !== 'all') params.category = activeCategory
      if (searchQuery.trim()) params.search = searchQuery.trim()
      const res = await api.get('/api/documents', { params })
      setDocs(res.data?.items ?? res.data ?? [])
    } catch {
      toast.error('שגיאה בטעינת מסמכים')
    } finally {
      setLoading(false)
    }
  }, [activeCategory, searchQuery])

  useEffect(() => {
    const timer = setTimeout(fetchDocs, 300)
    return () => clearTimeout(timer)
  }, [fetchDocs])

  const handleDelete = async (docId: number) => {
    if (!window.confirm('האם אתה בטוח שברצונך למחוק מסמך זה?')) return
    try {
      await api.delete(`/api/documents/${docId}`)
      toast.success('המסמך נמחק בהצלחה')
      fetchDocs()
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'שגיאה במחיקת המסמך')
    }
  }

  // Computed stats
  const totalSize = docs.reduce((acc, d) => acc + (d.file_size || 0), 0)
  const categoryCounts = docs.reduce<Record<string, number>>((acc, d) => {
    acc[d.category] = (acc[d.category] || 0) + 1
    return acc
  }, {})

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* ── Header ── */}
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white">ספריית מסמכים 📋</h1>
          <p className="text-gray-400 text-sm mt-1">כל המסמכים, תעודות וקבצים של העסק</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm transition-all hover:opacity-90"
            style={{ background: 'rgba(212,175,55,0.15)', color: '#d4af37', border: '1px solid rgba(212,175,55,0.3)' }}
          >
            <FilePlus size={16} />
            צור מסמך
          </button>
          <button
            onClick={() => setShowUpload(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm transition-all hover:opacity-90"
            style={{ background: 'linear-gradient(135deg, #d4af37, #b8962e)', color: '#0a0e1a' }}
          >
            <Upload size={16} />
            העלה מסמך
          </button>
        </div>
      </div>

      {/* ── Stats Row ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div
          className="rounded-xl p-4"
          style={{ background: '#111827', border: '1px solid #1f2937' }}
        >
          <div className="text-xs text-gray-500 mb-1">סה"כ מסמכים</div>
          <div className="text-2xl font-bold text-white">{docs.length}</div>
        </div>
        <div
          className="rounded-xl p-4"
          style={{ background: '#111827', border: '1px solid #1f2937' }}
        >
          <div className="text-xs text-gray-500 mb-1">נפח כולל</div>
          <div className="text-2xl font-bold" style={{ color: '#d4af37' }}>
            {formatTotalSize(totalSize)}
          </div>
        </div>
        {Object.entries(categoryCounts)
          .slice(0, 2)
          .map(([cat, count]) => (
            <div
              key={cat}
              className="rounded-xl p-4"
              style={{ background: '#111827', border: '1px solid #1f2937' }}
            >
              <div className="text-xs text-gray-500 mb-1">{getCategoryLabel(cat)}</div>
              <div className="text-2xl font-bold text-white">{count}</div>
            </div>
          ))}
      </div>

      {/* ── Filter Bar ── */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        {/* Category chips */}
        <div className="flex items-center gap-2 flex-wrap flex-1">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              onClick={() => setActiveCategory(cat.value)}
              className="px-3 py-1.5 rounded-xl text-xs font-medium transition-all whitespace-nowrap"
              style={
                activeCategory === cat.value
                  ? {
                      background: 'rgba(212,175,55,0.2)',
                      color: '#d4af37',
                      border: '1px solid #d4af37',
                    }
                  : {
                      background: '#111827',
                      color: '#9ca3af',
                      border: '1px solid #1f2937',
                    }
              }
            >
              {cat.emoji} {cat.label}
              {cat.value !== 'all' && categoryCounts[cat.value] ? (
                <span
                  className="mr-1.5 px-1.5 py-0.5 rounded-full text-xs"
                  style={{ background: 'rgba(255,255,255,0.1)' }}
                >
                  {categoryCounts[cat.value]}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative flex-shrink-0">
          <Search size={15} color="#6b7280" className="absolute top-1/2 right-3 -translate-y-1/2" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="חיפוש מסמך..."
            className="pl-4 pr-9 py-2 rounded-xl text-sm text-white placeholder-gray-600 outline-none w-52"
            style={{ background: '#111827', border: '1px solid #1f2937' }}
          />
        </div>
      </div>

      {/* ── Content ── */}
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 size={28} color="#d4af37" className="animate-spin" />
        </div>
      ) : docs.length === 0 ? (
        /* Empty state */
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <FolderOpen size={56} color="#374151" strokeWidth={1.2} className="mb-4" />
          <h3 className="text-lg font-semibold text-gray-300 mb-1">אין מסמכים עדיין</h3>
          <p className="text-gray-500 text-sm mb-6">
            {searchQuery || activeCategory !== 'all'
              ? 'לא נמצאו מסמכים התואמים לסינון'
              : 'העלה את המסמך הראשון כדי להתחיל'}
          </p>
          {!searchQuery && activeCategory === 'all' && (
            <button
              onClick={() => setShowUpload(true)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm"
              style={{ background: 'linear-gradient(135deg, #d4af37, #b8962e)', color: '#0a0e1a' }}
            >
              <Upload size={16} />
              העלה את המסמך הראשון
            </button>
          )}
        </div>
      ) : (
        /* Document Grid */
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {docs.map((doc) => (
            <DocCard key={doc.id} doc={doc} onDelete={handleDelete} />
          ))}
        </div>
      )}

      {/* ── Upload Modal ── */}
      {showUpload && (
        <UploadModal
          onClose={() => setShowUpload(false)}
          onSuccess={fetchDocs}
        />
      )}

      {/* ── Create Document Modal ── */}
      {showCreate && (
        <CreateDocumentModal onClose={() => setShowCreate(false)} />
      )}
    </div>
  )
}
