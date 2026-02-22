/** Simple RFC-4180 CSV parser. Returns array of objects keyed by header row. */
export function parseCSV(text: string): Record<string, string>[] {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  if (lines.length < 2) return []

  const parseRow = (line: string): string[] => {
    const cells: string[] = []
    let i = 0
    while (i < line.length) {
      if (line[i] === '"') {
        // Quoted field
        let cell = ''
        i++ // skip opening quote
        while (i < line.length) {
          if (line[i] === '"' && line[i + 1] === '"') {
            cell += '"'
            i += 2
          } else if (line[i] === '"') {
            i++ // skip closing quote
            break
          } else {
            cell += line[i++]
          }
        }
        cells.push(cell)
        if (line[i] === ',') i++
      } else {
        // Unquoted field
        const end = line.indexOf(',', i)
        if (end === -1) {
          cells.push(line.slice(i).trim())
          break
        } else {
          cells.push(line.slice(i, end).trim())
          i = end + 1
        }
      }
    }
    return cells
  }

  const headers = parseRow(lines[0]).map((h) => h.trim().toLowerCase())
  const rows: Record<string, string>[] = []

  for (let r = 1; r < lines.length; r++) {
    const line = lines[r].trim()
    if (!line) continue
    const cells = parseRow(line)
    const obj: Record<string, string> = {}
    for (let c = 0; c < headers.length; c++) {
      obj[headers[c]] = (cells[c] ?? '').trim()
    }
    rows.push(obj)
  }
  return rows
}

/** Detect which CSV column maps to a given field by checking a list of aliases. */
export function detectColumn(headers: string[], aliases: string[]): string | undefined {
  const lower = headers.map((h) => h.toLowerCase())
  for (const alias of aliases) {
    const idx = lower.indexOf(alias.toLowerCase())
    if (idx !== -1) return headers[idx]
  }
  return undefined
}
