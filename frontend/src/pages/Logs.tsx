import { useState, useEffect } from 'react'
import {
  Activity,
  LogIn,
  Plus,
  Edit2,
  Trash2,
  Search,
  DollarSign,
  Settings,
  Users,
  FileText,
  Upload,
  AlertCircle,
  RefreshCw,
  Filter,
  ChevronLeft,
  ChevronRight,
  Clock,
} from 'lucide-react'
import api from '../api/client'

interface LogEntry {
  id: number
  timestamp: string
  user_email: string
  action: string
  resource: string
  details: string
  ip_address: string
  success: boolean
}

interface LogStats {
  total: number
  errors: number
  by_action: Record<string, number>
  days: number
}

const ACTION_ICONS: Record<string, { icon: JSX.Element; color: string; label: string }> = {
  LOGIN:          { icon: <LogIn size={13} />,      color: '#4ade80', label: 'כניסה' },
  LOGOUT:         { icon: <LogIn size={13} />,      color: '#6b7280', label: 'יציאה' },
  ADD_WATCH:      { icon: <Plus size={13} />,       color: '#60a5fa', label: 'שעון נוסף' },
  EDIT_WATCH:     { icon: <Edit2 size={13} />,      color: '#fbbf24', label: 'שעון עודכן' },
  SELL_WATCH:     { icon: <DollarSign size={13} />, color: '#34d399', label: 'שעון נמכר' },
  DELETE_WATCH:   { icon: <Trash2 size={13} />,     color: '#f87171', label: 'שעון נמחק' },
  ADD_ENTRY:      { icon: <DollarSign size={13} />, color: '#a78bfa', label: 'רשומה פיננסית' },
  DELETE_ENTRY:   { icon: <Trash2 size={13} />,     color: '#f87171', label: 'רשומה נמחקה' },
  EXPORT:         { icon: <FileText size={13} />,   color: '#34d399', label: 'ייצוא' },
  PRICE_SCOUT:    { icon: <Search size={13} />,     color: '#22d3ee', label: 'חיפוש מחירים' },
  WATCH_IDENTIFY: { icon: <Search size={13} />,     color: '#d4af37', label: 'זיהוי שעון' },
  GENERATE_DOC:   { icon: <FileText size={13} />,   color: '#f59e0b', label: 'מסמך הופק' },
  CREATE_USER:    { icon: <Users size={13} />,      color: '#60a5fa', label: 'משתמש נוצר' },
  EDIT_USER:      { icon: <Users size={13} />,      color: '#fbbf24', label: 'משתמש עודכן' },
  DELETE_USER:    { icon: <Users size={13} />,      color: '#f87171', label: 'משתמש נמחק' },
  SAVE_SETTINGS:  { icon: <Settings size={13} />,   color: '#9ca3af', label: 'הגדרות שמורות' },
  UPLOAD_DOC:     { icon: <Upload size={13} />,     color: '#34d399', label: 'מסמך הועלה' },
  DELETE_DOC:     { icon: <Trash2 size={13} />,     color: '#f87171', label: 'מסמך נמחק' },
}

function ActionBadge({ action, success }: { action: string; success: boolean }) {
  const meta = ACTION_ICONS[action] || { icon: <Activity size={13} />, color: '#6b7280', label: action }
  const color = success ? meta.color : '#f87171'
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ background: `${color}18`, color, border: `1px solid ${color}35` }}
    >
      {meta.icon}
      {success ? meta.label : `❌ ${meta.label}`}
    </span>
  )
}

