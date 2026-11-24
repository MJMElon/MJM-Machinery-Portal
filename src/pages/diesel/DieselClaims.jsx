import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useOutletContext } from 'react-router-dom'
import PageHeader from '../../components/PageHeader.jsx'
import { Button, Card } from '../../components/ui.jsx'
import { IconBell, IconClock, IconEye, IconPencil, IconPlus, IconPrint, IconTrash } from '../../components/icons.jsx'
import { Empty, ErrorBox, Loading, StatusBadge } from '../../components/diesel/shared.jsx'
import { FuelDashboard } from '../../components/diesel/FuelDashboard.jsx'
import { CLAIM_STATUS, deleteClaim, isReload, listClaimCards, listClaimLines, listClaims, listPaymentDocs, listPeople, listVehicles, personLabel, remindApprovers, removeReceipt } from '../../lib/diesel.js'
import { printClaim } from '../../components/diesel/ClaimPrint.js'
import { PaymentDocsButton } from '../../components/diesel/PaymentDocs.jsx'
import { day, money, num } from '../../lib/format.js'
import { useAuth } from '../../auth/AuthContext.jsx'

export const claimNo = (c, i) => (c.claim_no != null ? String(c.claim_no).padStart(3, '0') : String(i + 1))

// A draft is kept 30 days from its last save, then deleted for good
// (here when the claimant opens the page, and every night in the database:
// migration 20261215).
export const DRAFT_DAYS = 30
const DAY_MS = 24 * 60 * 60 * 1000
export const draftDaysLeft = (c) => DRAFT_DAYS - Math.floor((Date.now() - Date.parse(c.updated_at || c.created_at)) / DAY_MS)

