import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Package, Search, FileText, Users, BarChart2,
  Settings, Watch, Scan, FolderOpen, LogOut, Shield, UserCheck,
  Eye, ChevronDown, Activity, Globe, Menu, X,
} from 'lucide-react'
import CurrencySelector from './CurrencySelector'
import { useState } from 'react'
import { useAuth } from '../context/AuthContext'

const GOLD = '#d4af37'
const GOLD_DARK = '#b8962e'
const SIDEBAR_BG = 'linear-gradient(180deg, #0d1117 0%, #111827 100%)'
const BORDER = '#1f2937'

const navItems = [
  { to: '/',              label: 'דשבורד',        icon: LayoutDashboard, end: true },
  { to: '/inventory',     label: 'מלאי',           icon: Package },
  { to: '/watch-id',      label: 'זיהוי שעון',     icon: Scan },
  { to: '/price-scout',   label: 'איתור מחירים',   icon: Search },
  { to: '/ads',           label: 'יצירת מודעות',   icon: FileText },
  { to: '/community',     label: 'קהילה',          icon: Users },
  { to: '/finance',       label: 'חשבונות',        icon: BarChart2 },
  { to: '/documents',     label: 'מסמכים',         icon: FolderOpen },
  { to: '/exchange-rates',label: 'שערי מטח',       icon: Globe },
]

// Bottom nav: the 5 most-used items on mobile
const bottomNavItems = [
  { to: '/',            label: 'דשבורד',  icon: LayoutDashboard, end: true },
  { to: '/inventory',   label: 'מלאי',    icon: Package },
  { to: '/watch-id',    label: 'זיהוי',   icon: Scan },
  { to: '/price-scout', label: 'מחירים',  icon: Search },
  { to: '/finance',     label: 'חשבונות', icon: BarChart2 },
]

const roleIcon  = { admin: <Shield size={11} />, manager: <UserCheck size={11} />, viewer: <Eye size={11} /> }
const roleLabel = { admin: 'מנהל ראשי', manager: 'מנהל', viewer: 'צופה' }
const roleColor = { admin: '#f59e0b', manager: '#3b82f6', viewer: '#6b7280' }

function NavItem({ to, label, icon: Icon, end, onClick }: {
  to: string; label: string; icon: React.ElementType; end?: boolean; onClick?: () => void
}) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onClick}
      className={({ isActive }) =>
        `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 w-full ${
          isActive ? '' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
        }`
      }
      style={({ isActive }) =>
        isActive ? { background: `linear-gradient(135deg, ${GOLD}, ${GOLD_DARK})`, color: '#0a0e1a' } : {}
      }
    >
      <Icon size={18} />
      <span>{label}</span>
    </NavLink>
  )
}

