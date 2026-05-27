import { useState, useEffect } from 'react'
import {
  Users as UsersIcon,
  Plus,
  Edit2,
  Trash2,
  Shield,
  Eye,
  UserCheck,
  X,
  Save,
  Key,
  CheckCircle,
  XCircle,
  Clock,
} from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../api/client'
import { useAuth, AuthUser, UserRole } from '../context/AuthContext'

const ROLE_META: Record<UserRole, { label: string; color: string; icon: JSX.Element; desc: string }> = {
  admin: {
    label: 'מנהל ראשי',
    color: '#f59e0b',
    icon: <Shield size={14} />,
    desc: 'גישה מלאה לכל המערכת כולל ניהול משתמשים והגדרות',
  },
  manager: {
    label: 'מנהל',
    color: '#3b82f6',
    icon: <UserCheck size={14} />,
    desc: 'יכול לנהל מלאי, פיננסים ומסמכים. אין גישה להגדרות ומשתמשים',
  },
  viewer: {
    label: 'צופה',
    color: '#6b7280',
    icon: <Eye size={14} />,
    desc: 'קריאה בלבד — לא יכול להוסיף, לערוך או למחוק',
  },
}

function RoleBadge({ role }: { role: UserRole }) {
  const meta = ROLE_META[role]
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ background: `${meta.color}20`, color: meta.color, border: `1px solid ${meta.color}40` }}
    >
      {meta.icon}
      {meta.label}
    </span>
  )
}

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

interface UserFormState {
  email: string
  full_name: string
  role: UserRole
  password: string
  is_active: boolean
}

const emptyForm: UserFormState = { email: '', full_name: '', role: 'viewer', password: '', is_active: true }

