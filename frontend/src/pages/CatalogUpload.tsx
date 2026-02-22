import { useState, useRef, useCallback } from 'react'

const TOKEN_KEY = 'rsm-tools-token'

// ── Field definitions ────────────────────────────────────────────────────────

type ProductField =
  | 'partNumber' | 'series' | 'description' | 'englishDescription'
  | 'category' | 'price' | 'listPricePer100' | 'wagoIdent'
  | 'distributorDiscount' | 'minQty' | 'skip'

interface FieldDef { value: ProductField; label: string; required: boolean }

const FIELDS: FieldDef[] = [
  { value: 'partNumber',          label: 'Part Number',            required: true  },
  { value: 'category',            label: 'Category',               required: true  },
  { value: 'price',               label: 'List Price (Each)',       required: true  },
  { value: 'description',         label: 'Description',            required: false },
  { value: 'englishDescription',  label: 'English Description',    required: false },
  { value: 'series',              label: 'Series',                 required: false },
  { value: 'listPricePer100',     label: 'List Price Per 100',     required: false },
  { value: 'wagoIdent',          label: 'WAGO Ident #',           required: false },
  { value: 'distributorDiscount', label: 'Discount (%)',           required: false },
  { value: 'minQty',             label: 'Min Qty',                required: false },
  { value: 'skip',               label: '-- Skip this column --', required: false },
]

const SAMPLE_CSV = `Part Number,Category,List Price (Each),Description,Distributor Discount,Min Qty
2273-208,Connectors,1.25,3-conductor terminal block,20,1
750-841,Controllers,245.00,750 Series I/O Module,15,1`

// ── CSV parser ───────────────────────────────────────────────────────────────

function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
  const rows: string[][] = []
  let cur: string[] = []
  let field = ''
  let inQ = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i], n = text[i + 1]
    if (c === '"') {
      if (inQ && n === '"') { field += '"'; i++ } else inQ = !inQ
    } else if (c === ',' && !inQ) {
      cur.push(field.trim()); field = ''
    } else if ((c === '\n' || c === '\r') && !inQ) {
      if (c === '\r' && n === '\n') i++
      cur.push(field.trim()); field = ''
      if (cur.some(Boolean)) rows.push(cur)
      cur = []
    } else { field += c }
  }
  cur.push(field.trim())
  if (cur.some(Boolean)) rows.push(cur)
  if (!rows.length) return { headers: [], rows: [] }
  return { headers: rows[0], rows: rows.slice(1, 25001) }
}

