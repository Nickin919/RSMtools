import { api, apiBlob } from './api'

export interface PriceContract {
  id: string
  name: string
  description: string | null
  quoteNumber: string | null
  quoteCore?: string | null
  quoteYear?: string | number | null
  quoteRevision?: string | null
  validFrom: string | null
  validTo: string | null
  isArchived?: boolean
  createdAt: string
  _count?: { items: number }
  items?: PriceContractItem[]
}

export interface PriceContractItem {
  id: string
  partNumber: string | null
  seriesOrGroup: string | null
  costPrice: number
  suggestedSellPrice: number | null
  discountPercent: number | null
  moq: string | null
  minQuantity: number
  partId?: string | null
}

export interface QuoteGroup {
  quoteCore: string
  quoteYear: string | number | null
  label: string
  contracts: PriceContract[]
}

export const priceContractsApi = {
  list: (view?: 'by-name' | 'by-quote') =>
    api<{
      contracts?: PriceContract[]
      view?: string
      groups?: QuoteGroup[]
      ungrouped?: PriceContract[]
    } | PriceContract[]>(`/price-contracts${view === 'by-quote' ? '?view=by-quote' : ''}`),

  get: (id: string) => api<{ contract?: PriceContract } & PriceContract>(`/price-contracts/${id}`),

  create: (data: { name: string; description?: string; quoteNumber?: string }) =>
    api<{ contract?: PriceContract } & PriceContract>('/price-contracts', { method: 'POST', json: data }),

  update: (id: string, data: { name?: string; description?: string; quoteNumber?: string }) =>
    api(`/price-contracts/${id}`, { method: 'PATCH', json: data }),

  archive: (id: string) => api(`/price-contracts/${id}/archive`, { method: 'POST' }),

  unarchive: (id: string) => api(`/price-contracts/${id}/unarchive`, { method: 'POST' }),

  uploadPdf: (id: string, file: File) => {
    const fd = new FormData()
    fd.append('pdf', file)
    return api(`/price-contracts/${id}/items/upload-pdf`, { method: 'POST', formData: fd })
  },

  updateItem: (contractId: string, itemId: string, data: Record<string, unknown>) =>
    api(`/price-contracts/${contractId}/items/${itemId}`, { method: 'PATCH', json: data }),

  removeItem: (contractId: string, itemId: string) =>
    api(`/price-contracts/${contractId}/items/${itemId}`, { method: 'DELETE' }),

  bulkSellPrice: (contractId: string, data: { itemIds: string[]; marginPercent?: number; suggestedSellPrice?: number }) =>
    api(`/price-contracts/${contractId}/items/bulk-sell-price`, { method: 'POST', json: data }),

  bulkMoq: (contractId: string, data: { itemIds: string[]; moq: string }) =>
    api(`/price-contracts/${contractId}/items/bulk-moq`, { method: 'POST', json: data }),

  downloadCsv: (id: string) => apiBlob(`/price-contracts/${id}/download-csv`),

  downloadQuoteFamily: (id: string) => apiBlob(`/price-contracts/${id}/download-quote-family`),

  /** Public parse — no auth, no save (for guests). */
  parsePdfPublic: async (file: File) => {
    const fd = new FormData()
    fd.append('pdf', file)
    return api<{
      success: boolean
      suggestedName: string
      metadata: { quoteNumber?: string; quoteDate?: string; expirationDate?: string }
      rows: Array<{
        partNumber: string
        series: string
        description: string
        price: string
        discount: string
        moq: string
        netPrice: string
      }>
    }>('/public/price-contracts/parse-pdf', { method: 'POST', formData: fd })
  },

  /** WAIGO has no batch-upload — create one contract per PDF then upload. */
  batchUploadPdfs: async (files: File[]) => {
    const results: Array<{
      filename: string
      contractId: string
      contractName: string
      imported: number
      skipped: number
      error?: string
    }> = []
    for (const file of files) {
      const name = file.name.replace(/\.pdf$/i, '') || 'Pricing contract'
      try {
        const created = await priceContractsApi.create({ name })
        const contract = (created as { contract?: PriceContract }).contract ?? (created as PriceContract)
        const upload = (await priceContractsApi.uploadPdf(contract.id, file)) as {
          imported?: number
          skipped?: number
        }
        results.push({
          filename: file.name,
          contractId: contract.id,
          contractName: contract.name,
          imported: upload.imported ?? 0,
          skipped: upload.skipped ?? 0,
        })
      } catch (e) {
        results.push({
          filename: file.name,
          contractId: '',
          contractName: name,
          imported: 0,
          skipped: 0,
          error: e instanceof Error ? e.message : 'Upload failed',
        })
      }
    }
    return results
  },
}
