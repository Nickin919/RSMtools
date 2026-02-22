import { useParams, Link } from 'react-router-dom'
import { useEffect, useState } from 'react'

const TOKEN_KEY = 'rsm-tools-token'

interface Contract {
  id: string
  name: string
  description: string | null
  items: unknown[]
}

export default function ContractDetail() {
  const { id } = useParams<{ id: string }>()
  const [contract, setContract] = useState<Contract | null>(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadMessage, setUploadMessage] = useState('')

  useEffect(() => {
    if (!id) return
    const token = localStorage.getItem(TOKEN_KEY)
    fetch(`/api/price-contracts/${id}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => setContract(data.contract ?? data))
      .catch(() => setContract(null))
      .finally(() => setLoading(false))
  }, [id])

  async function handlePdfUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files?.length || !id) return
    setUploading(true)
    setUploadMessage('')
    const token = localStorage.getItem(TOKEN_KEY)
    const formData = new FormData()
    for (let i = 0; i < files.length; i++) formData.append('pdf', files[i])
    try {
      const res = await fetch(`/api/price-contracts/${id}/items/upload-pdfs`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setUploadMessage(`Uploaded. ${data.totalImported ?? data.imported ?? data.count ?? ''} items added.`)
        window.location.reload()
      } else setUploadMessage(data.message || 'Upload failed')
    } catch {
      setUploadMessage('Upload failed')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  if (loading) return <div className="text-gray-500">Loading…</div>
  if (!contract) return <div className="text-red-600">Contract not found.</div>

  const items = Array.isArray(contract.items) ? contract.items : []

  return (
    <div>
      <Link to="/contracts" className="text-sm text-gray-500 hover:text-gray-700">← Contracts</Link>
      <div className="mt-4 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{contract.name}</h1>
          {contract.description && <p className="mt-1 text-gray-600">{contract.description}</p>}
        </div>
      </div>
      <div className="card mt-6 p-6">
        <h2 className="font-semibold text-gray-900">Upload PDF(s)</h2>
        <p className="mt-1 text-sm text-gray-500">Add line items from one or more WAGO quote PDFs.</p>
        <input
          type="file"
          accept=".pdf"
          multiple
          className="input mt-3 max-w-sm"
          onChange={handlePdfUpload}
          disabled={uploading}
        />
        {uploadMessage && (
          <p className={`mt-2 text-sm ${uploadMessage.startsWith('Uploaded') ? 'text-green-600' : 'text-red-600'}`}>
            {uploadMessage}
          </p>
        )}
      </div>
      <div className="card mt-6 overflow-hidden">
        <h2 className="border-b border-gray-200 bg-gray-50 px-4 py-3 font-semibold text-gray-900">
          Line items ({items.length})
        </h2>
        {items.length === 0 ? (
          <p className="p-4 text-gray-500">No items yet. Upload PDF(s) above.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Part #</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Series / Group</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Cost</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Discount %</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Min qty</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {items.map((item, i) => {
                  const row = item as Record<string, unknown>
                  return (
                  <tr key={(row.id as string) ?? i}>
                    <td className="px-4 py-2 text-sm text-gray-900">{String(row.partNumber ?? '')}</td>
                    <td className="px-4 py-2 text-sm text-gray-600">{String(row.seriesOrGroup ?? '')}</td>
                    <td className="px-4 py-2 text-right text-sm text-gray-900">{String(row.costPrice ?? '')}</td>
                    <td className="px-4 py-2 text-right text-sm text-gray-600">{String(row.discountPercent ?? '')}</td>
                    <td className="px-4 py-2 text-right text-sm text-gray-600">{String(row.minQuantity ?? '')}</td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
