import { Request, Response } from 'express'
import fs from 'fs'
import { prisma } from '../lib/prisma'
import { parseCSV, detectColumn } from '../lib/csvParser'

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
