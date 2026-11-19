import { printHtml } from '../../lib/printFrame.js'

// Fuel Usage Reports printout: two tables, Jan – Dec of one year, one row per
// person (HQ vehicles: the claimant / driver) or per machine (estate):
//   1. fuel usage in litres   2. fuel expenses in RM
// and below them the average fuel price per litre (RM ÷ litres), per month
// and for the year. Printed in place (A4 landscape, no browser header/footer).

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
    <colgroup><col style="width:3%" /><col style="width:15%" />${MONTHS.map(() => '<col />').join('')}<col style="width:8%" /></colgroup>
    <thead><tr><th>No.</th><th class="l">${esc(nameHeader)}</th>${MONTHS.map((m) => `<th>${m}</th>`).join('')}<th>Total</th></tr></thead>
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
@page { size: A4 landscape; margin: 0; }
html, body { margin: 0; padding: 0; background: #fff; color: #111827; }
body { font: 10px/1.4 "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.page { width: 100%; border-collapse: collapse; }
.page > thead td, .page > tfoot td { height: 10mm; padding: 0; }
.page > tbody > tr > td { padding: 0 10mm; vertical-align: top; }
.head { padding-bottom: 6px; border-bottom: 2px solid ${GREEN}; margin-bottom: 4px; }
.head h1 { margin: 0; font-size: 16px; color: ${GREEN}; }
.head p { margin: 2px 0 0; color: #475569; }
h2 { font-size: 11.5px; margin: 12px 0 5px; color: ${GREEN}; }
.t { width: 100%; border-collapse: collapse; table-layout: fixed; }
.t th { background: ${GREEN}; color: #fff; font-weight: 600; padding: 5px 4px; text-align: right; }
.t td { padding: 4px; border-bottom: 1px solid #e5e7eb; text-align: right; font-variant-numeric: tabular-nums; }
.t tbody tr:nth-child(even) td { background: #f6f8f7; }
.t .l { text-align: left; } .t .c { text-align: center; } .t .b { font-weight: 700; }
.t th.l { text-align: left; }
.t tr.sum td { font-weight: 700; border-top: 1.5px solid ${GREEN}; background: #eef5f0; }
.t tr.avg td { font-weight: 600; color: #374151; background: #fff; }
tr { break-inside: avoid; }
.avgbox { margin-top: 10px; display: inline-block; border: 1.5px solid ${GREEN}; border-radius: 6px; padding: 6px 12px; font-size: 12px; }
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
