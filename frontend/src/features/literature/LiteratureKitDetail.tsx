import { useState, useEffect } from 'react'
import { Link, useNavigate, useParams, Navigate } from 'react-router-dom'
import {
  BookMarked, Eye, Download, Trash2, Archive, Mail, ArrowLeft, Pencil, Check, X,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { literatureKitApi } from '../../lib/literatureApi'
import { useAuth } from '../../lib/auth'
import EmailComposer, { EmailComposerPayload } from './EmailComposer'

interface LitInKit {
  id: string
  title: string
  type: string
  filePath: string
  fileSize: number
}

interface KitDetail {
  id: string
  name: string
  notes?: string
  items: { literature: LitInKit; addedAt: string }[]
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export default function LiteratureKitDetail() {
  const { id } = useParams<{ id: string }>()
  const { isGuest, user } = useAuth()
  const navigate = useNavigate()

  const [kit, setKit] = useState<KitDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState('')
  const [showEmail, setShowEmail] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)

  const loadKit = async () => {
    if (!id || isGuest) return
    setLoading(true)
    try {
      const { data } = await literatureKitApi.getById(id)
      setKit(data as KitDetail)
      setNameValue((data as KitDetail).name)
    } catch (err: unknown) {
      const status = (err as { status?: number })?.status
      if (status === 404) setNotFound(true)
      else toast.error('Failed to load kit')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadKit()
  }, [id, isGuest]) // eslint-disable-line react-hooks/exhaustive-deps

  if (isGuest) return <Navigate to="/literature" replace />

  const saveName = async () => {
    if (!id || !nameValue.trim()) return
    try {
      await literatureKitApi.update(id, { name: nameValue.trim() })
      setKit((k) => (k ? { ...k, name: nameValue.trim() } : k))
      setEditingName(false)
      toast.success('Renamed')
    } catch {
      toast.error('Failed to rename')
    }
  }

  const removeItem = async (litId: string) => {
    if (!id) return
    setRemovingId(litId)
    try {
      await literatureKitApi.removeItem(id, litId)
      setKit((k) =>
        k ? { ...k, items: k.items.filter((i) => i.literature.id !== litId) } : k
      )
      toast.success('Removed')
    } catch {
      toast.error('Failed to remove')
    } finally {
      setRemovingId(null)
    }
  }

  const handleZip = async () => {
    if (!id) return
    try {
      const { data } = await literatureKitApi.downloadZip(id)
      downloadBlob(data, `Literature_Kit_${kit?.name || id}.zip`)
    } catch {
      toast.error('ZIP download failed')
    }
  }

  const handleSlip = async () => {
    if (!id) return
    try {
      const { data } = await literatureKitApi.downloadSlip(id)
      downloadBlob(data, `Literature_Overview_${kit?.name || id}.pdf`)
    } catch {
      toast.error('Overview download failed')
    }
  }

  const handleSend = async (payload: EmailComposerPayload) => {
    if (!id) throw new Error('Missing kit')
    const { data } = await literatureKitApi.sendEmail(id, {
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

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <span className="h-10 w-10 animate-spin rounded-full border-2 border-wago-green border-t-transparent" />
      </div>
    )
  }

  if (notFound || !kit) {
    return (
      <div className="py-16 text-center">
        <p className="text-gray-600">Kit not found</p>
        <Link to="/literature/kits" className="btn-primary mt-4 inline-flex">
          Back to kits
        </Link>
      </div>
    )
  }

  const items = kit.items.map((i) => i.literature)

  return (
    <div className="mx-auto max-w-3xl">
      <button
        type="button"
        onClick={() => navigate('/literature/kits')}
        className="mb-4 flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800"
      >
        <ArrowLeft className="h-4 w-4" /> Kits
      </button>

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          {editingName ? (
            <div className="flex items-center gap-2">
              <input
                className="input text-lg font-semibold"
                value={nameValue}
                onChange={(e) => setNameValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && saveName()}
              />
              <button type="button" onClick={saveName} className="rounded p-2 text-wago-green hover:bg-wago-green/10">
                <Check className="h-5 w-5" />
              </button>
              <button type="button" onClick={() => setEditingName(false)} className="rounded p-2 text-gray-400 hover:bg-gray-100">
                <X className="h-5 w-5" />
              </button>
            </div>
          ) : (
            <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
              <BookMarked className="h-7 w-7 shrink-0 text-wago-green" />
              <span className="truncate">{kit.name}</span>
              <button type="button" onClick={() => setEditingName(true)} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
                <Pencil className="h-4 w-4" />
              </button>
            </h1>
          )}
          <p className="mt-1 text-sm text-gray-500">
            {items.length} document{items.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={handleSlip} className="btn-secondary flex items-center gap-2 text-sm">
            <Download className="h-4 w-4" /> Overview
          </button>
          <button type="button" onClick={handleZip} className="btn-secondary flex items-center gap-2 text-sm" disabled={items.length === 0}>
            <Archive className="h-4 w-4" /> ZIP
          </button>
          <button
            type="button"
            onClick={() => setShowEmail(true)}
            className="btn-primary flex items-center gap-2 text-sm"
            disabled={items.length === 0}
          >
            <Mail className="h-4 w-4" /> Email
          </button>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="card py-12 text-center text-gray-500">
          <p>This kit is empty.</p>
          <Link to="/literature" className="btn-primary mt-4 inline-flex">
            Browse literature
          </Link>
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((lit) => (
            <li key={lit.id} className="card flex items-center justify-between gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-gray-900">{lit.title}</p>
                <p className="text-xs text-gray-500">
                  {lit.type.replace(/_/g, ' ')} · {formatBytes(lit.fileSize)}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <a
                  href={lit.filePath}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded p-2 text-blue-600 hover:bg-blue-50"
                  title="View"
                >
                  <Eye className="h-4 w-4" />
                </a>
                <button
                  type="button"
                  onClick={() => removeItem(lit.id)}
                  disabled={removingId === lit.id}
                  className="rounded p-2 text-gray-400 hover:bg-red-50 hover:text-red-600"
                  title="Remove"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <EmailComposer
        isOpen={showEmail}
        onClose={() => setShowEmail(false)}
        title="Email literature kit"
        subtitle={kit.name}
        defaultSubject={`WAGO Literature Kit: ${kit.name}`}
        defaultMessage={`${[user?.firstName, user?.lastName].filter(Boolean).join(' ') || 'Someone'} shared a literature kit with you.`}
        fromLabel="RSM Tools"
        kitAttachment={{
          items: items.map((i) => ({ fileSize: i.fileSize })),
          primarySizeBytes: 80_000,
        }}
        onSend={handleSend}
      />
    </div>
  )
}
