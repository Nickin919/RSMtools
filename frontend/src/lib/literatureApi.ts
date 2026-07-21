/**
 * Literature APIs for RSM Tools → WAIGO shared backend.
 * Public browse / zip / send-kit work for guests; kit CRUD requires login.
 */
import { api, apiBlobPost, getApiBase, getToken } from './api'

export interface LitItem {
  id: string
  title: string
  description?: string
  type: string
  filePath: string
  fileSize: number
  keywords: string[]
  industryTags: string[]
  parts: { part: { partNumber: string } }[]
  series: { seriesName: string }[]
  createdAt: string
}

export interface LiteratureListResponse {
  items: LitItem[]
  total: number
}

export type EmailPayload = {
  to: string[]
  cc?: string[]
  bcc?: string[]
  subject?: string
  message?: string
  attachFiles?: boolean
  copyToSelf?: boolean
}

async function getData<T>(path: string, params?: Record<string, string | number | undefined>): Promise<{ data: T }> {
  const data = await api<T>(path, { params })
  return { data }
}

async function postData<T>(path: string, body: unknown): Promise<{ data: T }> {
  const data = await api<T>(path, { method: 'POST', json: body })
  return { data }
}

export const publicLiteratureApi = {
  list: (params?: {
    type?: string
    partNumber?: string
    seriesName?: string
    search?: string
    industryTag?: string
    limit?: number
    offset?: number
  }) => getData<LiteratureListResponse>('/public/literature', params),

  downloadZip: async (literatureIds: string[]) => {
    const data = await apiBlobPost('/public/literature/zip', { literatureIds })
    return { data }
  },

  sendKit: (payload: EmailPayload & {
    literatureIds: string[]
    kitName?: string
    senderName?: string
    replyTo?: string
  }) =>
    postData<{ message: string; attachedFiles: boolean; itemCount: number }>(
      '/public/literature/send-kit',
      payload
    ),
}

export const literatureKitApi = {
  list: (params?: { page?: number; limit?: number }) =>
    getData<{ items: any[]; total: number; page?: number; limit?: number; totalPages?: number }>(
      '/literature-kits',
      params
    ),
  create: (data: { name: string; notes?: string }) => postData<any>('/literature-kits', data),
  getById: (id: string) => getData<any>(`/literature-kits/${id}`),
  update: (id: string, data: { name?: string; notes?: string | null }) =>
    api<any>(`/literature-kits/${id}`, { method: 'PATCH', json: data }).then((d) => ({ data: d })),
  delete: (id: string) => api(`/literature-kits/${id}`, { method: 'DELETE' }),
  addItems: (id: string, literatureIds: string[]) =>
    postData<any>(`/literature-kits/${id}/items`, { literatureIds }),
  removeItem: (id: string, litId: string) =>
    api(`/literature-kits/${id}/items/${litId}`, { method: 'DELETE' }),
  downloadZip: async (id: string) => {
    const headers = new Headers()
    headers.set('X-Client-App', 'rsm-tools')
    const token = getToken()
    if (token) headers.set('Authorization', `Bearer ${token}`)
    const res = await fetch(`${getApiBase()}/literature-kits/${id}/zip`, { headers })
    if (!res.ok) throw new Error(`Download failed (${res.status})`)
    return { data: await res.blob() }
  },
  downloadSlip: async (id: string) => {
    const headers = new Headers()
    headers.set('X-Client-App', 'rsm-tools')
    const token = getToken()
    if (token) headers.set('Authorization', `Bearer ${token}`)
    const res = await fetch(`${getApiBase()}/literature-kits/${id}/slip`, { headers })
    if (!res.ok) throw new Error(`Download failed (${res.status})`)
    return { data: await res.blob() }
  },
  sendEmail: (id: string, payload: EmailPayload) =>
    postData<{ message: string; attachedFiles: boolean; itemCount: number }>(
      `/literature-kits/${id}/send`,
      payload
    ),
}
