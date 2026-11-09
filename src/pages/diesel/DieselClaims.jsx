import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useOutletContext } from 'react-router-dom'
import PageHeader from '../../components/PageHeader.jsx'
import { Button, Card } from '../../components/ui.jsx'
import { IconDownload, IconEye, IconPencil, IconPlus, IconPrint, IconTrash } from '../../components/icons.jsx'
import { Empty, ErrorBox, Loading, StatusBadge } from '../../components/diesel/shared.jsx'
import { CLAIM_STATUS, deleteClaim, listClaims, listPeople, listVehicles, personLabel, removeReceipt, vehicleLabel } from '../../lib/diesel.js'
import { day, downloadCsv, money, num, sum, today } from '../../lib/format.js'
import { useAuth } from '../../auth/AuthContext.jsx'

export const claimNo = (c, i) => (c.claim_no != null ? String(c.claim_no).padStart(3, '0') : String(i + 1))

// Fuel Claims: the claim list (No. · Description · Claim amount · Action:
// view / edit / print / delete), latest first. Each person sees their own
// claims; people with "see all users' claims" see everyone's and review them
// on the claim page (approve / reject / pay).
export default function DieselClaims() {
  const { company, access } = useOutletContext()
  const { user, isSuperAdmin } = useAuth()
  const navigate = useNavigate()
  const [claims, setClaims] = useState([])
  const [vehicles, setVehicles] = useState([])
  const [people, setPeople] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)

  const load = useCallback(async () => {
    try {
      const [c, v, p] = await Promise.all([
        listClaims(company.id, access.viewAll ? {} : { mine: user.id }),
        listVehicles(company.id),
        access.viewAll ? listPeople(company.id) : []
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
  }, [company.id, user.id, access.viewAll])

  useEffect(() => {
    setLoading(true)
    load()
  }, [load])

  const vById = new Map(vehicles.map((v) => [v.id, v]))
  const person = new Map(people.map((p) => [p.user_id, p]))
  const all = access.viewAll
  // Latest first: by date of the fill-up, then by creation.
  const rows = [...claims].sort((a, b) => (a.fill_date < b.fill_date ? 1 : a.fill_date > b.fill_date ? -1 : (a.created_at || '') < (b.created_at || '') ? 1 : -1))

  async function remove(c) {
    if (!window.confirm(`Delete claim ${claimNo(c, 0)}? This cannot be undone.`)) return
    setBusyId(c.id)
    setError('')
    try {
      await deleteClaim(c.id)
      removeReceipt(c.receipt_path)
      await load()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusyId(null)
    }
  }

  const canEdit = (c) => c.status === 'pending' && c.claimant_id === user.id && access.can('claims', 'edit')
  const canDelete = (c) => (c.status === 'pending' && c.claimant_id === user.id && access.can('claims', 'delete')) || isSuperAdmin

  const exportCsv = () =>
    downloadCsv(
      `fuel-claims-${company.code || company.name}-${today()}.csv`,
      [
        { header: 'No.', value: (c) => claimNo(c, 0) },
        { header: 'Date', value: (c) => c.fill_date },
        { header: 'Vehicle', value: (c) => vehicleLabel(vById.get(c.vehicle_id)) },
        { header: 'Claimant', value: (c) => personLabel(person.get(c.claimant_id)) },
        { header: 'Odometer (km)', value: (c) => c.odometer_km },
        { header: 'Litres', value: (c) => Number(c.litres) },
        { header: 'Claim amount (RM)', value: (c) => Number(c.amount) },
        { header: 'Station', value: (c) => c.station },
        { header: 'Status', value: (c) => CLAIM_STATUS[c.status]?.label || c.status },
        { header: 'Review note', value: (c) => c.review_note }
      ],
      rows
    )

  return (
    <div className="space-y-4">
      <PageHeader
        right={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={exportCsv} disabled={!rows.length}>
              <IconDownload width={18} height={18} /> Export CSV
            </Button>
            {access.claim && (
              <Button onClick={() => navigate('/diesel/claims/new')}>
                <IconPlus width={18} height={18} /> New claim
              </Button>
            )}
          </div>
        }
      />
      <ErrorBox>{error}</ErrorBox>

      <p className="text-sm text-slate-500">
        {all ? 'All users’ claims' : 'Your claims'} · {rows.length} claim{rows.length === 1 ? '' : 's'} · {num(sum(rows, 'litres'))} L ·{' '}
        {money(sum(rows))}
      </p>

      <Card className="overflow-hidden">
        <h3 className="border-b border-slate-200 px-5 py-3 font-semibold text-slate-800">Claim list</h3>
        {loading ? (
          <Loading />
        ) : rows.length === 0 ? (
          <Empty>No claims yet. Press New claim after filling up.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="w-20 px-5 py-2.5">No.</th>
                  <th className="px-3 py-2.5">Description</th>
                  <th className="w-40 px-3 py-2.5 text-right">Claim amount</th>
                  <th className="w-44 px-3 py-2.5 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((c, i) => (
                  <tr key={c.id} className="hover:bg-slate-50/60">
                    <td className="px-5 py-3 font-semibold tabular-nums text-slate-800">{claimNo(c, i)}</td>
                    <td className="px-3 py-3">
                      <Link to={`/diesel/claims/${c.id}`} className="font-medium text-slate-800 hover:text-brand">
                        Fuel claim
                      </Link>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                        <span>{day(c.fill_date)}</span>
                        <span>· {c.vehicle_id ? vehicleLabel(vById.get(c.vehicle_id)) : 'No vehicle'}</span>
                        <span>· {num(c.litres, 2)} L</span>
                        {all && <span>· {personLabel(person.get(c.claimant_id))}</span>}
                        <StatusBadge status={c.status} />
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right font-semibold tabular-nums text-slate-900">{money(c.amount)}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center justify-center gap-0.5">
                        <ActionButton to={`/diesel/claims/${c.id}`} label="View" Icon={IconEye} />
                        <ActionButton to={canEdit(c) ? `/diesel/claims/${c.id}/edit` : null} label="Edit" Icon={IconPencil} />
                        <ActionButton to={`/diesel/claims/${c.id}?print=1`} label="Print" Icon={IconPrint} />
                        <ActionButton
                          onClick={canDelete(c) ? () => remove(c) : null}
                          label="Delete"
                          Icon={IconTrash}
                          danger
                          disabled={busyId === c.id}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
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
