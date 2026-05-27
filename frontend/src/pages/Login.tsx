import { useState, FormEvent } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Eye, EyeOff, Watch, Lock, Mail, AlertCircle } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const from = (location.state as any)?.from?.pathname || '/'

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !password) return
    setLoading(true)
    setError(null)
    try {
      await login(email.trim(), password)
      navigate(from, { replace: true })
    } catch (err: any) {
      setError(err.response?.data?.detail || 'שגיאת התחברות. בדוק אימייל וסיסמה.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1608 50%, #0a0a0a 100%)' }}
    >
      {/* Background texture */}
      <div
        className="absolute inset-0 opacity-5"
        style={{
          backgroundImage:
            'repeating-linear-gradient(45deg, #d4af37 0, #d4af37 1px, transparent 0, transparent 50%)',
          backgroundSize: '12px 12px',
        }}
      />

      <div className="relative w-full max-w-md mx-4">
        {/* Card */}
        <div
          className="rounded-2xl p-8"
          style={{
            background: 'rgba(20, 16, 4, 0.95)',
            border: '1px solid rgba(212, 175, 55, 0.3)',
            boxShadow: '0 25px 60px rgba(0,0,0,0.6), 0 0 40px rgba(212,175,55,0.05)',
          }}
        >
          {/* Logo */}
          <div className="text-center mb-8">
            <div
              className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-4"
              style={{ background: 'linear-gradient(135deg, #d4af37, #b8962e)' }}
            >
              <Watch size={32} color="#0a0a0a" />
            </div>
            <h1
              className="text-2xl font-bold"
              style={{
                background: 'linear-gradient(135deg, #d4af37, #f0d060)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              Watch Pro
            </h1>
            <p className="text-sm mt-1" style={{ color: '#9ca3af' }}>
              ניהול שעוני יוקרה
            </p>
          </div>

          <h2 className="text-white text-xl font-semibold mb-6 text-center">
            התחברות למערכת
          </h2>

          <form onSubmit={handleSubmit} dir="rtl" className="space-y-4">
            {/* Email */}
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: '#9ca3af' }}>
                כתובת אימייל
              </label>
              <div className="relative">
                <Mail
                  size={16}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                  style={{ color: '#6b7280' }}
                />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="הזן אימייל"
                  required
                  autoComplete="email"
                  className="w-full pr-9 pl-4 py-3 rounded-lg text-white placeholder-gray-600 outline-none transition-all"
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(212,175,55,0.2)',
                    fontSize: '14px',
                  }}
                  onFocus={(e) => (e.target.style.borderColor = 'rgba(212,175,55,0.6)')}
                  onBlur={(e) => (e.target.style.borderColor = 'rgba(212,175,55,0.2)')}
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: '#9ca3af' }}>
                סיסמה
              </label>
              <div className="relative">
                <Lock
                  size={16}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                  style={{ color: '#6b7280' }}
                />
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                  className="w-full pr-9 pl-10 py-3 rounded-lg text-white placeholder-gray-600 outline-none transition-all"
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(212,175,55,0.2)',
                    fontSize: '14px',
                  }}
                  onFocus={(e) => (e.target.style.borderColor = 'rgba(212,175,55,0.6)')}
                  onBlur={(e) => (e.target.style.borderColor = 'rgba(212,175,55,0.2)')}
                />
                <button
                  type="button"
                  onClick={() => setShowPass((p) => !p)}
                  className="absolute left-3 top-1/2 -translate-y-1/2"
                  style={{ color: '#6b7280' }}
                  tabIndex={-1}
                >
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm"
                style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5' }}
              >
                <AlertCircle size={15} />
                <span>{error}</span>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading || !email || !password}
              className="w-full py-3 rounded-lg font-semibold text-sm transition-all mt-2"
              style={{
                background: loading || !email || !password
                  ? 'rgba(212,175,55,0.3)'
                  : 'linear-gradient(135deg, #d4af37, #b8962e)',
                color: loading || !email || !password ? '#6b7280' : '#0a0a0a',
                cursor: loading || !email || !password ? 'not-allowed' : 'pointer',
              }}
            >
              {loading ? 'מתחבר...' : 'התחבר'}
            </button>
          </form>

        </div>
      </div>
    </div>
  )
}
