import { useParams, Link, useNavigate } from 'react-router-dom'
import { useEffect, useState, useRef } from 'react'

const TOKEN_KEY = 'rsm-tools-token'

interface Item {
  id: string
  partNumber: string | null
  seriesOrGroup: string | null
  costPrice: number
  discountPercent: number | null
  suggestedSellPrice: number | null
  minQuantity: number
}

interface Contract {
  id: string
  name: string
  description: string | null
  createdAt: string
  items: Item[]
}

export default function ContractDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [contract, setContract] = useState<Contract | null>(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadMsg, setUploadMsg] = useState('')
  const [dragActive, setDragActive] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const token = localStorage.getItem(TOKEN_KEY)

  function fetchContract() {
    if (!id) return
    fetch(`/api/price-contracts/${id}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => setContract(data.contract ?? data))
      .catch(() => setContract(null))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchContract() }, [id])

  async function uploadPDFs(files: FileList | File[]) {
    const pdfs = Array.from(files).filter(f => f.name.toLowerCase().endsWith('.pdf'))
    if (!pdfs.length || !id) return
    setUploading(true); setUploadMsg('')
    const formData = new FormData()
    pdfs.forEach(f => formData.append('pdf', f))
    try {
      const res = await fetch(`/api/price-contracts/${id}/items/upload-pdfs`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setUploadMsg(`✓ ${data.totalImported ?? 0} items added`)
        fetchContract()
      } else {
        setUploadMsg(data.message || 'Upload failed')
      }
    } catch {
      setUploadMsg('Upload failed')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function downloadCsv() {
    if (!contract) return
    const res = await fetch(`/api/price-contracts/${id}/download-csv`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${contract.name.replace(/[^a-z0-9-_]/gi, '-')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function deleteItem(itemId: string) {
    await fetch(`/api/price-contracts/${id}/items/${itemId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    fetchContract()
  }

  async function deleteContract() {
    if (!contract || !window.confirm(`Delete "${contract.name}"?`)) return
    await fetch(`/api/price-contracts/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    navigate('/contracts', { replace: true })
  }

  if (loading) return <div className="text-gray-400">Loading…</div>
  if (!contract) return <div className="rounded-lg bg-red-50 p-4 text-red-700">Contract not found.</div>

  const items: Item[] = Array.isArray(contract.items) ? contract.items : []

  const totalCost = items.reduce((sum, it) => sum + it.costPrice, 0)
  const totalNet = items.reduce((sum, it) => {
    const disc = it.discountPercent ?? 0
    return sum + it.costPrice * (1 - disc / 100)
  }, 0)

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link to="/contracts" className="text-xs text-gray-400 hover:text-gray-600">← All contracts</Link>
          <h1 className="mt-1 text-2xl font-bold text-gray-900">{contract.name}</h1>
          {contract.description && <p className="mt-1 text-sm text-gray-500">{contract.description}</p>}
          <p className="mt-0.5 text-xs text-gray-400">{new Date(contract.createdAt).toLocaleDateString()}</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button type="button" onClick={downloadCsv} className="btn-primary py-1.5 px-4 text-sm">
            Download CSV
          </button>
          <button type="button" onClick={deleteContract} className="btn-secondary py-1.5 px-4 text-sm text-red-500 hover:text-red-700">
            Delete
          </button>
        </div>
      </div>

      {/* Add more PDFs */}
      <div className="card mt-6 p-4">
        <p className="mb-2 text-sm font-medium text-gray-700">Add more PDFs to this contract</p>
        <div
          onDrop={e => { e.preventDefault(); setDragActive(false); !uploading && uploadPDFs(e.dataTransfer.files) }}
          onDragOver={e => { e.preventDefault(); setDragActive(true) }}
          onDragLeave={() => setDragActive(false)}
          onClick={() => !uploading && fileRef.current?.click()}
          className={`flex cursor-pointer items-center justify-center gap-3 rounded-lg border-2 border-dashed px-6 py-4 transition-colors ${
            dragActive ? 'border-wago-green bg-green-50' : 'border-gray-200 hover:border-wago-green hover:bg-gray-50'
          } ${uploading ? 'pointer-events-none opacity-60' : ''}`}
        >
          <input ref={fileRef} type="file" accept=".pdf" multiple className="hidden"
            onChange={e => e.target.files && uploadPDFs(e.target.files)} />
          <span className="text-lg">{uploading ? '⏳' : '📄'}</span>
          <span className="text-sm text-gray-600">{uploading ? 'Uploading…' : 'Drop PDFs here or click to browse'}</span>
        </div>
        {uploadMsg && (
          <p className={`mt-2 text-sm ${uploadMsg.startsWith('✓') ? 'text-green-600' : 'text-red-600'}`}>{uploadMsg}</p>
        )}
      </div>

      {/* Items table */}
      <div className="card mt-6 overflow-hidden">
        <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-4 py-3">
          <h2 className="font-semibold text-gray-900">Line items ({items.length})</h2>
          {items.length > 0 && (
            <div className="text-xs text-gray-500">
              List total: <span className="font-medium">${totalCost.toFixed(2)}</span>
              &nbsp;·&nbsp;
              Net total: <span className="font-medium text-green-700">${totalNet.toFixed(2)}</span>
            </div>
          )}
        </div>

        {items.length === 0 ? (
          <p className="p-6 text-center text-gray-400">No items yet. Add PDFs above.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500">Part #</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500">Series</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500">List $</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500">Disc %</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500">Net $</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500">MOQ</th>
                  <th className="px-1 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 bg-white">
                {items.map(item => {
                  const disc = item.discountPercent ?? 0
                  const net = item.costPrice * (1 - disc / 100)
                  return (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2 font-mono text-xs text-gray-900">{item.partNumber ?? '—'}</td>
                      <td className="px-4 py-2 text-gray-600">{item.seriesOrGroup ?? '—'}</td>
                      <td className="px-4 py-2 text-right text-gray-900">${item.costPrice.toFixed(4)}</td>
                      <td className="px-4 py-2 text-right text-gray-500">{disc > 0 ? `${disc.toFixed(1)}%` : '—'}</td>
                      <td className="px-4 py-2 text-right font-medium text-green-700">${net.toFixed(4)}</td>
                      <td className="px-4 py-2 text-right text-gray-500">{item.minQuantity}</td>
                      <td className="px-1 py-2">
                        <button type="button" onClick={() => deleteItem(item.id)}
                          className="text-xs text-gray-300 hover:text-red-500" title="Remove">✕</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot className="border-t-2 border-gray-200 bg-gray-50">
                <tr>
                  <td colSpan={2} className="px-4 py-2 text-xs font-semibold text-gray-500">{items.length} items</td>
                  <td className="px-4 py-2 text-right text-xs font-semibold text-gray-700">${totalCost.toFixed(2)}</td>
                  <td />
                  <td className="px-4 py-2 text-right text-xs font-semibold text-green-700">${totalNet.toFixed(2)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
