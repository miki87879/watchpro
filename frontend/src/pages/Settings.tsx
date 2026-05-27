import { useState, useEffect } from 'react'
import { Eye, EyeOff, Trash2, Save, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../api/client'

interface KeyConfig {
  key: string
  label: string
  configured: boolean
  masked: string | null
}

interface ServiceConfig {
  service: string
  service_icon: string
  active: boolean
  partial: boolean
  keys: KeyConfig[]
  instructions: string[]
  link: string
  link_label: string
  description: string
}

function StatusBadge({ active, partial }: { active: boolean; partial: boolean }) {
  if (active) {
    return (
      <span
        className="text-xs font-medium px-2.5 py-1 rounded-full"
        style={{ background: 'rgba(34,197,94,0.15)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.3)' }}
      >
        ✅ פעיל
      </span>
    )
  }
  if (partial) {
    return (
      <span
        className="text-xs font-medium px-2.5 py-1 rounded-full"
        style={{ background: 'rgba(234,179,8,0.15)', color: '#facc15', border: '1px solid rgba(234,179,8,0.3)' }}
      >
        ⚠️ חלקי
      </span>
    )
  }
  return (
    <span
      className="text-xs font-medium px-2.5 py-1 rounded-full"
      style={{ background: 'rgba(107,114,128,0.15)', color: '#9ca3af', border: '1px solid rgba(107,114,128,0.3)' }}
    >
      ❌ לא מוגדר
    </span>
  )
}

function KeyRow({
  keyConfig,
  value,
  onChange,
  onDelete,
}: {
  keyConfig: KeyConfig
  value: string
  onChange: (val: string) => void
  onDelete: () => void
}) {
  const [show, setShow] = useState(false)

  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium" style={{ color: '#d1d5db' }}>
        {keyConfig.label}
      </label>
      {keyConfig.configured ? (
        <div className="flex items-center gap-2">
          <span
            className="flex-1 px-3 py-2 rounded-lg text-sm font-mono"
            style={{ background: 'rgba(34,197,94,0.1)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.25)' }}
          >
            {keyConfig.masked}
          </span>
          <button
            onClick={onDelete}
            className="p-2 rounded-lg transition-all hover:bg-red-900/30"
            style={{ color: '#f87171', border: '1px solid rgba(248,113,113,0.25)' }}
            title="מחק מפתח"
          >
            <Trash2 size={15} />
          </button>
        </div>
      ) : (
        <div className="relative">
          <input
            type={show ? 'text' : 'password'}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={`הכנס ${keyConfig.label}`}
            className="w-full px-3 py-2 pr-10 rounded-lg text-sm font-mono outline-none transition-all"
            style={{
              background: '#0a0e1a',
              border: '1px solid #1f2937',
              color: '#f9fafb',
              direction: 'ltr',
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = '#d4af37')}
            onBlur={(e) => (e.currentTarget.style.borderColor = '#1f2937')}
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="absolute left-2 top-1/2 -translate-y-1/2 p-1 rounded transition-colors"
            style={{ color: '#6b7280' }}
          >
            {show ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>
      )}
    </div>
  )
}

function ServiceCard({
  service,
  onRefetch,
}: {
  service: ServiceConfig
  onRefetch: () => void
}) {
  const [inputValues, setInputValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    service.keys.forEach((k) => { init[k.key] = '' })
    return init
  })
  const [saving, setSaving] = useState(false)
  const [instructionsOpen, setInstructionsOpen] = useState(false)

  const handleInputChange = (key: string, val: string) => {
    setInputValues((prev) => ({ ...prev, [key]: val }))
  }

  const handleDelete = async (keyName: string) => {
    if (!window.confirm(`האם אתה בטוח שברצונך למחוק את המפתח "${keyName}"?`)) return
    try {
      await api.delete(`/api/settings/api-keys/${keyName}`)
      toast.success('🗑️ מפתח נמחק בהצלחה')
      onRefetch()
    } catch {
      toast.error('שגיאה במחיקת המפתח')
    }
  }

  const handleSave = async () => {
    const keysToSave: Record<string, string> = {}
    service.keys.forEach((k) => {
      if (!k.configured && inputValues[k.key]?.trim()) {
        keysToSave[k.key] = inputValues[k.key].trim()
      }
    })
    if (Object.keys(keysToSave).length === 0) {
      toast('אין מפתחות חדשים לשמור', { icon: 'ℹ️' })
      return
    }
    setSaving(true)
    try {
      await api.post('/api/settings/api-keys', { keys: keysToSave })
      toast.success('✅ מפתח נשמר! השירות פעיל כעת')
      setInputValues((prev) => {
        const reset = { ...prev }
        Object.keys(keysToSave).forEach((k) => { reset[k] = '' })
        return reset
      })
      onRefetch()
    } catch {
      toast.error('שגיאה בשמירת המפתח')
    } finally {
      setSaving(false)
    }
  }

  const hasUnconfiguredWithValue = service.keys.some(
    (k) => !k.configured && inputValues[k.key]?.trim()
  )

  return (
    <div
      className="rounded-2xl p-6 flex flex-col gap-5"
      style={{ background: '#111827', border: '1px solid #1f2937' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{service.service_icon}</span>
          <h3 className="text-base font-bold" style={{ color: '#f9fafb' }}>
            {service.service}
          </h3>
        </div>
        <StatusBadge active={service.active} partial={service.partial} />
      </div>

      {/* Description */}
      <p className="text-sm" style={{ color: '#6b7280' }}>
        {service.description}
      </p>

      {/* Keys */}
      <div className="space-y-4">
        {service.keys.map((k) => (
          <KeyRow
            key={k.key}
            keyConfig={k}
            value={inputValues[k.key] ?? ''}
            onChange={(val) => handleInputChange(k.key, val)}
            onDelete={() => handleDelete(k.key)}
          />
        ))}
      </div>

      {/* Save button */}
      <button
        onClick={handleSave}
        disabled={saving || !hasUnconfiguredWithValue}
        className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        style={{
          background: hasUnconfiguredWithValue && !saving
            ? 'linear-gradient(135deg, #d4af37, #b8962e)'
            : '#1f2937',
          color: hasUnconfiguredWithValue && !saving ? '#0a0e1a' : '#6b7280',
        }}
      >
        <Save size={15} />
        {saving ? 'שומר...' : 'שמור'}
      </button>

      {/* Instructions accordion */}
      <div style={{ borderTop: '1px solid #1f2937' }} className="pt-3">
        <button
          onClick={() => setInstructionsOpen((o) => !o)}
          className="flex items-center gap-2 text-sm font-medium transition-colors w-full"
          style={{ color: '#9ca3af' }}
        >
          {instructionsOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          <span>📖 הוראות</span>
        </button>

        {instructionsOpen && (
          <div className="mt-3 space-y-3">
            <ol className="space-y-1.5 list-decimal list-inside">
              {service.instructions.map((step, i) => (
                <li key={i} className="text-sm" style={{ color: '#9ca3af' }}>
                  {step}
                </li>
              ))}
            </ol>
            {service.link && (
              <a
                href={service.link}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-medium transition-colors"
                style={{ color: '#d4af37' }}
              >
                <ExternalLink size={13} />
                {service.link_label}
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default function Settings() {
  const [services, setServices] = useState<ServiceConfig[]>([])
  const [loading, setLoading] = useState(true)

  const fetchSettings = async () => {
    try {
      const { data } = await api.get<ServiceConfig[]>('/api/settings/api-keys')
      setServices(data)
    } catch {
      toast.error('שגיאה בטעינת ההגדרות')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchSettings()
  }, [])

  return (
    <div className="min-h-screen p-8" style={{ background: '#0a0e1a', direction: 'rtl' }}>
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-1" style={{ color: '#f9fafb' }}>
          ⚙️ הגדרות ומפתחות API
        </h1>
        <p className="text-sm" style={{ color: '#6b7280' }}>
          חבר שירותים חיצוניים להרחבת יכולות המערכת
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div
            className="w-10 h-10 rounded-full border-2 border-t-transparent animate-spin"
            style={{ borderColor: '#d4af37', borderTopColor: 'transparent' }}
          />
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-6 items-start">
          {/* Left column — service cards (2/3 width) */}
          <div className="col-span-2 space-y-6">
            {services.map((svc) => (
              <ServiceCard key={svc.service} service={svc} onRefetch={fetchSettings} />
            ))}
          </div>

          {/* Right column — sidebar (1/3 width) */}
          <div className="col-span-1 space-y-5 sticky top-8">
            {/* Why API keys */}
            <div
              className="rounded-2xl p-5"
              style={{ background: '#111827', border: '1px solid #1f2937' }}
            >
              <h2 className="text-sm font-bold mb-4" style={{ color: '#d4af37' }}>
                🔑 למה צריך מפתחות API?
              </h2>
              <ul className="space-y-3">
                <li className="flex gap-2 text-sm" style={{ color: '#9ca3af' }}>
                  <span className="mt-0.5 flex-shrink-0">🛒</span>
                  <span>
                    <span className="font-semibold" style={{ color: '#d1d5db' }}>eBay — </span>
                    50 מכירות פעילות בכל חיפוש, מחירים מדויקים בזמן אמת
                  </span>
                </li>
                <li className="flex gap-2 text-sm" style={{ color: '#9ca3af' }}>
                  <span className="mt-0.5 flex-shrink-0">🌐</span>
                  <span>
                    <span className="font-semibold" style={{ color: '#d1d5db' }}>Chrono24 — </span>
                    הפלטפורמה הגדולה בעולם לשעוני יוקרה — עשרות אלפי מכירות
                  </span>
                </li>
                <li className="flex gap-2 text-sm" style={{ color: '#9ca3af' }}>
                  <span className="mt-0.5 flex-shrink-0">🤖</span>
                  <span>
                    <span className="font-semibold" style={{ color: '#d1d5db' }}>Anthropic — </span>
                    AI לזיהוי שעונים, מילוי אוטומטי ויצירת מודעות
                  </span>
                </li>
              </ul>
            </div>

            {/* eBay guide */}
            <div
              className="rounded-2xl p-5"
              style={{ background: '#111827', border: '1px solid #1f2937' }}
            >
              <h2 className="text-sm font-bold mb-4" style={{ color: '#d4af37' }}>
                🛒 כיצד מקבלים מפתח eBay (חינם)
              </h2>
              <ol className="space-y-2.5 list-decimal list-inside">
                <li className="text-sm" style={{ color: '#9ca3af' }}>
                  כנס ל-{' '}
                  <a
                    href="https://developer.ebay.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                    style={{ color: '#d4af37' }}
                  >
                    developer.ebay.com
                  </a>
                </li>
                <li className="text-sm" style={{ color: '#9ca3af' }}>
                  לחץ Get Started → צור חשבון (חינם)
                </li>
                <li className="text-sm" style={{ color: '#9ca3af' }}>
                  Create Application → Production
                </li>
                <li className="text-sm" style={{ color: '#9ca3af' }}>
                  העתק App ID ו-Cert ID
                </li>
                <li className="text-sm" style={{ color: '#9ca3af' }}>
                  הדבק למעלה ולחץ שמור
                </li>
              </ol>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
