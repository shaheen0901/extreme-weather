import Papa from 'papaparse'

// Reads CSV text into { columns, rows } where rows are arrays of strings.
// If the first row is entirely numeric, the file has no header row: every row is data and columns
// are named "Column 1", "Column 2", … (the Streamlit app treated such a first value as a header and lost it).
export function parseCSV(text) {
  const parsed = Papa.parse(text.trim(), { skipEmptyLines: 'greedy' })
  const data = parsed.data.filter((r) => r.some((c) => String(c).trim() !== ''))
  if (!data.length) throw new Error('The file is empty.')
  const width = Math.max(...data.map((r) => r.length))
  const first = data[0]
  const hasHeader = !first.every((c) => isNumber(c))
  const columns = hasHeader
    ? Array.from({ length: width }, (_, i) => String(first[i] ?? '').trim() || `Column ${i + 1}`)
    : Array.from({ length: width }, (_, i) => `Column ${i + 1}`)
  const rows = (hasHeader ? data.slice(1) : data).map((r) => Array.from({ length: width }, (_, i) => r[i] ?? ''))
  return { columns, rows, hasHeader }
}

export function isNumber(v) {
  const s = String(v).trim()
  return s !== '' && Number.isFinite(Number(s))
}

export function toNumber(v) {
  return isNumber(v) ? Number(String(v).trim()) : null
}

// Columns where at least 80% of values are numbers (same rule as the Streamlit app).
export function numericColumns(table) {
  return table.columns
    .map((name, i) => ({ name, i }))
    .filter(({ i }) => {
      const vals = table.rows.map((r) => r[i]).filter((v) => String(v).trim() !== '')
      return vals.length > 0 && vals.filter(isNumber).length / table.rows.length >= 0.8
    })
}

// Prefer a numeric column that does not look like a year, date or ID.
export function defaultValueColumn(numCols) {
  const skip = ['year', 'yr', 'date', 'time', 'id', 'station']
  const hit = numCols.find((c) => !skip.some((s) => c.name.toLowerCase().includes(s)))
  return (hit ?? numCols[0])?.i
}

// A column that looks like dates or years, for daily data.
export function defaultDateColumn(table, exclude) {
  const named = table.columns.findIndex((c, i) => i !== exclude && /date|time|year|day/i.test(c))
  if (named >= 0) return named
  const byContent = table.columns.findIndex((_, i) => i !== exclude && yearOf(table.rows[0]?.[i]) != null)
  return byContent >= 0 ? byContent : table.columns.findIndex((_, i) => i !== exclude)
}

// Year of a date value: a 4-digit year (1000–2999) anywhere in the text, e.g. 2021-08-29, 8/29/2021, 2021.
export function yearOf(v) {
  const m = String(v ?? '').match(/(?:^|\D)([12]\d{3})(?!\d)/)
  return m ? Number(m[1]) : null
}

// Annual maximum series from (date, value) rows.
export function annualMaxima(table, dateCol, valueCol) {
  const byYear = new Map()
  let skipped = 0
  for (const r of table.rows) {
    const y = yearOf(r[dateCol])
    const v = toNumber(r[valueCol])
    if (y == null || v == null) { skipped++; continue }
    if (!byYear.has(y) || v > byYear.get(y)) byYear.set(y, v)
  }
  const years = [...byYear.keys()].sort((a, b) => a - b)
  return { years, values: years.map((y) => byYear.get(y)), skipped }
}
