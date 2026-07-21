/**
 * Public catalog APIs (WAIGO shared backend).
 * Returns axios-compatible `{ data }` so ported Finder components need minimal changes.
 */
import { api } from './api'

export interface PartResult {
  id: string
  partNumber: string
  description: string
  categoryId: string | null
  categoryName: string
  thumbnailUrl: string | null
}

export interface SearchResponse {
  results: PartResult[]
  total: number
  limit: number
  offset: number
}

export interface AutocompleteResponse {
  results: PartResult[]
}

export interface CategoryNode {
  id: string
  name: string
  shortText: string | null
  thumbnailUrl: string | null
  wagoUrl: string | null
  featured: boolean
  order: number
  totalPartCount: number
  childCount: number
  children?: CategoryNode[]
}

export interface CategoriesResponse {
  categories: CategoryNode[]
}

export interface CategoryChildrenResponse {
  parentId: string
  parentName: string
  children: (CategoryNode & { directPartCount: number })[]
}

function withQuery(path: string, params?: Record<string, string | number | undefined>) {
  if (!params) return path
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === '') continue
    qs.set(k, String(v))
  }
  const s = qs.toString()
  return s ? `${path}?${s}` : path
}

async function getData<T>(path: string, params?: Record<string, string | number | undefined>): Promise<{ data: T }> {
  const data = await api<T>(withQuery(path, params))
  return { data }
}

export const publicApi = {
  searchParts: (params: { q?: string; categoryIds?: string; limit?: number; offset?: number }) =>
    getData<SearchResponse>('/public/parts/search', params),

  autocompleteParts: (q: string, limit = 8) =>
    getData<AutocompleteResponse>('/public/parts/autocomplete', { q, limit }),

  getPartNumbers: (prefixes: string[], limit = 5000) =>
    getData<{ partNumbers: string[] }>('/public/parts/part-numbers', {
      prefixes: prefixes.join(','),
      limit,
    }),

  getPartsByPrefixes: (prefixes: string[], limit = 500) =>
    getData<SearchResponse>('/public/parts/by-prefixes', {
      prefixes: prefixes.join(','),
      limit,
    }),

  getPartAccessories: (partNumber: string) =>
    getData<SearchResponse>('/public/parts/accessories', { partNumber }),

  getPartsByPartNumbers: (partNumbers: string[]) =>
    getData<SearchResponse>('/public/parts/by-numbers', {
      partNumbers: partNumbers.join(','),
    }),

  getPublicCategories: () => getData<CategoriesResponse>('/public/categories'),

  getCategoryChildren: (categoryId: string) =>
    getData<CategoryChildrenResponse>(`/public/categories/${categoryId}/children`),
}
