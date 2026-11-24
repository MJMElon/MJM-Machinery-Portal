import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import PageHeader from '../../components/PageHeader.jsx'
import { Badge, Button, Card, Select, Spinner, TextInput } from '../../components/ui.jsx'
import { IconEye, IconPencil, IconPlus, IconTrash } from '../../components/icons.jsx'
import { MACHINE_STATUS, coverState, deleteMachine, listMachines, listPortalPeople, machineNo, machineStatus, removeMachineFile, useCmmsAccess, userLabel } from '../../lib/cmms.js'
import { listLocations } from '../../lib/companies.js'
import { useCompany } from '../../lib/CompanyContext.jsx'

// Machinery Profile: every machine AND vehicle of the company. Cases link to
// these, suppliers list which ones they handle, and Fuel Manage uses them as
// the vehicles for claims, fleet cards and fill-ups. Each row opens a full
// profile page (particulars, insurance / road tax / Puspakom, photos, files,
// drivers). Rows marked "general use" are offered to everyone in fuel claims.
// On top: a summary (status counts and a count per type, each type clickable
// as a filter), then tabs Active / Inactive / Insurance only / KPDN subsidy,
// and filters by location, type and brand next to the search.

// Type and brand are typed freely (and imported from Excel), so they are
// compared without case or extra spaces: "Heavy machine" = "HEAVY MACHINE".
const norm = (v) => String(v || '').trim().replace(/\s+/g, ' ').toUpperCase()
const typeKey = (m) => norm(m.machine_type) || '—'
const brandKey = (m) => norm(m.brand) || '—'
const TABS = { ...MACHINE_STATUS, kpdn: { label: 'KPDN subsidy' } }
export default function MachineryProfile() {
  const { current } = useCompany()
  const navigate = useNavigate()
  const access = useCmmsAccess(current?.id)
  const [rows, setRows] = useState([])
  const [people, setPeople] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [tab, setTab] = useState('active') // active | inactive | insurance_only (like the old CMMS tabs) | kpdn
  const [typeF, setTypeF] = useState('') // '' = all types, else a typeKey
  const [brandF, setBrandF] = useState('') // '' = all brands, else a brandKey
  const [locations, setLocations] = useState([])
  const [loc, setLoc] = useState('') // '' = all, 'none' = without a location, else a location id
  const [busyId, setBusyId] = useState(null)

  const load = useCallback(async () => {
    if (!current) return
    try {
      const [m, p, l] = await Promise.all([listMachines(current.id), listPortalPeople().catch(() => []), listLocations(current.id).catch(() => [])])
      setRows(m)
      setLocations(l)
      setLoc((v) => (v && v !== 'none' && !l.some((x) => x.id === v) ? '' : v))
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

  // Locations come from Settings → Company profile; the column and filter only show when the company has some.
  const hasLocations = locations.length > 0
  const locationName = useMemo(() => new Map(locations.map((l) => [l.id, l.name])), [locations])
  const countIn = (id) => rows.filter((m) => (id === 'none' ? !locationName.has(m.location_id) : m.location_id === id)).length

  // The tab, then location, type and brand, then the search.
  const inTab = (m) => (tab === 'kpdn' ? Boolean(m.kpdn_subsidy) : machineStatus(m) === tab)
  const inLoc = (m) => !loc || !hasLocations || (loc === 'none' ? !locationName.has(m.location_id) : m.location_id === loc)
  const tabRows = useMemo(() => rows.filter(inTab), [rows, tab]) // eslint-disable-line react-hooks/exhaustive-deps
  const countTab = (k) => rows.filter((m) => (k === 'kpdn' ? Boolean(m.kpdn_subsidy) : machineStatus(m) === k)).length

  // Filter choices with their counts in this tab (and the other filters), so an empty choice never shows.
  const choices = (key, pick) => {
    const counts = new Map()
    for (const m of tabRows) if (pick(m)) counts.set(key(m), (counts.get(key(m)) || 0) + 1)
    return [...counts.entries()].sort((a, b) => (a[0] === '—') - (b[0] === '—') || a[0].localeCompare(b[0]))
  }
  const typeChoices = choices(typeKey, (m) => inLoc(m) && (!brandF || brandKey(m) === brandF))
  const brandChoices = choices(brandKey, (m) => inLoc(m) && (!typeF || typeKey(m) === typeF))
  // A type is shown as it is most often written in the profile (e.g. HEAVY MACHINE, FT15).
  const typeLabel = useMemo(() => {
    const seen = new Map()
    for (const m of rows) {
      const k = typeKey(m)
      const spelt = seen.get(k) || new Map()
      const v = String(m.machine_type || '').trim().replace(/\s+/g, ' ')
      spelt.set(v, (spelt.get(v) || 0) + 1)
      seen.set(k, spelt)
    }
    return new Map([...seen].map(([k, spelt]) => [k, [...spelt].sort((a, b) => b[1] - a[1])[0][0]]))
  }, [rows])
  const nice = (k) => (k === '—' ? 'No type' : typeLabel.get(k) || k)
  // Summary by type: the current tab, all locations.
  const byType = choices(typeKey, () => true).sort((a, b) => b[1] - a[1])

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase()
    const list = tabRows.filter((m) => inLoc(m) && (!typeF || typeKey(m) === typeF) && (!brandF || brandKey(m) === brandF))
    if (!t) return list
    return list.filter((m) =>
      [machineNo(m), m.name, m.reg_no, m.machine_type, m.brand, m.model, m.acc_code, locationName.get(m.location_id), ...drivers(m)].some((v) =>
        String(v || '').toLowerCase().includes(t)
      )
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabRows, q, people, loc, locationName, typeF, brandF])
  const filtered = Boolean(loc || typeF || brandF || q.trim())
  const clearFilters = () => {
    setLoc('')
    setTypeF('')
    setBrandF('')
    setQ('')
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

  return (
    <div className="space-y-4">
      <PageHeader
        title="Machinery Profile"
        right={
          <div className="flex flex-wrap items-center gap-2">
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

      {!loading && rows.length > 0 && (
        <Card className="p-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Figure label="Total" value={rows.length} />
            <Figure label="Active" value={countTab('active')} tone="green" onClick={() => setTab('active')} on={tab === 'active'} />
            <Figure label="Inactive" value={countTab('inactive')} tone="red" onClick={() => setTab('inactive')} on={tab === 'inactive'} />
            <Figure label="Insurance only" value={countTab('insurance_only')} tone="sky" onClick={() => setTab('insurance_only')} on={tab === 'insurance_only'} />
            <Figure label="KPDN subsidy" value={countTab('kpdn')} tone="emerald" onClick={() => setTab('kpdn')} on={tab === 'kpdn'} />
          </div>
          {byType.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">By type · {TABS[tab].label}</p>
              <div className="flex flex-wrap gap-2">
                {byType.map(([k, n]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setTypeF(typeF === k ? '' : k)}
                    aria-pressed={typeF === k}
                    title={typeF === k ? 'Show all types' : `Show only ${nice(k)}`}
                    className={`inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-sm transition ${
                      typeF === k ? 'border-brand bg-brand text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-brand hover:text-brand'
                    }`}
                  >
                    <span className="font-medium">{nice(k)}</span>
                    <span className={`rounded-full px-1.5 text-xs font-bold tabular-nums ${typeF === k ? 'bg-white/25' : 'bg-slate-100 text-slate-700'}`}>{n}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      <Card className="overflow-hidden">
        {/* Tabs: Active / Inactive / Insurance only (like the old CMMS), and KPDN subsidy */}
        <div className="flex flex-wrap border-b border-slate-200 bg-slate-50/60">
          {Object.entries(TABS).map(([k, v]) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className={`relative px-6 py-3 text-sm font-bold transition ${
                tab === k
                  ? 'bg-white text-brand'
                  : k === 'inactive'
                    ? 'text-red-600 hover:bg-white/60'
                    : k === 'insurance_only'
                      ? 'text-sky-700 hover:bg-white/60'
                      : k === 'kpdn'
                        ? 'text-emerald-700 hover:bg-white/60'
                        : 'text-slate-600 hover:bg-white/60'
              }`}
            >
              {v.label}
              <span className="ml-1.5 rounded-full bg-slate-200 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600">{countTab(k)}</span>
              {tab === k && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-brand" />}
            </button>
          ))}
        </div>
        {tab === 'kpdn' && (
          <p className="border-b border-emerald-100 bg-emerald-50 px-5 py-2 text-sm text-emerald-800">
            Vehicles ticked “KPDN diesel subsidy” (any status). Their fleet card applications are in{' '}
            <Link to="/diesel/cards" className="font-semibold underline">
              Fleet Card Manage
            </Link>
            .
          </p>
        )}
        <div className="flex flex-wrap items-end gap-2 border-b border-slate-200 px-5 py-3">
          {hasLocations && (
            <Filter label="Location">
              <Select value={loc} onChange={(e) => setLoc(e.target.value)} className="h-10" aria-label="Location">
                <option value="">All locations</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name} ({tabRows.filter((m) => m.location_id === l.id).length})
                  </option>
                ))}
                <option value="none">No location ({tabRows.filter((m) => !locationName.has(m.location_id)).length})</option>
              </Select>
            </Filter>
          )}
          <Filter label="Type">
            <Select value={typeF} onChange={(e) => setTypeF(e.target.value)} className="h-10" aria-label="Type">
              <option value="">All types</option>
              {typeF && !typeChoices.some(([k]) => k === typeF) && <option value={typeF}>{nice(typeF)} (0)</option>}
              {typeChoices.map(([k, n]) => (
                <option key={k} value={k}>
                  {nice(k)} ({n})
                </option>
              ))}
            </Select>
          </Filter>
          <Filter label="Brand">
            <Select value={brandF} onChange={(e) => setBrandF(e.target.value)} className="h-10" aria-label="Brand">
              <option value="">All brands</option>
              {brandF && !brandChoices.some(([k]) => k === brandF) && <option value={brandF}>{brandF === '—' ? 'No brand' : brandF} (0)</option>}
              {brandChoices.map(([k, n]) => (
                <option key={k} value={k}>
                  {k === '—' ? 'No brand' : k} ({n})
                </option>
              ))}
            </Select>
          </Filter>
          <Filter label="Search" grow>
            <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search code, plate, type, brand, driver…" className="h-10" />
          </Filter>
          <div className="flex h-10 items-center gap-3 text-sm">
            <span className="whitespace-nowrap text-slate-500">
              {shown.length} of {tabRows.length}
            </span>
            {filtered && (
              <button type="button" onClick={clearFilters} className="whitespace-nowrap font-medium text-brand hover:underline">
                Clear filters
              </button>
            )}
          </div>
        </div>
        {loading ? (
          <div className="flex justify-center py-12 text-brand">
            <Spinner className="h-7 w-7" />
          </div>
        ) : shown.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-slate-500">{rows.length ? (filtered ? 'Nothing matches these filters.' : tab === 'kpdn' ? 'No vehicle is ticked for the KPDN diesel subsidy.' : `No ${TABS[tab].label.toLowerCase()} machines or vehicles.`) : 'No machines or vehicles yet.'}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1120px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="w-24 px-5 py-2.5">No.</th>
                  <th className="px-3 py-2.5">Code / Reg. no.</th>
                  {hasLocations && <th className="px-3 py-2.5">Location</th>}
                  <th className="px-3 py-2.5">Type</th>
                  <th className="px-3 py-2.5">Brand</th>
                  <th className="px-3 py-2.5">Model</th>
                  <th className="px-3 py-2.5">Driver</th>
                  <th className="px-3 py-2.5">Fuel</th>
                  <th className="px-3 py-2.5">Cover</th>
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
                      {hasLocations && <td className="px-3 py-3 text-slate-700">{locationName.get(m.location_id) || '—'}</td>}
                      <td className="px-3 py-3 text-slate-700">
                        {m.machine_type || '—'}
                        {m.hq_vehicle && <Badge color="violet" className="ml-1.5">HQ</Badge>}
                        {m.general_use && <Badge color="blue" className="ml-1.5">General-use car</Badge>}
                      </td>
                      <td className="px-3 py-3 text-slate-700">{m.brand || '—'}</td>
                      <td className="px-3 py-3 text-slate-700">{m.model || '—'}</td>
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

const TONE = {
  green: 'text-green-700',
  red: 'text-red-600',
  sky: 'text-sky-700',
  emerald: 'text-emerald-700'
}
// One figure of the summary; a status figure also switches to its tab.
function Figure({ label, value, tone, onClick, on }) {
  const body = (
    <>
      <span className="block text-xs text-slate-500">{label}</span>
      <span className={`mt-0.5 block font-display text-2xl font-extrabold tabular-nums ${TONE[tone] || 'text-slate-900'}`}>{value}</span>
    </>
  )
  const cls = 'rounded-xl border px-3 py-2 text-left'
  if (!onClick) return <div className={`${cls} border-slate-200 bg-slate-50`}>{body}</div>
  return (
    <button type="button" onClick={onClick} aria-pressed={on} className={`${cls} transition ${on ? 'border-brand bg-brand-light/50' : 'border-slate-200 bg-white hover:border-brand'}`}>
      {body}
    </button>
  )
}

function Filter({ label, grow, children }) {
  return (
    <label className={`block ${grow ? 'min-w-[220px] flex-1' : 'w-full sm:w-48'}`}>
      <span className="mb-1 block text-xs font-semibold text-slate-500">{label}</span>
      {children}
    </label>
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
