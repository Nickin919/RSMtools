import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './lib/auth'
import Layout from './components/Layout'
import Login from './pages/Login'
import Register from './pages/Register'
import Dashboard from './pages/Dashboard'
import Contracts from './pages/Contracts'
import ContractCreate from './pages/ContractCreate'
import ContractDetail from './pages/ContractDetail'
import CatalogUpload from './pages/CatalogUpload'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="flex min-h-screen items-center justify-center">Loading…</div>
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

function AdminOrRsmRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const allowed = user?.role === 'ADMIN' || user?.role === 'RSM'
  if (!allowed) return <Navigate to="/" replace />
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
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="contracts" element={<Contracts />} />
        <Route path="contracts/new" element={<ContractCreate />} />
        <Route path="contracts/:id" element={<ContractDetail />} />
        <Route
          path="catalog"
          element={
            <AdminOrRsmRoute>
              <CatalogUpload />
            </AdminOrRsmRoute>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
