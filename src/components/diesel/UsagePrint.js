import { printHtml } from '../../lib/printFrame.js'

// Reports printout: two tables, Jan – Dec of one year, one row per
// person (HQ vehicles: the claimant / driver) or per machine (estate):
//   1. fuel usage in litres   2. fuel expenses in RM
// and below them the average fuel price per litre (RM ÷ litres), per month
// and for the year. Printed in place (A4 portrait, no browser header/footer).

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const GREEN = '#14532d'
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const fmt = (v, d) => (v ? Number(v).toLocaleString('en-MY', { minimumFractionDigits: d, maximumFractionDigits: d }) : '–')

/**
 * rows: [{ name, litres: [12], amount: [12] }] (already sorted)
 * nameHeader: 'User' or 'Machine'; lines: heading lines under the title.
 */
export function usageTableHtml({ title, lines = [], nameHeader, rows, year }) {
  const sumCol = (key, i) => rows.reduce((t, r) => t + (r[key][i] || 0), 0)
  const total = (arr) => arr.reduce((t, v) => t + (v || 0), 0)
  const colL = MONTHS.map((_, i) => sumCol('litres', i))
  const colRM = MONTHS.map((_, i) => sumCol('amount', i))
  const allL = total(colL)
  const allRM = total(colRM)
  const avg = (rm, l) => (l > 0 ? rm / l : 0)

  const table = (caption, key, d, foot) => `
  <h2>${esc(caption)}</h2>
  <table class="t">
    <colgroup><col style="width:3.5%" /><col style="width:14%" />${MONTHS.map(() => '<col />').join('')}<col style="width:8.5%" /></colgroup>
    <thead><tr><th class="c">No.</th><th class="l">${esc(nameHeader)}</th>${MONTHS.map((m) => `<th>${m}</th>`).join('')}<th>Total</th></tr></thead>
    <tbody>
      ${
        rows.length
          ? rows
              .map(
                (r, n) =>
                  `<tr><td class="c">${n + 1}</td><td class="l">${esc(r.name)}</td>${r[key].map((v) => `<td>${fmt(v, d)}</td>`).join('')}<td class="b">${fmt(total(r[key]), d)}</td></tr>`
              )
              .join('')
          : `<tr><td colspan="15" class="c">No fuel usage for this selection.</td></tr>`
      }
    </tbody>
    <tfoot>${foot}</tfoot>
  </table>`

  const footL = `<tr class="sum"><td></td><td class="l">Total</td>${colL.map((v) => `<td>${fmt(v, 2)}</td>`).join('')}<td>${fmt(allL, 2)}</td></tr>`
  const footRM =
    `<tr class="sum"><td></td><td class="l">Total</td>${colRM.map((v) => `<td>${fmt(v, 2)}</td>`).join('')}<td>${fmt(allRM, 2)}</td></tr>` +
    `<tr class="avg"><td></td><td class="l">Average price (RM / L)</td>${MONTHS.map((_, i) => `<td>${fmt(avg(colRM[i], colL[i]), 3)}</td>`).join('')}<td>${fmt(avg(allRM, allL), 3)}</td></tr>`

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<title>${esc(title)} ${year}</title>
<style>
@page { size: A4 portrait; margin: 0; }
html, body { margin: 0; padding: 0; background: #fff; color: #111827; }
body { font: 8px/1.35 "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.page { width: 100%; border-collapse: collapse; }
.page > thead td, .page > tfoot td { height: 10mm; padding: 0; }
.page > tbody > tr > td { padding: 0 8mm; vertical-align: top; }
.head { padding-bottom: 6px; border-bottom: 2px solid ${GREEN}; margin-bottom: 4px; }
.head h1 { margin: 0; font-size: 15px; color: ${GREEN}; }
.head p { margin: 2px 0 0; color: #475569; }
h2 { font-size: 10.5px; margin: 12px 0 5px; color: ${GREEN}; }
.t { width: 100%; border-collapse: collapse; table-layout: fixed; }
.t th { background: ${GREEN}; color: #fff; font-weight: 600; padding: 4px 2px; text-align: right; }
.t td { padding: 3.5px 2px; border-bottom: 1px solid #e5e7eb; text-align: right; font-variant-numeric: tabular-nums; }
.t tbody tr:nth-child(even) td { background: #f6f8f7; }
.t .l { text-align: left; } .t .c { text-align: center; } .t .b { font-weight: 700; }
.t th.l { text-align: left; } .t th.c { text-align: center; }
.t tr.sum td { font-weight: 700; border-top: 1.5px solid ${GREEN}; background: #eef5f0; }
.t tr.avg td { font-weight: 600; color: #374151; background: #fff; }
tr { break-inside: avoid; }
.avgbox { margin-top: 10px; display: inline-block; border: 1.5px solid ${GREEN}; border-radius: 6px; padding: 6px 12px; font-size: 11px; }
.avgbox b { color: ${GREEN}; font-size: 14px; }
</style></head><body>
<table class="page"><thead><tr><td></td></tr></thead><tfoot><tr><td></td></tr></tfoot><tbody><tr><td>
  <div class="head"><h1>${esc(title)} · ${year}</h1>${lines.filter(Boolean).map((l) => `<p>${esc(l)}</p>`).join('')}</div>
  ${table('Fuel usage (litres)', 'litres', 2, footL)}
  ${table('Fuel expenses (RM)', 'amount', 2, footRM)}
  <div class="avgbox">Average fuel price per litre, ${year}: <b>RM ${fmt(avg(allRM, allL), 3)}</b> <span style="color:#6b7280">(${fmt(allRM, 2)} RM ÷ ${fmt(allL, 2)} L)</span></div>
</td></tr></tbody></table>
</body></html>`
}

export const printUsageTable = (opts) => printHtml(usageTableHtml(opts))

/**
 * Table view printout (A4 portrait): every receipt, grouped (fleet card / cash,
 * or machine type), with subtotals and the total. Then, when `receipts` is
 * given, every claimed receipt by date, one per page: the photo and under it
 * "Claimed by <name> on <date>".
 * groups: [{ title, rows: [{ type, date, who, vehicle, claimNo?, litres, amount, remark }] }]
 * Receipts with nothing attached are left out by the caller (no empty pages).
 * receipts: [{ url, pdf, date, who, vehicle, receipt, litres, amount, card, claimNo, claimedOn }]
 */
export function usageDetailHtml({ title, lines = [], hq, groups, receipts = [] }) {
  if (hq) return usageVehicleHtml({ title, lines, groups, receipts })
  const dd = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '')
  const sum = (rows, k) => rows.reduce((t, r) => t + (r[k] || 0), 0)
  const all = groups.flatMap((g) => g.rows)
  const span = hq ? 5 : 4
  const cols = hq ? 8 : 7
  // Type first and narrow; every other column the same width
  const even = `${(90 / (cols - 1)).toFixed(3)}%`
  const body = groups
    .map(
      (g) => `
    <tr class="grp"><td colspan="${cols}">${esc(g.title)} <span>· ${g.rows.length} receipt${g.rows.length === 1 ? '' : 's'}</span></td></tr>
    ${g.rows
      .map(
        (r) => `<tr><td>${esc(r.type || '')}</td><td>${esc(dd(r.date))}</td><td>${esc(r.who)}</td><td>${esc(r.vehicle)}${r.general ? ' <i>(general)</i>' : ''}</td>${hq ? `<td>${esc(r.claimNo || '–')}</td>` : ''}<td class="r">${fmt(r.litres, 2)}</td><td class="r">${fmt(r.amount, 2)}</td><td class="rm">${esc(r.remark || '')}</td></tr>`
      )
      .join('')}
    <tr class="sub"><td colspan="${span}" class="r">Subtotal</td><td class="r">${fmt(sum(g.rows, 'litres'), 2)}</td><td class="r">${fmt(sum(g.rows, 'amount'), 2)}</td><td></td></tr>`
    )
    .join('')
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<title>${esc(title)}</title>
<style>
@page { size: A4 portrait; margin: 0; }
html, body { margin: 0; padding: 0; background: #fff; color: #111827; }
body { font: 9px/1.4 "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.page { width: 100%; border-collapse: collapse; }
.page > thead td, .page > tfoot td { height: 10mm; padding: 0; }
.page > tbody > tr > td { padding: 0 9mm; vertical-align: top; }
.head { padding-bottom: 6px; border-bottom: 2px solid ${GREEN}; margin-bottom: 8px; }
.head h1 { margin: 0; font-size: 15px; color: ${GREEN}; }
.head p { margin: 2px 0 0; color: #475569; }
.t { width: 100%; border-collapse: collapse; table-layout: fixed; }
.t td { overflow-wrap: anywhere; }
.t th { background: ${GREEN}; color: #fff; font-weight: 600; padding: 4px; text-align: left; }
.t th.r, .t td.r { text-align: right; font-variant-numeric: tabular-nums; }
.t td { padding: 3.5px 4px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
.t td.rm { color: #374151; }
.t tr.grp td { background: #eef5f0; font-weight: 700; color: #14532d; padding-top: 5px; }
.t tr.grp span { font-weight: 500; color: #4b5563; }
.t tr.sub td { font-weight: 700; border-bottom: 1.5px solid #cbd5e1; }
.t tfoot td { font-weight: 700; background: #f1f5f9; border-top: 2px solid ${GREEN}; }
tr { break-inside: avoid; }
.rc { break-before: page; page-break-before: always; text-align: center; }
.rc .no { text-align: left; font-size: 10px; font-weight: 700; color: ${GREEN}; margin: 0 0 6px; }
.rc .no span { font-weight: 500; color: #6b7280; }
.rc img { display: block; margin: 0 auto; max-width: 100%; max-height: 228mm; object-fit: contain; border: 1px solid #e5e7eb; border-radius: 4px; }
.rc .nophoto { margin: 40mm auto; width: 70%; padding: 18px; border: 1.5px dashed #cbd5e1; border-radius: 8px; color: #6b7280; font-size: 11px; }
.rc .cap { margin: 8px auto 0; display: inline-block; text-align: left; border-top: 2px solid ${GREEN}; padding-top: 5px; font-size: 11px; }
.rc .cap b { color: ${GREEN}; }
.rc .cap p { margin: 2px 0 0; color: #374151; font-size: 10px; }
</style></head><body>
<table class="page"><thead><tr><td></td></tr></thead><tfoot><tr><td></td></tr></tfoot><tbody><tr><td>
  <div class="head"><h1>${esc(title)}</h1>${lines.filter(Boolean).map((l) => `<p>${esc(l)}</p>`).join('')}</div>
  <table class="t">
    <colgroup><col style="width:10%" />${Array.from({ length: cols - 1 }, () => `<col style="width:${even}" />`).join('')}</colgroup>
    <thead><tr><th>Type</th><th>Date</th><th>${hq ? 'Driver' : 'Machine'}</th><th>${hq ? 'Vehicle' : 'Location'}</th>${hq ? '<th>Claim no.</th>' : ''}<th class="r">Litres</th><th class="r">Amount (RM)</th><th>Remark</th></tr></thead>
    <tbody>${body || `<tr><td colspan="${cols}">No fuel usage for this selection.</td></tr>`}</tbody>
    <tfoot><tr><td colspan="${span}" class="r">Total · ${all.length} receipt${all.length === 1 ? '' : 's'}</td><td class="r">${fmt(sum(all, 'litres'), 2)}</td><td class="r">${fmt(sum(all, 'amount'), 2)}</td><td></td></tr></tfoot>
  </table>
  ${receipts
    .map(
      (r, i) => `<div class="rc">
    <p class="no">Receipt ${i + 1} of ${receipts.length} <span>· ${esc(dd(r.date))}${r.receipt ? ` · No. ${esc(r.receipt)}` : ''}</span></p>
    ${r.url ? `<img src="${esc(r.url)}" alt="Receipt ${i + 1}" />` : r.pdf ? `<div class="nophoto">This receipt is a PDF file: open it from the claim to see it.</div>` : ''}
    <div class="cap">
      Claimed by <b>${esc(r.who)}</b> on <b>${esc(dd(r.claimedOn))}</b>${r.claimNo ? ` · Claim ${esc(r.claimNo)}` : ''}
      <p>Filled ${esc(dd(r.date))} · ${esc(r.vehicle)} · ${fmt(r.litres, 2)} L · RM ${fmt(r.amount, 2)} · ${esc(r.card)}</p>
    </div>
  </div>`
    )
    .join('')}
</td></tr></tbody></table>
</body></html>`
}

export const printUsageDetail = (opts) => printHtml(usageDetailHtml(opts))

// HQ table view printout: per vehicle (reg no. once), a Fleet card section then
// a Cash claim section — receipt date, receipt no., litre, RM/L, total amount,
// remark (own remark, then company · claim no. · claimant) — with subtotals;
// then the claimed receipts, one per page (same as the other printout).
function usageVehicleHtml({ title, lines, groups, receipts }) {
  const dd = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '')
  const sum = (rows, k) => rows.reduce((t, r) => t + (r[k] || 0), 0)
  const perL = (l, a) => (l > 0 ? (a / l).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 3 }) : '–')
  const all = groups.flatMap((g) => g.rows)
  const cols = '<colgroup><col style="width:12%" /><col style="width:13%" /><col style="width:10%" /><col style="width:9%" /><col style="width:13%" /><col /></colgroup>'
  const head = '<tr class="h"><th>Receipt date</th><th>Receipt no.</th><th class="r">Litre</th><th class="r">RM/L</th><th class="r">Total amount (RM)</th><th>Remark</th></tr>'
  const body = groups
    .map(
      (g) => `${g.first ? `<h2>${esc(g.vehicle?.title || '')}${g.vehicle?.name ? ` <span>${esc(g.vehicle.name)}</span>` : ''}</h2>` : ''}
  <table class="t ${g.kind === 'cash' ? 'cash' : 'card'}">${cols}
    <thead><tr class="sec"><th colspan="6">${esc(g.title)} <span>· ${g.rows.length} receipt${g.rows.length === 1 ? '' : 's'}</span></th></tr>${head}</thead>
    <tbody>${g.rows
      .map(
        (r) =>
          `<tr><td>${esc(dd(r.date))}</td><td>${esc(r.receipt || '–')}</td><td class="r">${fmt(r.litres, 2)}</td><td class="r">${perL(r.litres, r.amount)}</td><td class="r b">${fmt(r.amount, 2)}</td><td>${r.billTo ? `<b>Bill to ${esc(r.billTo)}</b><br />` : ''}${r.remark ? `${esc(r.remark)}<br />` : ''}${r.from ? `<i>${esc(r.from)}</i>` : ''}</td></tr>`
      )
      .join('')}
    <tr class="sub"><td colspan="2" class="r">Subtotal</td><td class="r">${fmt(sum(g.rows, 'litres'), 2)}</td><td class="r">${perL(sum(g.rows, 'litres'), sum(g.rows, 'amount'))}</td><td class="r">${fmt(sum(g.rows, 'amount'), 2)}</td><td></td></tr></tbody>
  </table>`
    )
    .join('')
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<title>${esc(title)}</title>
<style>
@page { size: A4 portrait; margin: 0; }
html, body { margin: 0; padding: 0; background: #fff; color: #111827; }
body { font: 9px/1.4 "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.page { width: 100%; border-collapse: collapse; }
.page > thead td, .page > tfoot td { height: 10mm; padding: 0; }
.page > tbody > tr > td { padding: 0 9mm; vertical-align: top; }
.head { padding-bottom: 6px; border-bottom: 2px solid ${GREEN}; margin-bottom: 6px; }
.head h1 { margin: 0; font-size: 15px; color: ${GREEN}; }
.head p { margin: 2px 0 0; color: #475569; }
h2 { font-size: 12px; margin: 12px 0 4px; padding-bottom: 2px; border-bottom: 1.5px solid #111827; break-after: avoid; }
h2 span { font-size: 9px; font-weight: 500; color: #6b7280; }
.t { width: 100%; border-collapse: collapse; table-layout: fixed; margin-bottom: 6px; }
.t th, .t td { padding: 3px 4px; text-align: left; vertical-align: top; overflow-wrap: anywhere; }
.t tr.sec th { font-size: 10px; padding: 4px; }
.t tr.sec th span { font-weight: 500; color: #4b5563; }
.t.card tr.sec th { background: #e0f2fe; color: #0c4a6e; }
.t.cash tr.sec th { background: #fef3c7; color: #78350f; }
.t tr.h th { font-weight: 600; color: #475569; border-bottom: 1px solid #cbd5e1; }
.t td { border-bottom: 1px solid #e5e7eb; }
.t .r { text-align: right; font-variant-numeric: tabular-nums; }
.t .b { font-weight: 700; }
.t i { color: #6b7280; font-style: normal; }
.t tr.sub td { font-weight: 700; background: #f8fafc; border-bottom: 1.5px solid #cbd5e1; }
.tot { margin-top: 8px; padding: 5px 8px; background: #f1f5f9; border-top: 2px solid ${GREEN}; font-weight: 700; text-align: right; }
.tot span { margin-left: 18px; }
tr { break-inside: avoid; }
.rc { break-before: page; page-break-before: always; text-align: center; }
.rc .no { text-align: left; font-size: 10px; font-weight: 700; color: ${GREEN}; margin: 0 0 6px; }
.rc .no span { font-weight: 500; color: #6b7280; }
.rc img { display: block; margin: 0 auto; max-width: 100%; max-height: 228mm; object-fit: contain; border: 1px solid #e5e7eb; border-radius: 4px; }
.rc .nophoto { margin: 40mm auto; width: 70%; padding: 18px; border: 1.5px dashed #cbd5e1; border-radius: 8px; color: #6b7280; font-size: 11px; }
.rc .cap { margin: 8px auto 0; display: inline-block; text-align: left; border-top: 2px solid ${GREEN}; padding-top: 5px; font-size: 11px; }
.rc .cap b { color: ${GREEN}; }
.rc .cap p { margin: 2px 0 0; color: #374151; font-size: 10px; }
</style></head><body>
<table class="page"><thead><tr><td></td></tr></thead><tfoot><tr><td></td></tr></tfoot><tbody><tr><td>
  <div class="head"><h1>${esc(title)}</h1>${lines.filter(Boolean).map((l) => `<p>${esc(l)}</p>`).join('')}</div>
  ${body || '<p>No fuel usage for this selection.</p>'}
  <div class="tot">Total · ${all.length} receipt${all.length === 1 ? '' : 's'}<span>${fmt(sum(all, 'litres'), 2)} L</span><span>RM ${fmt(sum(all, 'amount'), 2)}</span></div>
  ${(() => {
    // Bill to other companies: per company and month (month-end billing)
    const m = new Map()
    for (const r of all) {
      if (!r.billTo) continue
      const co = m.get(r.billTo) || { name: r.billTo, months: new Map(), n: 0, litres: 0, amount: 0 }
      const ym = r.date.slice(0, 7)
      const mo = co.months.get(ym) || { ym, n: 0, litres: 0, amount: 0 }
      for (const t of [co, mo]) { t.n++; t.litres += r.litres; t.amount += r.amount }
      co.months.set(ym, mo)
      m.set(r.billTo, co)
    }
    const list = [...m.values()].sort((a, b) => a.name.localeCompare(b.name))
    if (!list.length) return ''
    const mn = (ym) => new Date(`${ym}-01T00:00:00`).toLocaleDateString('en-MY', { month: 'long', year: 'numeric' })
    const rows = list
      .map((c) => {
        const ms = [...c.months.values()].sort((a, b) => a.ym.localeCompare(b.ym))
        return (
          ms.map((mo, i) => `<tr><td>${i === 0 ? `<b>${esc(c.name)}</b>` : ''}</td><td>${esc(mn(mo.ym))}</td><td class="r">${mo.n}</td><td class="r">${fmt(mo.litres, 2)}</td><td class="r b">${fmt(mo.amount, 2)}</td></tr>`).join('') +
          (ms.length > 1 ? `<tr class="sub"><td colspan="2" class="r">${esc(c.name)} total</td><td class="r">${c.n}</td><td class="r">${fmt(c.litres, 2)}</td><td class="r">${fmt(c.amount, 2)}</td></tr>` : '')
        )
      })
      .join('')
    const g = list.reduce((t, c) => ({ n: t.n + c.n, litres: t.litres + c.litres, amount: t.amount + c.amount }), { n: 0, litres: 0, amount: 0 })
    return `<h2>Bill to other companies · by month</h2><table class="t"><colgroup><col /><col style="width:20%" /><col style="width:11%" /><col style="width:13%" /><col style="width:18%" /></colgroup>
    <thead><tr class="h"><th>Company</th><th>Month</th><th class="r">Receipts</th><th class="r">Litre</th><th class="r">Total amount (RM)</th></tr></thead>
    <tbody>${rows}<tr class="sub"><td colspan="2" class="r">All companies</td><td class="r">${g.n}</td><td class="r">${fmt(g.litres, 2)}</td><td class="r">${fmt(g.amount, 2)}</td></tr></tbody></table>`
  })()}
  ${receipts
    .map(
      (r, i) => `<div class="rc">
    <p class="no">Receipt ${i + 1} of ${receipts.length} <span>· ${esc(dd(r.date))}${r.receipt ? ` · No. ${esc(r.receipt)}` : ''}</span></p>
    ${r.url ? `<img src="${esc(r.url)}" alt="Receipt ${i + 1}" />` : r.pdf ? `<div class="nophoto">This receipt is a PDF file: open it from the claim to see it.</div>` : ''}
    <div class="cap">
      Claimed by <b>${esc(r.who)}</b> on <b>${esc(dd(r.claimedOn))}</b>${r.claimNo ? ` · Claim ${esc(r.claimNo)}` : ''}
      <p>Filled ${esc(dd(r.date))} · ${esc(r.vehicle)} · ${fmt(r.litres, 2)} L · RM ${fmt(r.amount, 2)} · ${esc(r.card)}</p>
    </div>
  </div>`
    )
    .join('')}
</td></tr></tbody></table>
</body></html>`
}
