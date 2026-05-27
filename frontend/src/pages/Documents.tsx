import { useState, useEffect, useCallback } from 'react'
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
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">ספריית מסמכים 📋</h1>
          <p className="text-gray-400 text-sm mt-1">כל המסמכים, תעודות וקבצים של העסק</p>
        </div>
        <button
          onClick={() => setShowUpload(true)}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all hover:opacity-90"
          style={{ background: 'linear-gradient(135deg, #d4af37, #b8962e)', color: '#0a0e1a' }}
        >
          <Upload size={16} />
          העלה מסמך
        </button>
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
    </div>
  )
}
