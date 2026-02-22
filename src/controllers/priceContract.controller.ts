import { Request, Response } from 'express'
import fs from 'fs'
import { prisma } from '../lib/prisma'
import { parseWagoPDF, toCSV } from '../lib/pdfParser'

const ADMIN_RSM: string[] = ['ADMIN', 'RSM']

function canAccessContract(userId: string, role: string, createdById: string): boolean {
  return ADMIN_RSM.includes(role) || userId === createdById
}

// ─── List contracts ───────────────────────────────────────────────────────────

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

// ─── Create contract ──────────────────────────────────────────────────────────

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

// ─── Get contract by id ───────────────────────────────────────────────────────

export async function getContract(req: Request, res: Response) {
  const { id } = req.params
  const user = req.user!

  const contract = await prisma.priceContract.findUnique({
    where: { id },
    include: {
      createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      items: { orderBy: { createdAt: 'asc' } },
    },
  })

  if (!contract) return res.status(404).json({ message: 'Contract not found.' })
  if (!canAccessContract(user.id, user.role, contract.createdById)) {
    return res.status(403).json({ message: 'Access denied.' })
  }

  return res.status(200).json({ contract })
}

// ─── Delete contract ──────────────────────────────────────────────────────────

export async function deleteContract(req: Request, res: Response) {
  const { id } = req.params
  const user = req.user!

  const contract = await prisma.priceContract.findUnique({ where: { id } })
  if (!contract) return res.status(404).json({ message: 'Contract not found.' })
  if (!canAccessContract(user.id, user.role, contract.createdById)) {
    return res.status(403).json({ message: 'Access denied.' })
  }

  await prisma.priceContract.delete({ where: { id } })
  return res.status(200).json({ message: 'Contract deleted.' })
}

// ─── Upload PDFs to contract ──────────────────────────────────────────────────

export async function uploadPDFsToContract(req: Request, res: Response) {
  const { id } = req.params
  const user = req.user!

  const contract = await prisma.priceContract.findUnique({ where: { id } })
  if (!contract) return res.status(404).json({ message: 'Contract not found.' })
  if (!canAccessContract(user.id, user.role, contract.createdById)) {
    return res.status(403).json({ message: 'Access denied.' })
  }

  const files: Express.Multer.File[] = []
  if (req.file) files.push(req.file)
  if (Array.isArray(req.files)) files.push(...req.files)

  if (files.length === 0) {
    return res.status(400).json({ message: 'No PDF file(s) provided. Send one or more PDFs as field "pdf".' })
  }

  let totalImported = 0
  let totalSkipped = 0
  const allUnparsed: string[] = []
  const fileResults: { filename: string; imported: number; skipped: number }[] = []

  for (const file of files) {
    let parseResult
    try {
      parseResult = await parseWagoPDF(file.path)
    } catch (err) {
      console.error('PDF parse error:', err)
      allUnparsed.push(`${file.originalname}: parse failed`)
      try { fs.unlinkSync(file.path) } catch { /* ignore */ }
      continue
    }

    try { fs.unlinkSync(file.path) } catch { /* ignore */ }

    let fileImported = 0
    let fileSkipped = 0

    for (const row of parseResult.rows) {
      if (!row.partNumber || row.costPrice <= 0) { fileSkipped++; continue }

      // Try to find matching part in master catalog
      const part = await prisma.part.findFirst({
        where: {
          partNumber: row.partNumber,
          catalog: { isMaster: true },
        },
      })

      await prisma.priceContractItem.create({
        data: {
          contractId: id,
          partId: part?.id ?? null,
          partNumber: row.partNumber,
          seriesOrGroup: row.seriesOrGroup || null,
          costPrice: row.costPrice,
          discountPercent: row.discountPercent || null,
          suggestedSellPrice: row.suggestedSellPrice ?? null,
          minQuantity: row.minQuantity || 1,
        },
      })
      fileImported++
    }

    totalImported += fileImported
    totalSkipped += fileSkipped
    allUnparsed.push(...parseResult.unparsedLines.slice(0, 5))
    fileResults.push({ filename: file.originalname, imported: fileImported, skipped: fileSkipped })
  }

  return res.status(200).json({
    message: `Processed ${files.length} PDF(s). ${totalImported} items imported, ${totalSkipped} skipped.`,
    files: fileResults,
    totalImported,
    totalSkipped,
    sampleUnparsed: allUnparsed.slice(0, 10),
  })
}

