import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './lib/auth'
import Layout from './components/Layout'
import Login from './pages/Login'
import Register from './pages/Register'
import Home from './pages/Home'
import Contracts from './pages/Contracts'
import ContractCreate from './pages/ContractCreate'
import ContractDetail from './pages/ContractDetail'
import ProductFinder from './features/product-finder/ProductFinder'
import IoSystemConfigurator from './features/io-configurator/IoSystemConfigurator'
import LiteratureBrowse from './features/literature/LiteratureBrowse'
import LiteratureKits from './features/literature/LiteratureKits'
import LiteratureKitDetail from './features/literature/LiteratureKitDetail'

function RequireSession({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="flex min-h-screen items-center justify-center">Loading…</div>
  if (!user) return <Navigate to="/login" replace />
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
        <Route path="contracts" element={<Contracts />} />
        <Route path="contracts/new" element={<ContractCreate />} />
        <Route path="contracts/:id" element={<ContractDetail />} />
        <Route path="product-finder" element={<ProductFinder />} />
        <Route path="io-system-configurator" element={<IoSystemConfigurator />} />
        <Route path="literature" element={<LiteratureBrowse />} />
        <Route path="literature/kits" element={<LiteratureKits />} />
        <Route path="literature/kits/:id" element={<LiteratureKitDetail />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
