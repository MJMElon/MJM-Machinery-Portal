// Receipt scanning in the browser (no server): Tesseract.js is loaded from a CDN
// the first time it is needed, the photo is read, and a few fields are picked
// out of the text with simple rules for Malaysian fuel receipts. The result is
// a DRAFT the person checks and corrects before saving.

const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js'
const PDFJS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'
const PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'

function loadScript(src, ready) {
  if (ready()) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = src
    s.async = true
    s.onload = () => (ready() ? resolve() : reject(new Error('Script did not load: ' + src)))
    s.onerror = () => reject(new Error('Could not load the reader (no internet?).'))
    document.head.appendChild(s)
  })
}

let pdfLoading = null
async function loadPdfJs() {
  if (!pdfLoading) pdfLoading = loadScript(PDFJS_URL, () => Boolean(window.pdfjsLib)).then(() => {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER
    return window.pdfjsLib
  })
  return pdfLoading
}

/**
 * A PDF receipt: use its own text when it has one (e-receipts from the fuel
 * apps do), otherwise draw the first page and read it like a photo.
 * Returns { text, canvas } — canvas only when the text layer was empty.
 */
async function pdfToTextOrCanvas(file) {
  const pdfjs = await loadPdfJs()
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
  const page = await doc.getPage(1)
  const content = await page.getTextContent()
  // Group text items into lines by their vertical position
  const rows = new Map()
  for (const it of content.items) {
    if (!it.str || !it.str.trim()) continue
    const y = Math.round(it.transform[5] / 3)
    if (!rows.has(y)) rows.set(y, [])
    rows.get(y).push({ x: it.transform[4], s: it.str })
  }
  const text = [...rows.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([, items]) => items.sort((a, b) => a.x - b.x).map((i) => i.s).join(' '))
    .join('\n')
  if (text.replace(/\s/g, '').length >= 20) return { text }
  const viewport = page.getViewport({ scale: 2 })
  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise
  return { text: '', canvas }
}

let loading = null
function loadTesseract() {
  if (!loading) loading = loadScript(TESSERACT_URL, () => Boolean(window.Tesseract)).then(() => window.Tesseract)
  return loading
}

let worker = null
async function getWorker() {
  const T = await loadTesseract()
  if (!worker) worker = await T.createWorker('eng')
  return worker
}

// Receipts photographed on a phone read much better after a clean-up:
// upscale small shots, drop colour, stretch the contrast.
async function prepare(file) {
  const bmp = await createImageBitmap(file)
  const scale = Math.min(2.5, Math.max(1, 1800 / Math.max(bmp.width, bmp.height)))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bmp.width * scale)
  canvas.height = Math.round(bmp.height * scale)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height)
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const d = img.data
  let min = 255
  let max = 0
  for (let i = 0; i < d.length; i += 4) {
    const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
    d[i] = d[i + 1] = d[i + 2] = g
    if (g < min) min = g
    if (g > max) max = g
  }
  const range = Math.max(1, max - min)
  for (let i = 0; i < d.length; i += 4) {
    const g = ((d[i] - min) / range) * 255
    d[i] = d[i + 1] = d[i + 2] = g
  }
  ctx.putImageData(img, 0, 0)
  return canvas
}

/** Reads the text from a receipt photo or PDF. Throws on failure. */
export async function readReceiptText(file) {
  if (!file) return ''
  let source = file
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '')) {
    const r = await pdfToTextOrCanvas(file)
    if (r.text) return r.text
    source = r.canvas
  } else if (!file.type.startsWith('image/')) {
    return ''
  } else {
    try {
      source = await prepare(file)
    } catch {
      // e.g. HEIC the browser cannot decode: let Tesseract try the raw file
    }
  }
  const w = await getWorker()
  const { data } = await w.recognize(source)
  return data?.text || ''
}

const num = (s) => Number(String(s).replace(/,/g, ''))

/**
 * Picks date, litres, unit price, amount, receipt no. and station out of
 * receipt text. Anything it is not sure about is left empty.
 */
