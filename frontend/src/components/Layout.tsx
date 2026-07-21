import { Outlet, Link, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth'

function initials(firstName: string | null, lastName: string | null, email: string | null): string {
  const first = firstName?.trim()
  const last = lastName?.trim()
  if (first && last) return (first[0] + last[0]).toUpperCase()
  if (first) return first.slice(0, 2).toUpperCase()
  if (last) return last.slice(0, 2).toUpperCase()
  if (email?.trim()) {
    const [local, domain] = email.trim().split('@')
    if (local && domain) return (local[0] + domain[0]).toUpperCase()
    return email.slice(0, 2).toUpperCase()
  }
  return 'U'
}

export default function Layout() {
  const { user, isGuest, logout } = useAuth()
  const location = useLocation()
  const displayName = isGuest
    ? 'Guest'
    : [user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.email || 'User'

  const navItems = [
    { to: '/', label: 'Home' },
    { to: '/contracts', label: 'Pricing contracts' },
  ]

  return (
    <div className="flex min-h-screen bg-gray-50">
      <aside className="flex w-56 flex-col bg-wago-green">
        <div className="flex h-14 items-center justify-center border-b border-wago-darkgreen/30">
          <span className="text-lg font-bold tracking-wide text-white">WAGO</span>
        </div>
        <nav className="flex-1 space-y-0.5 p-3">
          {navItems.map(({ to, label }) => {
            const isActive =
              to === '/'
                ? location.pathname === '/'
                : location.pathname === to || location.pathname.startsWith(`${to}/`)
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

      <div className="flex flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b border-gray-200 bg-white px-6 shadow-sm">
          <h1 className="text-lg font-semibold text-gray-900">RSM Tools</h1>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600">{displayName}</span>
            {!isGuest && (
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-wago-green text-xs font-medium text-white">
                {initials(user?.firstName ?? null, user?.lastName ?? null, user?.email ?? null)}
              </span>
            )}
            {isGuest ? (
              <Link to="/login" className="btn-secondary text-sm">
                Sign in
              </Link>
            ) : (
              <button type="button" onClick={logout} className="btn-secondary text-sm">
                Sign out
              </button>
            )}
          </div>
        </header>
        <main className="flex-1 overflow-auto px-6 py-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
