export interface ParsedCsv {
  headers: string[]
  rows: Record<string, string>[]
}

/**
 * Minimal RFC4180-ish CSV parser: handles quoted fields (including embedded
 * commas, newlines, and escaped "" quotes) and both CRLF/LF line endings.
 * Retail CSV exports are rarely more exotic than this, so no library needed.
 */
export function parseCsv(text: string): ParsedCsv {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const rawRows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < normalized.length; i++) {
    const c = normalized[i]
    if (inQuotes) {
      if (c === '"') {
        if (normalized[i + 1] === '"') { field += '"'; i++ }
        else inQuotes = false
      } else {
        field += c
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      row.push(field); field = ''
    } else if (c === '\n') {
      row.push(field); field = ''
      rawRows.push(row); row = []
    } else {
      field += c
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rawRows.push(row) }

  if (rawRows.length === 0) return { headers: [], rows: [] }

  const headers = rawRows[0].map((h) => h.trim())
  const rows = rawRows.slice(1)
    .filter((r) => r.some((cell) => cell.trim() !== ''))  // skip blank trailing lines
    .map((r) => {
      const obj: Record<string, string> = {}
      headers.forEach((h, idx) => { obj[h] = (r[idx] ?? '').trim() })
      return obj
    })

  return { headers, rows }
}
