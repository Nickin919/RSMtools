import pdfParse from 'pdf-parse'
import fs from 'fs'

export interface ParsedRow {
  partNumber: string
  seriesOrGroup: string
  description: string
  costPrice: number
  discountPercent: number
  minQuantity: number
  suggestedSellPrice?: number
}

export interface ParseResult {
  rows: ParsedRow[]
  unparsedLines: string[]
  rawText?: string
}

// WAGO article numbers: digits/letters with hyphens, at least 4 chars, e.g. 2273-208, 750-841, 2604-3201
const ARTICLE_RE = /\b(\d[\d\w]{1,}-[\d\w][\d\w-]{0,})\b/

// Matches a price like 12.34 or 1,234.56 or 1.234,56
const PRICE_RE = /\b(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,4})|\d+[.,]\d{1,4}|\d{3,})\b/g

function parsePrice(s: string): number {
  // Handle both 1,234.56 and 1.234,56 formats
  const cleaned = s.replace(/\s/g, '')
  // If comma before last 2 digits and no period: European format 1.234,56
  if (/^\d{1,3}(\.\d{3})*(,\d{1,4})$/.test(cleaned)) {
    return parseFloat(cleaned.replace(/\./g, '').replace(',', '.'))
  }
  // American format 1,234.56
  return parseFloat(cleaned.replace(/,/g, ''))
}

function extractPrices(text: string): number[] {
  const prices: number[] = []
  const matches = text.matchAll(/\b(\d{1,3}(?:[.,]\d{3})*[.,]\d{1,4}|\d+[.,]\d{2})\b/g)
  for (const m of matches) {
    const v = parsePrice(m[1])
    if (!isNaN(v) && v > 0) prices.push(v)
  }
  return prices
}

function extractDiscount(text: string): number {
  // Look for XX% or XX.XX%
  const m = text.match(/(\d+(?:[.,]\d+)?)\s*%/)
  if (m) return parseFloat(m[1].replace(',', '.'))
  return 0
}

function extractQty(text: string): number {
  // Look for "Qty: N" or "Menge: N" or just a standalone small integer
  const m = text.match(/(?:qty|menge|quantity|min\.?\s*qty)[:\s]+(\d+)/i)
  if (m) return parseInt(m[1], 10)
  return 1
}

function extractSeries(partNumber: string): string {
  // Series is typically the first segment before the last hyphen
  const parts = partNumber.split('-')
  if (parts.length >= 2) return parts[0]
  return ''
}

/**
 * Parses a WAGO quote PDF and extracts pricing rows.
 * Handles multiple common WAGO PDF formats by scanning for article-number patterns.
 */
export async function parseWagoPDF(filePath: string): Promise<ParseResult> {
  const buffer = fs.readFileSync(filePath)
  let text = ''
  try {
    const parsed = await pdfParse(buffer)
    text = parsed.text
  } catch (err) {
    console.error('pdf-parse error:', err)
    return { rows: [], unparsedLines: [], rawText: '' }
  }

  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  const rows: ParsedRow[] = []
  const unparsedLines: string[] = []

  // Strategy: scan lines for WAGO article number patterns.
  // For each matching line, try to extract prices and discount from that line
  // and the next 1–3 lines.
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const articleMatch = line.match(ARTICLE_RE)

    if (articleMatch) {
      const partNumber = articleMatch[1]
      // Collect this line + up to 3 more for context
      const context = lines.slice(i, Math.min(i + 4, lines.length)).join(' ')

      const prices = extractPrices(context)
      const discount = extractDiscount(context)
      const qty = extractQty(context)

      // Determine description: everything after the article number on the same line
      const afterArticle = line.slice(line.indexOf(partNumber) + partNumber.length).trim()
      // Strip leading price-like tokens from description
      const description = afterArticle.replace(/^[\d.,\s%]+/, '').trim() || partNumber

      // Assign prices: in WAGO quotes typically List Price > Net Price
      // If we have ≥2 prices, largest is list (cost), smallest is net
      let costPrice = 0
      let suggestedSellPrice: number | undefined

      if (prices.length >= 2) {
        const sorted = [...prices].sort((a, b) => b - a)
        costPrice = sorted[0]
        suggestedSellPrice = sorted[sorted.length - 1]
      } else if (prices.length === 1) {
        costPrice = prices[0]
      }

      if (costPrice > 0) {
        rows.push({
          partNumber,
          seriesOrGroup: extractSeries(partNumber),
          description,
          costPrice,
          discountPercent: discount,
          minQuantity: qty > 0 ? qty : 1,
          suggestedSellPrice,
        })
      } else {
        unparsedLines.push(line)
      }
      i++
    } else {
      i++
    }
  }

  // Deduplicate by partNumber (last occurrence wins)
  const deduped = new Map<string, ParsedRow>()
  for (const row of rows) {
    deduped.set(row.partNumber, row)
  }

  return {
    rows: Array.from(deduped.values()),
    unparsedLines,
    rawText: text,
  }
}

/** Convert ParseResult rows to a CSV string */
export function toCSV(rows: ParsedRow[]): string {
  const headers = ['Part Number', 'Series/Group', 'Description', 'Cost Price', 'Discount %', 'Min Qty', 'Suggested Sell Price']
  const escape = (v: unknown) => {
    const s = String(v ?? '')
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
  }
  const headerLine = headers.map(escape).join(',')
  const dataLines = rows.map((r) =>
    [
      r.partNumber,
      r.seriesOrGroup,
      r.description,
      r.costPrice.toFixed(4),
      r.discountPercent.toFixed(2),
      r.minQuantity,
      r.suggestedSellPrice != null ? r.suggestedSellPrice.toFixed(4) : '',
    ]
      .map(escape)
      .join(','),
  )
  return [headerLine, ...dataLines].join('\r\n')
}
