import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { ReactNode } from 'react'
import { AuthProvider, useAuth } from './context/AuthContext'
import { CurrencyProvider } from './context/CurrencyContext'
import { WatchSearchProvider } from './context/WatchSearchContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Inventory from './pages/Inventory'
import AddWatch from './pages/AddWatch'
import WatchDetail from './pages/WatchDetail'
import PriceScout from './pages/PriceScout'
import AdCreator from './pages/AdCreator'
import Community from './pages/Community'
import Finance from './pages/Finance'
import WatchIdentifier from './pages/WatchIdentifier'
import Documents from './pages/Documents'
import Settings from './pages/Settings'
import Users from './pages/Users'
import Logs from './pages/Logs'
import ExchangeRates from './pages/ExchangeRates'

// ─── Route guard: redirect to /login if not authenticated ────────────────────
function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0a0a0a' }}>
        <div className="text-center">
          <div
            className="w-12 h-12 rounded-full border-4 border-t-transparent animate-spin mx-auto mb-3"
            style={{ borderColor: 'rgba(212,175,55,0.4)', borderTopColor: '#d4af37' }}
          />
          <p className="text-sm" style={{ color: '#6b7280' }}>טוען...</p>
        </div>
      </div>
    )
  }
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }
  return <>{children}</>
}

function RequireAdmin({ children }: { children: ReactNode }) {
  const { isAdmin } = useAuth()
  if (!isAdmin) return <Navigate to="/" replace />
  return <>{children}</>
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="inventory" element={<Inventory />} />
        <Route path="inventory/add" element={<AddWatch />} />
        <Route path="inventory/edit/:id" element={<AddWatch />} />
        <Route path="inventory/:id" element={<WatchDetail />} />
        <Route path="price-scout" element={<PriceScout />} />
        <Route path="ads" element={<AdCreator />} />
        <Route path="community" element={<Community />} />
        <Route path="finance" element={<Finance />} />
        <Route path="watch-id" element={<WatchIdentifier />} />
        <Route path="documents" element={<Documents />} />
        <Route path="settings" element={<RequireAdmin><Settings /></RequireAdmin>} />
        <Route path="users" element={<RequireAdmin><Users /></RequireAdmin>} />
        <Route path="logs" element={<RequireAdmin><Logs /></RequireAdmin>} />
        <Route path="exchange-rates" element={<ExchangeRates />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <CurrencyProvider>
          <WatchSearchProvider>
            <AppRoutes />
          </WatchSearchProvider>
        </CurrencyProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