function formatDate(iso: string) {
  // Treat timestamps without timezone suffix as UTC (backend stores UTC)
  const utcStr = iso.endsWith('Z') || iso.includes('+') ? iso : iso + 'Z'
  return new Date(utcStr).toLocaleString('he-IL', {
    timeZone: 'Asia/Jerusalem',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

export default function Logs() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [stats, setStats] = useState<LogStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [filterAction, setFilterAction] = useState('')
  const [filterEmail, setFilterEmail] = useState('')
  const [days, setDays] = useState(30)
  const PER_PAGE = 50

  useEffect(() => {
    fetchLogs()
    fetchStats()
  }, [page, filterAction, filterEmail, days])

  async function fetchLogs() {
    setLoading(true)
    try {
      const params: Record<string, any> = { page, per_page: PER_PAGE, days }
      if (filterAction) params.action = filterAction
      if (filterEmail) params.user_email = filterEmail
      const res = await api.get('/api/logs', { params })
      setLogs(res.data)
    } catch {
      setLogs([])
    } finally {
      setLoading(false)
    }
  }

  async function fetchStats() {
    try {
      const res = await api.get('/api/logs/stats', { params: { days } })
      setStats(res.data)
    } catch {}
  }

  async function clearOld() {
    if (!confirm('למחוק לוגים ישנים מלפני 90 יום?')) return
    await api.delete('/api/logs/clear', { params: { older_than_days: 90 } })
    fetchLogs()
    fetchStats()
  }

  return (
    <div className="p-6 max-w-6xl mx-auto" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Activity size={24} style={{ color: '#d4af37' }} />
            לוגים ופעילות מערכת
          </h1>
          <p className="text-sm mt-1" style={{ color: '#6b7280' }}>
            {stats ? `${stats.total} פעולות ב-${days} הימים האחרונים` : '...'}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { fetchLogs(); fetchStats() }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm"
            style={{ background: 'rgba(255,255,255,0.06)', color: '#9ca3af' }}
          >
            <RefreshCw size={14} />
            רענן
          </button>
          <button
            onClick={clearOld}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm"
            style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}
          >
            <Trash2 size={14} />
            נקה ישנים
          </button>
        </div>
      </div>

      {/* Stats cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {[
            { label: 'סה"כ פעולות', value: stats.total, color: '#d4af37' },
            { label: 'שגיאות', value: stats.errors, color: '#f87171' },
            { label: 'כניסות', value: stats.by_action['LOGIN'] || 0, color: '#4ade80' },
            { label: 'שעונים נוספו', value: (stats.by_action['ADD_WATCH'] || 0), color: '#60a5fa' },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-xl p-4 text-center"
              style={{ background: 'rgba(20,16,4,0.8)', border: `1px solid ${s.color}20` }}
            >
              <p className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</p>
              <p className="text-xs mt-1" style={{ color: '#6b7280' }}>{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div
        className="flex flex-wrap gap-3 mb-4 p-4 rounded-xl"
        style={{ background: 'rgba(20,16,4,0.6)', border: '1px solid rgba(212,175,55,0.1)' }}
      >
        <div className="flex items-center gap-2">
          <Filter size={14} style={{ color: '#6b7280' }} />
          <span className="text-xs" style={{ color: '#6b7280' }}>סינון:</span>
        </div>

        {/* Action filter */}
        <select
          value={filterAction}
          onChange={(e) => { setFilterAction(e.target.value); setPage(1) }}
          className="px-3 py-1.5 rounded-lg text-xs outline-none"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(212,175,55,0.2)', color: '#9ca3af' }}
        >
          <option value="">כל הפעולות</option>
          {Object.entries(ACTION_ICONS).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>

        {/* Email filter */}
        <input
          type="text"
          value={filterEmail}
          onChange={(e) => { setFilterEmail(e.target.value); setPage(1) }}
          placeholder="חפש לפי אימייל..."
          className="px-3 py-1.5 rounded-lg text-xs outline-none"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(212,175,55,0.2)', color: '#9ca3af', minWidth: '160px' }}
        />

        {/* Days */}
        <select
          value={days}
          onChange={(e) => { setDays(Number(e.target.value)); setPage(1) }}
          className="px-3 py-1.5 rounded-lg text-xs outline-none"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(212,175,55,0.2)', color: '#9ca3af' }}
        >
          {[7, 14, 30, 60, 90, 180, 365].map((d) => (
            <option key={d} value={d}>{d} ימים</option>
          ))}
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-12" style={{ color: '#6b7280' }}>טוען לוגים...</div>
      ) : logs.length === 0 ? (
        <div className="text-center py-12" style={{ color: '#6b7280' }}>
          <Activity size={40} className="mx-auto mb-3 opacity-20" />
          <p>אין לוגים להצגה</p>
        </div>
      ) : (
        <div
          className="rounded-2xl overflow-hidden"
          style={{ background: 'rgba(20,16,4,0.8)', border: '1px solid rgba(212,175,55,0.1)' }}
        >
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(212,175,55,0.1)' }}>
                {['זמן', 'משתמש', 'פעולה', 'פרטים'].map((h) => (
                  <th key={h} className="text-right px-4 py-3 text-xs font-medium" style={{ color: '#6b7280' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.map((log, i) => (
                <tr
                  key={log.id}
                  style={{
                    borderBottom: i < logs.length - 1 ? '1px solid rgba(255,255,255,0.03)' : 'none',
                    background: !log.success ? 'rgba(239,68,68,0.03)' : 'transparent',
                  }}
                >
                  <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: '#6b7280' }}>
                    <span className="flex items-center gap-1">
                      <Clock size={11} />
                      {formatDate(log.timestamp)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs" style={{ color: '#9ca3af' }}>{log.user_email}</span>
                  </td>
                  <td className="px-4 py-3">
                    <ActionBadge action={log.action} success={log.success} />
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-xs" style={{ color: '#9ca3af' }}>{log.resource}</p>
                    {log.details && log.details !== '{}' && (
                      <p className="text-xs mt-0.5" style={{ color: '#6b7280' }}>
                        {log.details.slice(0, 80)}{log.details.length > 80 ? '…' : ''}
                      </p>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination */}
          <div
            className="flex items-center justify-between px-4 py-3"
            style={{ borderTop: '1px solid rgba(212,175,55,0.1)' }}
          >
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs"
              style={{ background: 'rgba(255,255,255,0.06)', color: page === 1 ? '#374151' : '#9ca3af' }}
            >
              <ChevronRight size={13} /> הקודם
            </button>
            <span className="text-xs" style={{ color: '#6b7280' }}>עמוד {page}</span>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={logs.length < PER_PAGE}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs"
              style={{ background: 'rgba(255,255,255,0.06)', color: logs.length < PER_PAGE ? '#374151' : '#9ca3af' }}
            >
              הבא <ChevronLeft size={13} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
