// Receipt scanning in the browser (no server): Tesseract.js is loaded from a CDN
// the first time it is needed, the photo is read, and a few fields are picked
// out of the text with simple rules for Malaysian fuel receipts. The result is
// a DRAFT the person checks and corrects before saving.

const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js'
const PDFJS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'
const PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'

export function loadScript(src, ready) {
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
  // Group text items into lines by their vertical position. pdf.js often
  // hands one word over in several pieces (Setel: "9f66e18f-b104-…" comes
  // as "9", "f", "66"…), so pieces that touch are joined without a space;
  // a space goes in only where there is a visible gap.
  const rows = new Map()
  for (const it of content.items) {
    if (!it.str) continue
    const y = Math.round(it.transform[5] / 3)
    if (!rows.has(y)) rows.set(y, [])
    const size = Math.hypot(it.transform[0], it.transform[1]) || it.height || 10
    rows.get(y).push({ x: it.transform[4], w: it.width || 0, size, s: it.str })
  }
  const text = [...rows.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([, items]) => {
      items.sort((a, b) => a.x - b.x)
      let line = ''
      let end = null
      for (const i of items) {
        if (end != null && i.x - end > i.size * 0.2 && !/\s$/.test(line) && !/^\s/.test(i.s)) line += ' '
        line += i.s
        end = i.x + i.w
      }
      return line.replace(/\s+/g, ' ').trim()
    })
    .filter(Boolean)
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

// ---- pump / flow meter photo → litres ------------------------------------------
// Mechanical fuel meters (PIUSI K33 / K44 and the like) show the litres on
// white number wheels in a black window on a light face plate. The window is
// found first (a wide dark box with light around it), then only that strip is
// read. Reading the whole photo does not work: the digits are a small part of it.

/** Grey copy of an image, at most `max` px on the long side: { w, h, g: Uint8Array, scale }. */
function greyOf(source, max) {
  const sw = source.width
  const sh = source.height
  const scale = Math.min(1, max / Math.max(sw, sh))
  const w = Math.max(1, Math.round(sw * scale))
  const h = Math.max(1, Math.round(sh * scale))
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(source, 0, 0, w, h)
  const d = ctx.getImageData(0, 0, w, h).data
  const g = new Uint8Array(w * h)
  for (let i = 0, j = 0; i < d.length; i += 4, j++) g[j] = (d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8
  return { w, h, g, scale }
}

/** Otsu's threshold of a grey image (splits dark from light). */
function otsu(g) {
  const hist = new Array(256).fill(0)
  for (let i = 0; i < g.length; i++) hist[g[i]]++
  let sum = 0
  for (let i = 0; i < 256; i++) sum += i * hist[i]
  let sumB = 0
  let wB = 0
  let best = 0
  let t = 127
  for (let i = 0; i < 256; i++) {
    wB += hist[i]
    if (!wB) continue
    const wF = g.length - wB
    if (!wF) break
    sumB += i * hist[i]
    const mB = sumB / wB
    const mF = (sum - sumB) / wF
    const v = wB * wF * (mB - mF) * (mB - mF)
    if (v > best) {
      best = v
      t = i
    }
  }
  return t
}

/**
 * Candidate display windows in a photo: dark, wide boxes with light around
 * them, biggest first. Boxes are in the source image's own pixels.
 */
export function findMeterWindows(source) {
  const { w, h, g, scale } = greyOf(source, 480)
  const out = []
  const seen = new Set()
  // Two cuts between dark and light: photos in shade and in sun differ a lot.
  const t0 = otsu(g)
  for (const t of [t0, Math.round(t0 * 0.7)]) {
    const label = new Int32Array(w * h)
    const stack = []
    let next = 0
    for (let start = 0; start < w * h; start++) {
      if (g[start] >= t || label[start]) continue
      next++
      let x0 = w, x1 = 0, y0 = h, y1 = 0, area = 0
      stack.push(start)
      label[start] = next
      while (stack.length) {
        const p = stack.pop()
        const x = p % w
        const y = (p - x) / w
        area++
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
        if (x > 0 && !label[p - 1] && g[p - 1] < t) { label[p - 1] = next; stack.push(p - 1) }
        if (x < w - 1 && !label[p + 1] && g[p + 1] < t) { label[p + 1] = next; stack.push(p + 1) }
        if (y > 0 && !label[p - w] && g[p - w] < t) { label[p - w] = next; stack.push(p - w) }
        if (y < h - 1 && !label[p + w] && g[p + w] < t) { label[p + w] = next; stack.push(p + w) }
      }
      const bw = x1 - x0 + 1
      const bh = y1 - y0 + 1
      if (bw < w * 0.1 || bh < 8 || bw / bh < 1.8 || bw / bh > 9) continue
      // A close-up may cut the window off at the sides, never at the top or bottom.
      if (y0 <= 1 || y1 >= h - 2 || bh > h * 0.35) continue
      // Mostly dark, but not solid: the white digits are inside it.
      const fill = area / (bw * bh)
      if (fill < 0.15 || fill > 0.97) continue
      // Light above and below (the face plate).
      const m = Math.max(2, Math.round(bh * 0.2))
      let light = 0
      let n = 0
      for (let x = Math.max(0, x0 - m); x <= Math.min(w - 1, x1 + m); x++) {
        for (const y of [y0 - m, y1 + m]) if (y >= 0 && y < h) { n++; if (g[y * w + x] >= t) light++ }
      }
      if (!n || light / n < 0.7) continue
      const key = `${Math.round(x0 / 8)}-${Math.round(y0 / 8)}-${Math.round(bw / 8)}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ x: x0 / scale, y: y0 / scale, w: bw / scale, h: bh / scale, area: bw * bh })
    }
  }
  return out.sort((a, b) => b.area - a.area).slice(0, 4)
}

/**
 * One window cut out of the photo for reading: dark digits on white, about
 * `height` px tall.
 */
function windowCanvas(source, box, { height = 110 } = {}) {
  const x = box.x
  const w = box.w
  const scale = Math.min(6, height / box.h)
  const c = document.createElement('canvas')
  c.width = Math.round(w * scale)
  c.height = Math.round(box.h * scale)
  const ctx = c.getContext('2d', { willReadFrequently: true })
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, x, box.y, w, box.h, 0, 0, c.width, c.height)
  const img = ctx.getImageData(0, 0, c.width, c.height)
  const d = img.data
  const g = new Uint8Array(c.width * c.height)
  let min = 255
  let max = 0
  for (let i = 0, j = 0; i < d.length; i += 4, j++) {
    const v = (d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8
    g[j] = v
    if (v < min) min = v
    if (v > max) max = v
  }
  const range = Math.max(1, max - min)
  for (let i = 0, j = 0; i < d.length; i += 4, j++) {
    const v = 255 - ((g[j] - min) / range) * 255
    d[i] = d[i + 1] = d[i + 2] = v
  }
  ctx.putImageData(img, 0, 0)
  return c
}

/**
 * The number wheels of a window (as made by windowCanvas: dark digits on
 * light), redrawn alone on a clean white line: the frame, the tick marks, the
 * stripes and the model name are left out. Returns { canvas, count } or null
 * when there are not 3 to 5 digit shapes in a row.
 */
function digitLine(win, deep = false) {
  const w = win.width
  const h = win.height
  const ctx = win.getContext('2d', { willReadFrequently: true })
  const d = ctx.getImageData(0, 0, w, h).data
  const g = new Uint8Array(w * h)
  for (let i = 0, j = 0; i < d.length; i += 4, j++) g[j] = d[i]
  // The cut between digit and background. `deep` cuts a second time inside the
  // dark part, for wheels that are themselves grey (digit < wheel < surround).
  let t = otsu(g)
  if (deep) t = otsu(g.filter((v) => v < t))
  const label = new Int32Array(w * h)
  const stack = []
  const blobs = []
  let next = 0
  for (let start = 0; start < w * h; start++) {
    if (g[start] >= t || label[start]) continue
    next++
    let x0 = w, x1 = 0, y0 = h, y1 = 0
    const pix = []
    stack.push(start)
    label[start] = next
    while (stack.length) {
      const p = stack.pop()
      const x = p % w
      const y = (p - x) / w
      pix.push(p)
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
      if (x > 0 && !label[p - 1] && g[p - 1] < t) { label[p - 1] = next; stack.push(p - 1) }
      if (x < w - 1 && !label[p + 1] && g[p + 1] < t) { label[p + 1] = next; stack.push(p + 1) }
      if (y > 0 && !label[p - w] && g[p - w] < t) { label[p - w] = next; stack.push(p - w) }
      if (y < h - 1 && !label[p + w] && g[p + w] < t) { label[p + w] = next; stack.push(p + w) }
    }
    const bw = x1 - x0 + 1
    const bh = y1 - y0 + 1
    // A digit: tall, not wider than tall, clear of the window's edge.
    if (bh < h * 0.35 || bh > h * 0.92 || bw > bh * 1.1 || bw < bh * 0.12) continue
    if (x0 <= 1 || y0 <= 1 || x1 >= w - 2 || y1 >= h - 2) continue
    blobs.push({ x0, x1, y0, y1, bw, bh, pix })
  }
  if (blobs.length < 3) return null
  // Keep the shapes that sit on one line and are about as tall as each other.
  const hs = blobs.map((b) => b.bh).sort((a, b) => a - b)
  const mh = hs[hs.length >> 1]
  const cs = blobs.map((b) => (b.y0 + b.y1) / 2).sort((a, b) => a - b)
  const mc = cs[cs.length >> 1]
  const row = blobs.filter((b) => b.bh > mh * 0.75 && b.bh < mh * 1.3 && Math.abs((b.y0 + b.y1) / 2 - mc) < mh * 0.3).sort((a, b) => a.x0 - b.x0)
  if (row.length < 3 || row.length > 5) return null
  const gap = Math.round(mh * 0.25)
  const pad = Math.round(mh * 0.5)
  const c = document.createElement('canvas')
  c.width = pad * 2 + row.reduce((n, b) => n + b.bw, 0) + gap * (row.length - 1)
  c.height = pad * 2 + Math.max(...row.map((b) => b.bh))
  const o = c.getContext('2d')
  o.fillStyle = '#fff'
  o.fillRect(0, 0, c.width, c.height)
  const img = o.getImageData(0, 0, c.width, c.height)
  let x = pad
  for (const b of row) {
    for (const p of b.pix) {
      const px = (p % w) - b.x0 + x
      const py = Math.floor(p / w) - b.y0 + pad
      const k = (py * c.width + px) * 4
      img.data[k] = img.data[k + 1] = img.data[k + 2] = 0
    }
    x += b.bw + gap
  }
  o.putImageData(img, 0, 0)
  return { canvas: c, count: row.length }
}

/** Only the digits of what was read. */
const digitsOf = (text) => String(text || '').replace(/\D/g, '')

// A window is cut out at two sizes; each must show the same number of wheels
// and read to the same digits, one digit per wheel. Anything else: not sure.
const WINDOW_SIZES = [110, 150]

/** Litres on a meter photo, given `recognize(canvas) → text`. Null when not sure. */
export async function readMeterWith(source, recognize) {
  for (const box of findMeterWindows(source)) {
    for (const deep of [false, true]) {
      const reads = []
      for (const height of WINDOW_SIZES) {
        const line = digitLine(windowCanvas(source, box, { height }), deep)
        if (!line) break
        const raw = digitsOf(await recognize(line.canvas))
        if (raw.length !== line.count) break
        reads.push(raw)
      }
      if (reads.length === WINDOW_SIZES.length && reads.every((r) => r === reads[0]) && Number(reads[0]) > 0) return Number(reads[0])
    }
  }
  return null
}

// A second reader that only knows digits and takes each window as one word.
let digitWorker = null
async function getDigitWorker() {
  const T = await loadTesseract()
  if (!digitWorker) {
    digitWorker = await T.createWorker('eng')
    await digitWorker.setParameters({ tessedit_char_whitelist: '0123456789', tessedit_pageseg_mode: '8' })
  }
  return digitWorker
}

/** Version of the meter reader, shown small on the phone form so a stale copy of the app can be told apart. */
export const METER_READER_VERSION = 3

/** Reads the litres shown on a meter photo. Returns { litres } (null when unsure) or { litres: null, error }. */
export async function readMeterPhoto(file) {
  try {
    const source = await createImageBitmap(file)
    const w = await getDigitWorker()
    const litres = await readMeterWith(source, async (canvas) => (await w.recognize(canvas)).data?.text || '')
    console.info('[meter scan]', litres)
    return { litres }
  } catch (e) {
    console.error('[meter scan] failed', e)
    return { litres: null, error: e?.message || 'Could not read the photo.' }
  }
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
  // Every candidate is tried in turn: a receipt id such as "…-4cce-…"
  // looks like "4 cce" but is not a date, and must not hide the real one.
  const findDate = (src) => {
    for (const a of fix(src).matchAll(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})\b/g)) {
      const d = toIso(a[3], a[2], a[1])
      if (d) return d
    }
    for (const b of fix(src).matchAll(/\b(20\d{2})[/.-](\d{1,2})[/.-](\d{1,2})\b/g)) {
      const d = toIso(b[1], b[2], b[3])
      if (d) return d
    }
    for (const c of src.matchAll(/\b(\d{1,2})[ \t/-]*([A-Za-z]{3})[A-Za-z]*[ \t/,-]*(\d{4}|\d{2})\b/g)) {
      const d = MON[c[2].toUpperCase()] && toIso(c[3], MON[c[2].toUpperCase()], c[1])
      if (d) return d
    }
    return null
  }
  // The value may be on the label's line or the next one (Setel: "Created on").
  const di = lines.findIndex((l) => /\b(DATE|TARIKH|TKH|DT|CREATED\s*ON)\b/i.test(l))
  out.fill_date = (di >= 0 && (findDate(lines[di]) || findDate(lines[di + 1] || ''))) || findDate(t) || undefined
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
  // Subsidised receipts (MySubsidy / KPDN) print the pump price but charge
  // less: the claim keeps the price actually paid.
  if (out.litres && out.amount && out.unit_price && Math.abs(out.litres * out.unit_price - out.amount) > 0.05)
    out.unit_price = Math.round((out.amount / out.litres) * 1000) / 1000

  // Receipt number = the TAX INVOICE number. Search in order of preference:
  // 1. a line with "Tax Invoice" (number on the same line or the next lines),
  // 2. "Invoice No" / "Inv No",
  // 3. "Receipt / Resit / Doc / Trans / Ref / Bil / Slip No".
  // The value must contain a digit; dates, times, amounts, phone numbers,
  // GST/SST ids and vehicle registrations are never taken.
  const bad = (v) =>
    !/\d/.test(v) || /^\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}$/.test(v) || /^\d{1,2}:\d{2}/.test(v) ||
    /^\d{1,5}[.,]\d{2}$/.test(v) || /^0[1-9]\d{7,9}$/.test(v) || /^[A-Z]{1,3}\d{1,4}[A-Z]?$/i.test(v) ||
    /^(RM|GST|SST|TEL|NO)\d*$/i.test(v)
  const TIERS = [
    /\bTAX\s*INV(?:OICE)?\b/i,
    /\bINV(?:OICE)?\b/i,
    /\b(?:RECEIPT|RCPT|RESIT|BIL|BILL|DOC(?:UMENT)?|TRANS(?:ACTION)?|TXN|REF(?:ERENCE)?|TICKET|SLIP|CHIT)\b/i
  ]
  const TAIL = /^\s*(?:NO|NUM|NUMBER|#|ID)?\s*[:.#-]?\s*/i
  const pick = (x) => {
    const found = x.match(/[A-Z0-9][A-Z0-9/-]{3,40}/gi) || []
    return found.find((v) => !bad(v))
  }
  // Within a tier a number on the label's own line wins over one on the
  // following lines (a bare "TAX INVOICE" title must not grab the next text).
  let rn
  for (const re of TIERS) {
    const hits = []
    lines.forEach((l, i) => {
      const m = l.match(re)
      if (m) hits.push([i, l.slice(m.index + m[0].length).replace(TAIL, '')])
    })
    for (const [, rest] of hits) if ((rn = pick(rest))) break
    for (const [i] of hits) if (!rn && (rn = pick(lines[i + 1] || '') || pick(lines[i + 2] || ''))) break
    if (rn) break
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