function guessField(header: string): ProductField {
  const h = header.toLowerCase().replace(/[\s_\-().#]+/g, '')
  if (/partnumber|partno|itemno|articleno|artikelnummer|sku/.test(h)) return 'partNumber'
  if (/wagoident|internalident/.test(h)) return 'wagoIdent'
  if (/per100|priceper100/.test(h)) return 'listPricePer100'
  if (/priceeach|listpriceeach/.test(h)) return 'price'
  if (/listprice|baseprice/.test(h)) return 'price'
  if (/^price$|^cost$/.test(h)) return 'price'
  if (/englishdesc|engdesc|altdesc/.test(h)) return 'englishDescription'
  if (/desc|description|bezeichnung/.test(h)) return 'description'
  if (/category|kategorie|group|produktgruppe/.test(h)) return 'category'
  if (/series|serie/.test(h)) return 'series'
  if (/discount|rabatt/.test(h)) return 'distributorDiscount'
  if (/minqty|multiples|orderinmultiples|moq/.test(h)) return 'minQty'
  return 'skip'
}

function validate(mapping: Record<number, ProductField>, updateOnly: boolean) {
  const vals = Object.values(mapping)
  const required = updateOnly ? ['partNumber'] : FIELDS.filter(f => f.required).map(f => f.value)
  const errors: string[] = []
  for (const r of required) {
    if (!vals.includes(r as ProductField))
      errors.push(`Required field "${FIELDS.find(f => f.value === r)?.label}" is not mapped`)
  }
  const nonSkip = vals.filter(v => v !== 'skip')
  if (new Set(nonSkip).size !== nonSkip.length) errors.push('Each field can only be mapped once')
  return errors
}

// ── Step indicator ───────────────────────────────────────────────────────────

type Step = 'upload' | 'mapping' | 'preview' | 'importing' | 'complete'

function StepDot({ n, label, active, done }: { n: number; label: string; active: boolean; done: boolean }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold ${
        done ? 'bg-wago-green text-white' : active ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'
      }`}>
        {done ? '✓' : n}
      </div>
      <span className="text-xs font-medium text-gray-600">{label}</span>
    </div>
  )
}

// ── Main component ───────────────────────────────────────────────────────────

export default function CatalogUpload() {
  const [step, setStep] = useState<Step>('upload')
  const [headers, setHeaders] = useState<string[]>([])
  const [rawRows, setRawRows] = useState<string[][]>([])
  const [mapping, setMapping] = useState<Record<number, ProductField>>({})
  const [updateOnly, setUpdateOnly] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [result, setResult] = useState<{ imported: number; updated: number; skipped: number; errors: number; errorDetails?: string[] } | null>(null)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const processFile = useCallback((file: File) => {
    if (!file.name.toLowerCase().endsWith('.csv')) { setError('Please upload a CSV file.'); return }
    setParsing(true); setError('')
    const reader = new FileReader()
    reader.onload = (e) => {
      setTimeout(() => {
        try {
          const { headers: h, rows } = parseCSV((e.target?.result as string) || '')
          if (!h.length) { setError('No data found in file.'); setParsing(false); return }
          setHeaders(h)
          setRawRows(rows)
          const auto: Record<number, ProductField> = {}
          h.forEach((hdr, i) => { auto[i] = guessField(hdr) })
          setMapping(auto)
          setStep('mapping')
        } catch { setError('Failed to parse CSV.') }
        finally { setParsing(false) }
      }, 0)
    }
    reader.onerror = () => { setError('Failed to read file.'); setParsing(false) }
    reader.readAsText(file, 'UTF-8')
  }, [])

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (f) processFile(f); e.target.value = ''
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragActive(false)
    const f = e.dataTransfer.files?.[0]; if (f) processFile(f)
  }

  function transformRows() {
    return rawRows.map(row => {
      const obj: Record<string, string | number | null> = {}
      Object.entries(mapping).forEach(([idxStr, field]) => {
        if (field === 'skip') return
        const val = row[+idxStr] ?? ''
        if (['price', 'listPricePer100', 'distributorDiscount'].includes(field)) {
          obj[field] = parseFloat(val.replace(/[^0-9.-]/g, '')) || 0
        } else if (field === 'minQty') {
          const n = parseInt(val, 10); obj[field] = isNaN(n) ? null : n
        } else { obj[field] = val.trim() || null }
      })
      return obj
    })
  }

  async function handleImport() {
    setStep('importing'); setError('')
    const token = localStorage.getItem(TOKEN_KEY)
    try {
      const products = transformRows()
      const res = await fetch('/api/product-import/import-products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ products, updateOnly }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message || 'Import failed')
      setResult(data)
      setStep('complete')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed')
      setStep('preview')
    }
  }

  function reset() {
    setStep('upload'); setHeaders([]); setRawRows([]); setMapping({})
    setResult(null); setError(''); setUpdateOnly(false)
  }

  function downloadSample() {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([SAMPLE_CSV], { type: 'text/csv' }))
    a.download = 'catalog-import-template.csv'; a.click()
  }

  const stepIdx = ['upload', 'mapping', 'preview', 'importing', 'complete'].indexOf(step)

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Master catalog</h1>
      <p className="mt-1 text-gray-600">Import products from CSV (Admin / RSM only). Map your columns, preview, then import.</p>

      {/* Step indicator */}
      <div className="mt-6 flex max-w-lg items-center gap-0">
        {(['Upload', 'Map', 'Preview', 'Import'] as const).map((label, i) => (
          <div key={label} className="flex flex-1 items-center">
            <StepDot n={i + 1} label={label} active={stepIdx === i} done={stepIdx > i} />
            {i < 3 && <div className={`h-px flex-1 ${stepIdx > i ? 'bg-wago-green' : 'bg-gray-200'}`} />}
          </div>
        ))}
      </div>

      <div className="card mt-6 p-6">

        {/* ── Step 1: Upload ── */}
        {step === 'upload' && (
          <div>
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Upload CSV file</h2>
            {error && <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
            <div
              onDrop={handleDrop}
              onDragOver={(e) => { e.preventDefault(); setDragActive(true) }}
              onDragLeave={() => setDragActive(false)}
              onClick={() => !parsing && fileRef.current?.click()}
              className={`flex cursor-pointer flex-col items-center rounded-xl border-2 border-dashed px-8 py-12 transition-colors ${
                dragActive ? 'border-wago-green bg-green-50' : 'border-gray-300 hover:border-wago-green hover:bg-gray-50'
              } ${parsing ? 'pointer-events-none opacity-60' : ''}`}
            >
              <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFilePick} />
              <div className="mb-3 text-4xl">{parsing ? '⏳' : '📂'}</div>
              <p className="font-medium text-gray-900">{parsing ? 'Parsing…' : 'Drop CSV here or click to browse'}</p>
              <p className="mt-1 text-sm text-gray-500">Supports .csv files up to 25,000 rows</p>
            </div>
            <div className="mt-4 flex items-center justify-between">
              <button type="button" onClick={downloadSample} className="text-sm text-wago-green hover:underline">
                ↓ Download sample template
              </button>
            </div>
            <div className="mt-6 rounded-lg border border-gray-200 bg-gray-50 p-4">
              <p className="text-sm font-medium text-gray-700">Expected columns (auto-detected):</p>
              <div className="mt-2 flex flex-wrap gap-1">
                {FIELDS.filter(f => f.value !== 'skip').map(f => (
                  <span key={f.value} className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${
                    f.required ? 'bg-wago-green/10 text-wago-green' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {f.label}{f.required ? ' *' : ''}
                  </span>
                ))}
              </div>
              <p className="mt-2 text-xs text-gray-500">* Required. All others optional.</p>
            </div>
          </div>
        )}

        {/* ── Step 2: Map columns ── */}
        {step === 'mapping' && (
          <div>
            <h2 className="mb-1 text-lg font-semibold text-gray-900">Map columns</h2>
            <p className="mb-4 text-sm text-gray-500">{rawRows.length.toLocaleString()} rows loaded. Assign each CSV column to a product field.</p>

            <div className="mb-4 flex items-center gap-3 rounded-lg bg-gray-50 px-4 py-3">
              <input
                id="update-only"
                type="checkbox"
                checked={updateOnly}
                onChange={e => setUpdateOnly(e.target.checked)}
                className="h-4 w-4 rounded text-wago-green"
              />
              <label htmlFor="update-only" className="text-sm font-medium text-gray-700">
                Update-only mode — only update existing products, don't create new ones
              </label>
            </div>

            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">CSV column</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Sample value</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Maps to</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {headers.map((hdr, i) => (
                    <tr key={i}>
                      <td className="px-4 py-2 text-sm font-medium text-gray-900">{hdr}</td>
                      <td className="max-w-xs truncate px-4 py-2 text-sm text-gray-500">{rawRows[0]?.[i] ?? '—'}</td>
                      <td className="px-4 py-2">
                        <select
                          value={mapping[i] ?? 'skip'}
                          onChange={e => setMapping({ ...mapping, [i]: e.target.value as ProductField })}
                          className="input py-1 text-sm"
                        >
                          {FIELDS.map(f => (
                            <option key={f.value} value={f.value}>
                              {f.label}{f.required && !updateOnly ? ' *' : ''}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {validate(mapping, updateOnly).length > 0 && (
              <div className="mt-4 rounded-lg bg-red-50 px-4 py-3">
                {validate(mapping, updateOnly).map((e, i) => (
                  <p key={i} className="text-sm text-red-700">• {e}</p>
                ))}
              </div>
            )}

            <div className="mt-6 flex justify-between">
              <button type="button" onClick={() => setStep('upload')} className="btn-secondary">← Back</button>
              <button
                type="button"
                onClick={() => { if (!validate(mapping, updateOnly).length) setStep('preview') }}
                disabled={validate(mapping, updateOnly).length > 0}
                className="btn-primary disabled:opacity-40"
              >
                Continue to Preview →
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: Preview ── */}
        {step === 'preview' && (
          <div>
            <h2 className="mb-1 text-lg font-semibold text-gray-900">Preview</h2>
            <p className="mb-4 text-sm text-gray-500">First 5 rows. Review before importing.</p>

            {error && <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

            <div className="mb-4 flex gap-4">
              <div className="card flex-1 p-3 text-center">
                <p className="text-xl font-bold text-gray-900">{rawRows.length.toLocaleString()}</p>
                <p className="text-xs text-gray-500">Rows</p>
              </div>
              <div className="card flex-1 p-3 text-center">
                <p className="text-xl font-bold text-gray-900">{Object.values(mapping).filter(v => v !== 'skip').length}</p>
                <p className="text-xs text-gray-500">Mapped columns</p>
              </div>
              <div className="card flex-1 p-3 text-center">
                <p className="text-sm font-bold text-gray-900">{updateOnly ? 'Update only' : 'Upsert'}</p>
                <p className="text-xs text-gray-500">Mode</p>
              </div>
            </div>

            {(() => {
              const mappedCols = headers
                .map((h, i) => ({ h, field: mapping[i], i }))
                .filter(c => c.field && c.field !== 'skip')
              const previewData = transformRows().slice(0, 5)
              return (
                <div className="overflow-x-auto rounded-lg border border-gray-200">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500">#</th>
                        {mappedCols.map(c => (
                          <th key={c.i} className="px-3 py-2 text-left text-xs font-semibold text-gray-500">
                            {FIELDS.find(f => f.value === c.field)?.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white">
                      {previewData.map((row, ri) => (
                        <tr key={ri}>
                          <td className="px-3 py-2 text-gray-400">{ri + 1}</td>
                          {mappedCols.map(c => (
                            <td key={c.i} className="max-w-xs truncate px-3 py-2 text-gray-900">
                              {String(row[c.field!] ?? '—')}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            })()}

            <div className="mt-6 flex justify-between">
              <button type="button" onClick={() => setStep('mapping')} className="btn-secondary">← Back</button>
              <button type="button" onClick={handleImport} className="btn-primary">
                Import {rawRows.length.toLocaleString()} products →
              </button>
            </div>
          </div>
        )}

        {/* ── Step: Importing ── */}
        {step === 'importing' && (
          <div className="flex flex-col items-center py-16">
            <div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-wago-green border-t-transparent" />
            <p className="text-gray-600">Importing {rawRows.length.toLocaleString()} products…</p>
            <p className="mt-1 text-sm text-gray-400">This may take a moment for large catalogs.</p>
          </div>
        )}

        {/* ── Step: Complete ── */}
        {step === 'complete' && result && (
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-3xl">✓</div>
            <h2 className="mb-6 text-2xl font-bold text-gray-900">Import complete!</h2>
            <div className="mx-auto mb-8 grid max-w-lg grid-cols-4 gap-4">
              <div className="rounded-lg bg-green-50 p-4">
                <p className="text-2xl font-bold text-green-900">{result.imported}</p>
                <p className="text-xs text-green-700">Created</p>
              </div>
              <div className="rounded-lg bg-blue-50 p-4">
                <p className="text-2xl font-bold text-blue-900">{result.updated}</p>
                <p className="text-xs text-blue-700">Updated</p>
              </div>
              <div className="rounded-lg bg-gray-50 p-4">
                <p className="text-2xl font-bold text-gray-900">{result.skipped}</p>
                <p className="text-xs text-gray-600">Skipped</p>
              </div>
              <div className="rounded-lg bg-red-50 p-4">
                <p className="text-2xl font-bold text-red-900">{result.errors}</p>
                <p className="text-xs text-red-700">Errors</p>
              </div>
            </div>
            {result.errorDetails && result.errorDetails.length > 0 && (
              <div className="mx-auto mb-6 max-w-lg rounded-lg bg-red-50 px-4 py-3 text-left">
                <p className="mb-1 text-sm font-semibold text-red-800">Sample errors:</p>
                {result.errorDetails.slice(0, 5).map((e, i) => (
                  <p key={i} className="text-xs text-red-700">• {e}</p>
                ))}
              </div>
            )}
            <button type="button" onClick={reset} className="btn-primary">Import another file</button>
          </div>
        )}
      </div>
    </div>
  )
}
