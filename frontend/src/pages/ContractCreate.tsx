import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { priceContractsApi } from '../lib/priceContractsApi'
import { createGuestContract } from '../lib/guestContracts'

export default function ContractCreate() {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [quoteNumber, setQuoteNumber] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()
  const { isGuest } = useAuth()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (isGuest) {
        const contract = createGuestContract({
          name,
          description: description || undefined,
          quoteNumber: quoteNumber.trim() || undefined,
        })
        navigate(`/contracts/${contract.id}`, { replace: true })
        return
      }
      const data = await priceContractsApi.create({
        name,
        description: description || undefined,
        ...(quoteNumber.trim() && { quoteNumber: quoteNumber.trim() }),
      })
      const contract = (data as { contract?: { id: string } }).contract ?? (data as { id: string })
      navigate(`/contracts/${contract.id}`, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Create contract</h1>
      <p className="mt-1 text-gray-600">
        {isGuest
          ? 'Create a session-only contract (not saved to the server). Upload PDFs on the next screen.'
          : 'Add a new pricing contract. You can upload PDF(s) after creating it.'}
      </p>
      <form onSubmit={handleSubmit} className="mt-6 max-w-xl space-y-4">
        {error && (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
        )}
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-gray-700">
            Name
          </label>
          <input
            id="name"
            className="input mt-1"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div>
          <label htmlFor="quoteNumber" className="block text-sm font-medium text-gray-700">
            Quote number (optional)
          </label>
          <input
            id="quoteNumber"
            className="input mt-1"
            value={quoteNumber}
            onChange={(e) => setQuoteNumber(e.target.value)}
            placeholder="e.g. T26Q5889-A"
          />
        </div>
        <div>
          <label htmlFor="description" className="block text-sm font-medium text-gray-700">
            Description (optional)
          </label>
          <textarea
            id="description"
            className="input mt-1"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="flex gap-3">
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Creating…' : 'Create contract'}
          </button>
          <button type="button" className="btn-secondary" onClick={() => navigate('/contracts')}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
