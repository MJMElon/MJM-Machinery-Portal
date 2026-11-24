import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useOutletContext, useSearchParams } from 'react-router-dom'
import { Card } from '../../components/ui.jsx'
import { Empty, ErrorBox, Loading } from '../../components/diesel/shared.jsx'
import { cardBalances, cardLedger, isReload, listCardData, listClaimLines, listClaims, listPaymentDocs, listPeople, listTopups, listVehicles, personLabel, reviewClaim } from '../../lib/diesel.js'
import { TopupSection } from '../../components/diesel/TopupRequests.jsx'
import { useAuth } from '../../auth/AuthContext.jsx'
import { claimNo } from './DieselClaims.jsx'
import { RejectModal } from './ClaimView.jsx'
import { ClaimsTable } from '../../components/diesel/ClaimsTable.jsx'
import { MarkPaidModal } from '../../components/diesel/PaymentDocs.jsx'
import { IconBack } from '../../components/icons.jsx'

// Claims Approval (& Payment for accountants), in tabs:
//   Pending approval  claims waiting for me: the people I am approver for
//                     (User setting → Claims approved by); claimant, date,
//                     amount, the receipt pictures, ✓ / ✗ (PendingClaims.jsx)
//   To pay            approved claims, for accountants: mark paid
//   All claims        every claim I can see (accountants: the whole company)
//   Top-up requests   fleet card top-up requests: to approve, to top up
//                     (procurement), my requests, all (TopupRequests.jsx)
// ?tab=pending|topay|all|topup opens that tab (the Fuel Manage task bar).
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
  // Top-up requests: approvers of top-ups, procurement, and anyone who may request one (their own requests)
  const topupUser = isSuperAdmin || access.topupApprover || access.can('topup', 'process') || access.can('cards', 'view')
  const claimsUser = approver || accountant || access.viewAll
  const allowed = claimsUser || topupUser
  const TABS = [
    approver && ['pending', 'Pending approval'],
    accountant && ['topay', 'To pay'],
    claimsUser && ['all', 'All claims'],
    topupUser && ['topup', 'Top-up requests']
  ].filter(Boolean)
  const wanted = params.get('tab')
  const [tab, setTab] = useState(TABS.some(([k]) => k === wanted) ? wanted : TABS[0]?.[0])
  const [tu, setTu] = useState(null) // { topups, cards, vById, balance } once loaded; topups null before the migration

  const load = useCallback(async () => {
    if (!allowed) return setLoading(false)
    try {
      const [c, p, t] = await Promise.all([
        claimsUser ? listClaims(company.id) : [],
        listPeople(company.id).catch(() => []),
        topupUser
          ? Promise.all([listTopups(company.id).catch(() => null), listCardData(company.id).catch(() => ({ cards: [] })), listVehicles(company.id).catch(() => []), cardLedger(company.id).catch(() => null)])
          : null
      ])
      const [ls, ds] = c.length
        ? await Promise.all([listClaimLines(company.id, { claimIds: c.map((x) => x.id) }).catch(() => []), listPaymentDocs(c.filter((x) => x.status === 'paid').map((x) => x.id)).catch(() => ({}))])
        : [[], {}]
      setDocs(ds)
      setClaims(c)
      setLines(ls)
      setPeople(p)
      if (t) setTu({ topups: t[0], cards: t[1].cards, vById: new Map(t[2].map((v) => [v.id, v])), balance: t[3] ? cardBalances(t[3]) : null })
      setError('')
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [company.id, allowed, claimsUser, topupUser])

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

  async function act(list, nextStatus, note) {
    setBusy(true)
    setError('')
    try {
      for (const c of list) await reviewClaim(c.id, nextStatus, note ?? c.review_note)
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

        {tab === 'topup' && (
          <div className="p-3 sm:p-4">
            {loading || !tu ? (
              <Loading />
            ) : tu.topups === null ? (
              <Empty>Top-up requests are not set up in the database yet.</Empty>
            ) : (
              <TopupSection
                company={company}
                access={access}
                me={user.id}
                topups={tu.topups}
                cards={tu.cards}
                vById={tu.vById}
                person={person}
                balance={tu.balance}
                onChanged={load}
                onError={setError}
              />
            )}
          </div>
        )}

        {tab === 'topup' ? null : loading ? (
          <Loading />
        ) : (
          <ClaimsTable
            mode={tab}
            rows={rows}
            linesOf={linesOf}
            nameOf={nameOf}
            claimNo={claimNo}
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
