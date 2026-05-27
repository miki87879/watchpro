import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import api from '../api/client'

export type UserRole = 'admin' | 'manager' | 'viewer'

export interface AuthUser {
  id: number
  email: string
  full_name: string | null
  role: UserRole
  is_active: boolean
  created_at: string
  last_login: string | null
}

interface AuthContextType {
  user: AuthUser | null
  token: string | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  // Permission helpers
  isAdmin: boolean
  isManager: boolean   // admin OR manager
  canWrite: boolean    // admin or manager — can create/edit/delete
  canViewSettings: boolean // only admin
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('auth_token'))
  const [loading, setLoading] = useState(true)

  // On mount — verify stored token
  useEffect(() => {
    const stored = localStorage.getItem('auth_token')
    if (!stored) {
      setLoading(false)
      return
    }
    api.get('/api/auth/me')
      .then((res) => {
        setUser(res.data)
        setToken(stored)
      })
      .catch(() => {
        localStorage.removeItem('auth_token')
        localStorage.removeItem('auth_user')
        setToken(null)
        setUser(null)
      })
      .finally(() => setLoading(false))
  }, [])

  const login = async (email: string, password: string) => {
    const res = await api.post('/api/auth/login', { email, password })
    const { access_token, user: userData } = res.data
    localStorage.setItem('auth_token', access_token)
    localStorage.setItem('auth_user', JSON.stringify(userData))
    setToken(access_token)
    setUser(userData)
  }

  const logout = () => {
    localStorage.removeItem('auth_token')
    localStorage.removeItem('auth_user')
    setToken(null)
    setUser(null)
  }

  const isAdmin = user?.role === 'admin'
  const isManager = user?.role === 'admin' || user?.role === 'manager'
  const canWrite = isManager
  const canViewSettings = isAdmin

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, isAdmin, isManager, canWrite, canViewSettings }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
