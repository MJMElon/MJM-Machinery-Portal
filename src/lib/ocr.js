// Receipt scanning in the browser (no server): Tesseract.js is loaded from a CDN
// the first time it is needed, the photo is read, and a few fields are picked
// out of the text with simple rules for Malaysian fuel receipts. The result is
// a DRAFT the person checks and corrects before saving.

const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js'

let loading = null
function loadTesseract() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract)
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const s = document.createElement('script')
      s.src = TESSERACT_URL
      s.async = true
      s.onload = () => (window.Tesseract ? resolve(window.Tesseract) : reject(new Error('Tesseract did not load')))
      s.onerror = () => reject(new Error('Could not load the scanner (no internet?).'))
      document.head.appendChild(s)
    })
  }
  return loading
}

let worker = null
async function getWorker() {
  const T = await loadTesseract()
  if (!worker) worker = await T.createWorker('eng')
  return worker
}

/** Reads the text from a receipt image (PDFs are skipped). Returns '' on failure. */
export async function readReceiptText(file) {
  if (!file || !file.type.startsWith('image/')) return ''
  const w = await getWorker()
  const { data } = await w.recognize(file)
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

  // Date: dd/mm/yyyy, dd-mm-yy, yyyy-mm-dd
  const d1 = t.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})\b/)
  const d2 = t.match(/\b(20\d{2})[/.-](\d{1,2})[/.-](\d{1,2})\b/)
  if (d2) out.fill_date = `${d2[1]}-${d2[2].padStart(2, '0')}-${d2[3].padStart(2, '0')}`
  else if (d1) {
    const y = d1[3].length === 2 ? `20${d1[3]}` : d1[3]
    out.fill_date = `${y}-${d1[2].padStart(2, '0')}-${d1[1].padStart(2, '0')}`
  }

  // Litres: "12.345 L", "LITRE 45.67", "45.67 LTR", "QTY 40.12"
  const lit =
    t.match(/(\d{1,3}(?:[.,]\d{1,3})?)\s*(?:L|LTR|LTRS|LITRE|LITRES|LITER)\b/i) ||
    t.match(/(?:LITRE|LITRES|LITER|LTR|QTY|VOLUME|VOL)\s*[:=]?\s*(\d{1,3}(?:[.,]\d{1,3})?)/i)
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

  // Receipt / invoice number
  const rn = t.match(/(?:RECEIPT|RCPT|INVOICE|INV|BILL|TRANS(?:ACTION)?|REF)\s*(?:NO|NUM|#)?\s*[:.#]?\s*([A-Z0-9-]{4,20})/i)
  if (rn) out.receipt_no = rn[1]

  // Station brand
  const brand = t.match(/\b(PETRONAS|SHELL|PETRON|CALTEX|BHP|CHEVRON|ESSO)\b/i)
  if (brand) out.station = brand[1][0].toUpperCase() + brand[1].slice(1).toLowerCase()

  // Fuel product (for the remark)
  const prod = t.match(/\b(DIESEL|EURO\s*5|PRIMAX\s*9[57]|V-?POWER|RON\s*9[57]|DYNAMIC\s*DIESEL|BLAZE\s*9[57]|FUELSAVE)\b/i)
  if (prod) out.remark = prod[1].toUpperCase()

  return out
}

/** Scan one receipt file → draft line fields (empty object if nothing readable). */
export async function scanReceipt(file) {
  try {
    const text = await readReceiptText(file)
    return { ...parseReceipt(text), _text: text }
  } catch (e) {
    return { _error: e.message || 'Scan failed' }
  }
}
