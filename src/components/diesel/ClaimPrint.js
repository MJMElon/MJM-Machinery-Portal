import { receiptUrl, vehicleLabel } from '../../lib/diesel.js'
import { day, num } from '../../lib/format.js'

// The fuel claim form printout.
//
// Printing happens in place: the form is built as its own small document,
// loaded into an invisible same-origin frame on the current page, and that
// frame is printed. The print dialog opens straight away over the page the
// person is on (the claim list or the claim), with the form as the preview —
// no new tab or page. This works whether the module runs on its own or
// inside a module window (iframe) of CMMS 2.
//
// Only the receipts paid in cash go on the form: those are the ones the
// company pays back, so the total is exactly what the claimant receives.
// Fleet-card (KPDN) receipts stay off the form.
//
// The page margins are zero (that is what stops the browser printing its own
// header and footer: the date, the "CMMS 2" title, the address and "1/1").
// The form's own margins come from a table whose header and footer rows are
// empty spacers, which browsers repeat on every printed page.

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

const padNo = (claim) => (claim.claim_no != null ? String(claim.claim_no).padStart(3, '0') : '')

const CSS = `
@page { size: A4 portrait; margin: 0; }
html, body { margin: 0; padding: 0; background: #fff; color: #111827; }
body { font: 11px/1.45 "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
table { border-collapse: collapse; }
.page { width: 100%; }
.page > thead td, .page > tfoot td { height: 14mm; padding: 0; }
.page > tbody > tr > td { padding: 0 15mm; vertical-align: top; }
.head { text-align: center; padding-bottom: 10px; border-bottom: 2px solid #111827; }
.head .name { font-size: 21px; font-weight: 800; letter-spacing: -.01em; line-height: 1.2; }
.head .reg { font-size: 10px; color: #6b7280; margin-top: 1px; }
.head .line { font-size: 10.5px; color: #374151; margin-top: 3px; }
.title { margin: 20px 0 14px; text-align: center; font-size: 16px; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; }
.meta { width: 100%; font-size: 11.5px; }
.meta td { padding: 1.5px 0; vertical-align: top; }
.meta td.k { width: 118px; color: #6b7280; }
.meta td.v { font-weight: 600; }
.lines { width: 100%; margin-top: 14px; font-size: 10.5px; }
.lines th { background: #111827; color: #fff; font-weight: 600; font-size: 9.5px; letter-spacing: .06em; text-transform: uppercase; padding: 6px 7px; text-align: left; vertical-align: bottom; }
.lines td { padding: 6px 7px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
.lines tbody tr:nth-child(even) td { background: #f9fafb; }
.lines .c { text-align: center; }
.lines .r { text-align: right; font-variant-numeric: tabular-nums; }
.lines th.r { text-align: right; }
.lines .wrap { word-break: break-all; }
.lines .veh { color: #374151; }
.lines .remark { display: block; font-size: 9.5px; color: #6b7280; }
.lines .amt { font-weight: 600; }
.sum { width: 100%; margin-top: 10px; }
.sum td { vertical-align: top; }
.sum .box { margin-left: auto; width: 240px; border-top: 2px solid #111827; padding-top: 6px; font-size: 11px; }
.sum .box table { width: 100%; }
.sum .box td { padding: 2px 0; }
.sum .box .k { color: #6b7280; }
.sum .box .r { text-align: right; font-variant-numeric: tabular-nums; }
.sum .box .total td { padding-top: 5px; font-weight: 800; font-size: 13px; }
.notes { margin-top: 10px; font-size: 10.5px; color: #374151; }
.sign { width: 100%; margin-top: 40px; font-size: 11px; break-inside: avoid; }
.sign td { width: 33.33%; padding: 0 14px 0 0; vertical-align: top; }
.sign .label { color: #6b7280; }
.sign .space { height: 46px; }
.sign .line { width: 85%; border-bottom: 1px solid #111827; padding: 0 2px 3px; min-height: 14px; font-weight: 600; }
.sign .role { padding-top: 4px; font-weight: 600; }
.receipts { break-before: page; }
.receipts h2 { font-size: 12px; font-weight: 700; margin: 0 0 8px; letter-spacing: .04em; text-transform: uppercase; }
.receipts table { width: 100%; }
.receipts td { width: 50%; padding: 0 6px 10px 0; vertical-align: top; break-inside: avoid; }
.receipts img { display: block; max-width: 100%; max-height: 118mm; border: 1px solid #e5e7eb; border-radius: 4px; }
.receipts .cap { font-size: 10px; color: #6b7280; margin-top: 3px; }
`

