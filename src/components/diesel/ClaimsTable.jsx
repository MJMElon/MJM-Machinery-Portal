import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../ui.jsx'
import { IconChevron, IconCheck, IconEye, IconRefresh, IconSearch, IconX } from '../icons.jsx'
import { StatusBadge } from './shared.jsx'
import { PaymentDocsButton } from './PaymentDocs.jsx'
import { CLAIM_STATUS, isReload, openReceipt, receiptUrls } from '../../lib/diesel.js'
import { day, money, num } from '../../lib/format.js'

// Claims Approval: one table for the three tabs, same columns and spacing.
//   Pending approval  ☐ | Claim No. | Submitted | Claimant | Claim amount | Receipts | Status | ✓ ✗
//   To pay            ☐ | … | Status (approved by … on …) | Mark paid
//   All claims        … | Status (click the title to filter) | what I may do
// Toolbar on top (as in a mail inbox): tick all, refresh and ⋮ (Approve all /
// Approve all selected, or Mark all paid / Mark all selected paid); on All
// claims the search box instead. Click a receipt picture to see it big and
// move through the claim's receipts with ‹ › (or the arrow keys).

const isPdf = (p) => /\.pdf$/i.test(p || '')

export function ClaimsTable({
  mode, // 'pending' | 'topay' | 'all'
  rows,
  linesOf,
  nameOf,
  claimNo,
  payableOf,
  busy,
  canApprove = () => false,
  canPay = () => false,
  onApprove,
  onReject,
  onPay,
  onRefresh,
  search = '',
  onSearch,
  statusFilter = '',
  onStatusFilter,
  docs = {},
  empty
}) {
  const [picked, setPicked] = useState(() => new Set())
  const [urls, setUrls] = useState({})
  const [viewing, setViewing] = useState(null) // { claim, index }
  const ticks = mode !== 'all'

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
  useEffect(() => setPicked(new Set()), [mode])

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

  async function bulk(list) {
    // Mark paid opens its own window (documents + confirm)
    if (mode !== 'pending') return onPay(list)
    if (list.length > 1 && !window.confirm(`Approve ${list.length} claims (${money(total(list))})?`)) return
    await onApprove(list)
    setPicked(new Set())
  }

  const receiptsOf = (c) => linesOf(c.id).filter((l) => l.receipt_path)
  const bulkLabel =
    mode === 'pending'
      ? chosen.length
        ? `Approve all selected (${chosen.length})`
        : 'Approve all'
      : chosen.length
      ? `Mark all selected paid (${chosen.length})`
      : 'Mark all paid'
  const showStatus = true // every tab, so the columns line up when switching tabs
  const round = 'flex h-9 w-9 items-center justify-center rounded-full disabled:opacity-50'

  return (
    <>
      {/* Toolbar */}
      <div className="flex min-h-[53px] flex-wrap items-center gap-1 border-b border-slate-200 px-2 py-2">
        {ticks && (
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
        )}
        {mode !== 'all' && (
          <button type="button" onClick={onRefresh} disabled={busy} className={`${round} text-slate-600 hover:bg-slate-100`} title="Refresh" aria-label="Refresh">
            <IconRefresh width={18} height={18} />
          </button>
        )}
        {ticks && <MoreMenu disabled={busy || rows.length === 0} label={bulkLabel} onPick={() => bulk(chosen.length ? chosen : rows)} />}
        {ticks && chosen.length > 0 && <span className="ml-2 text-xs font-medium text-slate-500">{chosen.length} selected</span>}
        {mode === 'all' && (
          <label className="relative w-full max-w-xs">
            <IconSearch width={16} height={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              placeholder="Search name or claim no."
              className="h-9 w-full rounded-full border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm outline-none focus:border-brand focus:bg-white"
            />
          </label>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="py-14 text-center text-sm text-slate-500">{empty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] table-fixed text-sm">
            <colgroup>
              <col style={{ width: 52 }} />
              <col style={{ width: '9%' }} />
              <col style={{ width: '12%' }} />
              <col />
              <col style={{ width: '12%' }} />
              <col style={{ width: showStatus ? '16%' : '24%' }} />
              {showStatus && <col style={{ width: '21%' }} />}
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
                {showStatus && (
                  <th className="px-3 py-1.5">{mode === 'all' ? <StatusFilter value={statusFilter} onChange={onStatusFilter} /> : 'Status'}</th>
                )}
                <th className="py-2.5 pl-3 pr-12 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((c) => {
                const ls = linesOf(c.id)
                const litres = ls.reduce((s, l) => s + Number(l.litres || 0), 0)
                const pics = receiptsOf(c)
                const approveHere = c.status === 'pending' && canApprove(c)
                const payHere = c.status === 'approved' && canPay(c)
                return (
                  <tr key={c.id} className={`h-16 align-middle hover:bg-slate-50/60 ${picked.has(c.id) ? 'bg-brand-light/30' : ''}`}>
                    <td className="py-3 text-center">
                      {ticks && (
                        <input type="checkbox" checked={picked.has(c.id)} onChange={() => toggle(c.id)} className="h-4 w-4 rounded border-slate-300" aria-label={`Tick ${claimNo(c, 0)}`} />
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <Link to={`/diesel/claims/${c.id}?from=review`} className="font-semibold tabular-nums text-slate-800 hover:text-brand">
                        {claimNo(c, 0)}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 font-semibold tabular-nums text-slate-800">{day(c.submitted_on || c.fill_date)}</td>
                    <td className="truncate px-3 py-2.5 font-medium text-slate-800" title={nameOf(c.claimant_id)}>
                      {nameOf(c.claimant_id)}
                    </td>
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
                    {showStatus && (
                      <td className="px-3 py-2.5">
                        <span className="inline-flex items-center gap-1.5">
                          <StatusBadge status={c.status} />
                          {c.status === 'paid' && <PaymentDocsButton docs={docs[c.id]} />}
                        </span>
                        <StatusLine claim={c} nameOf={nameOf} />
                      </td>
                    )}
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-1.5">
                        {approveHere && (
                          <>
                            <button type="button" disabled={busy} onClick={() => onApprove([c])} className={`${round} bg-green-600 text-white shadow-sm hover:bg-green-700`} title="Approve" aria-label={`Approve ${claimNo(c, 0)}`}>
                              <IconCheck width={18} height={18} />
                            </button>
                            <button type="button" disabled={busy} onClick={() => onReject(c)} className={`${round} border border-red-200 bg-white text-red-600 hover:bg-red-50`} title="Reject" aria-label={`Reject ${claimNo(c, 0)}`}>
                              <IconX width={18} height={18} />
                            </button>
                          </>
                        )}
                        {payHere && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => onPay([c])}
                            className="flex h-9 items-center justify-center rounded-full bg-emerald-600 px-3 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                            title="Mark paid"
                          >
                            Mark paid
                          </button>
                        )}
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
      )}

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

/** Under the status: who did it and when ("Approved by Ahmad on 22 Nov 2026"). */
function StatusLine({ claim, nameOf }) {
  const verb = { approved: 'Approved', rejected: 'Rejected', paid: 'Paid' }[claim.status]
  if (!verb || !claim.reviewed_at) return null
  return (
    <span className="mt-0.5 block text-xs leading-snug text-slate-500" title={claim.review_note || ''}>
      {verb} by {nameOf(claim.reviewed_by)} on {day(claim.reviewed_at.slice(0, 10))}
    </span>
  )
}

/** The Status column title of All claims: click it to show only one status. */
function StatusFilter({ value, onChange }) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [open])
  const pick = (v) => {
    onChange(v)
    setOpen(false)
  }
  return (
    <div className="relative">
      <button
        type="button"
        onClick={(e) => (e.stopPropagation(), setOpen((o) => !o))}
        className={`-ml-2 inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold uppercase tracking-wide hover:bg-slate-200/60 ${value ? 'text-brand' : ''}`}
        aria-expanded={open}
      >
        {value ? CLAIM_STATUS[value]?.label || value : 'Status'}
        <IconChevron width={14} height={14} className={`transition ${open ? '-rotate-90' : 'rotate-90'}`} />
      </button>
      {open && (
        <div className="absolute left-0 top-9 z-20 min-w-[230px] rounded-xl border border-slate-200 bg-white py-1 normal-case tracking-normal shadow-lg">
          {[['', 'All statuses'], ...Object.entries(CLAIM_STATUS).filter(([k]) => k !== 'draft').map(([k, v]) => [k, v.label])].map(([k, label]) => (
            <button
              key={k || 'all'}
              type="button"
              onClick={() => pick(k)}
              className={`flex w-full items-center justify-between gap-3 px-4 py-2 text-left text-sm hover:bg-slate-50 ${value === k ? 'font-semibold text-brand' : 'font-medium text-slate-700'}`}
            >
              {label}
              {value === k && <IconCheck width={14} height={14} />}
            </button>
          ))}
        </div>
      )}
    </div>
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
        <div className="absolute left-0 top-10 z-20 min-w-[240px] rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
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
