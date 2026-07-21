import { useState, useRef, useCallback, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  BookOpen, Search, Eye, Download, Plus, Minus, X,
  Archive, BookMarked, Mail, Link as LinkIcon,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { publicLiteratureApi, literatureKitApi, LitItem } from '../../lib/literatureApi'
import { useAuth } from '../../lib/auth'
import EmailComposer, { EmailComposerPayload } from './EmailComposer'

const LIT_TYPES = ['FLYER', 'BROCHURE', 'WHITE_PAPER', 'CATALOG_PAGE', 'FULL_CATALOG']
const PAGE_SIZE = 24

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function TypeBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    FLYER: 'bg-wago-green/10 text-wago-darkgreen',
    BROCHURE: 'bg-blue-100 text-blue-700',
    WHITE_PAPER: 'bg-purple-100 text-purple-700',
    CATALOG_PAGE: 'bg-orange-100 text-orange-700',
    FULL_CATALOG: 'bg-slate-100 text-slate-700',
  }
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${colors[type] ?? 'bg-gray-100 text-gray-600'}`}>
      {type.replace(/_/g, ' ')}
    </span>
  )
}

function NameModal({
  onConfirm,
  onClose,
  loading,
  title,
}: {
  onConfirm: (name: string) => void
  onClose: () => void
  loading: boolean
  title: string
}) {
  const [name, setName] = useState('')
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
        <h3 className="mb-4 text-lg font-semibold">{title}</h3>
        <input
          autoFocus
          type="text"
          className="input mb-4 w-full"
          placeholder="Kit name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && name.trim() && onConfirm(name.trim())}
        />
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => name.trim() && onConfirm(name.trim())}
            disabled={loading || !name.trim()}
            className="btn-primary flex items-center gap-2 disabled:opacity-60"
          >
            {loading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

export default function LiteratureBrowse() {
  const navigate = useNavigate()
  const { isGuest, user } = useAuth()

  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [partNumberFilter, setPartNumberFilter] = useState('')
  const [industryFilter, setIndustryFilter] = useState('')
  const [page, setPage] = useState(0)

  const [items, setItems] = useState<LitItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  const [selected, setSelected] = useState<Map<string, LitItem>>(new Map())
  const [showNameModal, setShowNameModal] = useState(false)
  const [kitSaving, setKitSaving] = useState(false)
  const [showEmail, setShowEmail] = useState(false)

  const searchTimer = useRef<ReturnType<typeof setTimeout>>()

  const fetchItems = useCallback(
    async (pg = 0, s = search, t = typeFilter, pn = partNumberFilter, ind = industryFilter) => {
      setLoading(true)
      try {
        const { data } = await publicLiteratureApi.list({
          limit: PAGE_SIZE,
          offset: pg * PAGE_SIZE,
          search: s || undefined,
          type: t || undefined,
          partNumber: pn || undefined,
          industryTag: ind || undefined,
        })
        setItems(data.items)
        setTotal(data.total ?? 0)
      } catch {
        toast.error('Failed to load literature')
      } finally {
        setLoading(false)
      }
    },
    [] // eslint-disable-line react-hooks/exhaustive-deps
  )

  useEffect(() => {
    fetchItems()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const debouncedSearch = (val: string) => {
    setSearch(val)
    setPage(0)
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(
      () => fetchItems(0, val, typeFilter, partNumberFilter, industryFilter),
      400
    )
  }

  const applyFilter = (key: string, val: string) => {
    const next = {
      s: search,
      t: typeFilter,
      pn: partNumberFilter,
      ind: industryFilter,
      [key]: val,
    }
    setPage(0)
    if (key === 't') setTypeFilter(val)
    if (key === 'pn') setPartNumberFilter(val)
    if (key === 'ind') setIndustryFilter(val)
    fetchItems(0, next.s, next.t, next.pn, next.ind)
  }

  const toggleSelect = (item: LitItem) => {
    setSelected((prev) => {
      const next = new Map(prev)
      if (next.has(item.id)) next.delete(item.id)
      else next.set(item.id, item)
      return next
    })
  }

  const totalSelectedSize = Array.from(selected.values()).reduce((sum, i) => sum + i.fileSize, 0)
  const selectedItems = Array.from(selected.values())

  const handleSaveAsKit = async (name: string) => {
    if (isGuest) {
      toast.error('Sign in to save literature kits')
      return
    }
    setKitSaving(true)
    try {
      const { data: kit } = await literatureKitApi.create({ name })
      await literatureKitApi.addItems(kit.id, Array.from(selected.keys()))
      toast.success(`Kit "${name}" created with ${selected.size} item(s)`)
      setShowNameModal(false)
      setSelected(new Map())
      navigate(`/literature/kits/${kit.id}`)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to create kit')
    } finally {
      setKitSaving(false)
    }
  }

  const handleDownloadZip = async () => {
    if (selected.size === 0) return
    try {
      const { data: blob } = await publicLiteratureApi.downloadZip(Array.from(selected.keys()))
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'Literature_Selection.zip'
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Download started')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to download ZIP')
    }
  }

  const handleSendEmail = async (payload: EmailComposerPayload) => {
    const senderName =
      [user?.firstName, user?.lastName].filter(Boolean).join(' ') ||
      user?.email ||
      payload.replyTo ||
      'RSM Tools guest'

    const { data } = await publicLiteratureApi.sendKit({
      literatureIds: Array.from(selected.keys()),
      kitName: `Literature Selection (${selected.size})`,
      senderName,
      replyTo: payload.replyTo || user?.email || undefined,
      to: payload.to,
      cc: payload.cc,
      bcc: payload.bcc,
      subject: payload.subject,
      message: payload.message,
      attachFiles: payload.attachFiles,
      copyToSelf: payload.copyToSelf,
    })
    toast.success(data.message)
    return data.message
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <BookOpen className="h-7 w-7 text-wago-green" />
            Literature Library
          </h1>
          <p className="mt-1 text-sm text-gray-500">Browse and email official WAGO product documents.</p>
        </div>
        {!isGuest ? (
          <Link to="/literature/kits" className="btn-secondary flex items-center gap-2">
            <BookMarked className="h-4 w-4" /> My Literature Kits
          </Link>
        ) : (
          <Link to="/register" className="btn-secondary flex items-center gap-2 text-sm">
            <LinkIcon className="h-4 w-4" /> Sign in to save kits
          </Link>
        )}
      </div>

      {isGuest && (
        <div className="mb-6 rounded-lg border border-wago-green/20 bg-wago-green/5 p-4 text-sm text-wago-darkgreen">
          Guest mode — browse, download ZIP, and email kits freely. Sign in only if you want to save kits on the server.
        </div>
      )}

      <div className="card mb-6 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative lg:col-span-2">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search title, description, keywords..."
              className="input w-full pl-9"
              value={search}
              onChange={(e) => debouncedSearch(e.target.value)}
            />
          </div>
          <select className="input" value={typeFilter} onChange={(e) => applyFilter('t', e.target.value)}>
            <option value="">All types</option>
            {LIT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
          <input
            type="text"
            className="input"
            placeholder="Part number..."
            value={partNumberFilter}
            onChange={(e) => applyFilter('pn', e.target.value)}
          />
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input
            type="text"
            className="input"
            placeholder="Industry..."
            value={industryFilter}
            onChange={(e) => applyFilter('ind', e.target.value)}
          />
        </div>
        {(search || typeFilter || partNumberFilter || industryFilter) && (
          <button
            type="button"
            onClick={() => {
              setSearch('')
              setTypeFilter('')
              setPartNumberFilter('')
              setIndustryFilter('')
              setPage(0)
              fetchItems(0, '', '', '', '')
            }}
            className="mt-2 flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
          >
            <X className="h-3 w-3" /> Clear filters
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <span className="h-10 w-10 animate-spin rounded-full border-2 border-wago-green border-t-transparent" />
        </div>
      ) : items.length === 0 ? (
        <div className="py-16 text-center text-gray-500">
          <BookOpen className="mx-auto mb-3 h-14 w-14 text-gray-300" />
          <p className="text-lg font-medium">No documents found</p>
          <p className="text-sm">Try adjusting your search or filters.</p>
        </div>
      ) : (
        <>
          <p className="mb-4 text-sm text-gray-500">
            {total} document{total !== 1 ? 's' : ''} found
          </p>
          <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {items.map((item) => {
              const isSelected = selected.has(item.id)
              return (
                <div
                  key={item.id}
                  className={`card flex flex-col gap-3 p-4 transition-all ${
                    isSelected ? 'bg-wago-green/5 ring-2 ring-wago-green' : 'hover:shadow-md'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <TypeBadge type={item.type} />
                      <h3 className="mt-1 line-clamp-2 text-sm font-semibold text-gray-900">{item.title}</h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleSelect(item)}
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                        isSelected
                          ? 'border-wago-green bg-wago-green text-white'
                          : 'border-gray-300 text-gray-400 hover:border-wago-green hover:text-wago-green'
                      }`}
                      title={isSelected ? 'Remove from selection' : 'Add to selection'}
                    >
                      {isSelected ? <Minus className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                    </button>
                  </div>

                  {item.description && <p className="line-clamp-2 text-xs text-gray-500">{item.description}</p>}

                  {item.keywords.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {item.keywords.slice(0, 4).map((k) => (
                        <span key={k} className="rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-600">
                          {k}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="mt-auto flex items-center justify-between border-t border-gray-100 pt-2">
                    <span className="text-xs text-gray-400">{formatBytes(item.fileSize)}</span>
                    <div className="flex gap-2">
                      <a
                        href={item.filePath}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
                      >
                        <Eye className="h-3.5 w-3.5" /> View
                      </a>
                      <a
                        href={item.filePath}
                        download
                        className="flex items-center gap-1 text-xs text-wago-green hover:text-wago-darkgreen"
                      >
                        <Download className="h-3.5 w-3.5" /> Download
                      </a>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {totalPages > 1 && (
            <div className="mb-8 flex items-center justify-center gap-4">
              <button
                type="button"
                onClick={() => {
                  setPage(page - 1)
                  fetchItems(page - 1)
                }}
                disabled={page === 0}
                className="btn-secondary disabled:opacity-40"
              >
                Previous
              </button>
              <span className="text-sm text-gray-600">
                Page {page + 1} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => {
                  setPage(page + 1)
                  fetchItems(page + 1)
                }}
                disabled={page >= totalPages - 1}
                className="btn-secondary disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}

      {selected.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-gray-200 bg-white shadow-2xl">
          <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-3 px-6 py-3 sm:flex-row sm:items-center">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-wago-green text-sm font-bold text-white">
                {selected.size}
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">
                  {selected.size} document{selected.size !== 1 ? 's' : ''} selected
                </p>
                <p className="text-xs text-gray-500">~{formatBytes(totalSelectedSize)} total</p>
              </div>
              <button type="button" onClick={() => setSelected(new Map())} className="ml-2 text-gray-400 hover:text-gray-600">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={handleDownloadZip} className="btn-secondary flex items-center gap-2 text-sm">
                <Archive className="h-4 w-4" /> Download ZIP
              </button>
              <button type="button" onClick={() => setShowEmail(true)} className="btn-secondary flex items-center gap-2 text-sm">
                <Mail className="h-4 w-4" /> Email kit
              </button>
              {!isGuest && (
                <button type="button" onClick={() => setShowNameModal(true)} className="btn-primary flex items-center gap-2 text-sm">
                  <BookMarked className="h-4 w-4" /> Save as kit
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {showNameModal && (
        <NameModal
          title="Save selection as kit"
          loading={kitSaving}
          onClose={() => setShowNameModal(false)}
          onConfirm={handleSaveAsKit}
        />
      )}

      <EmailComposer
        isOpen={showEmail}
        onClose={() => setShowEmail(false)}
        title="Email literature kit"
        subtitle={`${selected.size} document${selected.size !== 1 ? 's' : ''} selected`}
        defaultSubject={`WAGO Literature Kit (${selected.size} docs)`}
        defaultMessage="Please find the attached literature overview and documents."
        requireReplyTo={isGuest}
        fromLabel="RSM Tools"
        kitAttachment={{
          items: selectedItems.map((i) => ({ fileSize: i.fileSize })),
          primarySizeBytes: 80_000,
        }}
        onSend={handleSendEmail}
      />
    </div>
  )
}
