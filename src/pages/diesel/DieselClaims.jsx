import { useCallback, useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import PageHeader from '../../components/PageHeader.jsx'
import { Button, Card, Modal, Select } from '../../components/ui.jsx'
import { IconCheck, IconDownload, IconPlus, IconX } from '../../components/icons.jsx'
import {
  ClaimRow,
  Empty,
  ErrorBox,
  Loading,
  MonthSelect,
  OwnClaimActions,
  ReceiptButton,
  Stats,
  inputCls,
  monthsOf
} from '../../components/diesel/shared.jsx'
import { ClaimModal } from '../../components/diesel/ClaimModal.jsx'
import {
  CLAIM_STATUS,
  deleteClaim,
  listClaims,
  listPeople,
  listVehicles,
  personLabel,
  removeReceipt,
  reviewClaim,
  vehicleLabel
} from '../../lib/diesel.js'
import { downloadCsv, money, num, sum, thisMonth, today } from '../../lib/format.js'
import { useAuth } from '../../auth/AuthContext.jsx'

// Diesel Claims: cash fuel claims with receipt photos.
//   My claims  — your own claims (Cash Claim access): new, edit/delete while pending
//   All claims — every claim of the company (Report access to view; Diesel admins
//                approve, reject with a reason, mark paid, export)
export default function DieselClaims() {
  const { company, access } = useOutletContext()
  const { user, isSuperAdmin } = useAuth()
  const tabs = [...(access.claim ? [['mine', 'My claims']] : []), ...(access.report ? [['all', 'All claims']] : [])]
  const [tab, setTab] = useState(tabs[0]?.[0] || 'mine')
  const [claims, setClaims] = useState([])
  const [vehicles, setVehicles] = useState([])
  const [people, setPeople] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [modal, setModal] = useState(null) // 'new' | claim
  const [rejecting, setRejecting] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [filter, setFilter] = useState({ status: 'pending', vehicle: '', month: '' })

  const load = useCallback(async () => {
    try {
      const [c, v, p] = await Promise.all([
        listClaims(company.id, access.report ? {} : { mine: user.id }),
        listVehicles(company.id),
        access.report ? listPeople(company.id) : []
      ])
      setClaims(c)
      setVehicles(v)
      setPeople(p)
      setError('')
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [company.id, user.id, access.report])

  useEffect(() => {
    setLoading(true)
    load()
  }, [load])

  const vById = new Map(vehicles.map((v) => [v.id, v]))
  const person = new Map(people.map((p) => [p.user_id, p]))
  const mine = claims.filter((c) => c.claimant_id === user.id)
  const month = thisMonth()
  const mineMonth = mine.filter((c) => c.fill_date.startsWith(month) && c.status !== 'rejected')
  const months = monthsOf(claims.map((c) => c.fill_date))
  const rows = claims.filter(
    (c) =>
      (!filter.status || c.status === filter.status) &&
      (!filter.vehicle || c.vehicle_id === filter.vehicle) &&
      (!filter.month || c.fill_date.startsWith(filter.month))
  )

  async function act(id, fn) {
    setBusyId(id)
    setError('')
    try {
      await fn()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusyId(null)
    }
  }
  const remove = (c) =>
    window.confirm('Delete this claim? This cannot be undone.') &&
    act(c.id, async () => {
      await deleteClaim(c.id)
      removeReceipt(c.receipt_path)
      await load()
    })
  const review = (c, status, note) =>
    act(c.id, async () => {
      const data = await reviewClaim(c.id, status, note ?? c.review_note)
      setClaims((list) => list.map((x) => (x.id === c.id ? { ...x, ...data } : x)))
    })

  const exportCsv = () =>
    downloadCsv(
      `diesel-claims-${company.code || company.name}-${today()}.csv`,
      [
        { header: 'Date', value: (c) => c.fill_date },
        { header: 'Vehicle', value: (c) => vById.get(c.vehicle_id)?.name },
        { header: 'Reg. no.', value: (c) => vById.get(c.vehicle_id)?.reg_no },
        { header: 'Claimant', value: (c) => personLabel(person.get(c.claimant_id)) },
        { header: 'Odometer (km)', value: (c) => c.odometer_km },
        { header: 'Litres', value: (c) => Number(c.litres) },
        { header: 'Amount (RM)', value: (c) => Number(c.amount) },
        { header: 'Station', value: (c) => c.station },
        { header: 'Status', value: (c) => CLAIM_STATUS[c.status]?.label || c.status },
        { header: 'Reviewed by', value: (c) => personLabel(person.get(c.reviewed_by)) },
        { header: 'Review note', value: (c) => c.review_note },
        { header: 'Notes', value: (c) => c.notes }
      ],
      rows
    )

  return (
    <div className="space-y-4">
      <PageHeader
        title="Diesel Claims"
        subtitle={`${company.name} · cash fuel claims`}
        right={
          tab === 'mine' ? (
            <Button onClick={() => setModal('new')}>
              <IconPlus width={18} height={18} /> New claim
            </Button>
          ) : (
            <Button variant="secondary" onClick={exportCsv} disabled={!rows.length}>
              <IconDownload width={18} height={18} /> Export CSV
            </Button>
          )
        }
      />
      <ErrorBox>{error}</ErrorBox>

      {tabs.length > 1 && (
        <div className="inline-flex rounded-xl bg-slate-200/70 p-1" role="tablist">
          {tabs.map(([k, l]) => (
            <button
              key={k}
              role="tab"
              aria-selected={tab === k}
              onClick={() => setTab(k)}
              className={`rounded-lg px-4 py-1.5 text-sm font-semibold ${tab === k ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
            >
              {l}
            </button>
          ))}
        </div>
      )}

      {tab === 'mine' ? (
        <>
          <Stats
            items={[
              ['Waiting for approval', mine.filter((c) => c.status === 'pending').length],
              ['Litres this month', num(sum(mineMonth, 'litres')) + ' L'],
              ['Spent this month', money(sum(mineMonth))],
              ['Approved, not yet paid', money(sum(mine.filter((c) => c.status === 'approved')))]
            ]}
          />
          <Card className="overflow-hidden">
            {loading ? (
              <Loading />
            ) : mine.length === 0 ? (
              <Empty>No claims yet. Tap New claim after filling up.</Empty>
            ) : (
              <div className="divide-y divide-slate-100">
                {mine.map((c) => (
                  <ClaimRow
                    key={c.id}
                    claim={c}
                    vehicle={vById.get(c.vehicle_id)}
                    actions={
                      <>
                        {c.receipt_path && <ReceiptButton path={c.receipt_path} />}
                        <OwnClaimActions claim={c} busy={busyId === c.id} onEdit={() => setModal(c)} onDelete={() => remove(c)} />
                      </>
                    }
                  />
                ))}
              </div>
            )}
          </Card>
        </>
      ) : (
        <>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <div className="sm:w-44">
              <Select value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value })} className="h-10" aria-label="Status">
                <option value="">All statuses</option>
                {Object.entries(CLAIM_STATUS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="sm:w-56">
              <Select value={filter.vehicle} onChange={(e) => setFilter({ ...filter, vehicle: e.target.value })} className="h-10" aria-label="Vehicle">
                <option value="">All vehicles</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {vehicleLabel(v)}
                  </option>
                ))}
              </Select>
            </div>
            <MonthSelect months={months} value={filter.month} onChange={(m) => setFilter({ ...filter, month: m })} allLabel="All months" />
            <span className="text-sm text-slate-500 sm:ml-auto">
              {rows.length} claims · {num(sum(rows, 'litres'))} L · {money(sum(rows))}
            </span>
          </div>
          <Card className="overflow-hidden">
            {loading ? (
              <Loading />
            ) : rows.length === 0 ? (
              <Empty>No claims match these filters.</Empty>
            ) : (
              <div className="divide-y divide-slate-100">
                {rows.map((c) => {
                  const own = c.claimant_id === user.id && !isSuperAdmin
                  const busy = busyId === c.id
                  const reviewer = person.get(c.reviewed_by)
                  return (
                    <ClaimRow
                      key={c.id}
                      claim={c}
                      vehicle={vById.get(c.vehicle_id)}
                      meta={`${personLabel(person.get(c.claimant_id))}${reviewer ? ` · reviewed by ${personLabel(reviewer)}` : ''}`}
                      actions={
                        <>
                          <ReceiptButton path={c.receipt_path} />
                          {!access.admin ? null : own ? (
                            <span className="self-center text-xs text-slate-400">Your own claim — another admin reviews it</span>
                          ) : c.status === 'pending' ? (
                            <>
                              <Button size="sm" disabled={busy} onClick={() => review(c, 'approved')}>
                                <IconCheck width={16} height={16} /> Approve
                              </Button>
                              <Button size="sm" variant="ghost" className="text-red-600" disabled={busy} onClick={() => setRejecting(c)}>
                                <IconX width={16} height={16} /> Reject
                              </Button>
                            </>
                          ) : c.status === 'approved' ? (
                            <>
                              <Button size="sm" variant="secondary" disabled={busy} onClick={() => review(c, 'paid')}>
                                Mark paid
                              </Button>
                              <Button size="sm" variant="ghost" disabled={busy} onClick={() => review(c, 'pending')}>
                                Back to pending
                              </Button>
                            </>
                          ) : c.status === 'rejected' ? (
                            <Button size="sm" variant="ghost" disabled={busy} onClick={() => review(c, 'pending', null)}>
                              Back to pending
                            </Button>
                          ) : null}
                        </>
                      }
                    />
                  )
                })}
              </div>
            )}
          </Card>
        </>
      )}

      {modal && (
        <ClaimModal
          company={company}
          userId={user.id}
          vehicles={vehicles}
          claim={modal === 'new' ? null : modal}
          onClose={() => setModal(null)}
          onSaved={load}
        />
      )}
      {rejecting && (
        <RejectModal
          onClose={() => setRejecting(null)}
          onReject={(note) => {
            review(rejecting, 'rejected', note)
            setRejecting(null)
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
