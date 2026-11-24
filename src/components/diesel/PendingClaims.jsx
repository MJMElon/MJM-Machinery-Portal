import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../ui.jsx'
import { IconChevron, IconCheck, IconEye, IconRefresh, IconX } from '../icons.jsx'
import { isReload, openReceipt, receiptUrls } from '../../lib/diesel.js'
import { day, money, num } from '../../lib/format.js'

// Pending approval: one row per claim waiting for me.
//   ☐ | Claim No. | Submitted | Claimant | Claim amount | Receipts (small pictures) | ✓ / ✗
// Click a receipt picture to see it big and move through the claim's receipts
// with ‹ › (or the arrow keys). Toolbar on top (as in a mail inbox): tick all,
// refresh, and ⋮ with "Approve all" — or "Approve all selected" once rows are
// ticked.

const isPdf = (p) => /\.pdf$/i.test(p || '')

export function PendingClaims({ rows, linesOf, nameOf, claimNo, payableOf, busy, onApprove, onReject, onRefresh }) {
  const [picked, setPicked] = useState(() => new Set())
  const [urls, setUrls] = useState({})
  const [viewing, setViewing] = useState(null) // { claim, index }

  // Signed links for every receipt picture in the list (refreshed with the list).
  const paths = rows.flatMap((c) => linesOf(c.id).map((l) => l.receipt_path)).filter(Boolean)
  const pathKey = paths.join('|')
  useEffect(() => {
    let live = true
    receiptUrls(paths, 3600)
      .then((u) => live && setUrls(u))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [pathKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // Ticks of claims no longer in the list drop off.
  const ids = new Set(rows.map((c) => c.id))
  const chosen = rows.filter((c) => picked.has(c.id))
  const allTicked = rows.length > 0 && chosen.length === rows.length
  const toggle = (id) =>
    setPicked((s) => {
      const n = new Set([...s].filter((x) => ids.has(x)))
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  const tickAll = () => setPicked(allTicked ? new Set() : new Set(rows.map((c) => c.id)))
  const total = (list) => list.reduce((s, c) => s + payableOf(c), 0)

  async function approve(list) {
    if (list.length > 1 && !window.confirm(`Approve ${list.length} claims (${money(total(list))})?`)) return
    await onApprove(list)
    setPicked(new Set())
  }

  const receiptsOf = (c) => linesOf(c.id).filter((l) => l.receipt_path)

  return (
    <>
      {/* Toolbar: tick all · refresh · ⋮ (Approve all / Approve all selected) */}
      <div className="flex items-center gap-1 border-b border-slate-200 px-2 py-2">
        <label className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full hover:bg-slate-100" title={allTicked ? 'Untick all' : 'Tick all'}>
          <input
            type="checkbox"
            checked={allTicked}
            ref={(el) => el && (el.indeterminate = chosen.length > 0 && !allTicked)}
            onChange={tickAll}
            className="h-4 w-4 cursor-pointer rounded border-slate-400"
            aria-label="Tick all"
          />
        </label>
        <button type="button" onClick={onRefresh} disabled={busy} className="flex h-9 w-9 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100 disabled:opacity-40" title="Refresh" aria-label="Refresh">
          <IconRefresh width={18} height={18} />
        </button>
        <MoreMenu
          disabled={busy || rows.length === 0}
          label={chosen.length ? `Approve all selected (${chosen.length})` : 'Approve all'}
          onPick={() => approve(chosen.length ? chosen : rows)}
        />
        {chosen.length > 0 && <span className="ml-2 text-xs font-medium text-slate-500">{chosen.length} selected</span>}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] table-fixed text-sm">
          <colgroup>
            <col style={{ width: 52 }} />
            <col style={{ width: '11%' }} />
            <col style={{ width: '14%' }} />
            <col />
            <col style={{ width: '14%' }} />
            <col style={{ width: '24%' }} />
            <col style={{ width: 150 }} />
          </colgroup>
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/80 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <th className="py-2.5" />
              <th className="px-3 py-2.5">Claim No.</th>
              <th className="px-3 py-2.5">Submitted</th>
              <th className="px-3 py-2.5">Claimant</th>
              <th className="px-3 py-2.5 text-right">Claim amount</th>
              <th className="px-3 py-2.5">Receipts</th>
              <th className="px-3 py-2.5 text-center">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((c) => {
              const ls = linesOf(c.id)
              const litres = ls.reduce((s, l) => s + Number(l.litres || 0), 0)
              const pics = receiptsOf(c)
              return (
                <tr key={c.id} className={`h-16 align-middle hover:bg-slate-50/60 ${picked.has(c.id) ? 'bg-brand-light/30' : ''}`}>
                  <td className="py-3 text-center">
                    <input type="checkbox" checked={picked.has(c.id)} onChange={() => toggle(c.id)} className="h-4 w-4 rounded border-slate-300" aria-label={`Tick ${claimNo(c, 0)}`} />
                  </td>
                  <td className="px-3 py-2.5">
                    <Link to={`/diesel/claims/${c.id}?from=review`} className="font-semibold tabular-nums text-slate-800 hover:text-brand">
                      {claimNo(c, 0)}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 font-semibold tabular-nums text-slate-800">{day(c.submitted_on || c.fill_date)}</td>
                  <td className="truncate px-3 py-2.5 font-medium text-slate-800">{nameOf(c.claimant_id)}</td>
                  <td className="px-3 py-2.5 text-right">
                    <span className="block font-semibold tabular-nums text-slate-900">{money(payableOf(c))}</span>
                    {litres > 0 && <span className="text-xs tabular-nums text-slate-500">{num(litres, 2)} L</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    {pics.length === 0 ? (
                      <span className="text-xs text-slate-400">No receipt attached</span>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {pics.map((l, i) => (
                          <button
                            key={l.id}
                            type="button"
                            onClick={() => setViewing({ claim: c, index: i })}
                            className="h-11 w-11 overflow-hidden rounded-md border border-slate-200 bg-slate-50 transition hover:border-brand hover:ring-2 hover:ring-brand/30"
                            title={`Receipt ${i + 1} · ${day(l.fill_date)} · ${money(l.amount)}`}
                          >
                            {isPdf(l.receipt_path) ? (
                              <span className="flex h-full items-center justify-center text-[10px] font-bold text-red-600">PDF</span>
                            ) : urls[l.receipt_path] ? (
                              <img src={urls[l.receipt_path]} alt={`Receipt ${i + 1}`} loading="lazy" className="h-full w-full object-cover" />
                            ) : (
                              <span className="block h-full w-full animate-pulse bg-slate-100" />
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center justify-center gap-1.5">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onApprove([c])}
                        className="flex h-9 w-9 items-center justify-center rounded-full bg-green-600 text-white shadow-sm hover:bg-green-700 disabled:opacity-50"
                        title="Approve"
                        aria-label={`Approve ${claimNo(c, 0)}`}
                      >
                        <IconCheck width={18} height={18} />
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onReject(c)}
                        className="flex h-9 w-9 items-center justify-center rounded-full border border-red-200 bg-white text-red-600 hover:bg-red-50 disabled:opacity-50"
                        title="Reject"
                        aria-label={`Reject ${claimNo(c, 0)}`}
                      >
                        <IconX width={18} height={18} />
                      </button>
                      <Link to={`/diesel/claims/${c.id}?from=review`} className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-brand" title="View claim" aria-label="View claim">
                        <IconEye width={18} height={18} />
                      </Link>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {viewing && (
        <ReceiptViewer
          title={`${nameOf(viewing.claim.claimant_id)} · Claim ${claimNo(viewing.claim, 0)}`}
          lines={receiptsOf(viewing.claim)}
          urls={urls}
          start={viewing.index}
          onClose={() => setViewing(null)}
        />
      )}
    </>
  )
}

/** ⋮ button with one action under it. */
function MoreMenu({ label, onPick, disabled }) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [open])
  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={(e) => (e.stopPropagation(), setOpen((o) => !o))}
        className={`flex h-9 w-9 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100 disabled:opacity-40 ${open ? 'bg-slate-200' : ''}`}
        title="More"
        aria-label="More"
        aria-expanded={open}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="12" cy="5" r="1.9" />
          <circle cx="12" cy="12" r="1.9" />
          <circle cx="12" cy="19" r="1.9" />
        </svg>
      </button>
      {open && (
        <div className="absolute left-0 top-10 z-20 min-w-[220px] rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              onPick()
            }}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <IconCheck width={16} height={16} className="text-green-600" /> {label}
          </button>
        </div>
      )}
    </div>
  )
}

/** A claim's receipts shown big, one at a time, with ‹ › and the arrow keys. */
export function ReceiptViewer({ title, lines, urls, start = 0, onClose }) {
  const [i, setI] = useState(start)
  const n = lines.length
  const go = (d) => setI((x) => (x + d + n) % n)
  useEffect(() => {
    const key = (e) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight') go(1)
      else if (e.key === 'ArrowLeft') go(-1)
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [n]) // eslint-disable-line react-hooks/exhaustive-deps
  const l = lines[i]
  if (!l) return null
  const kind = isReload(l) ? 'Fleet card reload' : l.payment === 'fleet_card' ? 'Fleet card' : 'Cash'
  const arrow = 'absolute top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-slate-700 shadow-lg hover:bg-white'
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950/90" onClick={onClose} role="dialog" aria-modal="true" aria-label="Receipts">
      <div className="flex items-center justify-between gap-3 px-4 py-3 text-white" onClick={(e) => e.stopPropagation()}>
        <p className="min-w-0 truncate text-sm font-semibold">{title}</p>
        <button type="button" onClick={onClose} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full hover:bg-white/15" aria-label="Close">
          <IconX width={20} height={20} />
        </button>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-14 pb-2" onClick={onClose}>
        <div onClick={(e) => e.stopPropagation()} className="flex max-h-full max-w-full items-center justify-center">
          {isPdf(l.receipt_path) ? (
            <div className="rounded-xl bg-white p-8 text-center">
              <p className="mb-3 text-sm text-slate-600">This receipt is a PDF file.</p>
              <Button onClick={() => openReceipt(l.receipt_path).catch((e) => window.alert(e.message))}>Open the PDF</Button>
            </div>
          ) : urls[l.receipt_path] ? (
            <img src={urls[l.receipt_path]} alt={`Receipt ${i + 1}`} className="max-h-[calc(100dvh-9rem)] max-w-full rounded-lg bg-white object-contain shadow-2xl" />
          ) : (
            <p className="text-sm text-white/70">Loading…</p>
          )}
        </div>
        {n > 1 && (
          <>
            <button type="button" className={`${arrow} left-3`} onClick={(e) => (e.stopPropagation(), go(-1))} aria-label="Previous receipt">
              <IconChevron width={22} height={22} className="rotate-180" />
            </button>
            <button type="button" className={`${arrow} right-3`} onClick={(e) => (e.stopPropagation(), go(1))} aria-label="Next receipt">
              <IconChevron width={22} height={22} />
            </button>
          </>
        )}
      </div>
      <div className="px-4 pb-4 text-center text-sm text-white" onClick={(e) => e.stopPropagation()}>
        <span className="font-semibold">
          Receipt {i + 1} of {n}
        </span>
        <span className="text-white/75">
          {' '}
          · {day(l.fill_date)} · {kind} · {money(l.amount)}
          {Number(l.litres) > 0 ? ` · ${num(l.litres, 2)} L` : ''}
          {l.receipt_no ? ` · No. ${l.receipt_no}` : ''}
        </span>
      </div>
    </div>
  )
}
