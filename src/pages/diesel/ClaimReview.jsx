import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useOutletContext, useSearchParams } from 'react-router-dom'
import { Card } from '../../components/ui.jsx'
import { Empty, ErrorBox, Loading } from '../../components/diesel/shared.jsx'
import { decideTopup, isReload, listCardData, listClaimLines, listClaims, listPaymentDocs, listPeople, listTopups, listVehicles, personLabel, reviewClaim, topupNo } from '../../lib/diesel.js'
import { useAuth } from '../../auth/AuthContext.jsx'
import { claimNo } from './DieselClaims.jsx'
import { RejectModal } from './ClaimView.jsx'
import { ClaimsTable } from '../../components/diesel/ClaimsTable.jsx'
import { MarkPaidModal } from '../../components/diesel/PaymentDocs.jsx'
import { IconBack } from '../../components/icons.jsx'

// Claims Approval (& Payment for accountants), in tabs:
//   Pending approval  everything waiting for my approval: fuel claims of the
//                     people I approve, and their fleet card top-up requests
//                     (approving a top-up request puts a draft top-up claim
//                     in the requester's My Claims: migration 20261218)
//   To pay            approved claims, for accountants: mark paid
//   All claims        every claim I can see (accountants: the whole company)
// ?tab=pending|topay|all opens that tab (the Fuel Manage task bar).
// Same table on every claims tab (ClaimsTable.jsx). Approve / reject / mark
// paid right in the row, or several at once from the toolbar.
export default function ClaimReview() {
  const { company, access } = useOutletContext()
  const { user, isSuperAdmin } = useAuth()
  const [claims, setClaims] = useState([])
  const [lines, setLines] = useState([])
  const [people, setPeople] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [rejecting, setRejecting] = useState(null) // claim
  const [paying, setPaying] = useState(null) // claims to mark paid
  const [docs, setDocs] = useState({}) // payment documents by claim
  const navigate = useNavigate()
  const [status, setStatus] = useState('')
  const [q, setQ] = useState('')

  const [params] = useSearchParams()
  const approver = isSuperAdmin || access.admin
  const accountant = isSuperAdmin || access.pay
  const topupApprover = isSuperAdmin || Boolean(access.topupApprover)
  const claimsUser = approver || accountant || access.viewAll
  const allowed = claimsUser || topupApprover
  const TABS = [(approver || topupApprover) && ['pending', 'Pending approval'], accountant && ['topay', 'To pay'], claimsUser && ['all', 'All claims']].filter(Boolean)
  const wanted = params.get('tab') === 'topup' ? 'pending' : params.get('tab')
  const [tab, setTab] = useState(TABS.some(([k]) => k === wanted) ? wanted : TABS[0]?.[0])
  const [tu, setTu] = useState({ topups: [], cById: new Map(), vById: new Map() }) // top-up requests I may approve

  const load = useCallback(async () => {
    if (!allowed) return setLoading(false)
    try {
      const [c, p, t] = await Promise.all([
        claimsUser ? listClaims(company.id) : [],
        listPeople(company.id).catch(() => []),
        topupApprover
          ? Promise.all([listTopups(company.id).catch(() => null), listCardData(company.id).catch(() => ({ cards: [] })), listVehicles(company.id).catch(() => [])])
          : null
      ])
      const [ls, ds] = c.length
        ? await Promise.all([listClaimLines(company.id, { claimIds: c.map((x) => x.id) }).catch(() => []), listPaymentDocs(c.filter((x) => x.status === 'paid').map((x) => x.id)).catch(() => ({}))])
        : [[], {}]
      setDocs(ds)
      setClaims(c)
      setLines(ls)
      setPeople(p)
      if (t) setTu({ topups: t[0] || [], cById: new Map(t[1].cards.map((x) => [x.id, x])), vById: new Map(t[2].map((v) => [v.id, v])) })
      setError('')
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [company.id, allowed, claimsUser, topupApprover])

  useEffect(() => {
    setLoading(true)
    load()
  }, [load])

  const person = new Map(people.map((p) => [p.user_id, p]))
  const nameOf = (id) => (id === user.id ? `${user.fullName || user.email} (you)` : personLabel(person.get(id)))
  const canApprove = (c) =>
    c.kind === 'topup' ? c.claimant_id !== user.id || isSuperAdmin : c.claimant_id !== user.id && access.approves(c.claimant_id)
  const canPay = (c) => accountant && (c.claimant_id !== user.id || isSuperAdmin)
  const linesOf = useMemo(() => {
    const m = new Map()
    for (const l of lines) m.set(l.claim_id, [...(m.get(l.claim_id) || []), l])
    return (id) => m.get(id) || []
  }, [lines])

  const sorted = [...claims].sort((a, b) => ((a.submitted_on || a.fill_date) < (b.submitted_on || b.fill_date) ? 1 : -1))
  // Top-up requests waiting for me, shown as rows of the same table
  const cardLabel = (id) => {
    const card = tu.cById.get(id)
    const v = card?.vehicle_id ? tu.vById.get(card.vehicle_id) : null
    return card ? `Fleet card ${card.card_no || ''}${v ? ` (${v.reg_no || v.name})` : ''}` : 'Fleet card'
  }
  const topupRows = tu.topups
    .filter((r) => r.status === 'pending' && (r.requested_by !== user.id || isSuperAdmin) && (isSuperAdmin || access.approvesTopup?.(r.requested_by)))
    .map((r) => ({
      id: `tu-${r.id}`,
      kind: 'topup',
      topup: r,
      claimant_id: r.requested_by,
      submitted_on: (r.requested_at || '').slice(0, 10),
      status: 'pending',
      amount: Number(r.amount || 0),
      card: cardLabel(r.card_id),
      reason: r.reason || ''
    }))
  const pending = [...sorted.filter((c) => c.status === 'pending' && canApprove(c)), ...topupRows].sort((a, b) =>
    (a.submitted_on || a.fill_date || '') < (b.submitted_on || b.fill_date || '') ? 1 : -1
  )
  const noOf = (c, i) => (c.kind === 'topup' ? topupNo(c.topup) : claimNo(c, i))
  const toPay = sorted.filter((c) => c.status === 'approved' && canPay(c))
  const t = q.trim().toLowerCase()
  const all = sorted.filter((c) => (!status || c.status === status) && (!t || nameOf(c.claimant_id).toLowerCase().includes(t) || claimNo(c, 0).includes(t)))
  const rows = tab === 'pending' ? pending : tab === 'topay' ? toPay : all

  async function act(list, nextStatus, note) {
    setBusy(true)
    setError('')
    try {
      for (const c of list)
        if (c.kind === 'topup') await decideTopup(c.topup.id, nextStatus === 'approved', note)
        else await reviewClaim(c.id, nextStatus, note ?? c.review_note)
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
    if (c.kind === 'topup') return c.amount
    const ls = linesOf(c.id)
    return ls.length ? sum(ls, (l) => l.payment !== 'fleet_card' || isReload(l)) : Number(c.payable_amount ?? c.amount ?? 0)
  }

  if (!allowed)
    return (
      <Card>
        <Empty>You do not have the right to review claims.</Empty>
      </Card>
    )

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <button
          type="button"
          onClick={() => navigate('/diesel/claims')}
          className="inline-flex items-center gap-1.5 justify-self-start rounded-xl px-2 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 hover:text-brand"
        >
          <IconBack width={18} height={18} /> Back to My Claims
        </button>
        <h2 className="text-center font-display text-2xl font-bold tracking-tight text-slate-900">{accountant ? 'Claims Approval & Payment' : 'Claims Approval'}</h2>
        <span />
      </div>
      <ErrorBox>{error}</ErrorBox>
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 bg-slate-50/80 px-2 pt-2">
          <div className="flex">
            {TABS.map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setTab(k)}
                className={`relative flex items-center gap-2 px-5 py-3 text-sm font-bold ${tab === k ? 'fx-tab-on bg-white text-brand' : 'text-slate-600 hover:bg-white/60'}`}
              >
                {label}
                {tab === k && <span className="fx-line absolute inset-x-0 bottom-0 h-0.5 bg-brand" />}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <Loading />
        ) : (
          <ClaimsTable
            mode={tab}
            rows={rows}
            linesOf={linesOf}
            nameOf={nameOf}
            claimNo={noOf}
            payableOf={payableOf}
            busy={busy}
            canApprove={canApprove}
            canPay={canPay}
            onApprove={(list) => act(list, 'approved')}
            onReject={setRejecting}
            onPay={setPaying}
            docs={docs}
            onRefresh={() => {
              setLoading(true)
              load()
            }}
            search={q}
            onSearch={setQ}
            statusFilter={status}
            onStatusFilter={setStatus}
            empty={tab === 'pending' ? 'Nothing waiting for your approval.' : tab === 'topay' ? 'No approved claims waiting for payment.' : 'No claims found.'}
          />
        )}
      </Card>

      {paying && (
        <MarkPaidModal claims={paying} payableOf={payableOf} claimNo={claimNo} nameOf={nameOf} onPaid={(list) => act(list, 'paid')} onClose={() => setPaying(null)} />
      )}

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
