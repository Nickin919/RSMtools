/**
 * Quote number parsing for WAGO-style quotes.
 *
 * Format: [Prefix][Year][Core][-Revision]
 * - Prefix: T or W (e.g. T = type/year label)
 * - Year: 2 digits (26 → 2026)
 * - Core: Q + digits (e.g. Q5889) — the stable quote identifier
 * - Revision: optional -A, -B, etc. (in-year revisions)
 *
 * Examples:
 *   T26Q5889     → core Q5889, year 26, prefix T, revision null
 *   T26Q5889-A   → core Q5889, year 26, prefix T, revision A
 *   W26Q5889     → core Q5889, year 26, prefix W, revision null
 */

export interface ParsedQuoteNumber {
  /** Full display string (normalized) */
  display: string
  /** Core quote id, e.g. "Q5889" */
  core: string
  /** 2-digit year, e.g. 26 */
  year: number | null
  /** Prefix: "T" | "W" | null */
  prefix: string | null
  /** Revision suffix: "A" | "B" | null */
  revision: string | null
  /** Full year, e.g. 2026 */
  fullYear: number | null
}

const QUOTE_CORE_REGEX = /Q\d+/i
/** Match prefix (T or W) + 2-digit year + Q + digits, optional -X revision */
const FULL_QUOTE_REGEX = /^([TW])(\d{2})(Q\d+)(?:\s*[-–]\s*([A-Z0-9]+))?$/i

/**
 * Parse a quote number string into core, year, prefix, and revision.
 * Accepts formats: T26Q5889, T26Q5889-A, W26Q5889, Q5889, etc.
 */
export function parseQuoteNumber(raw: string | null | undefined): ParsedQuoteNumber | null {
  const s = typeof raw === 'string' ? raw.trim().toUpperCase() : ''
  if (!s) return null

  const fullMatch = s.match(FULL_QUOTE_REGEX)
  if (fullMatch) {
    const [, prefix, yearStr, core, revision] = fullMatch
    const year = parseInt(yearStr!, 10)
    const fullYear = year >= 0 && year <= 99 ? 2000 + year : null
    const display = revision ? `${prefix}${yearStr}${core}-${revision}` : `${prefix}${yearStr}${core}`
    return {
      display,
      core,
      year,
      fullYear,
      prefix: prefix || null,
      revision: revision || null,
    }
  }

  const coreOnly = s.match(QUOTE_CORE_REGEX)
  if (coreOnly) {
    const core = coreOnly[0]
    const rest = s.replace(core, '').trim()
    let year: number | null = null
    let prefix: string | null = null
    let revision: string | null = null
    const revMatch = rest.match(/[-–]\s*([A-Z0-9]+)$/i)
    if (revMatch) {
      revision = revMatch[1]
    }
    const preMatch = rest.match(/^([TW])(\d{2})/i)
    if (preMatch) {
      prefix = preMatch[1].toUpperCase()
      year = parseInt(preMatch[2], 10)
    }
    const fullYear = year !== null && year >= 0 && year <= 99 ? 2000 + year : null
    return {
      display: s,
      core,
      year,
      fullYear,
      prefix,
      revision,
    }
  }

  return null
}

/**
 * Grouping key for "quote family": same core (and optionally same full year).
 * Use this to group contracts that belong to the same quote lineage.
 */
export function quoteFamilyKey(parsed: ParsedQuoteNumber): string {
  const yearPart = parsed.fullYear != null ? `-${parsed.fullYear}` : ''
  return `${parsed.core}${yearPart}`
}
