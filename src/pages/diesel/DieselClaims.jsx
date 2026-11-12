import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useOutletContext } from 'react-router-dom'
import PageHeader from '../../components/PageHeader.jsx'
import { Button, Card } from '../../components/ui.jsx'
import { IconEye, IconPencil, IconPlus, IconPrint, IconTrash } from '../../components/icons.jsx'
import { Empty, ErrorBox, Loading, StatusBadge } from '../../components/diesel/shared.jsx'
import { FuelDashboard } from '../../components/diesel/FuelDashboard.jsx'
import { CLAIM_STATUS, deleteClaim, isReload, listClaimCards, listClaimLines, listClaims, listPeople, listVehicles, personLabel, removeReceipt } from '../../lib/diesel.js'
import { printClaim } from '../../components/diesel/ClaimPrint.js'
import { day, money, num } from '../../lib/format.js'
import { useAuth } from '../../auth/AuthContext.jsx'

export const claimNo = (c, i) => (c.claim_no != null ? String(c.claim_no).padStart(3, '0') : String(i + 1))

// Fuel Claims: a dashboard of the year (litres and RM per month) and the claim
// list (No. · Description · Claim amount · Action), latest first — always the
// person's OWN claims only. Reviewers reach other people's claims through the
// separate "Review claims" page.
export default function DieselClaims() {
  const { company, access } = useOutletContext()
  const { user, isSuperAdmin } = useAuth()
  const navigate = useNavigate()
  const [claims, setClaims] = useState([])
  const [lines, setLines] = useState([])
  const [vehicles, setVehicles] = useState([])
  const [cards, setCards] = useState([])
  const [people, setPeople] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [toReview, setToReview] = useState(0)

  const load = useCallback(async () => {
    try {
      const [c, p, v, cs] = await Promise.all([listClaims(company.id, { mine: user.id }), [], listVehicles(company.id).catch(() => []), listClaimCards(company.id).catch(() => [])])
      const ls = c.length ? await listClaimLines(company.id, { claimIds: c.map((x) => x.id) }).catch(() => []) : []
      setClaims(c)
      setLines(ls)
      setVehicles(v)
      setCards(cs)
      setPeople(p)
      setError('')
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [company.id, user.id])

  useEffect(() => {
    setLoading(true)
    load()
  }, [load])

  // Number on the Review claims button: waiting for my approval + approved waiting for payment (accountant)
  const approver = isSuperAdmin || access.admin
  const accountant = isSuperAdmin || access.pay
  useEffect(() => {
    if (!approver && !accountant) return
    let active = true
    listClaims(company.id)
      .then((all) => {
        if (!active) return
        const mine = (c) => c.claimant_id === user.id
        setToReview(
          all.filter((c) => (approver && c.status === 'pending' && !mine(c) && access.approves(c.claimant_id)) || (accountant && c.status === 'approved' && (!mine(c) || isSuperAdmin))).length
        )
      })
      .catch(() => {})
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company.id, user.id, approver, accountant])

  const person = new Map(people.map((p) => [p.user_id, p]))
  // Cash (claimable) receipts and subsidised fleet-card receipts, summed up.
  const sumUp = (ls) => {
    const litres = ls.reduce((s, l) => s + Number(l.litres || 0), 0)
    const amount = ls.reduce((s, l) => s + Number(l.amount || 0), 0)
    return { n: ls.length, litres, amount }
  }
  const linesOf = (id) => lines.filter((l) => l.claim_id === id)
  // Latest first: submission date, then creation.
  const rows = [...claims].sort((a, b) => {
    const da = a.submitted_on || a.fill_date
    const db = b.submitted_on || b.fill_date
    return da < db ? 1 : da > db ? -1 : (a.created_at || '') < (b.created_at || '') ? 1 : -1
  })
  // Rows not yet rejected count towards the dashboard (a card reload is not fuel: the fuel shows when the card is used)
  const liveLines = lines.filter((l) => !isReload(l) && claims.find((c) => c.id === l.claim_id)?.status !== 'rejected')

  async function remove(c) {
    if (!window.confirm(`Delete claim ${claimNo(c, 0)}? This cannot be undone.`)) return
    setBusyId(c.id)
    setError('')
    try {
      await deleteClaim(c.id)
      linesOf(c.id).forEach((l) => removeReceipt(l.receipt_path))
      await load()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusyId(null)
    }
  }

  // Print opens the print dialog right here, over the list (cash receipts only).
  async function print(c) {
    setBusyId(c.id)
    setError('')
    try {
      await printClaim({ company, claim: c, lines: linesOf(c.id), vehicles, cards, claimantName: user.fullName || user.email })
    } catch (e) {
      setError(e.message)
    } finally {
      setBusyId(null)
    }
  }

  const canEdit = (c) => c.status === 'pending' && c.claimant_id === user.id && access.can('claims', 'edit')
  const canDelete = (c) => (c.status === 'pending' && c.claimant_id === user.id && access.can('claims', 'delete')) || isSuperAdmin

  return (
    <div className="space-y-5">
      <PageHeader
        right={
          <div className="flex flex-wrap gap-2">
            {(access.admin || access.pay || access.viewAll) && (
              <Button variant="secondary" onClick={() => navigate('/diesel/claims/review')}>
                Review claims
                {toReview > 0 && <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold text-white">{toReview}</span>}
              </Button>
            )}
            {access.claim && (
              <Button onClick={() => navigate('/diesel/claims/new')}>
                <IconPlus width={18} height={18} /> New claim
              </Button>
            )}
          </div>
        }
      />
      <ErrorBox>{error}</ErrorBox>

      {!loading && <FuelDashboard lines={liveLines} title="Fuel history" />}

      <Card className="overflow-hidden">
        <h3 className="border-b border-slate-200 px-5 py-3 font-semibold text-slate-800">Claim list</h3>
        {loading ? (
          <Loading />
        ) : rows.length === 0 ? (
          <Empty>No claims yet. Press New claim after filling up.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="w-72 px-5 py-2.5">No.</th>
                  <th className="px-3 py-2.5">Description</th>
                  <th className="w-28 px-3 py-2.5 text-right">Litre</th>
                  <th className="w-40 px-3 py-2.5 text-right">Total fuel expenses</th>
                  <th className="w-44 px-3 py-2.5 text-right">Claim payable amount</th>
                  <th className="w-40 px-3 py-2.5 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((c, i) => {
                  const ls = linesOf(c.id)
                  const cash = sumUp(ls.filter((l) => l.payment !== 'fleet_card' && !isReload(l)))
                  const sub = sumUp(ls.filter((l) => l.payment === 'fleet_card'))
                  const reload = sumUp(ls.filter(isReload))
                  return (
                    <tr key={c.id} className="hover:bg-slate-50/60">
                      <td className="whitespace-nowrap px-5 py-2.5 align-middle">
                        <div className="flex items-center gap-3">
                          <Link to={`/diesel/claims/${c.id}`} className="font-semibold tabular-nums text-slate-800 hover:text-brand">
                            {claimNo(c, i)}
                          </Link>
                          <span className="text-xs text-slate-500">{day(c.submitted_on || c.fill_date)}</span>
                          <StatusBadge status={c.status} />
                        </div>
                      </td>
                      <td className="px-3 py-2.5 align-middle">
                        {/* Side by side when there is room; each on its own line when the column is narrow */}
                        <Link to={`/diesel/claims/${c.id}`} className="flex flex-wrap gap-x-5 gap-y-0.5 text-slate-800 hover:text-brand">
                          <span className="whitespace-nowrap text-amber-700">Cash fuel claim: {cash.n}</span>
                          <span className="whitespace-nowrap text-emerald-700">Subsidy fuel claim: {sub.n}</span>
                          {reload.n > 0 && <span className="whitespace-nowrap text-sky-700">Fleet card reload: {reload.n}</span>}
                        </Link>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums align-middle">{num(cash.litres + sub.litres, 2)} L</td>
                      <td className="px-3 py-2.5 text-right tabular-nums align-middle">{money(cash.amount + sub.amount)}</td>
                      <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-slate-900 align-middle">{money(cash.amount + reload.amount)}</td>
                      <td className="px-3 py-2.5 align-middle">
                        <div className="flex items-center justify-center gap-0.5">
                          <ActionButton to={`/diesel/claims/${c.id}`} label="View" Icon={IconEye} />
                          <ActionButton to={canEdit(c) ? `/diesel/claims/${c.id}/edit` : null} label="Edit" Icon={IconPencil} />
                          <ActionButton onClick={() => print(c)} label="Print" Icon={IconPrint} disabled={busyId === c.id} />
                          <ActionButton onClick={canDelete(c) ? () => remove(c) : null} label="Delete" Icon={IconTrash} danger disabled={busyId === c.id} />
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}

function ActionButton({ to, onClick, label, Icon, danger, disabled }) {
  const cls = `flex h-9 w-9 items-center justify-center rounded-lg ${
    danger ? 'text-slate-400 hover:bg-red-50 hover:text-red-600' : 'text-slate-500 hover:bg-slate-100 hover:text-brand'
  } disabled:cursor-not-allowed disabled:opacity-30`
  if (!to && !onClick)
    return (
      <span className={`${cls} cursor-not-allowed opacity-30`} title={`${label} not available`} aria-hidden="true">
        <Icon width={18} height={18} />
      </span>
    )
  if (to)
    return (
      <Link to={to} className={cls} title={label} aria-label={label}>
        <Icon width={18} height={18} />
      </Link>
    )
  return (
    <button onClick={onClick} disabled={disabled} className={cls} title={label} aria-label={label}>
      <Icon width={18} height={18} />
    </button>
  )
}
