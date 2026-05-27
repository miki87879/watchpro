import { useEffect, useState } from 'react'
import {
  Users, Plus, Search, Trash2, Edit, Mail, Phone,
  Send, X, Check, FileText, ChevronDown,
} from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../api/client'
import { Contact, EmailLog, NewsletterTemplate } from '../types'

export default function Community() {
  const [tab, setTab] = useState<'contacts' | 'newsletter' | 'logs'>('contacts')
  const [contacts, setContacts] = useState<Contact[]>([])
  const [logs, setLogs] = useState<EmailLog[]>([])
  const [templates, setTemplates] = useState<NewsletterTemplate[]>([])
  const [search, setSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editContact, setEditContact] = useState<Contact | null>(null)
  const [form, setForm] = useState({ name: '', email: '', phone: '', interests: '', notes: '' })
  const [newsletter, setNewsletter] = useState({ subject: '', body: '' })
  const [sending, setSending] = useState(false)

  const fetchContacts = () => {
    api.get('/api/community/contacts', { params: search ? { search } : {} })
      .then(res => setContacts(res.data))
      .catch(() => {})
  }

  useEffect(() => { fetchContacts() }, [search])
  useEffect(() => {
    api.get('/api/community/newsletter/logs').then(res => setLogs(res.data)).catch(() => {})
    api.get('/api/community/newsletter/templates').then(res => setTemplates(res.data.templates || [])).catch(() => {})
  }, [])

  const openAdd = () => {
    setForm({ name: '', email: '', phone: '', interests: '', notes: '' })
    setEditContact(null)
    setShowForm(true)
  }

  const openEdit = (c: Contact) => {
    setForm({ name: c.name, email: c.email || '', phone: c.phone || '', interests: c.interests || '', notes: c.notes || '' })
    setEditContact(c)
    setShowForm(true)
  }

  const saveContact = async () => {
    if (!form.name.trim()) { toast.error('שם הוא שדה חובה'); return }
    try {
      if (editContact) {
        const res = await api.put(`/api/community/contacts/${editContact.id}`, form)
        setContacts(prev => prev.map(c => c.id === editContact.id ? res.data : c))
        toast.success('איש קשר עודכן')
      } else {
        const res = await api.post('/api/community/contacts', form)
        setContacts(prev => [res.data, ...prev])
        toast.success('איש קשר נוסף')
      }
      setShowForm(false)
    } catch { toast.error('שגיאה') }
  }

  const deleteContact = async (id: number) => {
    if (!confirm('מחק איש קשר?')) return
    try {
      await api.delete(`/api/community/contacts/${id}`)
      setContacts(prev => prev.filter(c => c.id !== id))
      setSelectedIds(prev => prev.filter(i => i !== id))
      toast.success('נמחק')
    } catch { toast.error('שגיאה') }
  }

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id])
  }

  const selectAll = () => {
    if (selectedIds.length === contacts.length) {
      setSelectedIds([])
    } else {
      setSelectedIds(contacts.map(c => c.id))
    }
  }

  const sendNewsletter = async () => {
    if (!newsletter.subject.trim() || !newsletter.body.trim()) {
      toast.error('מלא נושא ותוכן')
      return
    }
    setSending(true)
    try {
      const res = await api.post('/api/community/newsletter/send', {
        subject: newsletter.subject,
        body: newsletter.body,
        recipient_ids: selectedIds.length > 0 ? selectedIds : undefined,
      })
      toast.success(res.data.message)
      api.get('/api/community/newsletter/logs').then(r => setLogs(r.data)).catch(() => {})
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'שגיאה בשליחה')
    } finally {
      setSending(false)
    }
  }

  const applyTemplate = (tmpl: NewsletterTemplate) => {
    setNewsletter({ subject: tmpl.subject, body: tmpl.body })
    toast.success(`תבנית "${tmpl.name}" הוחלה`)
  }

  const withEmailCount = contacts.filter(c => c.email).length

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">קהילה</h1>
          <p className="text-gray-400 text-sm mt-1">{contacts.length} אנשי קשר · {withEmailCount} עם אימייל</p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm"
          style={{ background: 'linear-gradient(135deg, #d4af37, #b8962e)', color: '#0a0e1a' }}
        >
          <Plus size={16} />
          הוסף איש קשר
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {[
          { key: 'contacts', label: `אנשי קשר (${contacts.length})`, icon: Users },
          { key: 'newsletter', label: 'שליחת ניוזלטר', icon: Mail },
          { key: 'logs', label: `היסטוריה (${logs.length})`, icon: FileText },
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key as any)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all"
            style={
              tab === key
                ? { background: 'linear-gradient(135deg, #d4af37, #b8962e)', color: '#0a0e1a' }
                : { background: '#111827', border: '1px solid #1f2937', color: '#9ca3af' }
            }
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      {/* Contacts tab */}
      {tab === 'contacts' && (
        <div className="space-y-4">
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search size={15} color="#6b7280" className="absolute top-1/2 -translate-y-1/2 right-3" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="חיפוש לפי שם, אימייל, טלפון..."
                className="w-full pl-4 pr-10 py-2.5 rounded-xl text-sm text-white placeholder-gray-500 outline-none"
                style={{ background: '#111827', border: '1px solid #1f2937' }}
              />
            </div>
            {contacts.length > 0 && (
              <button
                onClick={selectAll}
                className="px-4 py-2 rounded-xl text-sm font-medium"
                style={{ background: '#111827', border: '1px solid #1f2937', color: '#9ca3af' }}
              >
                {selectedIds.length === contacts.length ? 'בטל בחירה' : 'בחר הכל'}
              </button>
            )}
          </div>

          {selectedIds.length > 0 && (
            <div
              className="flex items-center justify-between px-4 py-3 rounded-xl"
              style={{ background: 'rgba(212,175,55,0.08)', border: '1px solid rgba(212,175,55,0.2)' }}
            >
              <span className="text-sm text-gray-300">{selectedIds.length} נבחרו</span>
              <button
                onClick={() => { setTab('newsletter') }}
                className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-semibold"
                style={{ background: '#d4af37', color: '#0a0e1a' }}
              >
                <Mail size={14} />
                שלח ניוזלטר לנבחרים
              </button>
            </div>
          )}

          {contacts.length === 0 ? (
            <div className="text-center py-16 text-gray-500">
              <Users size={48} color="#374151" className="mx-auto mb-3" />
              <p>אין אנשי קשר</p>
            </div>
          ) : (
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #1f2937' }}>
              <table className="w-full">
                <thead>
                  <tr style={{ background: '#111827', borderBottom: '1px solid #1f2937' }}>
                    <th className="w-10 p-3 text-center">
                      <div
                        onClick={selectAll}
                        className="w-4 h-4 rounded mx-auto cursor-pointer"
                        style={{
                          background: selectedIds.length === contacts.length ? '#d4af37' : 'transparent',
                          border: `2px solid ${selectedIds.length === contacts.length ? '#d4af37' : '#374151'}`,
                        }}
                      />
                    </th>
                    <th className="p-3 text-right text-xs font-semibold text-gray-400">שם</th>
                    <th className="p-3 text-right text-xs font-semibold text-gray-400">אימייל</th>
                    <th className="p-3 text-right text-xs font-semibold text-gray-400">טלפון</th>
                    <th className="p-3 text-right text-xs font-semibold text-gray-400">תחומי עניין</th>
                    <th className="p-3 text-right text-xs font-semibold text-gray-400">פעולות</th>
                  </tr>
                </thead>
                <tbody>
                  {contacts.map((c, i) => (
                    <tr
                      key={c.id}
                      style={{
                        background: i % 2 === 0 ? '#0a0e1a' : '#0d1117',
                        borderBottom: '1px solid #1a2035',
                      }}
                    >
                      <td className="p-3 text-center">
                        <div
                          onClick={() => toggleSelect(c.id)}
                          className="w-4 h-4 rounded mx-auto cursor-pointer"
                          style={{
                            background: selectedIds.includes(c.id) ? '#d4af37' : 'transparent',
                            border: `2px solid ${selectedIds.includes(c.id) ? '#d4af37' : '#374151'}`,
                          }}
                        />
                      </td>
                      <td className="p-3">
                        <div className="text-sm font-medium text-white">{c.name}</div>
                        {c.last_contact_at && (
                          <div className="text-xs text-gray-600 mt-0.5">
                            פנייה אחרונה: {new Date(c.last_contact_at).toLocaleDateString('he-IL')}
                          </div>
                        )}
                      </td>
                      <td className="p-3">
                        {c.email ? (
                          <a href={`mailto:${c.email}`} className="text-sm text-blue-400 hover:underline flex items-center gap-1">
                            <Mail size={12} />
                            {c.email}
                          </a>
                        ) : <span className="text-gray-600 text-sm">—</span>}
                      </td>
                      <td className="p-3">
                        {c.phone ? (
                          <span className="text-sm text-gray-300 flex items-center gap-1">
                            <Phone size={12} color="#6b7280" />
                            {c.phone}
                          </span>
                        ) : <span className="text-gray-600 text-sm">—</span>}
                      </td>
                      <td className="p-3">
                        <span className="text-sm text-gray-400 truncate max-w-32 block">{c.interests || '—'}</span>
                      </td>
                      <td className="p-3">
                        <div className="flex gap-1.5">
                          <button onClick={() => openEdit(c)} className="p-1.5 rounded-lg" style={{ color: '#d4af37', background: 'rgba(212,175,55,0.1)' }}>
                            <Edit size={13} />
                          </button>
                          <button onClick={() => deleteContact(c.id)} className="p-1.5 rounded-lg" style={{ color: '#ef4444', background: 'rgba(239,68,68,0.1)' }}>
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Newsletter tab */}
      {tab === 'newsletter' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <div className="rounded-xl p-5 space-y-4" style={{ background: '#111827', border: '1px solid #1f2937' }}>
              <h3 className="text-sm font-semibold text-gray-400">תוכן הניוזלטר</h3>
              <div>
                <label className="block text-xs text-gray-500 mb-1.5">נושא האימייל</label>
                <input
                  value={newsletter.subject}
                  onChange={e => setNewsletter(p => ({ ...p, subject: e.target.value }))}
                  placeholder="נושא הניוזלטר..."
                  className="w-full px-4 py-2.5 rounded-xl text-sm text-white placeholder-gray-600 outline-none"
                  style={{ background: '#1f2937', border: '1px solid #374151' }}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1.5">תוכן</label>
                <textarea
                  value={newsletter.body}
                  onChange={e => setNewsletter(p => ({ ...p, body: e.target.value }))}
                  placeholder="תוכן הניוזלטר..."
                  rows={12}
                  className="w-full px-4 py-2.5 rounded-xl text-sm text-white placeholder-gray-600 outline-none resize-none"
                  style={{ background: '#1f2937', border: '1px solid #374151' }}
                />
              </div>
            </div>

            <div className="rounded-xl p-4" style={{ background: '#111827', border: '1px solid #1f2937' }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-400">נמענים</span>
                <span className="text-sm font-medium" style={{ color: '#d4af37' }}>
                  {selectedIds.length > 0 ? `${selectedIds.length} נבחרו` : `כל אנשי הקשר (${withEmailCount} עם אימייל)`}
                </span>
              </div>
              <button
                onClick={sendNewsletter}
                disabled={sending}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-opacity disabled:opacity-60"
                style={{ background: 'linear-gradient(135deg, #d4af37, #b8962e)', color: '#0a0e1a' }}
              >
                <Send size={16} />
                {sending ? 'שולח...' : 'שלח ניוזלטר'}
              </button>
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-400">תבניות מוכנות</h3>
            {templates.map(tmpl => (
              <div
                key={tmpl.id}
                className="rounded-xl p-4 cursor-pointer hover:border-yellow-600 transition-colors"
                style={{ background: '#111827', border: '1px solid #1f2937' }}
                onClick={() => applyTemplate(tmpl)}
              >
                <div className="text-sm font-semibold text-white mb-1">{tmpl.name}</div>
                <div className="text-xs text-gray-500 truncate">{tmpl.subject}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Logs tab */}
      {tab === 'logs' && (
        <div className="space-y-3">
          {logs.length === 0 ? (
            <div className="text-center py-16 text-gray-500">
              <Mail size={40} color="#374151" className="mx-auto mb-3" />
              <p>לא נשלחו ניוזלטרים עדיין</p>
            </div>
          ) : (
            logs.map(log => (
              <div key={log.id} className="rounded-xl p-4" style={{ background: '#111827', border: '1px solid #1f2937' }}>
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-sm font-semibold text-white">{log.subject}</h3>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span>{log.recipients_count} נמענים</span>
                    <span>·</span>
                    <span>{new Date(log.sent_at).toLocaleDateString('he-IL')}</span>
                  </div>
                </div>
                <p className="text-xs text-gray-500 truncate">{log.body}</p>
              </div>
            ))
          )}
        </div>
      )}

      {/* Add/Edit contact modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="rounded-2xl p-6 w-full max-w-md" style={{ background: '#111827', border: '1px solid #1f2937' }}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-semibold text-white">
                {editContact ? 'עריכת איש קשר' : 'הוספת איש קשר'}
              </h3>
              <button onClick={() => setShowForm(false)} className="p-1 rounded-lg text-gray-500 hover:text-white">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-3">
              {[
                { key: 'name', label: 'שם *', placeholder: 'שם מלא', required: true },
                { key: 'email', label: 'אימייל', placeholder: 'email@example.com' },
                { key: 'phone', label: 'טלפון', placeholder: '05X-XXXXXXX' },
                { key: 'interests', label: 'תחומי עניין', placeholder: 'Rolex, Patek...' },
                { key: 'notes', label: 'הערות', placeholder: 'הערות נוספות...' },
              ].map(field => (
                <div key={field.key}>
                  <label className="block text-xs text-gray-500 mb-1">{field.label}</label>
                  <input
                    value={form[field.key as keyof typeof form]}
                    onChange={e => setForm(p => ({ ...p, [field.key]: e.target.value }))}
                    placeholder={field.placeholder}
                    className="w-full px-3 py-2.5 rounded-xl text-sm text-white placeholder-gray-600 outline-none"
                    style={{ background: '#1f2937', border: '1px solid #374151' }}
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setShowForm(false)} className="flex-1 py-2.5 rounded-xl text-sm font-medium" style={{ background: '#1f2937', color: '#9ca3af' }}>
                ביטול
              </button>
              <button onClick={saveContact} className="flex-1 py-2.5 rounded-xl text-sm font-semibold" style={{ background: 'linear-gradient(135deg, #d4af37, #b8962e)', color: '#0a0e1a' }}>
                {editContact ? 'עדכן' : 'הוסף'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
