import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import PageHeader from '../../components/PageHeader.jsx'
import { Badge, Button, Card, Spinner, TextInput } from '../../components/ui.jsx'
import { IconEye, IconPencil, IconPlus, IconTrash } from '../../components/icons.jsx'
import { coverState, deleteMachine, listMachines, listPortalPeople, machineNo, removeMachineFile, useCmmsAccess, userLabel } from '../../lib/cmms.js'
import { useCompany } from '../../lib/CompanyContext.jsx'

// Machinery Profile: every machine AND vehicle of the company. Cases link to
// these, suppliers list which ones they handle, and Fuel Manage uses them as
// the vehicles for claims, fleet cards and fill-ups. Each row opens a full
// profile page (particulars, insurance / road tax / Puspakom, photos, files,
// drivers). Rows marked "general use" are offered to everyone in fuel claims.
export default function MachineryProfile() {
  const { current } = useCompany()
  const navigate = useNavigate()
  const access = useCmmsAccess(current?.id)
  const [rows, setRows] = useState([])
  const [people, setPeople] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [tab, setTab] = useState('active') // active | inactive | insurance
  const [fType, setFType] = useState('')
  const [fBrand, setFBrand] = useState('')
  const [fModel, setFModel] = useState('')
  const [busyId, setBusyId] = useState(null)

  const load = useCallback(async () => {
    if (!current) return
    try {
      const [m, p] = await Promise.all([listMachines(current.id), listPortalPeople().catch(() => [])])
      setRows(m)
      setPeople(p)
      setError('')
    } catch (e) {
      setError(e.message || 'Could not load machines.')
    } finally {
      setLoading(false)
    }
  }, [current])

  useEffect(() => {
    setLoading(true)
    load()
  }, [load])

  const person = useMemo(() => new Map(people.map((p) => [p.user_id, p])), [people])
  const drivers = (m) => (m.driver_ids?.length ? m.driver_ids : m.driver_id ? [m.driver_id] : []).map((id) => userLabel(person.get(id)))

  // Which list a machine belongs to: Insurance only (e.g. HQ cars: no SMU or
  // repairs recorded, we only help renew insurance), else Active / Inactive.
  const listOf = (m) => (m.insurance_only ? 'insurance' : m.is_active === false ? 'inactive' : 'active')
  const counts = useMemo(() => rows.reduce((c, m) => ({ ...c, [listOf(m)]: (c[listOf(m)] || 0) + 1 }), {}), [rows])
  const inTab = useMemo(() => rows.filter((m) => listOf(m) === tab), [rows, tab])
  // Filter choices come from the machines in the tab; brand narrows by type, model by type + brand.
  const uniq = (list) => [...new Set(list.map((v) => (v || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b))
  const same = (a, b) => (a || '').trim() === b
  const typeOpts = useMemo(() => uniq(inTab.map((m) => m.machine_type)), [inTab])
  const brandOpts = useMemo(() => uniq(inTab.filter((m) => !fType || same(m.machine_type, fType)).map((m) => m.brand)), [inTab, fType])
  const modelOpts = useMemo(
    () => uniq(inTab.filter((m) => (!fType || same(m.machine_type, fType)) && (!fBrand || same(m.brand, fBrand))).map((m) => m.model)),
    [inTab, fType, fBrand]
  )

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase()
    return inTab.filter(
      (m) =>
        (!fType || same(m.machine_type, fType)) &&
        (!fBrand || same(m.brand, fBrand)) &&
        (!fModel || same(m.model, fModel)) &&
        (!t ||
          [machineNo(m), m.name, m.reg_no, m.machine_type, m.brand, m.model, m.acc_code, m.serial_no, m.chassis_no, m.engine_no, ...drivers(m)].some((v) =>
            String(v || '').toLowerCase().includes(t)
          ))
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inTab, q, fType, fBrand, fModel, people])

  const anyFilter = q || fType || fBrand || fModel
  const clearFilters = () => {
    setQ('')
    setFType('')
    setFBrand('')
    setFModel('')
  }
  const pickTab = (t) => {
    setTab(t)
    clearFilters()
  }

  async function remove(m) {
    if (!window.confirm(`Delete ${m.name}? This cannot be undone.`)) return
    setBusyId(m.id)
    setError('')
    try {
      await deleteMachine(m.id)
      ;[...(m.photos || []), m.reg_card_path, m.resolution_path].forEach(removeMachineFile)
      await load()
    } catch (e) {
      setError(e.message || 'Could not delete.')
    } finally {
      setBusyId(null)
    }
  }

  const canAdd = access.can('machines', 'add')
  const canEdit = access.can('machines', 'edit')
  const canDelete = access.can('machines', 'delete')
  const kpdn = rows.filter((r) => r.kpdn_subsidy).length

  return (
    <div className="space-y-4">
      <PageHeader
        title="Machinery Profile"
        right={
          <div className="flex flex-wrap items-center gap-2">
            {kpdn > 0 && (
              <Link to="/diesel/cards" className="inline-flex items-center gap-2 text-sm font-medium text-brand hover:underline">
                <Badge color="green">{kpdn}</Badge> KPDN subsidy → Fleet Card Manage
              </Link>
            )}
            {canAdd && (
              <Button variant="secondary" onClick={() => navigate('/cmms/machines/import')}>
                Import Excel
              </Button>
            )}
            {canAdd && (
              <Button onClick={() => navigate('/cmms/machines/new')}>
                <IconPlus width={18} height={18} /> New machine / vehicle
              </Button>
            )}
          </div>
        }
      />
      {error && <p className="rounded-xl bg-red-100 p-3 text-sm text-red-700">{error}</p>}

      <Card className="overflow-hidden">
        <div className="flex flex-wrap gap-1 border-b border-slate-200 px-3 pt-3">
          {[
            ['active', 'Active'],
            ['inactive', 'Inactive'],
            ['insurance', 'Insurance only']
          ].map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => pickTab(k)}
              className={`-mb-px rounded-t-lg border px-4 py-2 text-sm font-semibold ${
                tab === k ? 'border-slate-200 border-b-white bg-white text-brand' : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              {label} <span className="ml-1 tabular-nums text-xs text-slate-400">{counts[k] || 0}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-5 py-3">
          <FilterSelect label="Type" value={fType} options={typeOpts} onChange={(v) => { setFType(v); setFBrand(''); setFModel('') }} />
          <FilterSelect label="Brand" value={fBrand} options={brandOpts} onChange={(v) => { setFBrand(v); setFModel('') }} />
          <FilterSelect label="Model" value={fModel} options={modelOpts} onChange={setFModel} />
          <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search code, plate, serial, engine no., driver…" className="h-10 sm:w-72" />
          {anyFilter && (
            <button type="button" onClick={clearFilters} className="text-sm font-medium text-brand hover:underline">
              Clear
            </button>
          )}
          <span className="ml-auto text-sm text-slate-500">
            {shown.length} of {inTab.length}
          </span>
        </div>
        {loading ? (
          <div className="flex justify-center py-12 text-brand">
            <Spinner className="h-7 w-7" />
          </div>
        ) : shown.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-slate-500">{inTab.length ? 'Nothing matches the filters.' : rows.length ? 'Nothing in this list.' : 'No machines or vehicles yet.'}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1400px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="w-24 px-5 py-2.5">No.</th>
                  <th className="px-3 py-2.5">Code / Reg. no.</th>
                  <th className="px-3 py-2.5">Type</th>
                  <th className="px-3 py-2.5">Brand</th>
                  <th className="px-3 py-2.5">Model</th>
                  <th className="px-3 py-2.5">Serial / Engine no.</th>
                  <th className="px-3 py-2.5">Driver</th>
                  <th className="px-3 py-2.5">Fuel</th>
                  <th className="px-3 py-2.5">Cover</th>
                  <th className="w-24 px-3 py-2.5">Status</th>
                  <th className="w-32 px-3 py-2.5 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {shown.map((m) => {
                  const d = drivers(m)
                  return (
                    <tr key={m.id} className="hover:bg-slate-50/60">
                      <td className="px-5 py-3 font-semibold tabular-nums text-slate-500">{machineNo(m)}</td>
                      <td className="px-3 py-3">
                        <Link to={`/cmms/machines/${m.id}`} className="font-semibold text-slate-800 hover:text-brand">
                          {m.name}
                        </Link>
                        {m.reg_no && m.reg_no.trim().toUpperCase() !== m.name.trim().toUpperCase() && <span className="block text-xs text-slate-500">{m.reg_no}</span>}
                        {m.acc_code && <span className="block text-xs text-slate-400">{m.acc_code}</span>}
                      </td>
                      <td className="px-3 py-3 text-slate-700">
                        {m.machine_type || '—'}
                        {m.general_use && <Badge color="blue" className="ml-1.5">General-use car</Badge>}
                      </td>
                      <td className="px-3 py-3 text-slate-700">{m.brand || '—'}</td>
                      <td className="px-3 py-3 text-slate-700">{m.model || '—'}</td>
                      <td className="px-3 py-3 font-mono text-xs text-slate-700">
                        <span className="block">S: {m.serial_no || '—'}</span>
                        <span className="block">E: {m.engine_no || '—'}</span>
                      </td>
                      <td className="px-3 py-3 text-slate-700">{d.length ? d.join(', ') : '—'}</td>
                      <td className="px-3 py-3 text-slate-700">
                        {m.fuel_type === 'none' ? '—' : m.fuel_type === 'petrol' ? 'Petrol' : 'Diesel'}
                        {m.kpdn_subsidy && <Badge color="green" className="ml-1.5">KPDN</Badge>}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-1">
                          <Cover label="Insurance" to={m.insurance_to} />
                          <Cover label="Road tax" to={m.road_tax_to} />
                          <Cover label="Puspakom" to={m.puspakom_to} />
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <StatusBadge m={m} />
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center justify-center gap-0.5">
                          <Action to={`/cmms/machines/${m.id}`} label="View" Icon={IconEye} />
                          <Action to={canEdit ? `/cmms/machines/${m.id}/edit` : null} label="Edit" Icon={IconPencil} />
                          <Action onClick={canDelete ? () => remove(m) : null} label="Delete" Icon={IconTrash} danger disabled={busyId === m.id} />
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

function StatusBadge({ m }) {
  if (m.insurance_only) return <Badge color="blue">Insurance only</Badge>
  return <Badge color={m.is_active === false ? 'slate' : 'green'}>{m.is_active === false ? 'Inactive' : 'Active'}</Badge>
}

function FilterSelect({ label, value, options, onChange }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      className={`h-10 max-w-[14rem] rounded-xl border border-slate-300 bg-white px-3 text-sm ${value ? 'font-semibold text-slate-800' : 'text-slate-500'}`}
    >
      <option value="">All {label.toLowerCase()}s</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  )
}

// Insurance / road tax / Puspakom chip: red when expired, amber within 30 days.
function Cover({ label, to }) {
  const s = coverState(to)
  if (!s) return null
  const color = s === 'expired' ? 'red' : s === 'soon' ? 'amber' : 'slate'
  return (
    <Badge color={color} className="whitespace-nowrap">
      {label} {s === 'expired' ? 'expired' : s === 'soon' ? 'soon' : 'ok'}
    </Badge>
  )
}

function Action({ to, onClick, label, Icon, danger, disabled }) {
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
