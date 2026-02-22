import { useParams, Link, useNavigate } from 'react-router-dom'
import { useEffect, useState, useRef } from 'react'

const TOKEN_KEY = 'rsm-tools-token'

interface Part {
  id: string
  partNumber: string
  series: string | null
  description: string
  basePrice: number | null
}

interface Item {
  id: string
  partNumber: string | null
  seriesOrGroup: string | null
  description: string | null
  costPrice: number
  netPrice: number | null
  discountPercent: number | null
  suggestedSellPrice: number | null
  minQuantity: number
  moq: string | null
  partId: string | null
  part: Part | null
}

interface Contract {
  id: string
  name: string
  description: string | null
  quoteNumber: string | null
  validFrom: string | null
  validTo: string | null
  createdAt: string
  items: Item[]
}

function fmt(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
}

function pctOff(listPrice: number, costPrice: number): number | null {
  if (listPrice <= 0) return null
  return Math.round((1 - costPrice / listPrice) * 1000) / 10
}

export default function ContractDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const token = localStorage.getItem(TOKEN_KEY)

  const [contract, setContract] = useState<Contract | null>(null)
  const [loading, setLoading] = useState(true)

  // PDF upload state
  const [uploading, setUploading] = useState(false)
  const [uploadMsg, setUploadMsg] = useState('')
  const [dragActive, setDragActive] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Per-row inline edits (unverified items only)
  const [edits, setEdits] = useState<Record<string, { partNumber: string; costPrice: string }>>({})
  const [recheckingId, setRecheckingId] = useState<string | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)

  // Suggested sell price margin master control
  const [marginPct, setMarginPct] = useState('30')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [applyingMargin, setApplyingMargin] = useState(false)

  // Recheck all
  const [recheckingAll, setRecheckingAll] = useState(false)
  const [recheckResult, setRecheckResult] = useState<{ matched: number; unmatched: number } | null>(null)

  // Rename
  const [editingName, setEditingName] = useState(false)
  const [renameValue, setRenameValue] = useState('')

  function fetchContract() {
    if (!id) return
    fetch(`/api/price-contracts/${id}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => {
        const c: Contract = data.contract ?? data
        setContract(c)
        // Auto-select all product rows
        const productIds = new Set(c.items.filter(i => i.partNumber).map(i => i.id))
        setSelectedIds(productIds)
      })
      .catch(() => setContract(null))
      .finally(() => setLoading(false))
  }
  useEffect(() => { fetchContract() }, [id])

  // ── PDF upload ──────────────────────────────────────────────────────────────
  async function uploadPDFs(files: FileList | File[]) {
    const pdfs = Array.from(files).filter(f => f.name.toLowerCase().endsWith('.pdf'))
    if (!pdfs.length || !id) return
    setUploading(true); setUploadMsg('')
    const formData = new FormData()
    pdfs.forEach(f => formData.append('pdf', f))
    try {
      const res = await fetch(`/api/price-contracts/${id}/items/upload-pdfs`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: formData,
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) { setUploadMsg(`✓ ${data.totalImported ?? 0} items added`); fetchContract() }
      else setUploadMsg(data.message || 'Upload failed')
    } catch { setUploadMsg('Upload failed') }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = '' }
  }

  // ── Recheck / save item ─────────────────────────────────────────────────────
  async function handleRecheck(item: Item) {
    if (!id) return
    const edit = edits[item.id]
    const partNumber = edit?.partNumber?.trim() || item.partNumber || ''
    const costPrice = parseFloat(edit?.costPrice ?? String(item.costPrice))
    if (!partNumber) { alert('Enter a part number to recheck'); return }
    if (isNaN(costPrice) || costPrice < 0) { alert('Enter a valid cost price'); return }
    setRecheckingId(item.id)
    try {
      const res = await fetch(`/api/price-contracts/${id}/items/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ partNumber, costPrice }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setContract(prev => prev ? { ...prev, items: prev.items.map(i => i.id === item.id ? data.item : i) } : null)
        setEdits(prev => { const n = { ...prev }; delete n[item.id]; return n })
      }
    } finally { setRecheckingId(null) }
  }

  async function handleRemove(item: Item) {
    if (!id || !window.confirm('Remove this item?')) return
    setRemovingId(item.id)
    try {
      await fetch(`/api/price-contracts/${id}/items/${item.id}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
      })
      setContract(prev => prev ? { ...prev, items: prev.items.filter(i => i.id !== item.id) } : null)
    } finally { setRemovingId(null) }
  }

  // ── Suggested sell price margin ─────────────────────────────────────────────
  const productItems = (contract?.items ?? []).filter(i => i.partNumber)

  function toggleAll(checked: boolean) {
    setSelectedIds(checked ? new Set(productItems.map(i => i.id)) : new Set())
  }

  function toggleOne(itemId: string, checked: boolean) {
    setSelectedIds(prev => {
      const n = new Set(prev)
      checked ? n.add(itemId) : n.delete(itemId)
      return n
    })
  }

  async function applyMargin() {
    const ids = [...selectedIds]
    if (!ids.length || !id) return
    const margin = parseFloat(marginPct)
    if (isNaN(margin) || margin < 0 || margin >= 100) { alert('Enter a margin between 0 and 99'); return }
    setApplyingMargin(true)
    try {
      const res = await fetch(`/api/price-contracts/${id}/items/bulk-sell-price`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ itemIds: ids, marginPercent: margin }),
      })
      if (res.ok) fetchContract()
    } finally { setApplyingMargin(false) }
  }

  // ── Rename ──────────────────────────────────────────────────────────────────
  async function saveRename() {
    if (!id || !renameValue.trim()) return
    const res = await fetch(`/api/price-contracts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: renameValue.trim() }),
    })
    if (res.ok) { setContract(prev => prev ? { ...prev, name: renameValue.trim() } : null); setEditingName(false) }
  }

  // ── Recheck all items ───────────────────────────────────────────────────────
  async function recheckAll() {
    if (!id) return
    setRecheckingAll(true); setRecheckResult(null)
    try {
      const res = await fetch(`/api/price-contracts/${id}/recheck-all`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) { setRecheckResult({ matched: data.matched, unmatched: data.unmatched }); fetchContract() }
    } finally { setRecheckingAll(false) }
  }

  // ── Download CSV ────────────────────────────────────────────────────────────
  async function downloadCsv() {
    if (!contract) return
    const res = await fetch(`/api/price-contracts/${id}/download-csv`, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) return
    const blob = await res.blob()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${contract.name.replace(/[^a-z0-9-_]/gi, '-')}.csv`; a.click()
  }

  async function deleteContract() {
    if (!contract || !window.confirm(`Delete "${contract.name}"?`)) return
    await fetch(`/api/price-contracts/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
    navigate('/contracts', { replace: true })
  }

  if (loading) return <div className="text-gray-400">Loading…</div>
  if (!contract) return <div className="rounded-lg bg-red-50 p-4 text-red-700">Contract not found.</div>

  const items = contract.items
  const inCatalogCount = productItems.filter(i => i.partId).length
  const notInCatalogCount = productItems.length - inCatalogCount
  const allSelected = productItems.length > 0 && selectedIds.size === productItems.length
  const someSelected = selectedIds.size > 0 && !allSelected

  // Totals
  const totalCost = productItems.reduce((s, i) => s + i.costPrice, 0)
  const totalList = productItems.reduce((s, i) => s + (i.part?.basePrice ?? 0), 0)
  const totalSell = productItems.reduce((s, i) => s + (i.suggestedSellPrice ?? 0), 0)

  return (
    <div className="pb-10">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link to="/contracts" className="text-xs text-gray-400 hover:text-gray-600">← All contracts</Link>
          <div className="mt-1 flex items-center gap-3">
            {editingName ? (
              <>
                <input autoFocus value={renameValue} onChange={e => setRenameValue(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && saveRename()}
                  className="input text-xl font-bold max-w-sm" />
                <button onClick={saveRename} className="btn-primary py-1 px-3 text-sm">Save</button>
                <button onClick={() => setEditingName(false)} className="btn-secondary py-1 px-3 text-sm">Cancel</button>
              </>
            ) : (
              <>
                <h1 className="text-2xl font-bold text-gray-900">{contract.name}</h1>
                <button onClick={() => { setRenameValue(contract.name); setEditingName(true) }}
                  className="text-xs text-gray-400 hover:text-gray-700">✏️ Rename</button>
              </>
            )}
          </div>
          {contract.description && <p className="mt-1 text-sm text-gray-500">{contract.description}</p>}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
            {contract.quoteNumber && (
              <span className="flex items-center gap-1">
                <span className="font-medium text-gray-400">Quote #</span>
                <span className="font-mono font-semibold text-blue-700">{contract.quoteNumber}</span>
              </span>
            )}
            {contract.validFrom && (
              <span className="flex items-center gap-1">
                <span className="font-medium text-gray-400">Date</span>
                {new Date(contract.validFrom).toLocaleDateString()}
              </span>
            )}
            {contract.validTo && (
              <span className="flex items-center gap-1">
                <span className="font-medium text-gray-400">Expires</span>
                <span className={new Date(contract.validTo) < new Date() ? 'text-red-500 font-semibold' : ''}>
                  {new Date(contract.validTo).toLocaleDateString()}
                </span>
              </span>
            )}
            {!contract.validFrom && !contract.validTo && !contract.quoteNumber && (
              <span className="text-gray-400">Uploaded {new Date(contract.createdAt).toLocaleDateString()}</span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button" onClick={recheckAll} disabled={recheckingAll || productItems.length === 0}
            className="btn-secondary py-1.5 px-4 text-sm disabled:opacity-40"
            title="Re-run master catalog lookup for all items"
          >
            {recheckingAll ? '⟳ Checking…' : '⟳ Recheck All'}
          </button>
          <button type="button" onClick={downloadCsv} className="btn-primary py-1.5 px-4 text-sm">Download CSV</button>
          <button type="button" onClick={deleteContract} className="btn-secondary py-1.5 px-4 text-sm text-red-500">Delete</button>
        </div>
      </div>

      {/* ── Recheck result toast ── */}
      {recheckResult && (
        <div className="mt-3 flex items-center justify-between rounded-lg bg-blue-50 px-4 py-2 text-sm text-blue-800">
          <span>Recheck complete — <strong>{recheckResult.matched}</strong> matched, <strong>{recheckResult.unmatched}</strong> not found in catalog</span>
          <button onClick={() => setRecheckResult(null)} className="ml-4 text-blue-500 hover:text-blue-700">✕</button>
        </div>
      )}

      {/* ── Catalog validation summary ── */}
      {productItems.length > 0 && (
        <div className="mt-3 flex gap-3 flex-wrap">
          {inCatalogCount === 0 && notInCatalogCount > 0 ? (
            <div className="flex w-full items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
              <span className="text-lg">⚠</span>
              <div>
                <p className="font-semibold">Master catalog appears to be empty</p>
                <p className="mt-0.5">
                  None of the {notInCatalogCount} parts in this contract were found in the master catalog.
                  {' '}<a href="/catalog" className="underline font-medium">Upload your master catalog CSV</a> first,
                  then click <strong>Recheck All</strong> to match parts automatically.
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1 text-sm text-green-700">
                ✓ <span><strong>{inCatalogCount}</strong> in master catalog</span>
              </div>
              {notInCatalogCount > 0 && (
                <div className="flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-sm text-amber-700">
                  ⚠ <span><strong>{notInCatalogCount}</strong> not found — edit part # and Recheck</span>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Add more PDFs ── */}
      <div className="card mt-5 p-4">
        <p className="mb-2 text-sm font-medium text-gray-700">Add more PDFs to this contract</p>
        <div
          onDrop={e => { e.preventDefault(); setDragActive(false); !uploading && uploadPDFs(e.dataTransfer.files) }}
          onDragOver={e => { e.preventDefault(); setDragActive(true) }}
          onDragLeave={() => setDragActive(false)}
          onClick={() => !uploading && fileRef.current?.click()}
          className={`flex cursor-pointer items-center justify-center gap-3 rounded-lg border-2 border-dashed px-6 py-3 transition-colors ${dragActive ? 'border-wago-green bg-green-50' : 'border-gray-200 hover:border-wago-green hover:bg-gray-50'} ${uploading ? 'pointer-events-none opacity-60' : ''}`}
        >
          <input ref={fileRef} type="file" accept=".pdf" multiple className="hidden"
            onChange={e => e.target.files && uploadPDFs(e.target.files)} />
          <span>{uploading ? '⏳' : '📄'}</span>
          <span className="text-sm text-gray-600">{uploading ? 'Uploading…' : 'Drop PDFs here or click to browse'}</span>
        </div>
        {uploadMsg && <p className={`mt-2 text-sm ${uploadMsg.startsWith('✓') ? 'text-green-600' : 'text-red-600'}`}>{uploadMsg}</p>}
      </div>

      {/* ── Items table ── */}
      <div className="card mt-5 overflow-hidden">
        {items.length === 0 ? (
          <p className="p-8 text-center text-gray-400">No items yet. Add PDFs above.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Part # / Series</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600 max-w-xs">Description</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">Cost Price</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">List Price</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">% Off List</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">Disc %</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">Min Qty</th>
                  {/* Suggested Sell Price header with master margin control */}
                  <th className="px-4 py-3 text-right font-medium text-gray-600 min-w-[220px]">
                    <div className="flex flex-col items-end gap-1.5">
                      <span>Suggested Sell</span>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="checkbox"
                          checked={allSelected}
                          ref={el => { if (el) el.indeterminate = someSelected }}
                          onChange={e => toggleAll(e.target.checked)}
                          className="h-3.5 w-3.5 rounded text-wago-green"
                          title="Select all"
                        />
                        <input
                          type="number"
                          value={marginPct}
                          onChange={e => setMarginPct(e.target.value)}
                          min={0} max={99} step={0.5}
                          className="w-16 rounded border border-gray-300 px-1.5 py-0.5 text-right text-xs"
                          placeholder="Margin %"
                          title="Margin %"
                        />
                        <span className="text-xs text-gray-500">%</span>
                        <button
                          type="button"
                          onClick={applyMargin}
                          disabled={applyingMargin || selectedIds.size === 0}
                          className="rounded bg-wago-green px-2 py-0.5 text-xs text-white hover:bg-green-700 disabled:opacity-40"
                        >
                          {applyingMargin ? '…' : 'Apply'}
                        </button>
                      </div>
                    </div>
                  </th>
                  <th className="px-4 py-3 text-center font-medium text-gray-600">Status</th>
                  <th className="px-4 py-3 font-medium text-gray-600">Actions</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-100 bg-white">
                {items.map(item => {
                  const isSeriesDiscount = !item.partNumber && !!item.seriesOrGroup
                  const verified = !!item.partId
                  const unverified = !verified && !isSeriesDiscount
                  const edit = edits[item.id]
                  const listPrice = item.part?.basePrice ?? null
                  const pct = listPrice != null ? pctOff(listPrice, item.costPrice) : null
                  const isSelected = selectedIds.has(item.id)

                  // Series discount divider row
                  if (isSeriesDiscount) {
                    return (
                      <tr key={item.id} className="bg-blue-50">
                        <td colSpan={10} className="px-4 py-1.5 text-xs font-medium text-blue-700">
                          Series {item.seriesOrGroup} — {item.discountPercent != null ? `${item.discountPercent}% discount` : 'discount'}
                          {item.description ? ` (${item.description})` : ''}
                        </td>
                      </tr>
                    )
                  }

                  const displayPart = edit?.partNumber ?? item.partNumber ?? '—'
                  const displayCost = edit?.costPrice ?? String(item.costPrice)
                  const sellPrice = item.suggestedSellPrice

                  return (
                    <tr key={item.id} className={`${unverified ? 'bg-amber-50/60' : 'hover:bg-gray-50'}`}>
                      {/* Part # */}
                      <td className="px-4 py-2">
                        {unverified ? (
                          <input
                            type="text"
                            value={displayPart}
                            onChange={e => setEdits(prev => ({ ...prev, [item.id]: { ...prev[item.id], partNumber: e.target.value, costPrice: displayCost } }))}
                            className="w-36 rounded border border-gray-300 px-1.5 py-0.5 font-mono text-xs"
                            placeholder="Part #"
                          />
                        ) : (
                          <span className="font-mono text-xs">{item.partNumber}</span>
                        )}
                        {item.seriesOrGroup && <div className="text-xs text-gray-400">Series {item.seriesOrGroup}</div>}
                      </td>

                      {/* Description */}
                      <td className="max-w-xs truncate px-4 py-2 text-xs text-gray-500" title={item.description ?? item.part?.description ?? ''}>
                        {item.description || item.part?.description || '—'}
                      </td>

                      {/* Cost Price */}
                      <td className="px-4 py-2 text-right">
                        {unverified ? (
                          <input
                            type="number"
                            value={displayCost}
                            step={0.01} min={0}
                            onChange={e => setEdits(prev => ({ ...prev, [item.id]: { partNumber: displayPart, costPrice: e.target.value } }))}
                            className="w-24 rounded border border-gray-300 px-1.5 py-0.5 text-right text-xs"
                          />
                        ) : (
                          <span className="font-medium">{fmt(item.costPrice)}</span>
                        )}
                      </td>

                      {/* List Price (from master catalog) */}
                      <td className="px-4 py-2 text-right text-gray-500">
                        {listPrice != null ? fmt(listPrice) : '—'}
                      </td>

                      {/* % Off List */}
                      <td className="px-4 py-2 text-right">
                        {pct != null ? <span className="font-medium text-green-700">{pct}%</span> : '—'}
                      </td>

                      {/* Discount % — use stored value; derive from list/cost when absent */}
                      <td className="px-4 py-2 text-right text-gray-500">
                        {(() => {
                          const d = item.discountPercent != null ? item.discountPercent : pct
                          return d != null ? `${d}%` : '—'
                        })()}
                      </td>

                      {/* Min Qty */}
                      <td className="px-4 py-2 text-right text-gray-500">
                        {item.moq || item.minQuantity}
                      </td>

                      {/* Suggested Sell Price */}
                      <td className="px-4 py-2 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={e => toggleOne(item.id, e.target.checked)}
                            className="h-3.5 w-3.5 rounded text-wago-green"
                          />
                          <span className={`font-medium ${sellPrice ? 'text-green-700' : 'text-gray-300'}`}>
                            {sellPrice ? fmt(sellPrice) : '—'}
                          </span>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-2 text-center">
                        {verified ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">✓ In catalog</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">⚠ Not found</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-2">
                        {unverified ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleRecheck(item)}
                              disabled={recheckingId === item.id}
                              className="rounded bg-wago-green px-2 py-0.5 text-xs text-white hover:bg-green-700 disabled:opacity-50"
                            >
                              {recheckingId === item.id ? '…' : 'Recheck'}
                            </button>
                            <button
                              onClick={() => handleRemove(item)}
                              disabled={removingId === item.id}
                              className="rounded bg-red-100 px-2 py-0.5 text-xs text-red-700 hover:bg-red-200"
                            >
                              Remove
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleRemove(item)}
                            disabled={removingId === item.id}
                            className="rounded px-1.5 py-0.5 text-xs text-gray-300 hover:text-red-500"
                          >
                            ✕
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>

              {/* Totals footer */}
              {productItems.length > 0 && (
                <tfoot className="border-t-2 border-gray-200 bg-gray-50 text-sm font-semibold">
                  <tr>
                    <td colSpan={2} className="px-4 py-2 text-gray-500">{productItems.length} products</td>
                    <td className="px-4 py-2 text-right text-gray-800">{fmt(totalCost)}</td>
                    <td className="px-4 py-2 text-right text-gray-500">{totalList > 0 ? fmt(totalList) : '—'}</td>
                    <td className="px-4 py-2 text-right text-green-700">
                      {totalList > 0 ? `${Math.round((1 - totalCost / totalList) * 1000) / 10}%` : '—'}
                    </td>
                    <td colSpan={2} />
                    <td className="px-4 py-2 text-right text-green-700">{totalSell > 0 ? fmt(totalSell) : '—'}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
