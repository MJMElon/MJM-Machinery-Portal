// Fleet card statement rows (Setel or another station portal) → the shape
// the database import takes:
//   { txn_id, card_no, date 'YYYY-MM-DD', time 'HH:MM' | '', litres, amount,
//     station, product, vehicle, driver, receipt_no, company }
// Used by the fleet-card-import Edge Function (the AI agent) and by the
// statement upload in Fleet Card Manage, so both read files the same way.
// Plain JavaScript (no Deno or browser APIs) so both can import it.

// Column names we accept, lower-case with spaces/punctuation removed.
const ALIASES = {
  txn_id: ['txnid', 'transactionid', 'transactionno', 'transactionnumber', 'transactionref', 'txnno', 'txnref', 'reference', 'referenceno', 'refno', 'ref', 'id', 'trxid', 'trxno', 'invoiceno'],
  card_no: ['cardno', 'cardnumber', 'card', 'fleetcard', 'fleetcardno', 'fleetcardnumber', 'cardnum', 'maskedcardno', 'maskedcardnumber', 'pan'],
  datetime: ['datetime', 'transactiondatetime', 'transactiondate&time', 'transactiontime&date', 'timestamp', 'createdat', 'datetimemyt'],
  date: ['date', 'transactiondate', 'txndate', 'trxdate', 'filldate', 'purchasedate'],
  time: ['time', 'transactiontime', 'txntime', 'trxtime'],
  litres: ['litres', 'litre', 'liters', 'liter', 'volume', 'volumel', 'volumelitre', 'volumelitres', 'quantity', 'qty', 'qtyl', 'litresl', 'l'],
  amount: ['amount', 'amountrm', 'totalamount', 'totalamountrm', 'total', 'totalrm', 'rm', 'value', 'netamount', 'transactionamount', 'amountmyr'],
  station: ['station', 'stationname', 'site', 'sitename', 'merchant', 'merchantname', 'location', 'outlet', 'outletname', 'retailer'],
  product: ['product', 'productname', 'fuel', 'fueltype', 'fuelgrade', 'grade', 'item'],
  vehicle: ['vehicle', 'vehicleno', 'vehiclenumber', 'vehicleplate', 'plate', 'plateno', 'platenumber', 'regno', 'registrationno', 'carplate'],
  driver: ['driver', 'drivername', 'cardholder', 'cardholdername', 'user', 'username'],
  receipt_no: ['receiptno', 'receiptnumber', 'receipt', 'invoice', 'invoicenumber', 'billno'],
  company: ['company', 'companycode']
}
const KEY_OF = new Map(Object.entries(ALIASES).flatMap(([k, names]) => names.map((n) => [n, k])))
const squash = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9&]/g, '')

/** CSV / TSV / semicolon text → array of objects keyed by the header row. */
export function parseCsv(text) {
  const src = String(text ?? '').replace(/^﻿/, '')
  const first = src.split(/\r?\n/).find((l) => l.trim()) || ''
  const counts = { ',': 0, ';': 0, '\t': 0 }
  let q = false
  for (const ch of first) {
    if (ch === '"') q = !q
    else if (!q && ch in counts) counts[ch]++
  }
  const sep = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]
  const rows = []
  let row = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"'
        i++
      } else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === sep) {
      row.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++
      row.push(cell)
      cell = ''
      if (row.some((c) => c.trim() !== '')) rows.push(row)
      row = []
    } else cell += ch
  }
  row.push(cell)
  if (row.some((c) => c.trim() !== '')) rows.push(row)
  // the header is the first row that names a card and an amount (statements often start with a title block)
  const h = rows.findIndex((r) => {
    const keys = new Set(r.map((c) => KEY_OF.get(squash(c))))
    return keys.has('card_no') && keys.has('amount')
  })
  if (h < 0) return []
  const head = rows[h].map((c) => c.trim())
  return rows.slice(h + 1).map((r) => Object.fromEntries(head.map((name, i) => [name, (r[i] ?? '').trim()])))
}

const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 }
const pad = (n) => String(n).padStart(2, '0')
const okDate = (y, m, d) => y >= 2000 && y < 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31

