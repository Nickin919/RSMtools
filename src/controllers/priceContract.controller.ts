import { Request, Response } from 'express'
import fs from 'fs'
import { prisma } from '../lib/prisma'
import { parseWagoPDF, ParsedRow, toCSV } from '../lib/pdfParser'

const ADMIN_RSM: string[] = ['ADMIN', 'RSM']

function canAccess(userId: string, role: string, createdById: string): boolean {
  return ADMIN_RSM.includes(role) || userId === createdById
}

// ── helpers ───────────────────────────────────────────────────────────────────

/** Parse a formatted price string like "$5.04" → 5.04, returns null if invalid */
function parsePriceStr(s: string): number | null {
  const v = parseFloat(s.replace(/[$,]/g, '').trim())
  return isNaN(v) || v < 0 ? null : v
}

/** Parse "XX%" → XX, returns null if invalid */
function parseDiscountStr(s: string): number | null {
  const v = parseFloat(s.replace(/%/g, '').trim())
  return isNaN(v) ? null : v
}

/** Parse MOQ string "1" or "1-99" → first integer */
function parseMOQ(moq: string): number {
  const m = moq.match(/\d+/)
  return m ? Math.max(1, parseInt(m[0], 10)) : 1
}

/** Import parsed rows into a contract, returns { imported, skipped } */
async function importRowsToContract(
  contractId: string,
  rows: ParsedRow[],
): Promise<{ imported: number; skipped: number }> {
  let imported = 0, skipped = 0

  for (const row of rows) {
    const isSeriesDiscount = !row.partNumber && !!row.series
    const costPrice = parsePriceStr(row.price)

    // Skip invalid product rows (series discount rows are stored too)
    if (!isSeriesDiscount && (costPrice === null || costPrice <= 0)) { skipped++; continue }

    const discountPercent = parseDiscountStr(row.discount)
    const netPriceVal = parsePriceStr(row.netPrice)
    const moqStr = row.moq || ''
    const minQty = parseMOQ(moqStr)

    // Look up matching part in master catalog
    let partId: string | null = null
    if (row.partNumber && !isSeriesDiscount) {
      const part = await prisma.part.findFirst({
        where: { partNumber: row.partNumber, catalog: { isMaster: true } },
        select: { id: true },
      })
      partId = part?.id ?? null
    }

    // For series discount rows, match category by series name
    let categoryId: string | null = null
    if (isSeriesDiscount && row.series) {
      const cat = await prisma.category.findFirst({
        where: { OR: [{ name: row.series }, { name: { contains: row.series, mode: 'insensitive' } }] },
        select: { id: true },
      })
      categoryId = cat?.id ?? null
    }

    try {
      await prisma.priceContractItem.create({
        data: {
          contractId,
          partId,
          categoryId,
          partNumber: !isSeriesDiscount && row.partNumber ? row.partNumber : null,
          seriesOrGroup: row.series || null,
          description: row.description || null,
          costPrice: isSeriesDiscount ? 0 : (costPrice ?? 0),
          netPrice: netPriceVal,
          discountPercent,
          minQuantity: minQty,
          moq: moqStr || null,
        },
      })
      imported++
    } catch (err) {
      console.error('Failed to create contract item:', err)
      skipped++
    }
  }
  return { imported, skipped }
}

// ── List contracts ─────────────────────────────────────────────────────────

export async function listContracts(req: Request, res: Response) {
  const user = req.user!
  const isAdminOrRsm = ADMIN_RSM.includes(user.role)
  const contracts = await prisma.priceContract.findMany({
    where: isAdminOrRsm ? undefined : { createdById: user.id },
    orderBy: { createdAt: 'desc' },
    include: {
      createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      _count: { select: { items: true } },
    },
  })
  return res.status(200).json({ contracts })
}

// ── Create contract ────────────────────────────────────────────────────────

