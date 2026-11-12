import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useOutletContext, useParams, useSearchParams } from 'react-router-dom'
import PageHeader from '../../components/PageHeader.jsx'
import { Badge, Button, Card, Modal } from '../../components/ui.jsx'
import { IconCheck, IconPencil, IconPrint, IconTrash, IconX } from '../../components/icons.jsx'
import { ErrorBox, Loading, StatusBadge, inputCls } from '../../components/diesel/shared.jsx'
import { printClaim } from '../../components/diesel/ClaimPrint.js'
import {
  deleteClaim,
  getClaim,
  getClaimLines,
  isReload,
  listClaimCards,
  listPeople,
  listVehicles,
  openReceipt,
  personLabel,
  receiptUrl,
  removeReceipt,
  reviewClaim,
  vehicleLabel
} from '../../lib/diesel.js'
import { day, money, num } from '../../lib/format.js'
import { useAuth } from '../../auth/AuthContext.jsx'
import { claimNo } from './DieselClaims.jsx'

// One fuel claim: header, the receipt rows, totals, the receipts, and (for
// people with the right) approve / reject / mark paid. Print opens the print
// dialog in place with the claim form (cash receipts only); ?print=1 does so
// as soon as the claim has loaded.
export default function ClaimView() {
  const { company, access } = useOutletContext()
  const { user, isSuperAdmin } = useAuth()
  const { id } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [claim, setClaim] = useState(null)
  const [lines, setLines] = useState([])
  const [vehicles, setVehicles] = useState([])
  const [cards, setCards] = useState([])
  const [people, setPeople] = useState([])
  const [imgs, setImgs] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const printedOnLoad = useRef(false)

  const load = useCallback(async () => {
    try {
      const [c, ls, v, p, cs] = await Promise.all([getClaim(id), getClaimLines(id), listVehicles(company.id), access.viewAll ? listPeople(company.id) : [], listClaimCards(company.id).catch(() => [])])
      if (!c) throw new Error('Claim not found (or you have no access to it).')
      setClaim(c)
      setLines(ls)
      setVehicles(v)
      setCards(cs)
      setPeople(p)
      const urls = {}
      for (const l of ls) if (l.receipt_path && !/\.pdf$/i.test(l.receipt_path)) urls[l.id] = await receiptUrl(l.receipt_path)
      setImgs(urls)
      setError('')
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [id, company.id, access.viewAll])

  useEffect(() => {
    load()
  }, [load])

  const person = new Map(people.map((p) => [p.user_id, p]))
  const vById = new Map(vehicles.map((v) => [v.id, v]))
  const cById = new Map(cards.map((c) => [c.id, c]))
  const own = claim?.claimant_id === user.id
  const claimantName = own ? user.fullName || user.email : personLabel(person.get(claim?.claimant_id))

  const print = () =>
    act(() => printClaim({ company, claim, lines, vehicles, cards, claimantName }))

  useEffect(() => {
    if (!loading && claim && params.get('print') === '1' && !printedOnLoad.current) {
      printedOnLoad.current = true
      print()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, claim, params])
  const canEdit = claim && own && claim.status === 'pending' && access.can('claims', 'edit')
  const canDelete = claim && ((own && claim.status === 'pending' && access.can('claims', 'delete')) || isSuperAdmin)
  // Nobody reviews their own claim, super admins included.
  const canReview = claim && (access.admin || access.pay) && !own && access.reviewable(claim.claimant_id)
  const total = lines.reduce((s, l) => s + Number(l.amount || 0), 0)
  const payable = lines.filter((l) => l.payment === 'cash').reduce((s, l) => s + Number(l.amount || 0), 0)
  const litres = lines.reduce((s, l) => s + Number(l.litres || 0), 0)

  async function act(fn) {
    setBusy(true)
    setError('')
    try {
      await fn()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }
  const review = (status, note) =>
    act(async () => {
      const data = await reviewClaim(claim.id, status, note ?? claim.review_note)
      setClaim((c) => ({ ...c, ...data }))
    })
  const remove = () =>
    window.confirm('Delete this claim? This cannot be undone.') &&
    act(async () => {
      await deleteClaim(claim.id)
      lines.forEach((l) => removeReceipt(l.receipt_path))
      navigate('/diesel/claims', { replace: true })
    })

  if (loading) return <Loading />

  // Read-only boxes that mirror the claim form's cells.
  const box = 'flex items-center rounded-lg border border-slate-200 bg-slate-50 px-2 text-sm text-slate-800'
  const cell = `${box} h-9`
  const tall = `${box} h-[78px] items-start py-2 leading-snug`
  const showApproval = access.admin || access.pay

  const approval = !claim ? null : !canReview ? (
    <p className="text-xs text-slate-500">{own ? 'Your own claim' : claim.status === 'paid' ? 'Paid' : 'Not your approvee'}</p>
  ) : claim.status === 'pending' && access.admin ? (
    <div className="flex flex-col gap-2">
      <Button size="sm" disabled={busy} onClick={() => review('approved')}>
        <IconCheck width={16} height={16} /> Approve
      </Button>
      <Button size="sm" variant="secondary" className="text-red-600" disabled={busy} onClick={() => setRejecting(true)}>
        <IconX width={16} height={16} /> Reject
      </Button>
    </div>
  ) : claim.status === 'approved' ? (
    <div className="flex flex-col gap-2">
      {access.pay && (
        <Button size="sm" disabled={busy} onClick={() => review('paid')}>
          Mark paid
        </Button>
      )}
      {access.admin && (
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => review('pending')}>
          Back to pending
        </Button>
      )}
    </div>
  ) : claim.status === 'rejected' && access.admin ? (
    <Button size="sm" variant="ghost" disabled={busy} onClick={() => review('pending', null)}>
      Back to pending
    </Button>
  ) : (
    <p className="text-xs text-slate-500">{claim.status === 'paid' ? 'Paid' : '—'}</p>
  )

  return (
    <div className="space-y-4">
      <div>
        <PageHeader
          backTo="/diesel/claims"
          backLabel="Back to claim list"
          title={
            claim ? (
              <span className="inline-flex flex-wrap items-center gap-3">
                Fuel claim #{claimNo(claim, 0)}
                <StatusBadge status={claim.status} />
              </span>
            ) : (
              'Fuel claim'
            )
          }
          right={
            claim && (
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" disabled={busy} onClick={print}>
                  <IconPrint width={18} height={18} /> Print
                </Button>
                {canEdit && (
                  <Button variant="secondary" onClick={() => navigate(`/diesel/claims/${claim.id}/edit`)}>
                    <IconPencil width={18} height={18} /> Edit
                  </Button>
                )}
                {canDelete && (
                  <Button variant="secondary" className="text-red-600" disabled={busy} onClick={remove}>
                    <IconTrash width={18} height={18} /> Delete
                  </Button>
                )}
              </div>
            )
          }
        />
        <ErrorBox>{error}</ErrorBox>
      </div>

      {claim && (
        <>
          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1 px-4 py-3 text-sm text-slate-600">
              <span>Submission date: <b className="text-slate-800">{day(claim.submitted_on || claim.fill_date)}</b></span>
              <span>Total amount: <b className="text-slate-800">{money(total)}</b></span>
              <span>Payable amount: <b className="text-brand-dark">{money(payable)}</b></span>
              <span>Total litres: <b className="text-slate-800">{num(litres, 2)} L</b></span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1180px] border-t border-slate-200 text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="w-10 px-3 py-2.5">#</th>
                    <th className="w-44 px-2 py-2.5">Vehicle no.</th>
                    <th className="w-44 px-2 py-2.5">Receipt</th>
                    <th className="w-40 px-2 py-2.5">Description</th>
                    <th className="w-40 px-2 py-2.5">Fuel</th>
                    <th className="w-36 px-2 py-2.5 text-right">Total fuel expenses</th>
                    <th className="w-36 px-2 py-2.5 text-right">Claim payable amount</th>
                    <th className="w-40 px-2 py-2.5">Payment method</th>
                    <th className="w-44 px-2 py-2.5">Remark</th>
                    <th className="w-40 px-2 py-2.5">Attachment</th>
                    {showApproval && <th className="w-36 px-2 py-2.5">Approval</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lines.map((l, i) => (
                    <tr key={l.id} className="align-top">
                      <td className="px-3 py-3 text-slate-500">{i + 1}</td>
                      <td className="px-2 py-3">
                        <div className={`${tall} ${isReload(l) ? 'font-semibold text-emerald-700' : ''}`}>
                          {isReload(l) ? (
                            <span>
                              Fleet card reload
                              <span className="block text-xs font-normal text-slate-600">{cById.get(l.card_id)?.card_no || 'Card'}</span>
                            </span>
                          ) : l.vehicle_id ? (
                            vehicleLabel(vById.get(l.vehicle_id))
                          ) : (
                            'No vehicle'
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-3">
                        <div className="space-y-1.5">
                          <div className={cell}>{day(l.fill_date)}</div>
                          <div className={`${cell} truncate`} title={l.receipt_no || ''}>{l.receipt_no || '—'}</div>
                        </div>
                      </td>
                      <td className="px-2 py-3">
                        <div className={tall}>{[l.description, l.station].filter(Boolean).join(' · ') || '—'}</div>
                      </td>
                      <td className="px-2 py-3">
                        <div className="space-y-1.5">
                          <div className={`${cell} justify-between tabular-nums`}>
                            <span>{l.litres != null ? num(l.litres, 2) : '—'}</span>
                            <span className="text-xs text-slate-400">L</span>
                          </div>
                          <div className={`${cell} justify-between tabular-nums`}>
                            <span>{l.unit_price != null ? Number(l.unit_price).toFixed(3) : '—'}</span>
                            <span className="text-xs text-slate-400">RM/L</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-2 py-3">
                        <div className={`${tall} justify-end font-semibold tabular-nums`}>{money(l.amount)}</div>
                      </td>
                      <td className="px-2 py-3">
                        <div className={`${tall} justify-end font-bold tabular-nums text-brand-dark`}>{money(l.payment === 'cash' ? l.amount : 0)}</div>
                      </td>
                      <td className="px-2 py-3">
                        <div className="space-y-1.5">
                          <div className={cell}>{l.payment === 'fleet_card' ? 'Fleet card' : 'Cash'}</div>
                          <p className={`flex h-9 items-center rounded-lg px-2 text-xs font-medium ${isReload(l) ? 'bg-sky-50 text-sky-700' : l.payment === 'fleet_card' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                            {isReload(l) ? 'Card top-up · paid back' : l.payment === 'fleet_card' ? 'KPDN subsidy' : 'Non-subsidised'}
                          </p>
                        </div>
                      </td>
                      <td className="px-2 py-3">
                        <div className={`${tall} overflow-hidden text-slate-600`}>{l.remark || '—'}</div>
                      </td>
                      <td className="px-2 py-3">
                        {l.receipt_path ? (
                          <button
                            type="button"
                            onClick={() => openReceipt(l.receipt_path).catch((e) => window.alert(e.message))}
                            className="flex h-[78px] w-full items-center justify-center gap-2 overflow-hidden rounded-lg border border-slate-200 bg-white p-1 hover:border-brand"
                            title="Open receipt"
                          >
                            {imgs[l.id] ? (
                              <img src={imgs[l.id]} alt={`Receipt ${i + 1}`} className="h-full w-full rounded object-contain" />
                            ) : (
                              <span className="text-xs font-medium text-brand">Open PDF</span>
                            )}
                          </button>
                        ) : (
                          <div className={`${tall} justify-center text-xs text-red-500`}>No receipt</div>
                        )}
                      </td>
                      {showApproval && i === 0 && (
                        <td className="px-2 py-3" rowSpan={lines.length}>
                          {approval}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-slate-200 bg-slate-50/60 text-sm font-semibold text-slate-800">
                    <td className="px-3 py-2.5" colSpan={4}>
                      Total
                    </td>
                    <td className="px-2 py-2.5 text-right">{num(litres, 2)} L</td>
                    <td className="px-2 py-2.5 text-right">{money(total)}</td>
                    <td className="px-2 py-2.5 text-right text-brand-dark">{money(payable)}</td>
                    <td colSpan={showApproval ? 4 : 3} />
                  </tr>
                </tfoot>
              </table>
            </div>
            {(claim.notes || claim.reviewed_at || payable === 0) && (
              <div className="space-y-1 px-4 py-3 text-sm text-slate-600">
                {claim.notes && <p>Notes: {claim.notes}</p>}
                {claim.reviewed_at && (
                  <p>
                    Reviewed {day(claim.reviewed_at.slice(0, 10))} by {personLabel(person.get(claim.reviewed_by)) || 'admin'}
                    {claim.review_note ? ` · ${claim.review_note}` : ''}
                  </p>
                )}
                {payable === 0 && <Badge>Nothing to pay back — fleet card only</Badge>}
              </div>
            )}
          </Card>
        </>
      )}

      {rejecting && (
        <RejectModal
          onClose={() => setRejecting(false)}
          onReject={(note) => {
            review('rejected', note)
            setRejecting(false)
          }}
        />
      )}
    </div>
  )
}

function RejectModal({ onClose, onReject }) {
  const [note, setNote] = useState('')
  return (
    <Modal open onClose={onClose} title="Reject claim">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (note.trim()) onReject(note.trim())
        }}
        className="space-y-3"
      >
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">Reason (the claimant will see this)</span>
          <input autoFocus required maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} />
        </label>
        <div className="flex justify-end gap-2">
          <Button type="button" size="sm" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" size="sm" variant="danger" disabled={!note.trim()}>
            Reject
          </Button>
        </div>
      </form>
    </Modal>
  )
}
