import { useState } from 'react'

const TOKEN_KEY = 'rsm-tools-token'

export default function CatalogUpload() {
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!file) return
    setMessage(null)
    setLoading(true)
    const token = localStorage.getItem(TOKEN_KEY)
    const formData = new FormData()
    formData.append('file', file)
    try {
      const res = await fetch('/api/product-import/import', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message || 'Upload failed')
      setMessage({ type: 'success', text: 'Catalog import started. ' + (data.message || 'Success.') })
      setFile(null)
    } catch (err) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Upload failed',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Master catalog</h1>
      <p className="mt-1 text-gray-600">
        Upload a product catalog CSV (Admin/RSM only). Column mapping can be configured when the backend supports it.
      </p>
      <div className="card mt-6 max-w-xl p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          {message && (
            <div
              className={`rounded-lg px-3 py-2 text-sm ${
                message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'
              }`}
            >
              {message.text}
            </div>
          )}
          <div>
            <label htmlFor="catalog-file" className="block text-sm font-medium text-gray-700">
              CSV file
            </label>
            <input
              id="catalog-file"
              type="file"
              accept=".csv"
              className="input mt-1"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <button
            type="submit"
            className="btn-primary"
            disabled={loading || !file}
          >
            {loading ? 'Uploading…' : 'Upload catalog'}
          </button>
        </form>
      </div>
    </div>
  )
}
