import { useState, useEffect } from 'react'

const TOKEN_KEY = 'rsm-tools-token'

interface CatalogInfo {
  catalog: {
    id: string
    name: string
    description: string | null
    _count: { parts: number; categories: number }
  }
}

interface ImportResult {
  message: string
  imported: number
  skipped: number
  errors: number
  errorDetails?: string[]
  detectedColumns?: Record<string, string | undefined>
}

export default function CatalogUpload() {
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState('')
  const [catalogInfo, setCatalogInfo] = useState<CatalogInfo | null>(null)

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY)
    fetch('/api/product-import/catalog-info', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data && setCatalogInfo(data))
      .catch(() => null)
  }, [result])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!file) return
    setResult(null)
    setError('')
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
      setResult(data)
      setFile(null)
      const input = document.getElementById('catalog-file') as HTMLInputElement | null
      if (input) input.value = ''
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Master catalog</h1>
      <p className="mt-1 text-gray-600">
        Upload a product catalog CSV to populate the master product database. Admin / RSM only.
      </p>

      {/* Catalog stats */}
      {catalogInfo && (
        <div className="mt-4 flex gap-4">
          <div className="card flex-1 p-4">
            <p className="text-2xl font-bold text-wago-green">{catalogInfo.catalog._count.parts.toLocaleString()}</p>
            <p className="text-sm text-gray-500">Products</p>
          </div>
          <div className="card flex-1 p-4">
            <p className="text-2xl font-bold text-wago-green">{catalogInfo.catalog._count.categories.toLocaleString()}</p>
            <p className="text-sm text-gray-500">Categories</p>
          </div>
        </div>
      )}

      <div className="card mt-6 max-w-2xl p-6">
        <h2 className="font-semibold text-gray-900">Upload CSV</h2>
        <p className="mt-1 text-sm text-gray-500">
          Column headers are auto-detected. Supported names: <code className="text-xs bg-gray-100 px-1 rounded">partNumber</code>, <code className="text-xs bg-gray-100 px-1 rounded">description</code>, <code className="text-xs bg-gray-100 px-1 rounded">series</code>, <code className="text-xs bg-gray-100 px-1 rounded">basePrice</code>, <code className="text-xs bg-gray-100 px-1 rounded">category</code>, <code className="text-xs bg-gray-100 px-1 rounded">minQty</code>, <code className="text-xs bg-gray-100 px-1 rounded">distributorDiscount</code>, and common aliases.
        </p>
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
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
          <button type="submit" className="btn-primary" disabled={loading || !file}>
            {loading ? 'Importing…' : 'Import catalog'}
          </button>
        </form>

        {/* Error */}
        {error && (
          <div className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        {/* Success result */}
        {result && (
          <div className="mt-4 rounded-lg bg-green-50 px-4 py-3">
            <p className="font-medium text-green-800">{result.message}</p>
            <div className="mt-2 flex gap-6 text-sm text-green-700">
              <span><strong>{result.imported}</strong> imported</span>
              <span><strong>{result.skipped}</strong> skipped</span>
              {result.errors > 0 && <span className="text-red-600"><strong>{result.errors}</strong> errors</span>}
            </div>
            {result.detectedColumns && (
              <div className="mt-3">
                <p className="text-xs font-medium text-green-700">Detected column mapping:</p>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-green-600">
                  {Object.entries(result.detectedColumns)
                    .filter(([, v]) => v)
                    .map(([k, v]) => (
                      <span key={k}><strong>{k}</strong> → {v}</span>
                    ))}
                </div>
              </div>
            )}
            {result.errorDetails && result.errorDetails.length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-medium text-red-700">Sample errors:</p>
                <ul className="mt-1 list-disc pl-4 text-xs text-red-600">
                  {result.errorDetails.slice(0, 5).map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mt-6 max-w-2xl rounded-lg border border-gray-200 bg-gray-50 p-4">
        <h3 className="text-sm font-semibold text-gray-700">CSV format tips</h3>
        <ul className="mt-2 space-y-1 text-xs text-gray-600">
          <li>• First row must be column headers.</li>
          <li>• Required: a column that maps to part number (partNumber, article_no, artikelnummer, etc.).</li>
          <li>• Prices should be numeric (e.g. <code className="bg-white px-1 rounded">12.50</code> or <code className="bg-white px-1 rounded">12,50</code>).</li>
          <li>• Products with the same part number are updated (upsert). New parts are created.</li>
          <li>• Categories are created automatically if a category column is present.</li>
        </ul>
      </div>
    </div>
  )
}
