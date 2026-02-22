import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

const TOKEN_KEY = 'rsm-tools-token'

export default function ContractCreate() {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const token = localStorage.getItem(TOKEN_KEY)
    try {
      const res = await fetch('/api/price-contracts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name, description: description || undefined }),
      })
      if (!res.ok) throw new Error('Failed to create contract')
      const data = await res.json()
      navigate(`/contracts/${data.id}`, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Create contract</h1>
      <p className="mt-1 text-gray-600">Add a new pricing contract. You can upload PDF(s) after creating it.</p>
      <form onSubmit={handleSubmit} className="mt-6 max-w-xl space-y-4">
        {error && (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
        )}
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-gray-700">
            Contract name
          </label>
          <input
            id="name"
            type="text"
            className="input mt-1"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div>
          <label htmlFor="description" className="block text-sm font-medium text-gray-700">
            Description (optional)
          </label>
          <textarea
            id="description"
            rows={3}
            className="input mt-1"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="flex gap-3">
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Creating…' : 'Create contract'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/contracts')}
            className="btn-secondary"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