// ─── Download contract as CSV ─────────────────────────────────────────────────

export async function downloadContractCSV(req: Request, res: Response) {
  const { id } = req.params
  const user = req.user!

  const contract = await prisma.priceContract.findUnique({
    where: { id },
    include: { items: { orderBy: { createdAt: 'asc' } } },
  })

  if (!contract) return res.status(404).json({ message: 'Contract not found.' })
  if (!canAccessContract(user.id, user.role, contract.createdById)) {
    return res.status(403).json({ message: 'Access denied.' })
  }

  const rows = contract.items.map((item) => ({
    partNumber: item.partNumber ?? '',
    seriesOrGroup: item.seriesOrGroup ?? '',
    description: '',
    costPrice: item.costPrice,
    discountPercent: item.discountPercent ?? 0,
    minQuantity: item.minQuantity,
    suggestedSellPrice: item.suggestedSellPrice ?? undefined,
  }))

  const csv = toCSV(rows)
  const safeName = contract.name.replace(/[^a-z0-9_-]/gi, '_').slice(0, 60)

  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="contract-${safeName}.csv"`)
  return res.send(csv)
}

// ─── Batch upload: one PDF → one contract ────────────────────────────────────

/**
 * POST /api/price-contracts/batch-upload
 * Accepts multiple PDFs (field: "pdf"). Each PDF becomes its own PriceContract
 * named after the filename (e.g. "WAGO_Quote_2024.pdf" → "WAGO Quote 2024").
 */
export async function batchUploadPDFs(req: Request, res: Response) {
  const user = req.user!

  const files: Express.Multer.File[] = []
  if (req.file) files.push(req.file)
  if (Array.isArray(req.files)) files.push(...req.files)

  if (files.length === 0) {
    return res.status(400).json({ message: 'No PDF files provided.' })
  }

  function nameFromFile(originalname: string): string {
    return originalname
      .replace(/\.pdf$/i, '')
      .replace(/[_\-]+/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim() || originalname
  }

  const results: {
    filename: string
    contractId: string
    contractName: string
    imported: number
    skipped: number
    error?: string
  }[] = []

  for (const file of files) {
    const contractName = nameFromFile(file.originalname)
    let parseResult
    try {
      parseResult = await parseWagoPDF(file.path)
    } catch (err) {
      console.error('PDF parse error:', err)
      results.push({ filename: file.originalname, contractId: '', contractName, imported: 0, skipped: 0, error: 'PDF parse failed' })
      try { fs.unlinkSync(file.path) } catch { /* ignore */ }
      continue
    }
    try { fs.unlinkSync(file.path) } catch { /* ignore */ }

    // Create one contract per PDF
    const contract = await prisma.priceContract.create({
      data: {
        name: contractName,
        createdById: user.id,
      },
    })

    let imported = 0, skipped = 0
    for (const row of parseResult.rows) {
      if (!row.partNumber || row.costPrice <= 0) { skipped++; continue }

      const part = await prisma.part.findFirst({
        where: { partNumber: row.partNumber, catalog: { isMaster: true } },
      })

      await prisma.priceContractItem.create({
        data: {
          contractId: contract.id,
          partId: part?.id ?? null,
          partNumber: row.partNumber,
          seriesOrGroup: row.seriesOrGroup || null,
          costPrice: row.costPrice,
          discountPercent: row.discountPercent || null,
          suggestedSellPrice: row.suggestedSellPrice ?? null,
          minQuantity: row.minQuantity || 1,
        },
      })
      imported++
    }

    results.push({ filename: file.originalname, contractId: contract.id, contractName, imported, skipped })
  }

  return res.status(201).json({
    message: `Created ${results.length} contract(s).`,
    results,
  })
}

// ─── Delete a single contract item ────────────────────────────────────────────

export async function deleteContractItem(req: Request, res: Response) {
  const { id, itemId } = req.params
  const user = req.user!

  const contract = await prisma.priceContract.findUnique({ where: { id } })
  if (!contract) return res.status(404).json({ message: 'Contract not found.' })
  if (!canAccessContract(user.id, user.role, contract.createdById)) {
    return res.status(403).json({ message: 'Access denied.' })
  }

  const item = await prisma.priceContractItem.findFirst({ where: { id: itemId, contractId: id } })
  if (!item) return res.status(404).json({ message: 'Item not found.' })

  await prisma.priceContractItem.delete({ where: { id: itemId } })
  return res.status(200).json({ message: 'Item deleted.' })
}
