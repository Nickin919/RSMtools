import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { BookMarked, Plus, BookOpen, Trash2, ChevronRight } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { literatureKitApi } from '../../lib/literatureApi'
import { useAuth } from '../../lib/auth'
import { Navigate } from 'react-router-dom'

interface KitSummary {
  id: string
  name: string
  notes?: string
  itemCount: number
  createdAt: string
  updatedAt: string
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

export default function LiteratureKits() {
  const { isGuest } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<KitSummary | null>(null)
  const [deleting, setDeleting] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['literature-kits'],
    enabled: !isGuest,
    queryFn: async () => {
      const res = await literatureKitApi.list({ page: 1, limit: 50 })
      return res.data as { items: KitSummary[]; total: number }
    },
  })

  if (isGuest) return <Navigate to="/literature" replace />

  const kits = data?.items ?? []

  const handleCreate = async () => {
    if (!newName.trim()) return
    setCreating(true)
    try {
      const { data: kit } = await literatureKitApi.create({ name: newName.trim() })
      toast.success('Kit created')
      setShowCreate(false)
      setNewName('')
      queryClient.invalidateQueries({ queryKey: ['literature-kits'] })
      navigate(`/literature/kits/${kit.id}`)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to create kit')
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await literatureKitApi.delete(deleteTarget.id)
      toast.success('Kit deleted')
      setDeleteTarget(null)
      queryClient.invalidateQueries({ queryKey: ['literature-kits'] })
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <BookMarked className="h-7 w-7 text-wago-green" />
            My Literature Kits
          </h1>
          <p className="mt-1 text-sm text-gray-500">Saved kits for this RSM Tools account.</p>
        </div>
        <div className="flex gap-2">
          <Link to="/literature" className="btn-secondary flex items-center gap-2 text-sm">
            <BookOpen className="h-4 w-4" /> Browse
          </Link>
          <button type="button" onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2 text-sm">
            <Plus className="h-4 w-4" /> New kit
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <span className="h-10 w-10 animate-spin rounded-full border-2 border-wago-green border-t-transparent" />
        </div>
      ) : kits.length === 0 ? (
        <div className="card py-16 text-center text-gray-500">
          <BookMarked className="mx-auto mb-3 h-12 w-12 text-gray-300" />
          <p className="font-medium">No kits yet</p>
          <p className="mt-1 text-sm">Select documents in the library and save them as a kit.</p>
          <Link to="/literature" className="btn-primary mt-4 inline-flex">
            Browse literature
          </Link>
        </div>
      ) : (
        <ul className="space-y-2">
          {kits.map((kit) => (
            <li key={kit.id} className="card flex items-center justify-between gap-3 p-4 hover:border-wago-green">
              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                onClick={() => navigate(`/literature/kits/${kit.id}`)}
              >
                <p className="truncate font-medium text-gray-900">{kit.name}</p>
                <p className="text-xs text-gray-500">
                  {kit.itemCount} doc{kit.itemCount !== 1 ? 's' : ''} · Updated {formatDate(kit.updatedAt)}
                </p>
              </button>
              <button
                type="button"
                onClick={() => setDeleteTarget(kit)}
                className="rounded p-2 text-gray-400 hover:bg-red-50 hover:text-red-600"
                title="Delete kit"
              >
                <Trash2 className="h-4 w-4" />
              </button>
              <ChevronRight className="h-4 w-4 text-gray-300" />
            </li>
          ))}
        </ul>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-lg font-semibold">New literature kit</h3>
            <input
              autoFocus
              className="input mb-4 w-full"
              placeholder="Kit name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setShowCreate(false)}>
                Cancel
              </button>
              <button type="button" className="btn-primary" disabled={creating || !newName.trim()} onClick={handleCreate}>
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <h3 className="mb-2 text-lg font-semibold">Delete kit?</h3>
            <p className="mb-4 text-sm text-gray-600">
              “{deleteTarget.name}” will be permanently deleted.
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setDeleteTarget(null)}>
                Cancel
              </button>
              <button type="button" className="btn-primary bg-red-600 hover:bg-red-700" disabled={deleting} onClick={handleDelete}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
