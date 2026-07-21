import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './lib/auth'
import Layout from './components/Layout'
import Login from './pages/Login'
import Register from './pages/Register'
import Home from './pages/Home'
import Contracts from './pages/Contracts'
import ContractCreate from './pages/ContractCreate'
import ContractDetail from './pages/ContractDetail'

function RequireSession({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="flex min-h-screen items-center justify-center">Loading…</div>
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

/** Pricing contracts require a real login (server save). Guests are sent to login. */
function RequireLogin({ children }: { children: React.ReactNode }) {
  const { user, isGuest, loading } = useAuth()
  if (loading) return <div className="flex min-h-screen items-center justify-center">Loading…</div>
  if (!user || isGuest) return <Navigate to="/login" replace state={{ from: 'contracts' }} />
  return <>{children}</>
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route
        path="/"
        element={
          <RequireSession>
            <Layout />
          </RequireSession>
        }
      >
        <Route index element={<Home />} />
        <Route
          path="contracts"
          element={
            <RequireLogin>
              <Contracts />
            </RequireLogin>
          }
        />
        <Route
          path="contracts/new"
          element={
            <RequireLogin>
              <ContractCreate />
            </RequireLogin>
          }
        />
        <Route
          path="contracts/:id"
          element={
            <RequireLogin>
              <ContractDetail />
            </RequireLogin>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