/** The claim form as a complete HTML document (string). */
export function claimFormHtml({ company, claim, lines, vehicles, claimantName, images = {} }) {
  const vById = new Map((vehicles || []).map((v) => [v.id, v]))
  const total = lines.reduce((s, l) => s + Number(l.amount || 0), 0)
  const litres = lines.reduce((s, l) => s + Number(l.litres || 0), 0)
  const no = padNo(claim)
  const contact = [company.phone && `Tel: ${company.phone}`, company.fax && `Fax: ${company.fax}`, company.email && `Email: ${company.email}`]
    .filter(Boolean)
    .join('    ')

  // "Diesel - Petronas Senai, JPB 1234": what was bought and where, then the vehicle.
  const describe = (l) => {
    const what = [l.description, l.station].filter(Boolean).join(' - ')
    const veh = l.vehicle_id ? vehicleLabel(vById.get(l.vehicle_id)) : ''
    return `${esc(what || '—')}${veh ? `<span class="veh">, ${esc(veh)}</span>` : ''}`
  }

  const rows = lines
    .map(
      (l, i) => `
      <tr>
        <td class="c">${i + 1}</td>
        <td>${esc(day(l.fill_date))}</td>
        <td class="wrap">${esc(l.receipt_no || '—')}</td>
        <td>${describe(l)}${l.remark ? `<span class="remark">Remark: ${esc(l.remark)}</span>` : ''}</td>
        <td class="r">${l.litres != null ? Number(l.litres).toFixed(2) : '—'}</td>
        <td class="r">${l.unit_price != null ? Number(l.unit_price).toFixed(3) : '—'}</td>
        <td class="r amt">${Number(l.amount || 0).toFixed(2)}</td>
      </tr>`
    )
    .join('')

  const receipts = lines
    .map((l, i) =>
      images[l.id]
        ? `<td><img src="${esc(images[l.id])}" alt="Receipt ${i + 1}" /><div class="cap">Receipt ${i + 1} · ${esc(day(l.fill_date))} · RM ${Number(l.amount || 0).toFixed(2)}</div></td>`
        : ''
    )
    .filter(Boolean)
  const receiptRows = []
  for (let i = 0; i < receipts.length; i += 2) receiptRows.push(`<tr>${receipts[i]}${receipts[i + 1] || '<td></td>'}</tr>`)

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Fuel claim ${esc(no)} - ${esc(claimantName)}</title>
<style>${CSS}</style>
</head>
<body>
<table class="page">
<thead><tr><td></td></tr></thead>
<tfoot><tr><td></td></tr></tfoot>
<tbody><tr><td>
  <div class="head">
    <div class="name">${esc(company.name)}</div>
    ${company.registration_no ? `<div class="reg">${esc(company.registration_no)}</div>` : ''}
    ${company.address ? `<div class="line">${esc(company.address)}</div>` : ''}
    ${contact ? `<div class="line">${esc(contact)}</div>` : ''}
  </div>
  <div class="title">Fuel claim form</div>
  <table class="meta">
    <tr><td class="k">Name</td><td class="v">${esc(claimantName)}</td></tr>
    ${no ? `<tr><td class="k">Claim No.</td><td class="v">${esc(no)}</td></tr>` : ''}
    <tr><td class="k">Submission Date</td><td class="v">${esc(day(claim.submitted_on || claim.fill_date))}</td></tr>
  </table>
  <table class="lines">
    <colgroup>
      <col style="width:6%" /><col style="width:12%" /><col style="width:16%" /><col />
      <col style="width:12%" /><col style="width:12%" /><col style="width:13%" />
    </colgroup>
    <thead>
      <tr>
        <th class="c">No.</th><th>Receipt Date</th><th>Receipt No.</th><th>Description</th>
        <th class="r">Litre</th><th class="r">Unit price<br />(RM)</th><th class="r">Amount<br />(RM)</th>
      </tr>
    </thead>
    <tbody>
      ${rows || '<tr><td colspan="7" class="c">No cash receipt on this claim.</td></tr>'}
    </tbody>
  </table>
  <table class="sum"><tr><td>
    <div class="box"><table>
      <tr><td class="k">Total litres</td><td class="r">${litres.toFixed(2)} L</td></tr>
      <tr><td class="k">Receipts</td><td class="r">${lines.length}</td></tr>
      <tr class="total"><td>TOTAL PAYABLE (RM)</td><td class="r">${esc(num(total, 2))}</td></tr>
    </table></div>
  </td></tr></table>
  ${claim.notes ? `<div class="notes">Notes: ${esc(claim.notes)}</div>` : ''}
  <table class="sign">
    <tr><td class="label">Prepared By:</td><td class="label">Verified By:</td><td class="label">Approved By:</td></tr>
    <tr><td class="space"></td><td class="space"></td><td class="space"></td></tr>
    <tr><td><div class="line">${esc(claimantName)}</div></td><td><div class="line"></div></td><td><div class="line"></div></td></tr>
    <tr><td class="role">Claimant</td><td class="role">Account Department</td><td class="role">Department Head</td></tr>
  </table>
  ${
    receiptRows.length
      ? `<div class="receipts"><h2>Receipts · Fuel claim ${esc(no)}</h2><table>${receiptRows.join('')}</table></div>`
      : ''
  }
</td></tr></tbody>
</table>
</body>
</html>`
}

/**
 * Open the print dialog for a claim, in place. Resolves once the dialog has
 * been shown (Chrome and Firefox: once it closes). `lines` may include
 * fleet-card lines; only cash lines are printed.
 */
export async function printClaim({ company, claim, lines, vehicles, claimantName }) {
  const cash = (lines || []).filter((l) => l.payment !== 'fleet_card')
  const images = {}
  await Promise.all(
    cash.map(async (l) => {
      if (l.receipt_path && !/\.pdf$/i.test(l.receipt_path)) {
        const u = await receiptUrl(l.receipt_path).catch(() => null)
        if (u) images[l.id] = u
      }
    })
  )
  const html = claimFormHtml({ company, claim, lines: cash, vehicles, claimantName, images })
  return printHtml(html)
}

// Print an HTML document from an invisible frame on this page.
function printHtml(html) {
  return new Promise((resolve, reject) => {
    const frame = document.createElement('iframe')
    frame.setAttribute('aria-hidden', 'true')
    frame.setAttribute('title', 'Print')
    frame.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0;border:0;visibility:hidden'
    let removed = false
    const remove = () => {
      if (removed) return
      removed = true
      frame.remove()
    }
    frame.onload = async () => {
      const w = frame.contentWindow
      try {
        // Let the receipt images arrive before the preview is taken.
        await Promise.all(
          Array.from(w.document.images).map((im) =>
            im.complete ? null : new Promise((r) => { im.onload = im.onerror = r })
          )
        )
        // The frame goes once printing is over. Safari may not fire
        // afterprint, so it goes after a while in any case.
        w.addEventListener('afterprint', () => setTimeout(remove, 300))
        setTimeout(remove, 10 * 60 * 1000)
        w.focus()
        w.print()
        resolve()
      } catch (e) {
        remove()
        reject(e)
      }
    }
    frame.srcdoc = html
    document.body.appendChild(frame)
  })
}
