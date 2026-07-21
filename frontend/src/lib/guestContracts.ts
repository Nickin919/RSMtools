/**
 * Guest-session pricing contracts (browser only — not saved to the server).
 */

export interface GuestContractItem {
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
  part: null
}

export interface GuestContract {
  id: string
  name: string
  description: string | null
  quoteNumber: string | null
  quoteCore?: string | null
  quoteYear?: string | number | null
  quoteRevision?: string | null
  validFrom: string | null
  validTo: string | null
  createdAt: string
  isGuest: true
  items: GuestContractItem[]
  _count?: { items: number }
}

const STORAGE_KEY = 'rsm-guest-contracts'

function parseMoney(s: string | undefined | null): number {
  if (!s) return 0
  const n = parseFloat(String(s).replace(/[$,]/g, ''))
  return Number.isFinite(n) ? n : 0
}

function parseDiscount(s: string | undefined | null): number | null {
  if (!s) return null
  const n = parseFloat(String(s).replace(/%/g, ''))
  return Number.isFinite(n) ? n : null
}

function loadAll(): GuestContract[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as GuestContract[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveAll(contracts: GuestContract[]) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(contracts))
}

export function listGuestContracts(): GuestContract[] {
  return loadAll().map((c) => ({
    ...c,
    _count: { items: c.items?.length ?? 0 },
  }))
}

export function getGuestContract(id: string): GuestContract | null {
  return loadAll().find((c) => c.id === id) ?? null
}

export function createGuestContract(data: {
  name: string
  description?: string
  quoteNumber?: string
  items?: GuestContractItem[]
}): GuestContract {
  const contract: GuestContract = {
    id: `guest-${crypto.randomUUID()}`,
    name: data.name,
    description: data.description ?? null,
    quoteNumber: data.quoteNumber ?? null,
    validFrom: null,
    validTo: null,
    createdAt: new Date().toISOString(),
    isGuest: true,
    items: data.items ?? [],
  }
  const all = loadAll()
  all.unshift(contract)
  saveAll(all)
  return { ...contract, _count: { items: contract.items.length } }
}

export function updateGuestContract(id: string, patch: Partial<GuestContract>): GuestContract | null {
  const all = loadAll()
  const idx = all.findIndex((c) => c.id === id)
  if (idx < 0) return null
  all[idx] = { ...all[idx], ...patch, id: all[idx].id, isGuest: true }
  saveAll(all)
  return { ...all[idx], _count: { items: all[idx].items.length } }
}

export function removeGuestContract(id: string) {
  saveAll(loadAll().filter((c) => c.id !== id))
}

export function rowsToGuestItems(
  rows: Array<{
    partNumber?: string
    series?: string
    description?: string
    price?: string
    netPrice?: string
    discount?: string
    moq?: string
  }>
): GuestContractItem[] {
  return rows.map((r) => ({
    id: `guest-item-${crypto.randomUUID()}`,
    partNumber: r.partNumber || null,
    seriesOrGroup: r.series || null,
    description: r.description || null,
    costPrice: parseMoney(r.netPrice || r.price),
    netPrice: parseMoney(r.netPrice || r.price) || null,
    discountPercent: parseDiscount(r.discount),
    suggestedSellPrice: null,
    minQuantity: 1,
    moq: r.moq || null,
    partId: null,
    part: null,
  }))
}

export function guestContractToCsv(contract: GuestContract): string {
  const header = ['Part Number', 'Series', 'Description', 'Cost', 'Discount %', 'Suggested Sell', 'MOQ']
  const lines = [header.join(',')]
  for (const item of contract.items) {
    const cells = [
      item.partNumber ?? '',
      item.seriesOrGroup ?? '',
      `"${(item.description ?? '').replace(/"/g, '""')}"`,
      String(item.costPrice ?? ''),
      item.discountPercent != null ? String(item.discountPercent) : '',
      item.suggestedSellPrice != null ? String(item.suggestedSellPrice) : '',
      item.moq ?? '',
    ]
    lines.push(cells.join(','))
  }
  return lines.join('\n')
}