export async function createContract(req: Request, res: Response) {
  const { name, description, validFrom, validTo } = req.body ?? {}
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ message: 'Contract name is required.' })
  }
  const contract = await prisma.priceContract.create({
    data: {
      name: name.trim(),
      description: typeof description === 'string' ? description.trim() || null : null,
      validFrom: validFrom ? new Date(validFrom) : null,
      validTo: validTo ? new Date(validTo) : null,
      createdById: req.user!.id,
    },
  })
  return res.status(201).json({ contract })
}

// ── Get contract by id ─────────────────────────────────────────────────────

export async function getContract(req: Request, res: Response) {
  const { id } = req.params
  const user = req.user!
  const contract = await prisma.priceContract.findUnique({
    where: { id },
    include: {
      createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      items: {
        orderBy: { createdAt: 'asc' },
        include: {
          part: { select: { id: true, partNumber: true, series: true, description: true, basePrice: true } },
        },
      },
    },
  })
  if (!contract) return res.status(404).json({ message: 'Contract not found.' })
  if (!canAccess(user.id, user.role, contract.createdById)) return res.status(403).json({ message: 'Access denied.' })
  return res.status(200).json({ contract })
}

// ── Rename contract ────────────────────────────────────────────────────────

export async function renameContract(req: Request, res: Response) {
  const { id } = req.params
  const user = req.user!
  const { name } = req.body ?? {}
  if (!name || typeof name !== 'string' || !name.trim()) return res.status(400).json({ message: 'Name is required.' })
  const contract = await prisma.priceContract.findUnique({ where: { id } })
  if (!contract) return res.status(404).json({ message: 'Contract not found.' })
  if (!canAccess(user.id, user.role, contract.createdById)) return res.status(403).json({ message: 'Access denied.' })
  const updated = await prisma.priceContract.update({ where: { id }, data: { name: name.trim() } })
  return res.status(200).json({ contract: updated })
}

// ── Delete contract ────────────────────────────────────────────────────────

export async function deleteContract(req: Request, res: Response) {
  const { id } = req.params
  const user = req.user!
  const contract = await prisma.priceContract.findUnique({ where: { id } })
  if (!contract) return res.status(404).json({ message: 'Contract not found.' })
  if (!canAccess(user.id, user.role, contract.createdById)) return res.status(403).json({ message: 'Access denied.' })
  await prisma.priceContract.delete({ where: { id } })
  return res.status(200).json({ message: 'Contract deleted.' })
}

// ── Upload PDFs to existing contract ──────────────────────────────────────

export async function uploadPDFsToContract(req: Request, res: Response) {
  const { id } = req.params
  const user = req.user!
  const contract = await prisma.priceContract.findUnique({ where: { id } })
  if (!contract) return res.status(404).json({ message: 'Contract not found.' })
  if (!canAccess(user.id, user.role, contract.createdById)) return res.status(403).json({ message: 'Access denied.' })

  const files: Express.Multer.File[] = []
  if (req.file) files.push(req.file)
  if (Array.isArray(req.files)) files.push(...req.files)
  if (files.length === 0) return res.status(400).json({ message: 'No PDF file(s) provided.' })

  let totalImported = 0, totalSkipped = 0
  const fileResults: { filename: string; imported: number; skipped: number; warnings: number; errors: string[] }[] = []

  for (const file of files) {
    let parseResult
    try {
      parseResult = await parseWagoPDF(file.path)
    } catch (err) {
      console.error('PDF parse error:', err)
      fileResults.push({ filename: file.originalname, imported: 0, skipped: 0, warnings: 0, errors: ['Parse failed'] })
      try { fs.unlinkSync(file.path) } catch { /* ignore */ }
      continue
    }
    try { fs.unlinkSync(file.path) } catch { /* ignore */ }

    if (!parseResult.success) {
      fileResults.push({ filename: file.originalname, imported: 0, skipped: 0, warnings: parseResult.warnings.length, errors: parseResult.errors })
      continue
    }

    const { imported, skipped } = await importRowsToContract(id, parseResult.rows)
    totalImported += imported
    totalSkipped += skipped
    fileResults.push({ filename: file.originalname, imported, skipped, warnings: parseResult.warnings.length, errors: parseResult.errors })
  }

  return res.status(200).json({ totalImported, totalSkipped, files: fileResults })
}

