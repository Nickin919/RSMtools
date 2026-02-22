import { useEffect, useState, useRef, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'

const TOKEN_KEY = 'rsm-tools-token'

interface Contract {
  id: string
  name: string
  description: string | null
  quoteNumber: string | null
  validFrom: string | null
  validTo: string | null
  createdAt: string
  _count?: { items: number }
}

interface BatchResult {
  filename: string
  contractId: string
  contractName: string
  imported: number
  skipped: number
  error?: string
}

export default function Contracts() {
  const navigate = useNavigate()
  const [contracts, setContracts] = useState<Contract[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // batch-upload state
  const [dragActive, setDragActive] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadResults, setUploadResults] = useState<BatchResult[] | null>(null)
  const [uploadError, setUploadError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const token = localStorage.getItem(TOKEN_KEY)

  const fetchContracts = useCallback(() => {
    setLoading(true)
    fetch('/api/price-contracts', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => setContracts(Array.isArray(data) ? data : data.contracts ?? []))
      .catch(() => setError('Could not load contracts.'))
      .finally(() => setLoading(false))
  }, [token])

  useEffect(() => { fetchContracts() }, [fetchContracts])

  // ── Batch PDF upload ────────────────────────────────────────────────────────

  async function uploadFiles(files: FileList | File[]) {
    const pdfs = Array.from(files).filter(f => f.name.toLowerCase().endsWith('.pdf'))
    if (pdfs.length === 0) { setUploadError('Please select PDF files only.'); return }

    setUploading(true); setUploadError(''); setUploadResults(null)
    const formData = new FormData()
    pdfs.forEach(f => formData.append('pdf', f))

    try {
      const res = await fetch('/api/price-contracts/batch-upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message || 'Upload failed')
      setUploadResults(data.results ?? [])
      fetchContracts()
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragActive(false)
    if (uploading) return
    uploadFiles(e.dataTransfer.files)
  }

  async function downloadCsv(contractId: string, name: string) {
    const res = await fetch(`/api/price-contracts/${contractId}/download-csv`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${(name || contractId).replace(/[^a-z0-9-_]/gi, '-')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function deleteContract(id: string, name: string) {
    if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return
    await fetch(`/api/price-contracts/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    fetchContracts()
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pricing contracts</h1>
          <p className="mt-1 text-sm text-gray-500">Drop one or more WAGO quote PDFs — each becomes a contract automatically.</p>
        </div>
        <Link to="/contracts/new" className="btn-secondary text-sm">
          + Create manually
        </Link>
      </div>

      {/* ── Batch PDF drop zone ── */}
      <div
        onDrop={handleDrop}
        onDragOver={e => { e.preventDefault(); setDragActive(true) }}
        onDragLeave={() => setDragActive(false)}
        onClick={() => !uploading && fileRef.current?.click()}
        className={`mt-6 flex cursor-pointer flex-col items-center rounded-xl border-2 border-dashed px-8 py-10 transition-colors ${
          dragActive ? 'border-wago-green bg-green-50' : 'border-gray-300 hover:border-wago-green hover:bg-gray-50'
        } ${uploading ? 'pointer-events-none opacity-60' : ''}`}
      >
        <input
          ref={fileRef}
          type="file"
          accept=".pdf"
          multiple
          className="hidden"
          onChange={e => e.target.files && uploadFiles(e.target.files)}
        />
        <div className="mb-2 text-4xl">{uploading ? '⏳' : '📄'}</div>
        <p className="font-semibold text-gray-800">
          {uploading ? 'Uploading & parsing PDFs…' : 'Drop WAGO quote PDFs here, or click to browse'}
        </p>
        <p className="mt-1 text-sm text-gray-500">
          {uploading ? 'Please wait' : 'Each PDF creates one contract — named after the file'}
        </p>
      </div>

      {/* ── Upload results ── */}
      {uploadError && (
        <div className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{uploadError}</div>
      )}
      {uploadResults && (
        <div className="mt-4 rounded-xl border border-gray-200 bg-white">
          <div className="border-b border-gray-100 bg-gray-50 px-4 py-3 flex items-center justify-between">
            <p className="font-semibold text-gray-800">
              {uploadResults.length} contract{uploadResults.length !== 1 ? 's' : ''} created
            </p>
            <button type="button" onClick={() => setUploadResults(null)} className="text-xs text-gray-400 hover:text-gray-600">Dismiss</button>
          </div>
          <ul className="divide-y divide-gray-100">
            {uploadResults.map((r, i) => (
              <li key={i} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="font-medium text-gray-900">{r.contractName}</p>
                  <p className="text-xs text-gray-500">{r.filename}</p>
                </div>
                <div className="flex items-center gap-4">
                  {r.error ? (
                    <span className="text-sm text-red-600">⚠ {r.error}</span>
                  ) : (
                    <>
                      <span className="text-sm text-green-700">{r.imported} items</span>
                      {r.skipped > 0 && <span className="text-xs text-gray-400">{r.skipped} skipped</span>}
                      {r.contractId && (
                        <button type="button" onClick={() => navigate(`/contracts/${r.contractId}`)} className="btn-secondary text-xs py-1 px-3">
                          View →
                        </button>
                      )}
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Contract list ── */}
      <div className="mt-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">Your contracts</h2>
        {loading ? (
          <div className="text-gray-400">Loading…</div>
        ) : error ? (
          <div className="rounded-lg bg-red-50 p-4 text-red-700">{error}</div>
        ) : contracts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 p-8 text-center text-gray-400">
            No contracts yet. Drop PDFs above to get started.
          </div>
        ) : (
          <div className="space-y-2">
            {contracts.map(c => (
              <div key={c.id} className="card flex items-center justify-between px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-medium text-gray-900">{c.name}</p>
                    {c.quoteNumber && (
                      <span className="shrink-0 rounded bg-blue-50 px-1.5 py-0.5 text-xs font-mono text-blue-700">{c.quoteNumber}</span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-gray-400">
                    {c.validFrom
                      ? <>Contract: {new Date(c.validFrom).toLocaleDateString()}</>
                      : <>Uploaded: {new Date(c.createdAt).toLocaleDateString()}</>}
                    {c.validTo && <> · Exp: {new Date(c.validTo).toLocaleDateString()}</>}
                    {c._count != null ? ` · ${c._count.items} items` : ''}
                  </p>
                </div>
                <div className="ml-4 flex shrink-0 items-center gap-2">
                  <button type="button" onClick={() => downloadCsv(c.id, c.name)} className="btn-secondary py-1 px-3 text-xs">
                    CSV ↓
                  </button>
                  <Link to={`/contracts/${c.id}`} className="btn-secondary py-1 px-3 text-xs">
                    View
                  </Link>
                  <button type="button" onClick={() => deleteContract(c.id, c.name)} className="py-1 px-2 text-xs text-red-400 hover:text-red-600">
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
