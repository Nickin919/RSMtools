import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'

const TOKEN_KEY = 'rsm-tools-token'

export default function Dashboard() {
  const { user } = useAuth()
  const isAdminOrRsm = user?.role === 'ADMIN' || user?.role === 'RSM'
  const [contractCount, setContractCount] = useState<number | null>(null)

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY)
    fetch('/api/price-contracts', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setContractCount(Array.isArray(data) ? data.length : (data.contracts?.length ?? 0)))
      .catch(() => setContractCount(0))
  }, [])

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900">Dashboard</h2>
      <p className="mt-1 text-sm text-gray-600">
        Welcome back{user?.firstName ? `, ${user.firstName}` : ''}.
      </p>

      {/* WAIGO-style metric cards */}
      <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card p-5">
          <p className="text-2xl font-bold text-gray-900">{contractCount ?? '—'}</p>
          <p className="mt-1 text-sm font-medium text-gray-600">Contracts</p>
        </div>
        <div className="card p-5">
          <p className="text-2xl font-bold text-gray-900">—</p>
          <p className="mt-1 text-sm font-medium text-gray-600">Line items</p>
        </div>
        <div className="card p-5">
          <p className="text-2xl font-bold text-gray-900">{isAdminOrRsm ? 'Master' : '—'}</p>
          <p className="mt-1 text-sm font-medium text-gray-600">Catalog</p>
        </div>
        <div className="card p-5">
          <p className="text-2xl font-bold text-gray-900">—</p>
          <p className="mt-1 text-sm font-medium text-gray-600">Placeholder</p>
        </div>
      </div>

      {/* Quick actions / project-style links */}
      <div className="mt-8">
        <h3 className="text-sm font-semibold text-gray-900">Quick actions</h3>
        <div className="mt-4 space-y-3">
          <Link
            to="/contracts"
            className="card flex items-center justify-between p-4 transition-shadow hover:shadow-md"
          >
            <div>
              <p className="font-medium text-gray-900">Pricing contracts</p>
              <p className="text-sm text-gray-500">Create contracts, upload PDFs, download CSV</p>
            </div>
            <span className="btn-primary text-sm">View</span>
          </Link>
          {isAdminOrRsm && (
            <Link
              to="/catalog"
              className="card flex items-center justify-between p-4 transition-shadow hover:shadow-md"
            >
              <div>
                <p className="font-medium text-gray-900">Master catalog</p>
                <p className="text-sm text-gray-500">Upload product catalog CSV</p>
              </div>
              <span className="btn-primary text-sm">Upload</span>
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