export function parseReceipt(text) {
  const t = (text || '').replace(/\r/g, '')
  const lines = t.split('\n').map((l) => l.trim()).filter(Boolean)
  const out = {}

  // Date. Prefer a line labelled DATE / TARIKH / TKH; accept 09/11/2026,
  // 09-11-26, 09.11.2026, 2026-11-09, 09 Nov 2026, 9-NOV-26. OCR often reads
  // 0 as O and 1 as I/l in numbers, so normalise those first.
  const fix = (x) => x.replace(/[Oo]/g, '0').replace(/[Il|]/g, '1')
  const MON = { JAN: 1, FEB: 2, MAC: 3, MAR: 3, APR: 4, MAY: 5, MEI: 5, JUN: 6, JUL: 7, AUG: 8, OGO: 8, SEP: 9, OCT: 10, OKT: 10, NOV: 11, DEC: 12, DIS: 12 }
  const toIso = (y, m, d) => {
    y = String(y).length === 2 ? `20${y}` : String(y)
    m = Number(m)
    d = Number(d)
    if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31 && Number(y) >= 2015 && Number(y) <= 2100)) return null
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  }
  const findDate = (src) => {
    const a = fix(src).match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})\b/)
    if (a) return toIso(a[3], a[2], a[1])
    const b = fix(src).match(/\b(20\d{2})[/.-](\d{1,2})[/.-](\d{1,2})\b/)
    if (b) return toIso(b[1], b[2], b[3])
    const c = src.match(/\b(\d{1,2})[ \t/-]*([A-Za-z]{3})[A-Za-z]*[ \t/,-]*(\d{4}|\d{2})\b/)
    if (c && MON[c[2].toUpperCase()]) return toIso(c[3], MON[c[2].toUpperCase()], c[1])
    return null
  }
  const dateLine = lines.find((l) => /\b(DATE|TARIKH|TKH|DT)\b/i.test(l))
  out.fill_date = (dateLine && findDate(dateLine)) || findDate(t) || undefined
  if (!out.fill_date) delete out.fill_date

  // Litres: "12.345 L", "LITRE 45.67", "45.67 LTR", "QTY 40.12"
  const lit =
    t.match(/(\d{1,3}(?:[.,]\d{1,3})?)[ \t]*(?:L|LTR|LTRS|LITRE|LITRES|LITER)\b/i) ||
    t.match(/(?:LITRE|LITRES|LITER|LTR|QTY|VOLUME|VOL)[ \t]*[:=]?[ \t]*(\d{1,3}(?:[.,]\d{1,3})?)/i)
  if (lit && num(lit[1]) > 0 && num(lit[1]) < 2000) out.litres = num(lit[1])

  // Unit price: "RM 2.15 /L", "PRICE 3.350", "@ 2.05"
  const up =
    t.match(/(\d\.\d{2,3})\s*(?:\/|PER)\s*L/i) ||
    t.match(/(?:UNIT\s*PRICE|PRICE|@|RATE)\s*[:=]?\s*(?:RM)?\s*(\d\.\d{2,3})/i)
  if (up && num(up[1]) >= 1 && num(up[1]) <= 10) out.unit_price = num(up[1])

  // Amount: the "TOTAL" line, else the largest RM amount
  const totalLine = lines.find((l) => /TOTAL|AMOUNT|JUMLAH/i.test(l) && /\d/.test(l) && !/SUB\s*TOTAL/i.test(l))
  const fromTotal = totalLine && totalLine.match(/(\d{1,5}(?:,\d{3})*\.\d{2})/g)
  if (fromTotal) out.amount = num(fromTotal[fromTotal.length - 1])
  else {
    const amounts = [...t.matchAll(/RM\s*(\d{1,5}(?:,\d{3})*\.\d{2})/gi)].map((m) => num(m[1]))
    if (amounts.length) out.amount = Math.max(...amounts)
  }
  // If we have litres and unit price but no amount (or vice versa), fill the gap
  if (out.litres && out.unit_price && !out.amount) out.amount = Math.round(out.litres * out.unit_price * 100) / 100
  if (out.litres && out.amount && !out.unit_price) out.unit_price = Math.round((out.amount / out.litres) * 1000) / 1000

  // Receipt / invoice / document number: a labelled line ("Receipt No",
  // "Resit No", "Invoice No", "Doc No", "Trans No", "Ref No", "Bil No"); the
  // value may sit on the same line or on the next one. Dates, times, amounts
  // and phone / registration numbers are never taken.
  const bad = (v) =>
    /^\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}$/.test(v) || /^\d{1,2}:\d{2}/.test(v) || /^\d{1,5}[.,]\d{2}$/.test(v) ||
    /^(NO|NUM|NUMBER|RM|TEL|GST|SST)$/i.test(v) || /^0[1-9]\d{7,9}$/.test(v)
  const LABEL = /\b(?:RECEIPT|RCPT|RESIT|INVOICE|INV|BIL|BILL|DOC(?:UMENT)?|TRANS(?:ACTION)?|TXN|REF(?:ERENCE)?|TICKET|SLIP|CHIT)\b\s*(?:NO|NUM|NUMBER|#|ID)?\s*[:.#-]?\s*/i
  let rn
  for (let i = 0; i < lines.length && !rn; i++) {
    const m = lines[i].match(LABEL)
    if (!m) continue
    const rest = lines[i].slice(m.index + m[0].length).trim()
    const cand = [rest, lines[i + 1] || ''].map((x) => (x.match(/[A-Z0-9][A-Z0-9/-]{3,24}/i) || [])[0]).filter(Boolean)
    rn = cand.find((v) => !bad(v))
  }
  if (!rn) {
    const m = t.match(/\b(?:NO|NUM)\s*[:.#]?\s*([A-Z]{0,4}\d{6,16})\b/i)
    if (m && !bad(m[1])) rn = m[1]
  }
  if (rn) out.receipt_no = rn

  // Station brand
  const brand = t.match(/\b(PETRONAS|SHELL|PETRON|CALTEX|BHP|CHEVRON|ESSO)\b/i)
  if (brand) out.station = brand[1][0].toUpperCase() + brand[1].slice(1).toLowerCase()

  // Fuel product → Description
  if (/\bDIESEL|DYNAMIC\s*DIESEL|EURO\s*5|FUELSAVE\s*DIESEL|B10|B20/i.test(t)) out.product = 'Diesel'
  else if (/PRIMAX|V-?POWER|RON\s*9[57]|BLAZE\s*9[57]|FUELSAVE\s*95|PETROL/i.test(t)) out.product = 'Petrol'

  // Payment: subsidised diesel goes through the fleet card (KPDN / SKDS)
  if (/FLEET\s*CARD|FLEETCARD|SUBSID|KPDN|SKDS|DIESEL\s*SUBSIDI|KAD\s*FLEET/i.test(t)) out.payment = 'fleet_card'
  else if (/\bCASH\b|TUNAI/i.test(t)) out.payment = 'cash'

  return out
}

/** Scan one receipt file → draft line fields; `_text` is what was read, `_error` why it failed. */
export async function scanReceipt(file) {
  try {
    const text = await readReceiptText(file)
    const draft = parseReceipt(text)
    console.info('[receipt scan]', file.name, draft, text)
    return { ...draft, _text: text }
  } catch (e) {
    console.error('[receipt scan] failed', file?.name, e)
    return { _error: e?.message || 'Scan failed' }
  }
}