export default function Layout() {
  const { user, logout, isAdmin } = useAuth()
  const navigate = useNavigate()
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)

  const handleLogout = () => { logout(); navigate('/login') }
  const closeDrawer = () => setDrawerOpen(false)

  const SidebarContent = ({ onNav }: { onNav?: () => void }) => (
    <>
      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map(({ to, label, icon, end }) => (
          <NavItem key={to} to={to} label={label} icon={icon} end={end} onClick={onNav} />
        ))}
      </nav>

      {/* Bottom area */}
      <div className="px-3 py-4 space-y-1" style={{ borderTop: `1px solid ${BORDER}` }}>
        <div className="px-3 py-1">
          <CurrencySelector />
        </div>

        {isAdmin && (
          <>
            <NavItem to="/logs"     label="לוגים"      icon={Activity} onClick={onNav} />
            <NavItem to="/settings" label="הגדרות"     icon={Settings} onClick={onNav} />
            <NavItem to="/users"    label="משתמשים"    icon={Users}    onClick={onNav} />
          </>
        )}

        {/* User card */}
        {user && (
          <div className="relative">
            <button
              onClick={() => setShowUserMenu(p => !p)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all hover:bg-gray-800"
            >
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                style={{ background: `${roleColor[user.role]}20`, color: roleColor[user.role], border: `1px solid ${roleColor[user.role]}40` }}
              >
                {(user.full_name || user.email)[0].toUpperCase()}
              </div>
              <div className="flex-1 text-right min-w-0">
                <p className="text-xs font-medium text-white truncate">
                  {user.full_name || user.email.split('@')[0]}
                </p>
                <span className="inline-flex items-center gap-0.5 text-xs" style={{ color: roleColor[user.role] }}>
                  {roleIcon[user.role]}{roleLabel[user.role]}
                </span>
              </div>
              <ChevronDown size={14} style={{ color: '#6b7280', transform: showUserMenu ? 'rotate(180deg)' : '', transition: 'transform 0.2s' }} />
            </button>

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
    </>
  )

  return (
    <div className="flex h-screen overflow-hidden" style={{ direction: 'rtl' }}>

      {/* ═══════════════════ DESKTOP SIDEBAR (md+) ═══════════════════ */}
      <aside
        className="hidden md:flex flex-col w-64 flex-shrink-0"
        style={{ background: SIDEBAR_BG, borderLeft: `1px solid ${BORDER}` }}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-6 py-6" style={{ borderBottom: `1px solid ${BORDER}` }}>
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: `linear-gradient(135deg, ${GOLD}, ${GOLD_DARK})` }}>
            <Watch size={20} color="#0a0e1a" />
          </div>
          <div>
            <div className="font-bold text-lg" style={{ color: GOLD, lineHeight: 1.2 }}>Watch Pro</div>
            <div className="text-xs" style={{ color: '#6b7280' }}>ניהול שעוני יוקרה</div>
          </div>
        </div>
        <SidebarContent />
      </aside>

      {/* ═══════════════════ MOBILE DRAWER OVERLAY ═══════════════════ */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0"
            style={{ background: 'rgba(0,0,0,0.65)' }}
            onClick={closeDrawer}
          />
          {/* Drawer panel — slides in from right (RTL = right side) */}
          <aside
            className="absolute top-0 right-0 h-full w-72 flex flex-col"
            style={{ background: SIDEBAR_BG, borderLeft: `1px solid ${BORDER}` }}
          >
            {/* Drawer header */}
            <div className="flex items-center justify-between px-5 py-5" style={{ borderBottom: `1px solid ${BORDER}` }}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                  style={{ background: `linear-gradient(135deg, ${GOLD}, ${GOLD_DARK})` }}>
                  <Watch size={18} color="#0a0e1a" />
                </div>
                <span className="font-bold text-base" style={{ color: GOLD }}>Watch Pro</span>
              </div>
              <button
                onClick={closeDrawer}
                className="p-2 rounded-xl hover:bg-gray-800 transition-all"
              >
                <X size={20} color="#9ca3af" />
              </button>
            </div>

            <SidebarContent onNav={closeDrawer} />
          </aside>
        </div>
      )}

      {/* ═══════════════════ MAIN AREA ═══════════════════ */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* MOBILE TOP BAR */}
        <header
          className="md:hidden flex items-center justify-between px-4 py-3 flex-shrink-0"
          style={{ background: '#0d1117', borderBottom: `1px solid ${BORDER}` }}
        >
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: `linear-gradient(135deg, ${GOLD}, ${GOLD_DARK})` }}>
              <Watch size={16} color="#0a0e1a" />
            </div>
            <span className="font-bold text-sm" style={{ color: GOLD }}>Watch Pro</span>
          </div>

          {/* User avatar + hamburger */}
          <div className="flex items-center gap-2">
            {user && (
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                style={{ background: `${roleColor[user.role]}20`, color: roleColor[user.role], border: `1px solid ${roleColor[user.role]}40` }}
              >
                {(user.full_name || user.email)[0].toUpperCase()}
              </div>
            )}
            <button
              onClick={() => setDrawerOpen(true)}
              className="p-2 rounded-xl"
              style={{ background: '#1f2937' }}
            >
              <Menu size={20} color={GOLD} />
            </button>
          </div>
        </header>

        {/* Page content — extra bottom padding on mobile for bottom nav */}
        <main
          className="flex-1 overflow-y-auto"
          style={{ background: '#0a0e1a', paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          {/* Add bottom padding on mobile so content doesn't hide behind bottom nav */}
          <div className="md:pb-0 pb-20">
            <Outlet />
          </div>
        </main>

        {/* MOBILE BOTTOM NAVIGATION */}
        <nav
          className="md:hidden fixed bottom-0 left-0 right-0 flex items-center justify-around z-30 flex-shrink-0"
          style={{
            background: '#0d1117',
            borderTop: `1px solid ${BORDER}`,
            paddingBottom: 'env(safe-area-inset-bottom)',
          }}
        >
          {bottomNavItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className="flex flex-col items-center gap-0.5 py-2 px-3 rounded-xl transition-all"
              style={({ isActive }) => ({
                color: isActive ? GOLD : '#6b7280',
              })}
            >
              {({ isActive }) => (
                <>
                  <div
                    className="w-8 h-8 rounded-xl flex items-center justify-center transition-all"
                    style={{ background: isActive ? `rgba(212,175,55,0.15)` : 'transparent' }}
                  >
                    <Icon size={18} />
                  </div>
                  <span className="text-xs font-medium">{label}</span>
                </>
              )}
            </NavLink>
          ))}

          {/* "More" button → opens drawer */}
          <button
            onClick={() => setDrawerOpen(true)}
            className="flex flex-col items-center gap-0.5 py-2 px-3 rounded-xl transition-all"
            style={{ color: '#6b7280' }}
          >
            <div className="w-8 h-8 rounded-xl flex items-center justify-center">
              <Menu size={18} />
            </div>
            <span className="text-xs font-medium">עוד</span>
          </button>
        </nav>
      </div>
    </div>
  )
}
