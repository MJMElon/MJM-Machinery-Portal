import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useOutletContext, useParams, useSearchParams } from 'react-router-dom'
import PageHeader from '../../components/PageHeader.jsx'
import { Button, Card, Modal } from '../../components/ui.jsx'
import { IconCheck, IconPencil, IconPrint, IconTrash, IconX } from '../../components/icons.jsx'
import { ErrorBox, Loading, ReceiptButton, StatusBadge, inputCls } from '../../components/diesel/shared.jsx'
import { deleteClaim, getClaim, listPeople, listVehicles, personLabel, receiptUrl, removeReceipt, reviewClaim, vehicleLabel } from '../../lib/diesel.js'
import { day, money, num } from '../../lib/format.js'
import { useAuth } from '../../auth/AuthContext.jsx'
import { claimNo } from './DieselClaims.jsx'

// One fuel claim: all details, the receipt, and (for Fuel admins) approve /
// reject / mark paid. The Print button prints a clean claim form; opening the
// page with ?print=1 prints at once.
export default function ClaimView() {
  const { company, access } = useOutletContext()
  const { user, isSuperAdmin } = useAuth()
  const { id } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [claim, setClaim] = useState(null)
  const [vehicle, setVehicle] = useState(null)
  const [people, setPeople] = useState([])
  const [img, setImg] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [rejecting, setRejecting] = useState(false)

  const load = useCallback(async () => {
    try {
      const [c, v, p] = await Promise.all([getClaim(id), listVehicles(company.id), access.report ? listPeople(company.id) : []])
      if (!c) throw new Error('Claim not found (or you have no access to it).')
      setClaim(c)
      setVehicle(v.find((x) => x.id === c.vehicle_id) || null)
      setPeople(p)
      if (c.receipt_path && !/\.pdf$/i.test(c.receipt_path)) setImg(await receiptUrl(c.receipt_path))
      setError('')
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [id, company.id, access.report])

  useEffect(() => {
    load()
  }, [load])

  // ?print=1 → print as soon as the page (and receipt image) is ready
  useEffect(() => {
    if (!loading && claim && params.get('print') === '1') {
      const t = setTimeout(() => window.print(), img ? 600 : 200)
      return () => clearTimeout(t)
    }
  }, [loading, claim, img, params])

  const person = new Map(people.map((p) => [p.user_id, p]))
  const own = claim?.claimant_id === user.id
  const canEdit = claim && own && claim.status === 'pending' && access.can('claims', 'edit')
  const canDelete = claim && ((own && claim.status === 'pending' && access.can('claims', 'delete')) || isSuperAdmin)
  const canReview = claim && (access.admin || access.pay) && (!own || isSuperAdmin)

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
      removeReceipt(claim.receipt_path)
      navigate('/diesel/claims', { replace: true })
    })

  if (loading) return <Loading />

  return (
    <div className="space-y-4">
      <div className="print:hidden">
        <PageHeader
          backTo="/diesel/claims"
          backLabel="Back to claim list"
          title={claim ? `Fuel claim ${claimNo(claim, 0)}` : 'Fuel claim'}
          subtitle={company.name}
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
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px] print:block">
          {/* Claim form (this part prints) */}
          <Card className="p-5 sm:p-6 print:border-0 print:shadow-none">
            <div className="mb-5 flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
              <div>
                <p className="font-display text-xl font-extrabold tracking-tight text-slate-900">Fuel Claim</p>
                <p className="text-sm text-slate-500">{company.name}</p>
              </div>
              <div className="text-right">
                <p className="text-xs uppercase tracking-wide text-slate-400">Claim no.</p>
                <p className="font-display text-2xl font-extrabold tabular-nums text-slate-900">{claimNo(claim, 0)}</p>
                <StatusBadge status={claim.status} />
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
              <Row k="Date" v={day(claim.fill_date)} />
              <Row k="Vehicle" v={vehicleLabel(vehicle)} />
              <Row k="Claimant" v={own ? (user.fullName || user.email) : personLabel(person.get(claim.claimant_id))} />
              <Row k="Odometer" v={claim.odometer_km != null ? `${num(claim.odometer_km, 0)} km` : '—'} />
              <Row k="Litres" v={`${num(claim.litres, 2)} L`} />
              <Row k="Price per litre" v={Number(claim.litres) > 0 ? money(Number(claim.amount) / Number(claim.litres)) : '—'} />
              <Row k="Station" v={claim.station || '—'} />
              <Row k="Claim amount" v={<span className="text-lg font-bold">{money(claim.amount)}</span>} />
              <Row k="Submitted" v={day(claim.created_at?.slice(0, 10))} />
              {claim.notes && (
                <div className="col-span-2 sm:col-span-3">
                  <Row k="Notes" v={claim.notes} />
                </div>
              )}
              {claim.reviewed_at && (
                <div className="col-span-2 sm:col-span-3">
                  <Row
                    k="Reviewed"
                    v={`${day(claim.reviewed_at.slice(0, 10))} · ${personLabel(person.get(claim.reviewed_by)) || 'admin'}${claim.review_note ? ` · ${claim.review_note}` : ''}`}
                  />
                </div>
              )}
            </dl>
            <div className="mt-8 hidden grid-cols-3 gap-8 text-xs text-slate-500 print:grid">
              <div className="border-t border-slate-400 pt-1">Claimant signature</div>
              <div className="border-t border-slate-400 pt-1">Checked by</div>
              <div className="border-t border-slate-400 pt-1">Approved by</div>
            </div>
            {img && <img src={img} alt="Receipt" className="mt-6 hidden max-h-[60vh] rounded-lg border border-slate-200 print:block" />}
          </Card>

          {/* Receipt + review (screen only) */}
          <div className="space-y-4 print:hidden">
            <Card className="p-4">
              <p className="mb-2 font-semibold text-slate-800">Receipt</p>
              {img ? (
                <img src={img} alt="Receipt" className="max-h-96 w-full rounded-lg border border-slate-200 object-contain" />
              ) : claim.receipt_path ? (
                <p className="text-sm text-slate-500">PDF receipt.</p>
              ) : (
                <p className="text-sm text-red-500">No receipt attached.</p>
              )}
              {claim.receipt_path && (
                <div className="mt-2">
                  <ReceiptButton path={claim.receipt_path} />
                </div>
              )}
            </Card>

            {(access.admin || access.pay) && (
              <Card className="p-4">
                <p className="mb-2 font-semibold text-slate-800">Review</p>
                {!canReview ? (
                  <p className="text-sm text-slate-500">Your own claim — another admin reviews it.</p>
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
                  <p className="text-sm text-slate-500">{claim.status === 'paid' ? 'Paid.' : 'No action for you here.'}</p>
                )}
              </Card>
            )}
          </div>
        </div>
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

function Row({ k, v }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-400">{k}</dt>
      <dd className="mt-0.5 font-medium text-slate-800">{v}</dd>
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
