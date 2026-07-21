/**
 * API client for RSM Tools → WAIGO shared backend.
 * Always sends X-Client-App: rsm-tools so auth is app-scoped.
 */

const CLIENT_APP = 'rsm-tools'
const TOKEN_KEY = 'rsm-tools-token'

export function getApiBase(): string {
  const raw = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || ''
  // Dev default: Vite proxies /api → WAIGO when VITE_API_URL unset and proxy is configured
  return raw ? `${raw}/api` : '/api'
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
}

export { TOKEN_KEY, CLIENT_APP }

type ApiOptions = RequestInit & { json?: unknown; formData?: FormData }

export async function api<T = unknown>(path: string, options: ApiOptions = {}): Promise<T> {
  const { json, formData, headers: initHeaders, ...rest } = options
  const headers = new Headers(initHeaders)
  headers.set('X-Client-App', CLIENT_APP)

  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)

  let body: BodyInit | undefined = rest.body as BodyInit | undefined
  if (formData) {
    body = formData
  } else if (json !== undefined) {
    headers.set('Content-Type', 'application/json')
    body = JSON.stringify(json)
  }

  const res = await fetch(`${getApiBase()}${path.startsWith('/') ? path : `/${path}`}`, {
    ...rest,
    headers,
    body,
  })

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}))
    const message =
      (errBody as { error?: string; message?: string }).error ||
      (errBody as { message?: string }).message ||
      `Request failed (${res.status})`
    const err = new Error(message) as Error & { status?: number; code?: string; body?: unknown }
    err.status = res.status
    err.code = (errBody as { code?: string }).code
    err.body = errBody
    throw err
  }

  if (res.status === 204) return undefined as T
  const ct = res.headers.get('content-type') || ''
  if (ct.includes('application/json')) return res.json() as Promise<T>
  return res as unknown as T
}

export async function apiBlob(path: string): Promise<Blob> {
  const headers = new Headers()
  headers.set('X-Client-App', CLIENT_APP)
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const res = await fetch(`${getApiBase()}${path.startsWith('/') ? path : `/${path}`}`, { headers })
  if (!res.ok) throw new Error(`Download failed (${res.status})`)
  return res.blob()
}
