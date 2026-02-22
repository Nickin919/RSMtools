import { Outlet, Link, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth'

function initials(name: string | null, email: string | null): string {
  if (name?.trim()) {
    const parts = name.trim().split(/\s+/)
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    return name.slice(0, 2).toUpperCase()
  }
  if (email) return email.slice(0, 2).toUpperCase()
  return 'U'
}

export default function Layout() {
  const { user, logout } = useAuth()
  const location = useLocation()
  const isAdminOrRsm = user?.role === 'ADMIN' || user?.role === 'RSM'
  const displayName = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.email || 'User'

  const navItems = [
    { to: '/', label: 'Dashboard' },
    { to: '/contracts', label: 'Pricing contracts' },
    ...(isAdminOrRsm ? [{ to: '/catalog', label: 'Master catalog' }] : []),
  ]

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* WAIGO-style green sidebar */}
      <aside className="flex w-56 flex-col bg-wago-green">
        <div className="flex h-14 items-center justify-center border-b border-wago-darkgreen/30">
          <span className="text-lg font-bold tracking-wide text-white">WAGO</span>
        </div>
        <nav className="flex-1 space-y-0.5 p-3">
          {navItems.map(({ to, label }) => {
            const isActive = to === '/' ? location.pathname === '/' : location.pathname.startsWith(to)
            return (
              <Link
                key={to}
                to={to}
                className={`block rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive ? 'bg-white text-wago-green' : 'text-white/95 hover:bg-white/15'
                }`}
              >
                {label}
              </Link>
            )
          })}
        </nav>
      </aside>

      {/* Main content area */}
      <div className="flex flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b border-gray-200 bg-white px-6 shadow-sm">
          <h1 className="text-lg font-semibold text-gray-900">RSM Tools</h1>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600">{displayName}</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-wago-green text-xs font-medium text-white">
              {initials(displayName, user?.email ?? null)}
            </span>
            <button type="button" onClick={logout} className="btn-secondary text-sm">
              Sign out
            </button>
          </div>
        </header>
        <main className="flex-1 overflow-auto px-6 py-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