// ── Batch upload: one PDF → one contract ─────────────────────────────────

function nameFromFile(originalname: string): string {
  return originalname.replace(/\.pdf$/i, '').replace(/[_\-]+/g, ' ').replace(/\s{2,}/g, ' ').trim() || originalname
}

export async function batchUploadPDFs(req: Request, res: Response) {
  const user = req.user!
  const files: Express.Multer.File[] = []
  if (req.file) files.push(req.file)
  if (Array.isArray(req.files)) files.push(...req.files)
  if (files.length === 0) return res.status(400).json({ message: 'No PDF files provided.' })

  const results: {
    filename: string; contractId: string; contractName: string
    imported: number; skipped: number; warnings: number; errors: string[]
    metadata?: Record<string, string | undefined>
  }[] = []

  for (const file of files) {
    const contractName = nameFromFile(file.originalname)

    let parseResult
    try {
      parseResult = await parseWagoPDF(file.path)
    } catch (err) {
      console.error('PDF parse error:', err)
      results.push({ filename: file.originalname, contractId: '', contractName, imported: 0, skipped: 0, warnings: 0, errors: ['Parse failed'] })
      try { fs.unlinkSync(file.path) } catch { /* ignore */ }
      continue
    }
    try { fs.unlinkSync(file.path) } catch { /* ignore */ }

    if (!parseResult.success) {
      results.push({ filename: file.originalname, contractId: '', contractName, imported: 0, skipped: 0, warnings: parseResult.warnings.length, errors: parseResult.errors })
      continue
    }

    // Create contract (use quote metadata for name if available)
    const finalName = parseResult.metadata.quoteNumber
      ? `${contractName} (${parseResult.metadata.quoteNumber})`
      : contractName

    const contract = await prisma.priceContract.create({
      data: {
        name: finalName,
        validFrom: parseResult.metadata.quoteDate ? new Date(parseResult.metadata.quoteDate) : null,
        validTo: parseResult.metadata.expirationDate ? new Date(parseResult.metadata.expirationDate) : null,
        createdById: user.id,
      },
    })

    const { imported, skipped } = await importRowsToContract(contract.id, parseResult.rows)

    results.push({
      filename: file.originalname, contractId: contract.id, contractName: finalName,
      imported, skipped, warnings: parseResult.warnings.length, errors: parseResult.errors,
      metadata: parseResult.metadata as Record<string, string | undefined>,
    })
  }

  return res.status(201).json({ message: `Created ${results.filter(r => r.contractId).length} contract(s).`, results })
}

// ── Update + recheck a single item against master catalog ─────────────────

export async function updateContractItem(req: Request, res: Response) {
  const { id: contractId, itemId } = req.params
  const user = req.user!

  const contract = await prisma.priceContract.findUnique({ where: { id: contractId } })
  if (!contract) return res.status(404).json({ message: 'Contract not found.' })
  if (!canAccess(user.id, user.role, contract.createdById)) return res.status(403).json({ message: 'Access denied.' })

  const existing = await prisma.priceContractItem.findFirst({ where: { id: itemId, contractId } })
  if (!existing) return res.status(404).json({ message: 'Item not found.' })

  const { partNumber: bodyPN, costPrice: bodyCP, suggestedSellPrice: bodySP } = req.body ?? {}
  const partNumber = typeof bodyPN === 'string' && bodyPN.trim() ? bodyPN.trim() : existing.partNumber
  const costPrice = typeof bodyCP === 'number' && bodyCP >= 0 ? bodyCP : existing.costPrice
  const suggestedSellPrice = typeof bodySP === 'number' && bodySP >= 0 ? bodySP : existing.suggestedSellPrice

  let partId: string | null = null
  if (partNumber) {
    const part = await prisma.part.findFirst({
      where: { partNumber, catalog: { isMaster: true } },
      select: { id: true },
    })
    partId = part?.id ?? null
  }

  const updated = await prisma.priceContractItem.update({
    where: { id: itemId },
    data: { partNumber: partNumber || null, costPrice, partId, suggestedSellPrice },
    include: {
      part: { select: { id: true, partNumber: true, series: true, description: true, basePrice: true } },
    },
  })

  return res.status(200).json({ item: updated, inCatalog: !!partId })
}

