// Print without leaving the page: the document is loaded into an invisible
// same-origin frame and that frame is printed, so the print dialog opens over
// the page the person is on (also inside a CMMS 2 module window).
//
// printHtml(html): print a complete HTML document (string).
// printElement(el, { title, lines, landscape }): print a part of the page as
//   it looks on screen (the page's own stylesheets are carried over), under a
//   small heading. Anything marked data-noprint inside it is left out.
//
// Page margins are zero so browsers do not add their own header and footer
// (date, title, address, page x/y); the margins come from an outer table
// whose empty header and footer rows repeat on every printed page.

export function printHtml(html) {
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
        // Let images and stylesheets arrive before the preview is taken.
        await Promise.all([
          ...Array.from(w.document.images).map((im) => (im.complete ? null : new Promise((r) => { im.onload = im.onerror = r }))),
          ...Array.from(w.document.querySelectorAll('link[rel="stylesheet"]')).map((l) =>
            l.sheet ? null : new Promise((r) => { l.onload = l.onerror = r; setTimeout(r, 3000) })
          )
        ])
        // Safari may not fire afterprint, so the frame goes after a while in any case.
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

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function printElement(el, { title = '', lines = [], landscape = true } = {}) {
  const copy = el.cloneNode(true)
  copy.querySelectorAll('[data-noprint]').forEach((n) => n.remove())
  const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
    .map((n) => n.outerHTML)
    .join('\n')
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<base href="${esc(document.baseURI)}" />
<title>${esc(title)}</title>
${styles}
<style>
@page { size: A4 ${landscape ? 'landscape' : 'portrait'}; margin: 0; }
html, body { background: #fff !important; margin: 0; padding: 0; }
body { -webkit-print-color-adjust: exact; print-color-adjust: exact; font-size: 12px; }
.print-page { width: 100%; border-collapse: collapse; }
.print-page > thead td, .print-page > tfoot td { height: 10mm; padding: 0; }
.print-page > tbody > tr > td { padding: 0 10mm; vertical-align: top; }
.print-head { margin-bottom: 10px; padding-bottom: 6px; border-bottom: 2px solid #14532d; }
.print-head h1 { margin: 0; font-size: 16px; font-weight: 700; color: #14532d; }
.print-head p { margin: 2px 0 0; font-size: 11px; color: #475569; }
.overflow-x-auto, .overflow-hidden, .overflow-auto { overflow: visible !important; }
table { min-width: 0 !important; }
tr, .print-keep, .grid > * { break-inside: avoid; }
* { box-shadow: none !important; }
</style>
</head><body>
<table class="print-page"><thead><tr><td></td></tr></thead><tfoot><tr><td></td></tr></tfoot>
<tbody><tr><td>
<div class="print-head"><h1>${esc(title)}</h1>${lines.filter(Boolean).map((l) => `<p>${esc(l)}</p>`).join('')}</div>
${copy.outerHTML}
</td></tr></tbody></table>
</body></html>`
  return printHtml(html)
}
