import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { Button, Card, Select } from '../../components/ui.jsx'
import { IconCheck, IconEye, IconX } from '../../components/icons.jsx'
import { Empty, ErrorBox, Loading, StatusBadge, inputCls } from '../../components/diesel/shared.jsx'
import { CLAIM_STATUS, isReload, listClaimLines, listClaims, listPeople, personLabel, reviewClaim } from '../../lib/diesel.js'
import { day, money, num } from '../../lib/format.js'
import { useAuth } from '../../auth/AuthContext.jsx'
import { claimNo } from './DieselClaims.jsx'
import { RejectModal } from './ClaimView.jsx'

// Review claims, in three tabs:
//   Pending approval  claims waiting for me: the people I am approver for
//                     (Claim approval setting → Approved by)
//   To pay            approved claims, for accountants: mark paid
//   All claims        every claim I can see (accountants: the whole company)
// Approve / reject / mark paid right in the row, or several at once.
export default function ClaimReview() {
  const { company, access } = useOutletContext()
  const { user, isSuperAdmin } = useAuth()
  const [claims, setClaims] = useState([])
  const [lines, setLines] = useState([])
  const [people, setPeople] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [picked, setPicked] = useState(() => new Set())
  const [rejecting, setRejecting] = useState(null) // claim
  const [status, setStatus] = useState('')
  const [q, setQ] = useState('')

  const approver = isSuperAdmin || access.admin
  const accountant = isSuperAdmin || access.pay
  const allowed = approver || accountant || access.viewAll
  const TABS = [approver && ['pending', 'Pending approval'], accountant && ['topay', 'To pay'], ['all', 'All claims']].filter(Boolean)
  const [tab, setTab] = useState(TABS[0][0])

  const load = useCallback(async () => {
    if (!allowed) return setLoading(false)
    try {
      const [c, p] = await Promise.all([listClaims(company.id), listPeople(company.id).catch(() => [])])
      const ls = c.length ? await listClaimLines(company.id, { claimIds: c.map((x) => x.id) }).catch(() => []) : []
      setClaims(c)
      setLines(ls)
      setPeople(p)
      setError('')
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [company.id, allowed])

  useEffect(() => {
    setLoading(true)
    load()
  }, [load])

  const person = new Map(people.map((p) => [p.user_id, p]))
  const nameOf = (id) => (id === user.id ? `${user.fullName || user.email} (you)` : personLabel(person.get(id)))
  const canApprove = (c) => c.claimant_id !== user.id && access.approves(c.claimant_id)
  const canPay = (c) => accountant && (c.claimant_id !== user.id || isSuperAdmin)
  const linesOf = useMemo(() => {
    const m = new Map()
    for (const l of lines) m.set(l.claim_id, [...(m.get(l.claim_id) || []), l])
    return (id) => m.get(id) || []
  }, [lines])

  const sorted = [...claims].sort((a, b) => ((a.submitted_on || a.fill_date) < (b.submitted_on || b.fill_date) ? 1 : -1))
  const pending = sorted.filter((c) => c.status === 'pending' && canApprove(c))
  const toPay = sorted.filter((c) => c.status === 'approved' && canPay(c))
  const t = q.trim().toLowerCase()
  const all = sorted.filter((c) => (!status || c.status === status) && (!t || nameOf(c.claimant_id).toLowerCase().includes(t) || claimNo(c, 0).includes(t)))
  const rows = tab === 'pending' ? pending : tab === 'topay' ? toPay : all
  const count = { pending: pending.length, topay: toPay.length }

  // Ticks only for rows the current tab can act on in bulk
  const bulkable = (c) => (tab === 'pending' ? canApprove(c) && c.status === 'pending' : tab === 'topay' ? c.status === 'approved' && canPay(c) : false)
  const chosen = rows.filter((c) => picked.has(c.id) && bulkable(c))
  const toggle = (id) => setPicked((s) => {
    const n = new Set(s)
    n.has(id) ? n.delete(id) : n.add(id)
    return n
  })
  const allTicked = rows.length > 0 && rows.filter(bulkable).every((c) => picked.has(c.id))
  const tickAll = () => setPicked(allTicked ? new Set() : new Set(rows.filter(bulkable).map((c) => c.id)))

  async function act(list, nextStatus, note) {
    setBusy(true)
    setError('')
    try {
      for (const c of list) await reviewClaim(c.id, nextStatus, note ?? c.review_note)
      setPicked(new Set())
      await load()
    } catch (e) {
      setError(e.message)
      await load()
    } finally {
      setBusy(false)
    }
  }

  const sum = (ls, f) => ls.filter(f).reduce((s, l) => s + Number(l.amount || 0), 0)
  const payableOf = (c) => {
    const ls = linesOf(c.id)
    return ls.length ? sum(ls, (l) => l.payment !== 'fleet_card' || isReload(l)) : Number(c.payable_amount ?? c.amount ?? 0)
  }
  const chosenTotal = chosen.reduce((s, c) => s + payableOf(c), 0)

  if (!allowed)
    return (
      <Card>
        <Empty>You do not have the right to review claims.</Empty>
      </Card>
    )

  return (
    <div className="space-y-4">
      <ErrorBox>{error}</ErrorBox>
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 bg-slate-50/80 px-2 pt-2">
          <div className="flex">
            {TABS.map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => {
                  setTab(k)
                  setPicked(new Set())
                }}
                className={`relative flex items-center gap-2 px-5 py-3 text-sm font-bold ${tab === k ? 'bg-white text-brand' : 'text-slate-600 hover:bg-white/60'}`}
              >
                {label}
                {count[k] > 0 && <span className={`rounded-full px-2 py-0.5 text-xs ${k === 'pending' ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-700'}`}>{count[k]}</span>}
                {tab === k && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-brand" />}
              </button>
            ))}
          </div>
          {tab === 'all' && (
            <div className="flex flex-wrap gap-2 pb-2 pr-2">
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or no.…" className={`${inputCls} h-9 w-56`} />
              <Select value={status} onChange={(e) => setStatus(e.target.value)} className="h-9 w-40" aria-label="Status">
                <option value="">All statuses</option>
                {Object.entries(CLAIM_STATUS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </Select>
            </div>
          )}
        </div>

        {chosen.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-brand-light/50 px-5 py-2.5 text-sm">
            <span className="font-semibold text-slate-800">
              {chosen.length} selected · {money(chosenTotal)}
            </span>
            {tab === 'pending' ? (
              <Button size="sm" disabled={busy} onClick={() => act(chosen, 'approved')}>
                <IconCheck width={16} height={16} /> Approve selected
              </Button>
            ) : (
              <Button size="sm" disabled={busy} onClick={() => window.confirm(`Mark ${chosen.length} claim${chosen.length === 1 ? '' : 's'} paid (${money(chosenTotal)})?`) && act(chosen, 'paid')}>
                Mark selected paid
              </Button>
            )}
            <button type="button" className="text-xs text-slate-500 hover:text-slate-800" onClick={() => setPicked(new Set())}>
              Clear
            </button>
          </div>
        )}

        {loading ? (
          <Loading />
        ) : rows.length === 0 ? (
          <Empty>{tab === 'pending' ? 'Nothing waiting for your approval.' : tab === 'topay' ? 'No approved claims waiting for payment.' : 'No claims found.'}</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {tab !== 'all' && (
                    <th className="w-10 pl-5 py-2.5">
                      <input type="checkbox" checked={allTicked} onChange={tickAll} className="h-4 w-4 rounded border-slate-300" aria-label="Tick all" />
                    </th>
                  )}
                  <th className="w-44 px-3 py-2.5">No.</th>
                  <th className="px-3 py-2.5">Claimant</th>
                  <th className="px-3 py-2.5">Description</th>
                  <th className="w-24 px-3 py-2.5 text-right">Litre</th>
                  <th className="w-36 px-3 py-2.5 text-right">Claim payable</th>
                  <th className="w-24 px-3 py-2.5">Status</th>
                  <th className="w-56 px-3 py-2.5 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((c) => {
                  const ls = linesOf(c.id)
                  const cash = ls.filter((l) => l.payment !== 'fleet_card' && !isReload(l)).length
                  const sub = ls.filter((l) => l.payment === 'fleet_card').length
                  const reload = ls.filter(isReload).length
                  const litres = ls.length ? ls.reduce((s, l) => s + Number(l.litres || 0), 0) : Number(c.total_litres ?? c.litres ?? 0)
                  return (
                    <tr key={c.id} className={`hover:bg-slate-50/60 ${picked.has(c.id) ? 'bg-brand-light/30' : ''}`}>
                      {tab !== 'all' && (
                        <td className="pl-5 py-2.5">
                          {bulkable(c) && <input type="checkbox" checked={picked.has(c.id)} onChange={() => toggle(c.id)} className="h-4 w-4 rounded border-slate-300" aria-label={`Tick ${claimNo(c, 0)}`} />}
                        </td>
                      )}
                      <td className="whitespace-nowrap px-3 py-2.5">
                        <Link to={`/diesel/claims/${c.id}?from=review`} className="font-semibold tabular-nums text-slate-800 hover:text-brand">
                          {claimNo(c, 0)}
                        </Link>
                        <span className="ml-2 text-xs text-slate-500">{day(c.submitted_on || c.fill_date)}</span>
                      </td>
                      <td className="px-3 py-2.5 font-medium text-slate-800">{nameOf(c.claimant_id)}</td>
                      <td className="px-3 py-2.5">
                        <span className="flex flex-wrap gap-x-4 gap-y-0.5">
                          <span className="whitespace-nowrap text-amber-700">Cash fuel claim: {cash}</span>
                          <span className="whitespace-nowrap text-emerald-700">Subsidy fuel claim: {sub}</span>
                          {reload > 0 && <span className="whitespace-nowrap text-sky-700">Fleet card reload: {reload}</span>}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{num(litres, 2)} L</td>
                      <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-slate-900">{money(payableOf(c))}</td>
                      <td className="px-3 py-2.5">
                        <StatusBadge status={c.status} />
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center justify-end gap-1.5">
                          {c.status === 'pending' && canApprove(c) && (
                            <>
                              <Button size="sm" disabled={busy} onClick={() => act([c], 'approved')}>
                                <IconCheck width={15} height={15} /> Approve
                              </Button>
                              <Button size="sm" variant="secondary" className="text-red-600" disabled={busy} onClick={() => setRejecting(c)}>
                                <IconX width={15} height={15} /> Reject
                              </Button>
                            </>
                          )}
                          {c.status === 'approved' && canPay(c) && (
                            <Button size="sm" disabled={busy} onClick={() => act([c], 'paid')}>
                              Mark paid
                            </Button>
                          )}
                          <Link to={`/diesel/claims/${c.id}?from=review`} className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-brand" title="View" aria-label="View">
                            <IconEye width={18} height={18} />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              {tab === 'topay' && rows.length > 1 && (
                <tfoot>
                  <tr className="border-t border-slate-200 bg-slate-50/80 font-semibold">
                    <td colSpan={5} className="px-3 py-2.5 text-right text-slate-600">
                      Total to pay
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-900">{money(rows.reduce((s, c) => s + payableOf(c), 0))}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </Card>

      {rejecting && (
        <RejectModal
          onClose={() => setRejecting(null)}
          onReject={(note) => {
            const c = rejecting
            setRejecting(null)
            act([c], 'rejected', note)
          }}
        />
      )}
    </div>
  )
}