// ── Bulk apply sell price margin to selected items ────────────────────────

/**
 * POST /api/price-contracts/:id/items/bulk-sell-price
 * Body: { itemIds: string[], marginPercent: number }
 * suggestedSellPrice = costPrice / (1 - marginPercent/100)
 */
export async function bulkApplySellPrice(req: Request, res: Response) {
  const { id: contractId } = req.params
  const user = req.user!

  const contract = await prisma.priceContract.findUnique({ where: { id: contractId } })
  if (!contract) return res.status(404).json({ message: 'Contract not found.' })
  if (!canAccess(user.id, user.role, contract.createdById)) return res.status(403).json({ message: 'Access denied.' })

  const { itemIds, marginPercent } = req.body ?? {}
  if (!Array.isArray(itemIds) || itemIds.length === 0) return res.status(400).json({ message: 'itemIds required.' })
  const margin = parseFloat(marginPercent)
  if (isNaN(margin) || margin < 0 || margin >= 100) return res.status(400).json({ message: 'marginPercent must be 0–99.' })

  const divisor = 1 - margin / 100
  let updated = 0
  for (const itemId of itemIds as string[]) {
    const item = await prisma.priceContractItem.findFirst({ where: { id: itemId, contractId } })
    if (!item) continue
    const suggestedSellPrice = item.costPrice / divisor
    await prisma.priceContractItem.update({ where: { id: itemId }, data: { suggestedSellPrice } })
    updated++
  }

  return res.status(200).json({ updated })
}

// ── Delete a single contract item ─────────────────────────────────────────

export async function deleteContractItem(req: Request, res: Response) {
  const { id, itemId } = req.params
  const user = req.user!
  const contract = await prisma.priceContract.findUnique({ where: { id } })
  if (!contract) return res.status(404).json({ message: 'Contract not found.' })
  if (!canAccess(user.id, user.role, contract.createdById)) return res.status(403).json({ message: 'Access denied.' })
  const item = await prisma.priceContractItem.findFirst({ where: { id: itemId, contractId: id } })
  if (!item) return res.status(404).json({ message: 'Item not found.' })
  await prisma.priceContractItem.delete({ where: { id: itemId } })
  return res.status(200).json({ message: 'Item deleted.' })
}

// ── Download contract as CSV ──────────────────────────────────────────────

export async function downloadContractCSV(req: Request, res: Response) {
  const { id } = req.params
  const user = req.user!
  const contract = await prisma.priceContract.findUnique({
    where: { id },
    include: { items: { orderBy: { createdAt: 'asc' } } },
  })
  if (!contract) return res.status(404).json({ message: 'Contract not found.' })
  if (!canAccess(user.id, user.role, contract.createdById)) return res.status(403).json({ message: 'Access denied.' })

  // Map DB items back to ParsedRow shape for toCSV
  const rows: ParsedRow[] = contract.items
    .filter(item => item.partNumber)
    .map(item => ({
      partNumber: item.partNumber ?? '',
      series: item.seriesOrGroup ?? '',
      description: item.description ?? '',
      price: item.costPrice > 0 ? `$${item.costPrice.toFixed(2)}` : '',
      discount: item.discountPercent != null ? `${item.discountPercent}%` : '',
      moq: item.moq ?? String(item.minQuantity),
      netPrice: item.netPrice != null ? `$${item.netPrice.toFixed(2)}` : '',
      lineNumber: 0,
    }))

  const csv = toCSV(rows)
  const safeName = contract.name.replace(/[^a-z0-9_-]/gi, '_').slice(0, 60)
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="${safeName}.csv"`)
  return res.send(csv)
}
