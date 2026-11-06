// Shared number / date formatting (Malaysia) and CSV export.

const LOCALE = 'en-MY'

export const money = (n) =>
  'RM ' + Number(n || 0).toLocaleString(LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const num = (n, d = 1) => Number(n || 0).toLocaleString(LOCALE, { maximumFractionDigits: d })

/** '2026-11-06' → '6 Nov 2026' */
export const day = (d) =>
  d ? new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(d + 'T00:00:00')) : '—'

/** Today's date in the browser's time zone, as YYYY-MM-DD. */
export const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10)
export const thisMonth = () => today().slice(0, 7)

/** '2026-11' → 'Nov 2026' */
export const monthLabel = (m) =>
  new Intl.DateTimeFormat(LOCALE, { month: 'short', year: 'numeric' }).format(new Date(m + '-01T00:00:00'))

export const sum = (rows, key = 'amount') => rows.reduce((s, r) => s + Number(r[key] || 0), 0)

/**
 * Download rows as a CSV file (UTF-8 with BOM so Excel opens it directly).
 * `columns`: [{ header, value(row) }]
 */
export function downloadCsv(filename, columns, rows) {
  const cell = (v) => {
    const s = v == null ? '' : String(v)
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [columns.map((c) => cell(c.header)).join(',')]
  for (const r of rows) lines.push(columns.map((c) => cell(c.value(r))).join(','))
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
