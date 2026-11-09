import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useOutletContext, useParams, useSearchParams } from 'react-router-dom'
import PageHeader from '../../components/PageHeader.jsx'
import { Badge, Button, Card, Modal } from '../../components/ui.jsx'
import { IconCheck, IconPencil, IconPrint, IconTrash, IconX } from '../../components/icons.jsx'
import { ErrorBox, Loading, ReceiptButton, StatusBadge, inputCls } from '../../components/diesel/shared.jsx'
import {
  deleteClaim,
  getClaim,
  getClaimLines,
  listPeople,
  listVehicles,
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
// people with the right) approve / reject / mark paid. Print gives a clean claim
// form to hand in; ?print=1 prints at once.
export default function ClaimView() {
  const { company, access } = useOutletContext()
  const { user, isSuperAdmin } = useAuth()
  const { id } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [claim, setClaim] = useState(null)
  const [lines, setLines] = useState([])
  const [vehicles, setVehicles] = useState([])
  const [people, setPeople] = useState([])
  const [imgs, setImgs] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [rejecting, setRejecting] = useState(false)

  const load = useCallback(async () => {
    try {
      const [c, ls, v, p] = await Promise.all([getClaim(id), getClaimLines(id), listVehicles(company.id), access.viewAll ? listPeople(company.id) : []])
      if (!c) throw new Error('Claim not found (or you have no access to it).')
      setClaim(c)
      setLines(ls)
      setVehicles(v)
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

  useEffect(() => {
    if (!loading && claim && params.get('print') === '1') {
      const t = setTimeout(() => window.print(), Object.keys(imgs).length ? 800 : 200)
      return () => clearTimeout(t)
    }
  }, [loading, claim, imgs, params])

  const person = new Map(people.map((p) => [p.user_id, p]))
  const vById = new Map(vehicles.map((v) => [v.id, v]))
  const own = claim?.claimant_id === user.id
  const canEdit = claim && own && claim.status === 'pending' && access.can('claims', 'edit')
  const canDelete = claim && ((own && claim.status === 'pending' && access.can('claims', 'delete')) || isSuperAdmin)
  const canReview = claim && (access.admin || access.pay) && (!own || isSuperAdmin)
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

  const claimantName = own ? user.fullName || user.email : personLabel(person.get(claim?.claimant_id))

  return (
    <div className="space-y-4">
      <div className="print:hidden">
        <PageHeader
          backTo="/diesel/claims"
          backLabel="Back to claim list"
          title={claim ? `Fuel claim ${claimNo(claim, 0)}` : 'Fuel claim'}
          right={
            claim && (
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => window.print()}>
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
          {/* The claim form (prints) */}
          <Card className="p-5 sm:p-6 print:border-0 print:p-0 print:shadow-none">
            <div className="mb-4 flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
              <div>
                <p className="font-display text-xl font-extrabold tracking-tight text-slate-900">Fuel Claim</p>
                <p className="text-sm text-slate-600">{company.name}</p>
                <p className="text-sm text-slate-600">Claimant: {claimantName}</p>
                <p className="text-sm text-slate-600">Submission date: {day(claim.submitted_on || claim.fill_date)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs uppercase tracking-wide text-slate-400">Claim no.</p>
                <p className="font-display text-2xl font-extrabold tabular-nums text-slate-900">{claimNo(claim, 0)}</p>
                <StatusBadge status={claim.status} />
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="py-2 pr-2">#</th>
                    <th className="py-2 pr-2">Receipt date</th>
                    <th className="py-2 pr-2">Vehicle</th>
                    <th className="py-2 pr-2">Receipt no.</th>
                    <th className="py-2 pr-2 text-right">Litre</th>
                    <th className="py-2 pr-2 text-right">Unit price</th>
                    <th className="py-2 pr-2 text-right">Amount</th>
                    <th className="py-2 pr-2">Payment</th>
                    <th className="py-2 pr-2">Remark</th>
                    <th className="py-2 text-right">Payable</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lines.map((l, i) => (
                    <tr key={l.id}>
                      <td className="py-2 pr-2 text-slate-500">{i + 1}</td>
                      <td className="py-2 pr-2">{day(l.fill_date)}</td>
                      <td className="py-2 pr-2">{l.vehicle_id ? vehicleLabel(vById.get(l.vehicle_id)) : '—'}</td>
                      <td className="py-2 pr-2">{l.receipt_no || '—'}</td>
                      <td className="py-2 pr-2 text-right tabular-nums">{l.litres != null ? num(l.litres, 2) : '—'}</td>
                      <td className="py-2 pr-2 text-right tabular-nums">{l.unit_price != null ? Number(l.unit_price).toFixed(3) : '—'}</td>
                      <td className="py-2 pr-2 text-right tabular-nums">{money(l.amount)}</td>
                      <td className="py-2 pr-2">
                        {l.payment === 'fleet_card' ? 'Fleet card (KPDN)' : 'Cash'}
                      </td>
                      <td className="py-2 pr-2 text-slate-600">{[l.station, l.remark].filter(Boolean).join(' · ') || '—'}</td>
                      <td className="py-2 text-right font-semibold tabular-nums">{money(l.payment === 'cash' ? l.amount : 0)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-slate-300 font-semibold text-slate-900">
                    <td className="py-2 pr-2" colSpan={4}>
                      Total
                    </td>
                    <td className="py-2 pr-2 text-right tabular-nums">{num(litres, 2)} L</td>
                    <td />
                    <td className="py-2 pr-2 text-right tabular-nums">{money(total)}</td>
                    <td colSpan={2} className="py-2 pr-2 text-right">
                      Payable amount
                    </td>
                    <td className="py-2 text-right text-lg tabular-nums text-brand-dark">{money(payable)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            {claim.notes && <p className="mt-3 text-sm text-slate-600">Notes: {claim.notes}</p>}
            {claim.reviewed_at && (
              <p className="mt-2 text-sm text-slate-600">
                Reviewed {day(claim.reviewed_at.slice(0, 10))} by {personLabel(person.get(claim.reviewed_by)) || 'admin'}
                {claim.review_note ? ` · ${claim.review_note}` : ''}
              </p>
            )}
            <div className="mt-10 hidden grid-cols-3 gap-8 text-xs text-slate-500 print:grid">
              <div className="border-t border-slate-400 pt-1">Claimant signature</div>
              <div className="border-t border-slate-400 pt-1">Checked by</div>
              <div className="border-t border-slate-400 pt-1">Approved by</div>
            </div>
            {/* Receipts on the printout */}
            <div className="mt-6 hidden grid-cols-2 gap-4 print:grid">
              {lines.map((l, i) => imgs[l.id] && (
                <figure key={l.id}>
                  <img src={imgs[l.id]} alt={`Receipt ${i + 1}`} className="max-h-[45vh] rounded border border-slate-200" />
                  <figcaption className="text-xs text-slate-500">Receipt {i + 1} · {day(l.fill_date)} · {money(l.amount)}</figcaption>
                </figure>
              ))}
            </div>
          </Card>

          {/* Receipts + review (screen) */}
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] print:hidden">
            <Card className="p-4">
              <p className="mb-2 font-semibold text-slate-800">Receipts</p>
              {lines.every((l) => !l.receipt_path) ? (
                <p className="text-sm text-slate-500">No receipt attached.</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {lines.map((l, i) =>
                    l.receipt_path ? (
                      <div key={l.id} className="rounded-xl border border-slate-200 p-2">
                        {imgs[l.id] ? (
                          <img src={imgs[l.id]} alt={`Receipt ${i + 1}`} className="h-40 w-full rounded-lg object-contain" />
                        ) : (
                          <p className="py-6 text-center text-xs text-slate-500">PDF receipt</p>
                        )}
                        <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
                          <span>
                            #{i + 1} · {money(l.amount)}
                          </span>
                          <ReceiptButton path={l.receipt_path} />
                        </div>
                      </div>
                    ) : null
                  )}
                </div>
              )}
            </Card>

            {(access.admin || access.pay) && (
              <Card className="p-4">
                <p className="mb-2 font-semibold text-slate-800">Review</p>
                {!canReview ? (
                  <p className="text-sm text-slate-500">Your own claim — another reviewer handles it.</p>
                ) : claim.status === 'pending' && access.admin ? (
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" disabled={busy} onClick={() => review('approved')}>
                      <IconCheck width={16} height={16} /> Approve
                    </Button>
                    <Button size="sm" variant="ghost" className="text-red-600" disabled={busy} onClick={() => setRejecting(true)}>
                      <IconX width={16} height={16} /> Reject
                    </Button>
                  </div>
                ) : claim.status === 'approved' ? (
                  <div className="flex flex-wrap gap-2">
                    {access.pay && (
                      <Button size="sm" variant="secondary" disabled={busy} onClick={() => review('paid')}>
                        Mark paid {payable > 0 ? money(payable) : ''}
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
                  <p className="text-sm text-slate-500">{claim.status === 'paid' ? 'Paid.' : 'No action for you here.'}</p>
                )}
                {payable === 0 && <Badge className="mt-3">Nothing to pay back — fleet card only</Badge>}
              </Card>
            )}
          </div>
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