export default function Users() {
  const { user: me, isAdmin } = useAuth()
  const [users, setUsers] = useState<AuthUser[]>([])
  const [loading, setLoading] = useState(true)

  // Modal state
  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null)
  const [editingUser, setEditingUser] = useState<AuthUser | null>(null)
  const [form, setForm] = useState<UserFormState>(emptyForm)
  const [saving, setSaving] = useState(false)

  // Change-password modal for self
  const [showChangePass, setShowChangePass] = useState(false)
  const [cpCurrent, setCpCurrent] = useState('')
  const [cpNew, setCpNew] = useState('')
  const [cpSaving, setCpSaving] = useState(false)

  useEffect(() => {
    if (isAdmin) fetchUsers()
    else setLoading(false)
  }, [isAdmin])

  async function fetchUsers() {
    try {
      const res = await api.get('/api/users')
      setUsers(res.data)
    } catch {
      toast.error('שגיאה בטעינת משתמשים')
    } finally {
      setLoading(false)
    }
  }

  function openCreate() {
    setForm(emptyForm)
    setEditingUser(null)
    setModalMode('create')
  }

  function openEdit(u: AuthUser) {
    setForm({ email: u.email, full_name: u.full_name || '', role: u.role, password: '', is_active: u.is_active })
    setEditingUser(u)
    setModalMode('edit')
  }

  async function handleSave() {
    if (!form.email.trim()) return toast.error('נדרשת כתובת אימייל')
    if (modalMode === 'create' && !form.password) return toast.error('נדרשת סיסמה')
    setSaving(true)
    try {
      if (modalMode === 'create') {
        await api.post('/api/users', {
          email: form.email,
          password: form.password,
          full_name: form.full_name || null,
          role: form.role,
        })
        toast.success('משתמש נוצר בהצלחה')
      } else if (editingUser) {
        const payload: Record<string, any> = {
          full_name: form.full_name || null,
          role: form.role,
          is_active: form.is_active,
        }
        if (form.password) payload.password = form.password
        await api.put(`/api/users/${editingUser.id}`, payload)
        toast.success('המשתמש עודכן')
      }
      setModalMode(null)
      fetchUsers()
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'שגיאה בשמירה')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(u: AuthUser) {
    if (!confirm(`למחוק את המשתמש ${u.email}?`)) return
    try {
      await api.delete(`/api/users/${u.id}`)
      toast.success('המשתמש נמחק')
      setUsers((prev) => prev.filter((x) => x.id !== u.id))
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'שגיאה במחיקה')
    }
  }

  async function handleChangePassword() {
    if (!cpCurrent || !cpNew) return
    setCpSaving(true)
    try {
      await api.post('/api/auth/change-password', { current_password: cpCurrent, new_password: cpNew })
      toast.success('הסיסמה שונתה בהצלחה')
      setShowChangePass(false)
      setCpCurrent('')
      setCpNew('')
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'שגיאה בשינוי סיסמה')
    } finally {
      setCpSaving(false)
    }
  }

  if (!isAdmin) {
    return (
      <div className="p-6 text-center" style={{ color: '#6b7280' }}>
        <Shield size={48} className="mx-auto mb-3 opacity-30" />
        <p>אין לך הרשאה לצפות בדף זה</p>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-5xl mx-auto" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <UsersIcon size={24} style={{ color: '#d4af37' }} />
            ניהול משתמשים
          </h1>
          <p className="text-sm mt-1" style={{ color: '#6b7280' }}>
            {users.length} משתמשים רשומים
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowChangePass(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all"
            style={{ background: 'rgba(212,175,55,0.1)', color: '#d4af37', border: '1px solid rgba(212,175,55,0.3)' }}
          >
            <Key size={15} />
            שנה סיסמה
          </button>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all"
            style={{ background: 'linear-gradient(135deg, #d4af37, #b8962e)', color: '#0a0a0a' }}
          >
            <Plus size={15} />
            משתמש חדש
          </button>
        </div>
      </div>

      {/* Roles legend */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {(Object.entries(ROLE_META) as [UserRole, typeof ROLE_META[UserRole]][]).map(([role, meta]) => (
          <div
            key={role}
            className="rounded-xl p-3"
            style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${meta.color}20` }}
          >
            <div className="flex items-center gap-2 mb-1">
              <RoleBadge role={role} />
            </div>
            <p className="text-xs" style={{ color: '#6b7280' }}>{meta.desc}</p>
          </div>
        ))}
      </div>

      {/* Users table */}
      {loading ? (
        <div className="text-center py-12" style={{ color: '#6b7280' }}>טוען...</div>
      ) : (
        <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(20,16,4,0.8)', border: '1px solid rgba(212,175,55,0.15)' }}>
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(212,175,55,0.1)' }}>
                {['שם מלא', 'אימייל', 'תפקיד', 'סטטוס', 'כניסה אחרונה', ''].map((h) => (
                  <th key={h} className="text-right px-4 py-3 text-xs font-medium" style={{ color: '#6b7280' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((u, i) => (
                <tr
                  key={u.id}
                  style={{
                    borderBottom: i < users.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                    background: u.id === me?.id ? 'rgba(212,175,55,0.04)' : 'transparent',
                  }}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold"
                        style={{ background: `${ROLE_META[u.role].color}20`, color: ROLE_META[u.role].color }}
                      >
                        {(u.full_name || u.email)[0].toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-white">{u.full_name || '—'}</p>
                        {u.id === me?.id && <p className="text-xs" style={{ color: '#d4af37' }}>אתה</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm" style={{ color: '#9ca3af' }}>{u.email}</td>
                  <td className="px-4 py-3"><RoleBadge role={u.role} /></td>
                  <td className="px-4 py-3">
                    {u.is_active ? (
                      <span className="inline-flex items-center gap-1 text-xs" style={{ color: '#4ade80' }}>
                        <CheckCircle size={12} /> פעיל
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs" style={{ color: '#f87171' }}>
                        <XCircle size={12} /> מושבת
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs" style={{ color: '#6b7280' }}>
                    <span className="flex items-center gap-1">
                      <Clock size={11} />
                      {formatDate(u.last_login)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <button
                        onClick={() => openEdit(u)}
                        className="p-1.5 rounded-lg transition-all hover:bg-white/10"
                        style={{ color: '#9ca3af' }}
                        title="ערוך"
                      >
                        <Edit2 size={14} />
                      </button>
                      {u.id !== me?.id && (
                        <button
                          onClick={() => handleDelete(u)}
                          className="p-1.5 rounded-lg transition-all hover:bg-red-500/10"
                          style={{ color: '#6b7280' }}
                          title="מחק"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create / Edit Modal */}
      {modalMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div
            className="w-full max-w-md rounded-2xl p-6"
            style={{ background: '#141004', border: '1px solid rgba(212,175,55,0.3)' }}
            dir="rtl"
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-white">
                {modalMode === 'create' ? '➕ משתמש חדש' : '✏️ עריכת משתמש'}
              </h2>
              <button onClick={() => setModalMode(null)} style={{ color: '#6b7280' }}><X size={20} /></button>
            </div>

            <div className="space-y-4">
              {/* Email (only in create) */}
              {modalMode === 'create' && (
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: '#9ca3af' }}>אימייל *</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg text-white text-sm outline-none"
                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(212,175,55,0.2)' }}
                  />
                </div>
              )}

              {/* Full name */}
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: '#9ca3af' }}>שם מלא</label>
                <input
                  type="text"
                  value={form.full_name}
                  onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg text-white text-sm outline-none"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(212,175,55,0.2)' }}
                />
              </div>

              {/* Role */}
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: '#9ca3af' }}>תפקיד *</label>
                <select
                  value={form.role}
                  onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as UserRole }))}
                  className="w-full px-3 py-2 rounded-lg text-white text-sm outline-none"
                  style={{ background: 'rgba(20,16,4,0.9)', border: '1px solid rgba(212,175,55,0.2)' }}
                >
                  <option value="admin">מנהל ראשי — גישה מלאה</option>
                  <option value="manager">מנהל — ניהול תוכן</option>
                  <option value="viewer">צופה — קריאה בלבד</option>
                </select>
                <p className="text-xs mt-1" style={{ color: '#6b7280' }}>{ROLE_META[form.role].desc}</p>
              </div>

              {/* Password */}
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: '#9ca3af' }}>
                  {modalMode === 'create' ? 'סיסמה *' : 'סיסמה חדשה (השאר ריק לאי-שינוי)'}
                </label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  placeholder={modalMode === 'edit' ? '••••••  (לא ישתנה)' : ''}
                  className="w-full px-3 py-2 rounded-lg text-white text-sm outline-none"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(212,175,55,0.2)' }}
                />
              </div>

              {/* Active toggle (edit only) */}
              {modalMode === 'edit' && editingUser?.id !== me?.id && (
                <div className="flex items-center gap-3">
                  <label className="text-xs font-medium" style={{ color: '#9ca3af' }}>חשבון פעיל</label>
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, is_active: !f.is_active }))}
                    className="relative w-10 h-5 rounded-full transition-all"
                    style={{ background: form.is_active ? '#d4af37' : 'rgba(255,255,255,0.15)' }}
                  >
                    <span
                      className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all"
                      style={{ right: form.is_active ? '2px' : 'auto', left: form.is_active ? 'auto' : '2px' }}
                    />
                  </button>
                  <span className="text-xs" style={{ color: form.is_active ? '#4ade80' : '#f87171' }}>
                    {form.is_active ? 'פעיל' : 'מושבת'}
                  </span>
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg font-semibold text-sm"
                style={{ background: 'linear-gradient(135deg, #d4af37, #b8962e)', color: '#0a0a0a' }}
              >
                <Save size={15} />
                {saving ? 'שומר...' : 'שמור'}
              </button>
              <button
                onClick={() => setModalMode(null)}
                className="px-4 py-2.5 rounded-lg text-sm"
                style={{ background: 'rgba(255,255,255,0.06)', color: '#9ca3af' }}
              >
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Change Password Modal */}
      {showChangePass && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div
            className="w-full max-w-sm rounded-2xl p-6"
            style={{ background: '#141004', border: '1px solid rgba(212,175,55,0.3)' }}
            dir="rtl"
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-white">🔑 שינוי סיסמה</h2>
              <button onClick={() => setShowChangePass(false)} style={{ color: '#6b7280' }}><X size={20} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs mb-1" style={{ color: '#9ca3af' }}>סיסמה נוכחית</label>
                <input type="password" value={cpCurrent} onChange={(e) => setCpCurrent(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-white text-sm outline-none"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(212,175,55,0.2)' }} />
              </div>
              <div>
                <label className="block text-xs mb-1" style={{ color: '#9ca3af' }}>סיסמה חדשה</label>
                <input type="password" value={cpNew} onChange={(e) => setCpNew(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-white text-sm outline-none"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(212,175,55,0.2)' }} />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={handleChangePassword} disabled={cpSaving || !cpCurrent || !cpNew}
                className="flex-1 py-2.5 rounded-lg font-semibold text-sm"
                style={{ background: 'linear-gradient(135deg, #d4af37, #b8962e)', color: '#0a0a0a' }}>
                {cpSaving ? 'שומר...' : 'שנה סיסמה'}
              </button>
              <button onClick={() => setShowChangePass(false)}
                className="px-4 py-2.5 rounded-lg text-sm"
                style={{ background: 'rgba(255,255,255,0.06)', color: '#9ca3af' }}>
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
