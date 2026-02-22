import { Request, Response } from 'express'
import fs from 'fs'
import { prisma } from '../lib/prisma'
import { parseCSV, detectColumn } from '../lib/csvParser'

// ── Types shared between JSON and CSV import ──────────────────────────────────

interface MappedProduct {
  partNumber?: string | null
  series?: string | null
  description?: string | null
  englishDescription?: string | null
  category?: string | null
  price?: number | null        // basePrice
  listPricePer100?: number | null
  wagoIdent?: string | null
  distributorDiscount?: number | null
  minQty?: number | null
}

function safeNum(v: unknown): number | null {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''))
  return isNaN(n) ? null : n
}

// ── JSON import endpoint (used by the wizard UI) ──────────────────────────────

/**
 * POST /api/product-import/import-products
 * Body: { products: MappedProduct[], updateOnly?: boolean }
 *
 * Bulk-optimised: loads categories + existing part numbers in 2 queries,
 * then bulk-inserts new parts and batches updates — handles 25k rows easily.
 */
export async function importProducts(req: Request, res: Response) {
  const { products, updateOnly = false } = req.body ?? {}
  if (!Array.isArray(products) || products.length === 0) {
    return res.status(400).json({ message: 'No products provided.' })
  }

  const masterCatalog = await prisma.catalog.findFirst({ where: { isMaster: true } })
  if (!masterCatalog) {
    return res.status(500).json({ message: 'Master Catalog not found. Contact an administrator.' })
  }
  const catalogId = masterCatalog.id

  // ── 1. Normalise input rows ───────────────────────────────────────────────
  interface NormRow {
    partNumber: string
    categoryName: string
    series: string | null
    description: string
    englishDescription: string | null
    basePrice: number | null
    listPricePer100: number | null
    wagoIdent: string | null
    distributorDiscount: number
    minQty: number
  }

  const rows: NormRow[] = []
  let skipped = 0
  for (const p of products as MappedProduct[]) {
    const partNumber = p.partNumber?.trim()
    if (!partNumber) { skipped++; continue }
    rows.push({
      partNumber,
      categoryName: p.category?.trim() || 'General',
      series: p.series?.trim() || null,
      description: p.description?.trim() || partNumber,
      englishDescription: p.englishDescription?.trim() || null,
      basePrice: safeNum(p.price),
      listPricePer100: safeNum(p.listPricePer100),
      wagoIdent: p.wagoIdent?.trim() || null,
      distributorDiscount: safeNum(p.distributorDiscount) ?? 0,
      minQty: Math.max(1, safeNum(p.minQty) ?? 1),
    })
  }

  // ── 2. Ensure all referenced categories exist (one round-trip) ───────────
  const neededCatNames = [...new Set(rows.map(r => r.categoryName))]

  const existingCats = await prisma.category.findMany({
    where: { catalogId, name: { in: neededCatNames } },
    select: { id: true, name: true },
  })
  const catMap = new Map<string, string>(existingCats.map(c => [c.name, c.id]))

  const missingCatNames = neededCatNames.filter(n => !catMap.has(n))
  if (missingCatNames.length > 0 && !updateOnly) {
    // createMany with skipDuplicates handles race conditions
    await prisma.category.createMany({
      data: missingCatNames.map(name => ({ catalogId, name })),
      skipDuplicates: true,
    })
    // Reload just the newly created ones
    const newCats = await prisma.category.findMany({
      where: { catalogId, name: { in: missingCatNames } },
      select: { id: true, name: true },
    })
    newCats.forEach(c => catMap.set(c.name, c.id))
  }

  // ── 3. Load all existing part numbers for this catalog (one round-trip) ──
  const existingParts = await prisma.part.findMany({
    where: { catalogId },
    select: { partNumber: true, id: true },
  })
  const existingMap = new Map<string, string>(existingParts.map(p => [p.partNumber, p.id]))

  // ── 4. Split rows into creates vs updates ─────────────────────────────────
  const toCreate: NormRow[] = []
  const toUpdate: NormRow[] = []

  for (const row of rows) {
    if (!catMap.has(row.categoryName)) { skipped++; continue } // no category = updateOnly skipped earlier
    if (existingMap.has(row.partNumber)) {
      toUpdate.push(row)
    } else {
      if (updateOnly) { skipped++; continue }
      toCreate.push(row)
    }
  }

  // ── 5. Bulk insert new parts ──────────────────────────────────────────────
  let imported = 0, updated = 0, errors = 0
  const errorDetails: string[] = []

  if (toCreate.length > 0) {
    try {
      const result = await prisma.part.createMany({
        data: toCreate.map(r => ({
          catalogId,
          categoryId: catMap.get(r.categoryName)!,
          partNumber: r.partNumber,
          series: r.series,
          description: r.description,
          englishDescription: r.englishDescription,
          basePrice: r.basePrice,
          listPricePer100: r.listPricePer100,
          wagoIdent: r.wagoIdent,
          distributorDiscount: r.distributorDiscount,
          minQty: r.minQty,
        })),
        skipDuplicates: true,
      })
      imported = result.count
    } catch (err) {
      errors += toCreate.length
      errorDetails.push(`Bulk create failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // ── 6. Batch updates (chunks of 200 concurrent) ───────────────────────────
  const BATCH = 200
  for (let i = 0; i < toUpdate.length; i += BATCH) {
    const chunk = toUpdate.slice(i, i + BATCH)
    const results = await Promise.allSettled(
      chunk.map(r =>
        prisma.part.update({
          where: { catalogId_partNumber: { catalogId, partNumber: r.partNumber } },
          data: {
            categoryId: catMap.get(r.categoryName)!,
            series: r.series,
            description: r.description,
            englishDescription: r.englishDescription,
            basePrice: r.basePrice,
            listPricePer100: r.listPricePer100,
            wagoIdent: r.wagoIdent,
            distributorDiscount: r.distributorDiscount,
            minQty: r.minQty,
          },
        })
      )
    )
    for (const r of results) {
      if (r.status === 'fulfilled') { updated++ }
      else {
        errors++
        if (errorDetails.length < 20)
          errorDetails.push(r.reason instanceof Error ? r.reason.message : String(r.reason))
      }
    }
  }

  return res.status(200).json({ imported, updated, skipped, errors, errorDetails })
}

/**
 * POST /api/product-import/import
 * Accepts a CSV file upload (field: "file") and upserts products into the Master Catalog.
 * Restricted to ADMIN and RSM roles.
 *
 * Expected CSV columns (flexible, auto-detected):
 *   partNumber / part_number / article / article_no / artikelnummer / item_no
 *   series
 *   description / description / bezeichnung
 *   basePrice / base_price / list_price / preis / price
 *   minQty / min_qty / minimum_qty / mindestmenge
 *   packageQty / package_qty / vpe
 *   distributorDiscount / distributor_discount / discount / rabatt
 *   category / category_name / kategorie
 */
export async function importCatalog(req: Request, res: Response) {
  const file = req.file
  if (!file) {
    return res.status(400).json({ message: 'No file uploaded. Send a CSV as field "file".' })
  }

  let text: string
  try {
    text = fs.readFileSync(file.path, 'utf-8')
  } catch {
    return res.status(500).json({ message: 'Failed to read uploaded file.' })
  } finally {
    try { fs.unlinkSync(file.path) } catch { /* ignore */ }
  }

  const rows = parseCSV(text)
  if (rows.length === 0) {
    return res.status(400).json({ message: 'CSV is empty or could not be parsed.' })
  }

  const headers = Object.keys(rows[0])

  // Auto-detect columns
  const col = {
    partNumber: detectColumn(headers, ['partnumber', 'part_number', 'part number', 'article', 'article_no', 'article no', 'artikelnummer', 'item_no', 'item no', 'art.-nr', 'art nr']),
    series: detectColumn(headers, ['series', 'serie', 'product_series', 'product series']),
    description: detectColumn(headers, ['description', 'bezeichnung', 'name', 'product_name', 'product name', 'desc']),
    basePrice: detectColumn(headers, ['baseprice', 'base_price', 'base price', 'list_price', 'list price', 'price', 'preis', 'listprice']),
    minQty: detectColumn(headers, ['minqty', 'min_qty', 'min qty', 'minimum_qty', 'minimum qty', 'mindestmenge', 'moq']),
    packageQty: detectColumn(headers, ['packageqty', 'package_qty', 'package qty', 'vpe', 'pack_qty', 'pack qty']),
    distributorDiscount: detectColumn(headers, ['distributordiscount', 'distributor_discount', 'distributor discount', 'discount', 'rabatt', 'disc']),
    category: detectColumn(headers, ['category', 'category_name', 'category name', 'kategorie', 'group', 'produktgruppe']),
    englishDescription: detectColumn(headers, ['english_description', 'english description', 'en_description', 'description_en']),
  }

  if (!col.partNumber) {
    return res.status(400).json({
      message: 'Could not detect part number column. Expected a column named: partNumber, part_number, article, article_no, or similar.',
      detectedHeaders: headers,
    })
  }

  // Get or verify Master Catalog exists
  const masterCatalog = await prisma.catalog.findFirst({ where: { isMaster: true } })
  if (!masterCatalog) {
    return res.status(500).json({ message: 'Master Catalog not found. Run database seed first.' })
  }

  let imported = 0
  let skipped = 0
  let errors = 0
  const errorDetails: string[] = []

  for (const row of rows) {
    const partNumber = col.partNumber ? row[col.partNumber]?.trim() : ''
    if (!partNumber) { skipped++; continue }

    const description = (col.description ? row[col.description] : '') || partNumber
    const series = col.series ? row[col.series] : ''
    const basePriceRaw = col.basePrice ? row[col.basePrice] : ''
    const basePrice = basePriceRaw ? parseFloat(basePriceRaw.replace(/[,$€ ]/g, '').replace(',', '.')) : null
    const minQtyRaw = col.minQty ? row[col.minQty] : ''
    const minQty = minQtyRaw ? parseInt(minQtyRaw, 10) : 1
    const packageQtyRaw = col.packageQty ? row[col.packageQty] : ''
    const packageQty = packageQtyRaw ? parseInt(packageQtyRaw, 10) : 1
    const discountRaw = col.distributorDiscount ? row[col.distributorDiscount] : ''
    const distributorDiscount = discountRaw ? parseFloat(discountRaw.replace('%', '').trim()) : 0
    const categoryName = (col.category ? row[col.category] : '') || 'General'
    const englishDescription = col.englishDescription ? row[col.englishDescription] : null

    try {
      // Upsert category
      let category = await prisma.category.findFirst({
        where: { catalogId: masterCatalog.id, name: categoryName },
      })
      if (!category) {
        category = await prisma.category.create({
          data: { catalogId: masterCatalog.id, name: categoryName },
        })
      }

      // Upsert part
      await prisma.part.upsert({
        where: { catalogId_partNumber: { catalogId: masterCatalog.id, partNumber } },
        update: {
          series: series || null,
          description,
          englishDescription: englishDescription || null,
          basePrice: isNaN(basePrice as number) ? null : basePrice,
          minQty: isNaN(minQty) ? 1 : Math.max(1, minQty),
          packageQty: isNaN(packageQty) ? 1 : Math.max(1, packageQty),
          distributorDiscount: isNaN(distributorDiscount) ? 0 : distributorDiscount,
          categoryId: category.id,
        },
        create: {
          catalogId: masterCatalog.id,
          categoryId: category.id,
          partNumber,
          series: series || null,
          description,
          englishDescription: englishDescription || null,
          basePrice: isNaN(basePrice as number) ? null : basePrice,
          minQty: isNaN(minQty) ? 1 : Math.max(1, minQty),
          packageQty: isNaN(packageQty) ? 1 : Math.max(1, packageQty),
          distributorDiscount: isNaN(distributorDiscount) ? 0 : distributorDiscount,
        },
      })
      imported++
    } catch (err) {
      errors++
      errorDetails.push(`Row ${partNumber}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return res.status(200).json({
    message: `Import complete: ${imported} imported, ${skipped} skipped, ${errors} errors.`,
    imported,
    skipped,
    errors,
    errorDetails: errorDetails.slice(0, 20),
    detectedColumns: col,
  })
}

/** GET /api/product-import/catalog-info — returns master catalog stats */
export async function getCatalogInfo(req: Request, res: Response) {
  const catalog = await prisma.catalog.findFirst({
    where: { isMaster: true },
    include: {
      _count: { select: { parts: true, categories: true } },
    },
  })
  if (!catalog) {
    return res.status(404).json({ message: 'Master Catalog not found' })
  }
  return res.status(200).json({ catalog })
}
