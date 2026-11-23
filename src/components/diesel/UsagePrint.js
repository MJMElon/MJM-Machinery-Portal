import { printHtml } from '../../lib/printFrame.js'

// Fuel Usage Reports printout: two tables, Jan – Dec of one year, one row per
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
 * or machine type), with subtotals and the total.
 * groups: [{ title, rows: [{ date, who, vehicle, receipt?, litres, amount, remark }] }]
 */
export function usageDetailHtml({ title, lines = [], hq, groups }) {
  const dd = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '')
  const sum = (rows, k) => rows.reduce((t, r) => t + (r[k] || 0), 0)
  const all = groups.flatMap((g) => g.rows)
  const span = hq ? 4 : 3
  const body = groups
    .map(
      (g) => `
    <tr class="grp"><td colspan="${hq ? 7 : 6}">${esc(g.title)} <span>· ${g.rows.length} receipt${g.rows.length === 1 ? '' : 's'}</span></td></tr>
    ${g.rows
      .map(
        (r) => `<tr><td>${esc(dd(r.date))}</td><td>${esc(r.who)}</td><td>${esc(r.vehicle)}${r.general ? ' <i>(general)</i>' : ''}</td>${hq ? `<td>${esc(r.receipt || '–')}</td>` : ''}<td class="r">${fmt(r.litres, 2)}</td><td class="r">${fmt(r.amount, 2)}</td><td class="rm">${esc(r.remark || '')}</td></tr>`
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
.t { width: 100%; border-collapse: collapse; }
.t th { background: ${GREEN}; color: #fff; font-weight: 600; padding: 4px; text-align: left; }
.t th.r, .t td.r { text-align: right; font-variant-numeric: tabular-nums; }
.t td { padding: 3.5px 4px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
.t td.rm { color: #374151; }
.t tr.grp td { background: #eef5f0; font-weight: 700; color: #14532d; padding-top: 5px; }
.t tr.grp span { font-weight: 500; color: #4b5563; }
.t tr.sub td { font-weight: 700; border-bottom: 1.5px solid #cbd5e1; }
.t tfoot td { font-weight: 700; background: #f1f5f9; border-top: 2px solid ${GREEN}; }
tr { break-inside: avoid; }
</style></head><body>
<table class="page"><thead><tr><td></td></tr></thead><tfoot><tr><td></td></tr></tfoot><tbody><tr><td>
  <div class="head"><h1>${esc(title)}</h1>${lines.filter(Boolean).map((l) => `<p>${esc(l)}</p>`).join('')}</div>
  <table class="t">
    <colgroup><col style="width:10%" /><col style="width:${hq ? 17 : 24}%" /><col style="width:${hq ? 13 : 16}%" />${hq ? '<col style="width:12%" />' : ''}<col style="width:9%" /><col style="width:11%" /><col /></colgroup>
    <thead><tr><th>Date</th><th>${hq ? 'Driver' : 'Machine'}</th><th>${hq ? 'Vehicle' : 'Location'}</th>${hq ? '<th>Receipt no.</th>' : ''}<th class="r">Litres</th><th class="r">Amount (RM)</th><th>Remark</th></tr></thead>
    <tbody>${body || `<tr><td colspan="${hq ? 7 : 6}">No fuel usage for this selection.</td></tr>`}</tbody>
    <tfoot><tr><td colspan="${span}" class="r">Total · ${all.length} receipt${all.length === 1 ? '' : 's'}</td><td class="r">${fmt(sum(all, 'litres'), 2)}</td><td class="r">${fmt(sum(all, 'amount'), 2)}</td><td></td></tr></tfoot>
  </table>
</td></tr></tbody></table>
</body></html>`
}

export const printUsageDetail = (opts) => printHtml(usageDetailHtml(opts))