/** A date (and maybe time) in any common statement form → { date, time } in Malaysia time. */
export function parseWhen(value, timeValue) {
  let s = String(value ?? '').trim()
  let date = ''
  let time = ''
  if (!s) return { date, time }
  // ISO with a zone ("2026-11-10T00:15:00Z", "+08:00"): convert to Malaysia time
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/i.test(s)) {
    const t = new Date(s)
    if (!Number.isNaN(t.getTime())) {
      const my = new Date(t.getTime() + 8 * 3600 * 1000)
      return { date: my.toISOString().slice(0, 10), time: my.toISOString().slice(11, 16) }
    }
  }
  s = s.replace('T', ' ')
  let m
  if ((m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/))) {
    if (okDate(+m[1], +m[2], +m[3])) date = `${m[1]}-${pad(m[2])}-${pad(m[3])}`
  } else if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/))) {
    // Malaysian statements write day first: 10/11/2026 = 10 November 2026
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3]
    if (okDate(y, +m[2], +m[1])) date = `${y}-${pad(m[2])}-${pad(m[1])}`
  } else if ((m = s.match(/^(\d{1,2})[-\s]([A-Za-z]{3,9})[-\s,]+(\d{2,4})/))) {
    const mo = MON[m[2].toLowerCase().slice(0, 4)] || MON[m[2].toLowerCase().slice(0, 3)]
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3]
    if (mo && okDate(y, mo, +m[1])) date = `${y}-${pad(mo)}-${pad(m[1])}`
  } else if ((m = s.match(/^([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})/))) {
    const mo = MON[m[1].toLowerCase().slice(0, 4)] || MON[m[1].toLowerCase().slice(0, 3)]
    if (mo && okDate(+m[3], mo, +m[2])) date = `${m[3]}-${pad(mo)}-${pad(m[2])}`
  }
  const t = parseTime(timeValue) || parseTime(s.replace(/^\S+\s*/, '').replace(/^[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4}\s*/, ''))
  time = t || ''
  return { date, time }
}

function parseTime(value) {
  const m = String(value ?? '').trim().match(/(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?\s*([AaPp][Mm])?/)
  if (!m) return ''
  let h = +m[1]
  const ap = (m[3] || '').toLowerCase()
  if (ap === 'pm' && h < 12) h += 12
  if (ap === 'am' && h === 12) h = 0
  if (h > 23 || +m[2] > 59) return ''
  return `${pad(h)}:${m[2]}`
}

/** "RM 1,234.50", "1.234,50", "(12.00)" → number; '' → null. */
export function parseNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  let s = String(value ?? '').trim()
  if (!s) return null
  s = s.replace(/[^0-9.,-]/g, '')
  if (/,\d{1,2}$/.test(s) && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.') // 1.234,50
  else if (/^\d+,\d{1,3}$/.test(s) && !/,\d{3}$/.test(s)) s = s.replace(',', '.') // 12,5
  else s = s.replace(/,/g, '')
  const n = Number(s)
  return Number.isFinite(n) ? Math.abs(n) : null
}

/**
 * Rows from the agent (any keys) or from parseCsv → import rows.
 * Each result row also has `_row` (1-based) and `_problem` when it cannot be
 * imported (shown to the person before importing; the database checks again).
 */
export function normalizeRows(input, defaults = {}) {
  const list = Array.isArray(input) ? input : []
  return list.map((raw, i) => {
    const pick = {}
    for (const [k, v] of Object.entries(raw && typeof raw === 'object' ? raw : {})) {
      const key = KEY_OF.get(squash(k)) || (k in ALIASES ? k : null)
      if (key && (pick[key] === undefined || pick[key] === '')) pick[key] = v
    }
    const when = parseWhen(pick.datetime || pick.date, pick.time)
    const row = {
      txn_id: String(pick.txn_id ?? '').trim(),
      card_no: String(pick.card_no ?? '').trim(),
      date: when.date,
      time: when.time,
      litres: parseNumber(pick.litres),
      amount: parseNumber(pick.amount),
      station: String(pick.station ?? '').trim().slice(0, 120),
      product: String(pick.product ?? '').trim().slice(0, 60),
      vehicle: String(pick.vehicle ?? '').trim().slice(0, 40),
      driver: String(pick.driver ?? '').trim().slice(0, 120),
      receipt_no: String(pick.receipt_no ?? '').trim().slice(0, 60),
      company: String(pick.company ?? defaults.company ?? '').trim().slice(0, 40),
      _row: i + 1,
      _skip: '',
      _problem: ''
    }
    // No transaction id in the file: make one from the card, date, time and amounts,
    // so sending the same file again still adds nothing twice.
    if (!row.txn_id && row.card_no && row.date && row.amount != null)
      row.txn_id = `auto:${row.card_no.replace(/\s+/g, '')}|${row.date}|${row.time}|${row.amount.toFixed(2)}|${row.litres ?? ''}`
    // Non-fuel lines (car wash, shop) have no litres: skip them quietly
    if (row.litres == null || row.litres <= 0) row._skip = 'Not a fuel purchase (no litres)'
    else if (!row.card_no) row._problem = 'No card number'
    else if (!row.date) row._problem = 'No date'
    else if (row.amount == null) row._problem = 'No amount'
    return row
  })
}

/** Only what the database takes. */
export const importPayload = (rows) =>
  rows
    .filter((r) => !r._skip && !r._problem)
    .map(({ txn_id, card_no, date, time, litres, amount, station, product, vehicle, driver, receipt_no, company }) => ({
      txn_id, card_no, date, time, litres, amount, station, product, vehicle, driver, receipt_no, company
    }))
