import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

const TOKEN_KEY = 'rsm-tools-token'

interface Contract {
  id: string
  name: string
  description: string | null
  validFrom: string | null
  validTo: string | null
  createdAt: string
  itemsCount?: number
}

export default function Contracts() {
  const [contracts, setContracts] = useState<Contract[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY)
    fetch('/api/price-contracts', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Failed to load'))))
      .then((data) => setContracts(Array.isArray(data) ? data : data.contracts ?? []))
      .catch(() => setError('Could not load contracts.'))
      .finally(() => setLoading(false))
  }, [])

  async function downloadCsv(contractId: string, name: string) {
    const token = localStorage.getItem(TOKEN_KEY)
    const res = await fetch(`/api/price-contracts/${contractId}/download-csv`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `contract-${(name || contractId).replace(/[^a-z0-9-_]/gi, '-')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) return <div className="text-gray-500">Loading contracts…</div>
  if (error) return <div className="rounded-lg bg-red-50 p-4 text-red-700">{error}</div>

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Pricing contracts</h1>
        <Link to="/contracts/new" className="btn-primary">
          Create contract
        </Link>
      </div>
      <div className="mt-6 space-y-4">
        {contracts.length === 0 ? (
          <div className="card p-8 text-center text-gray-500">
            No contracts yet. Create one and upload PDF(s) to get started.
            <div className="mt-4">
              <Link to="/contracts/new" className="btn-primary">
                Create contract
              </Link>
            </div>
          </div>
        ) : (
          contracts.map((c) => (
            <div key={c.id} className="card flex items-center justify-between p-4">
              <div>
                <h2 className="font-semibold text-gray-900">{c.name}</h2>
                {c.description && (
                  <p className="mt-1 text-sm text-gray-500">{c.description}</p>
                )}
                <p className="mt-1 text-xs text-gray-400">
                  Created {new Date(c.createdAt).toLocaleDateString()}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => downloadCsv(c.id, c.name)}
                  className="btn-secondary"
                >
                  Download CSV
                </button>
                <Link to={`/contracts/${c.id}`} className="btn-secondary">
                  View
                </Link>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
