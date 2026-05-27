import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  Package,
  Search,
  FileText,
  Users,
  BarChart2,
  Settings,
  Watch,
  Scan,
  FolderOpen,
  LogOut,
  Shield,
  UserCheck,
  Eye,
  ChevronDown,
  Activity,
  Globe,
} from 'lucide-react'
import CurrencySelector from './CurrencySelector'
import { useState } from 'react'
import { useAuth } from '../context/AuthContext'

const navItems = [
  { to: '/', label: 'דשבורד', icon: LayoutDashboard, end: true },
  { to: '/inventory', label: 'מלאי', icon: Package },
  { to: '/watch-id', label: 'זיהוי שעון', icon: Scan },
  { to: '/price-scout', label: 'איתור מחירים', icon: Search },
  { to: '/ads', label: 'יצירת מודעות', icon: FileText },
  { to: '/community', label: 'קהילה', icon: Users },
  { to: '/finance', label: 'חשבונות', icon: BarChart2 },
  { to: '/documents', label: 'מסמכים', icon: FolderOpen },
  { to: '/exchange-rates', label: 'שערי מטח', icon: Globe },
]

const roleIcon = {
  admin: <Shield size={11} />,
  manager: <UserCheck size={11} />,
  viewer: <Eye size={11} />,
}
const roleLabel = {
  admin: 'מנהל ראשי',
  manager: 'מנהל',
  viewer: 'צופה',
}
const roleColor = {
  admin: '#f59e0b',
  manager: '#3b82f6',
  viewer: '#6b7280',
}

export default function Layout() {
  const { user, logout, isAdmin } = useAuth()
  const navigate = useNavigate()
  const [showUserMenu, setShowUserMenu] = useState(false)

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ direction: 'rtl' }}>
      {/* Sidebar */}
      <aside
        className="flex flex-col w-64 flex-shrink-0"
        style={{
          background: 'linear-gradient(180deg, #0d1117 0%, #111827 100%)',
          borderLeft: '1px solid #1f2937',
        }}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-6 py-6" style={{ borderBottom: '1px solid #1f2937' }}>
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, #d4af37, #b8962e)' }}
          >
            <Watch size={20} color="#0a0e1a" />
          </div>
          <div>
            <div className="font-bold text-lg" style={{ color: '#d4af37', lineHeight: 1.2 }}>
              Watch Pro
            </div>
            <div className="text-xs" style={{ color: '#6b7280' }}>
              ניהול שעוני יוקרה
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? 'text-navy-900'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
                }`
              }
              style={({ isActive }) =>
                isActive
                  ? { background: 'linear-gradient(135deg, #d4af37, #b8962e)', color: '#0a0e1a' }
                  : {}
              }
            >
              <Icon size={18} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Bottom area — settings (admin only) + user card */}
        <div className="px-3 py-4 space-y-1" style={{ borderTop: '1px solid #1f2937' }}>
          {/* Settings — admin only */}
          {/* Currency selector */}
          <div className="px-3 py-1">
            <CurrencySelector />
          </div>

          {isAdmin && (
            <>
              <NavLink
                to="/logs"
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 w-full ${
                    isActive ? '' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
                  }`
                }
                style={({ isActive }) =>
                  isActive
                    ? { background: 'linear-gradient(135deg, #d4af37, #b8962e)', color: '#0a0e1a' }
                    : {}
                }
              >
                <Activity size={18} />
                <span>לוגים</span>
              </NavLink>
              <NavLink
                to="/settings"
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 w-full ${
                    isActive ? '' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
                  }`
                }
                style={({ isActive }) =>
                  isActive
                    ? { background: 'linear-gradient(135deg, #d4af37, #b8962e)', color: '#0a0e1a' }
                    : {}
                }
              >
                <Settings size={18} />
                <span>הגדרות</span>
              </NavLink>
              <NavLink
                to="/users"
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 w-full ${
                    isActive ? '' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
                  }`
                }
                style={({ isActive }) =>
                  isActive
                    ? { background: 'linear-gradient(135deg, #d4af37, #b8962e)', color: '#0a0e1a' }
                    : {}
                }
              >
                <Users size={18} />
                <span>משתמשים</span>
              </NavLink>
            </>
          )}

          {/* User card */}
          {user && (
            <div className="relative">
              <button
                onClick={() => setShowUserMenu((p) => !p)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all hover:bg-gray-800"
              >
                {/* Avatar */}
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                  style={{
                    background: `${roleColor[user.role]}20`,
                    color: roleColor[user.role],
                    border: `1px solid ${roleColor[user.role]}40`,
                  }}
                >
                  {(user.full_name || user.email)[0].toUpperCase()}
                </div>
                <div className="flex-1 text-right min-w-0">
                  <p className="text-xs font-medium text-white truncate">
                    {user.full_name || user.email.split('@')[0]}
                  </p>
                  <span
                    className="inline-flex items-center gap-0.5 text-xs"
                    style={{ color: roleColor[user.role] }}
                  >
                    {roleIcon[user.role]}
                    {roleLabel[user.role]}
                  </span>
                </div>
                <ChevronDown
                  size={14}
                  style={{ color: '#6b7280', transform: showUserMenu ? 'rotate(180deg)' : '', transition: 'transform 0.2s' }}
                />
              </button>

              {/* Dropdown */}
              {showUserMenu && (
                <div
                  className="absolute bottom-full mb-1 w-full rounded-xl overflow-hidden shadow-xl"
                  style={{ background: '#1a1a2e', border: '1px solid rgba(212,175,55,0.2)' }}
                >
                  <div className="px-3 py-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <p className="text-xs text-white font-medium">{user.full_name || '—'}</p>
                    <p className="text-xs" style={{ color: '#6b7280' }}>{user.email}</p>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-sm transition-all hover:bg-red-500/10"
                    style={{ color: '#f87171' }}
                  >
                    <LogOut size={15} />
                    התנתק
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto" style={{ background: '#0a0e1a' }}>
        <Outlet />
      </main>
    </div>
  )
}