// Fuel Claims: a dashboard of the year (litres and RM per month) and the claim
// list (No. · Date · Status · Description · amounts · Action), latest first — always the
// person's OWN claims only. Reviewers reach other people's claims through the
// separate "Claims Approval" page.
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
  const [docs, setDocs] = useState({}) // payment documents of paid claims

  const load = useCallback(async () => {
    try {
      let [c, p, v, cs] = await Promise.all([listClaims(company.id, { mine: user.id }), [], listVehicles(company.id).catch(() => []), listClaimCards(company.id).catch(() => [])])
      let ls = c.length ? await listClaimLines(company.id, { claimIds: c.map((x) => x.id) }).catch(() => []) : []
      // Drafts past 30 days: deleted with their receipt photos.
      const expired = c.filter((x) => x.status === 'draft' && draftDaysLeft(x) <= 0)
      if (expired.length) {
        const gone = new Set()
        for (const x of expired) {
          try {
            await deleteClaim(x.id)
            ls.filter((l) => l.claim_id === x.id).forEach((l) => removeReceipt(l.receipt_path))
            gone.add(x.id)
          } catch {
            /* the nightly clean-up in the database takes it */
          }
        }
        c = c.filter((x) => !gone.has(x.id) && !(x.status === 'draft' && draftDaysLeft(x) <= 0))
        ls = ls.filter((l) => !gone.has(l.claim_id))
      }
      setDocs(await listPaymentDocs(c.filter((x) => x.status === 'paid').map((x) => x.id)).catch(() => ({})))
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

  // Number on the Claims Approval button: waiting for my approval + approved waiting for payment (accountant)
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
  const liveLines = lines.filter((l) => !isReload(l) && !['rejected', 'draft'].includes(claims.find((c) => c.id === l.claim_id)?.status))

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

  // Bell: remind the approvers of a pending claim (an email, once a day).
  const [note, setNote] = useState('')
  async function remind(c) {
    setBusyId(c.id)
    setError('')
    setNote('')
    try {
      const r = await remindApprovers(c.id)
      setNote(
        r === 'sent'
          ? `Reminder sent to the approver of claim ${claimNo(c, 0)}.`
          : r === 'already'
          ? `The approver of claim ${claimNo(c, 0)} was already reminded today.`
          : r === 'off'
          ? 'Email is not set up yet, so no reminder could be sent.'
          : 'No approver with an email address is set for you yet.'
      )
    } catch (e) {
      setError(e.message)
    } finally {
      setBusyId(null)
    }
  }

  const canEdit = (c) => ['pending', 'draft'].includes(c.status) && c.claimant_id === user.id && access.can('claims', 'edit')
  const canDelete = (c) => (['pending', 'draft'].includes(c.status) && c.claimant_id === user.id && access.can('claims', 'delete')) || isSuperAdmin

  return (
    <div className="space-y-5">
      <PageHeader
        right={
          <div className="flex flex-wrap gap-2">
            {(access.admin || access.pay || access.viewAll) && (
              <Button variant="secondary" onClick={() => navigate('/diesel/claims/review')}>
                Claims Approval
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
      {note && (
        <p className="flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-800">
          <IconBell width={16} height={16} /> {note}
          <button type="button" className="ml-auto text-xs text-emerald-700 hover:underline" onClick={() => setNote('')}>
            Close
          </button>
        </p>
      )}

      {!loading && <FuelDashboard lines={liveLines} />}

      <Card className="overflow-hidden">
        <h3 className="border-b border-slate-200 px-5 py-3 font-semibold text-slate-800">My Claims</h3>
        {loading ? (
          <Loading />
        ) : rows.length === 0 ? (
          <Empty>No claims yet. Press New claim after filling up.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1040px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="w-20 py-2.5 pl-5 pr-3">No.</th>
                  <th className="w-32 px-3 py-2.5">Date</th>
                  <th className="w-56 px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5">Description</th>
                  <th className="w-24 px-3 py-2.5 text-right">Litre</th>
                  <th className="w-32 px-3 py-2.5 text-right">Total fuel expenses</th>
                  <th className="w-36 px-3 py-2.5 text-right">Claim payable amount</th>
                  <th className="w-56 py-2.5 pl-6 pr-4 text-center">Action</th>
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
                      <td className="whitespace-nowrap py-3 pl-5 pr-3 align-middle">
                        <Link to={`/diesel/claims/${c.id}`} className="font-semibold tabular-nums text-slate-800 hover:text-brand">
                          {claimNo(c, i)}
                        </Link>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 align-middle font-semibold tabular-nums text-slate-800">{day(c.submitted_on || c.fill_date)}</td>
                      <td className="whitespace-nowrap px-3 py-3 align-middle">
                        <span className="inline-flex items-center gap-2">
                          <StatusBadge status={c.status} />
                          {c.status === 'draft' && <DraftCountdown claim={c} />}
                          {c.status === 'paid' && <PaymentDocsButton docs={docs[c.id]} />}
                        </span>
                      </td>
                      <td className="px-3 py-3 align-middle">
                        {/* Side by side when there is room; each on its own line when the column is narrow */}
                        <Link to={`/diesel/claims/${c.id}`} className="flex flex-wrap gap-x-5 gap-y-0.5 text-slate-800 hover:text-brand">
                          <span className="whitespace-nowrap text-amber-700">Cash fuel claim: {cash.n}</span>
                          <span className="whitespace-nowrap text-emerald-700">Subsidy fuel claim: {sub.n}</span>
                          {reload.n > 0 && <span className="whitespace-nowrap text-sky-700">Fleet card reload: {reload.n}</span>}
                        </Link>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums align-middle">{num(cash.litres + sub.litres, 2)} L</td>
                      <td className="px-3 py-3 text-right tabular-nums align-middle">{money(cash.amount + sub.amount)}</td>
                      <td className="px-3 py-3 text-right font-semibold tabular-nums text-slate-900 align-middle">{money(cash.amount + reload.amount)}</td>
                      <td className="py-3 pl-6 pr-4 align-middle">
                        <div className="flex items-center justify-center gap-0.5">
                          <ActionButton onClick={c.status === 'pending' ? () => remind(c) : null} label="Remind approver to approve" Icon={IconBell} disabled={busyId === c.id} />
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

/** "12 days left" next to a draft; red in the last 5 days. */
export function DraftCountdown({ claim }) {
  const left = Math.max(draftDaysLeft(claim), 0)
  const label = left <= 1 ? 'Last day' : `${left} days left`
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${left <= 5 ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-slate-500'}`}
      title={`This draft is deleted in ${left} day${left === 1 ? '' : 's'}`}
    >
      <IconClock width={12} height={12} /> {label}
    </span>
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
