import { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate, useOutletContext } from 'react-router-dom'
import PageHeader from '../../components/PageHeader.jsx'
import { Button, Card, Modal, Select, TextInput } from '../../components/ui.jsx'
import { IconCamera, IconDownload, IconImage, IconPencil, IconPlus, IconTrash } from '../../components/icons.jsx'
import { Empty, ErrorBox, F, Loading, MonthSelect, Stats, inputCls, monthsOf } from '../../components/diesel/shared.jsx'
import { deleteFuelRecord, listFuelRecords, listVehicles, openRecordPhoto, removeRecordPhoto, saveFuelRecord, vehicleLabel } from '../../lib/diesel.js'
import { listLocations } from '../../lib/companies.js'
import { useAuth } from '../../auth/AuthContext.jsx'
import { EMBEDDED } from '../../components/Shell.jsx'
import { day, downloadCsv, num, sum, thisMonth, today } from '../../lib/format.js'

// Fuel Usage Record: fuel issued to each machine from the company's own tank
// (date, machine, litres, who issued it). A record's location
// is the machine's location in Machinery Profile, so the list filters and
// totals by location when the company has locations.
export default function FuelRecords() {
  const { company, access } = useOutletContext()
  const navigate = useNavigate()
  const [records, setRecords] = useState([])
  const [machines, setMachines] = useState([])
  const [locations, setLocations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [month, setMonth] = useState(thisMonth())
  const [loc, setLoc] = useState('') // '' = all, 'none' = machines without a location, else a location id
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState(null) // null | {} (new) | record
  const [busyId, setBusyId] = useState(null)

  const load = useCallback(async () => {
    try {
      const [r, m, l] = await Promise.all([listFuelRecords(company.id), listVehicles(company.id), listLocations(company.id).catch(() => [])])
      setRecords(r)
      setMachines(m)
      setLocations(l)
      setError('')
    } catch (e) {
      setError(e.message || 'Could not load the records.')
    } finally {
      setLoading(false)
    }
  }, [company.id])

  useEffect(() => {
    setLoading(true)
    load()
  }, [load])

  const machineById = useMemo(() => new Map(machines.map((m) => [m.id, m])), [machines])
  const locationName = useMemo(() => new Map(locations.map((l) => [l.id, l.name])), [locations])
  const hasLocations = locations.length > 0
  const locOf = (r) => {
    const id = machineById.get(r.machine_id)?.location_id
    return locationName.has(id) ? id : 'none'
  }

  const months = monthsOf(records.map((r) => r.record_date), thisMonth())
  const inMonth = records.filter((r) => !month || r.record_date.startsWith(month))
  const t = q.trim().toLowerCase()
  const rows = inMonth.filter((r) => {
    if (hasLocations && loc && locOf(r) !== loc) return false
    if (!t) return true
    const m = machineById.get(r.machine_id)
    return [m?.name, m?.reg_no, m?.machine_type, r.issued_by, r.remark].some((v) => String(v || '').toLowerCase().includes(t))
  })
  // Litres of the month per location (all machines of the month, not the search).
  const byLocation = [...locations.map((l) => [l.id, l.name]), ['none', 'No location']]
    .map(([id, name]) => {
      const list = inMonth.filter((r) => locOf(r) === id)
      return { id, name, count: list.length, litres: sum(list, 'litres') }
    })
    .filter((x) => x.count > 0)

  const canAdd = access.can('fuel_record', 'add')
  // Site workers (Add only, no View) get the phone form straight away.
  if (!access.can('fuel_record', 'view') && canAdd) return <Navigate to="/diesel/records/mobile" replace />
  // The phone form opens in its own tab from a module window, so it can be bookmarked on a phone.
  // A fresh ?v= makes the tab load the newest version of the app, never a cached one.
  const openMobile = () => (EMBEDDED ? window.open(`${window.location.pathname}?v=${Date.now()}#/diesel/records/mobile`, '_blank') : navigate('/diesel/records/mobile'))
  const canEdit = access.can('fuel_record', 'edit')
  const canDelete = access.can('fuel_record', 'delete')

  async function remove(r) {
    if (!window.confirm(`Delete the record of ${day(r.record_date)} · ${vehicleLabel(machineById.get(r.machine_id))} · ${num(r.litres, 2)} L?`)) return
    setBusyId(r.id)
    try {
      await deleteFuelRecord(r.id)
      removeRecordPhoto(r.photo_path)
      await load()
    } catch (e) {
      setError(e.message || 'Could not delete.')
    } finally {
      setBusyId(null)
    }
  }

  function exportCsv() {
    downloadCsv(
      `fuel-usage-record-${month || 'all'}.csv`,
      [
        { header: 'Date', value: (r) => r.record_date },
        { header: 'Machine', value: (r) => vehicleLabel(machineById.get(r.machine_id)) },
        { header: 'Type', value: (r) => machineById.get(r.machine_id)?.machine_type || '' },
        ...(hasLocations ? [{ header: 'Location', value: (r) => locationName.get(machineById.get(r.machine_id)?.location_id) || '' }] : []),
        { header: 'Litres', value: (r) => r.litres },
        { header: 'Issued by', value: (r) => r.issued_by || '' },
        { header: 'Remark', value: (r) => r.remark || '' }
      ],
      rows
    )
  }

  return (
    <div className="space-y-4">
      <PageHeader
        right={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={exportCsv} disabled={loading || rows.length === 0}>
              <IconDownload width={18} height={18} /> CSV
            </Button>
            {canAdd && (
              <Button variant="secondary" onClick={openMobile} title="Simple phone form for site workers: photo of the meter, machine, litres">
                <IconCamera width={18} height={18} /> Mobile view
              </Button>
            )}
            {canAdd && (
              <Button onClick={() => setEditing({})} disabled={loading}>
                <IconPlus width={18} height={18} /> New record
              </Button>
            )}
          </div>
        }
      />
      <ErrorBox>{error}</ErrorBox>

      <Stats
        items={[
          ['Records', num(rows.length, 0)],
          ['Litres issued', `${num(sum(rows, 'litres'), 2)} L`],
          ['Machines fuelled', num(new Set(rows.map((r) => r.machine_id)).size, 0)],
          ['Average per record', rows.length ? `${num(sum(rows, 'litres') / rows.length, 1)} L` : '—']
        ]}
      />

      {hasLocations && byLocation.length > 0 && (
        <Card className="p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Litres by location{month ? '' : ' (all months)'}</p>
          <div className="flex flex-wrap gap-2">
            {byLocation.map((x) => (
              <button
                key={x.id}
                type="button"
                onClick={() => setLoc(loc === x.id ? '' : x.id)}
                className={`rounded-xl border px-3 py-2 text-left text-sm ${loc === x.id ? 'border-brand bg-brand-light/50' : 'border-slate-200 hover:border-brand'}`}
              >
                <span className="block font-medium text-slate-800">{x.name}</span>
                <span className="text-slate-500">
                  {num(x.litres, 2)} L · {x.count} record{x.count === 1 ? '' : 's'}
                </span>
              </button>
            ))}
          </div>
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-5 py-3">
          <MonthSelect months={months} value={month} onChange={setMonth} allLabel="All months" />
          {hasLocations && (
            <div className="sm:w-56">
              <Select value={loc} onChange={(e) => setLoc(e.target.value)} className="h-10" aria-label="Location">
                <option value="">All locations</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
                <option value="none">No location</option>
              </Select>
            </div>
          )}
          <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search machine, issued by, remark…" className="h-10 sm:ml-auto sm:w-72" />
        </div>
        {loading ? (
          <Loading />
        ) : rows.length === 0 ? (
          <Empty>{records.length ? 'No records match.' : canAdd ? 'No records yet. Press “New record” to add the first one.' : 'No records yet.'}</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-5 py-2.5">Date</th>
                  <th className="px-3 py-2.5">Machine</th>
                  {hasLocations && <th className="px-3 py-2.5">Location</th>}
                  <th className="px-3 py-2.5 text-right">Litres</th>
                  <th className="px-3 py-2.5">Issued by</th>
                  <th className="px-3 py-2.5">Remark</th>
                  {(canEdit || canDelete) && <th className="w-24 px-3 py-2.5 text-center">Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => {
                  const m = machineById.get(r.machine_id)
                  return (
                    <tr key={r.id} className="hover:bg-slate-50/60">
                      <td className="whitespace-nowrap px-5 py-3 text-slate-700">{day(r.record_date)}</td>
                      <td className="px-3 py-3">
                        <span className="font-semibold text-slate-800">{vehicleLabel(m)}</span>
                        {m?.machine_type && <span className="block text-xs text-slate-500">{m.machine_type}</span>}
                      </td>
                      {hasLocations && <td className="px-3 py-3 text-slate-700">{locationName.get(m?.location_id) || '—'}</td>}
                      <td className="px-3 py-3 text-right font-medium tabular-nums text-slate-800">
                        <span className="inline-flex items-center justify-end gap-1.5">
                          {r.photo_path && (
                            <button onClick={() => openRecordPhoto(r.photo_path).catch((e) => window.alert(e.message))} className="text-slate-400 hover:text-brand" title="Meter photo" aria-label="Open meter photo">
                              <IconImage width={16} height={16} />
                            </button>
                          )}
                          {num(r.litres, 2)}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-slate-700">{r.issued_by || '—'}</td>
                      <td className="max-w-xs px-3 py-3 text-slate-500">{r.remark || ''}</td>
                      {(canEdit || canDelete) && (
                        <td className="px-3 py-3">
                          <div className="flex items-center justify-center gap-0.5">
                            {canEdit && (
                              <button onClick={() => setEditing(r)} className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-brand" title="Edit" aria-label="Edit">
                                <IconPencil width={18} height={18} />
                              </button>
                            )}
                            {canDelete && (
                              <button onClick={() => remove(r)} disabled={busyId === r.id} className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30" title="Delete" aria-label="Delete">
                                <IconTrash width={18} height={18} />
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-200 bg-slate-50/80 font-semibold text-slate-800">
                  <td className="px-5 py-2.5" colSpan={hasLocations ? 3 : 2}>
                    Total
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{num(sum(rows, 'litres'), 2)}</td>
                  <td colSpan={canEdit || canDelete ? 3 : 2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>

      {editing && (
        <RecordModal
          company={company}
          record={editing}
          machines={machines}
          locations={locations}
          startLocation={loc && loc !== 'none' ? loc : ''}
          onClose={() => setEditing(null)}
          onSaved={load}
        />
      )}
    </div>
  )
}

// Add / edit one record. With locations, a Location box narrows the machine list.
function RecordModal({ company, record, machines, locations, startLocation, onClose, onSaved }) {
  const { user } = useAuth()
  const isNew = !record.id
  const [f, setF] = useState({
    record_date: record.record_date || today(),
    machine_id: record.machine_id || '',
    litres: record.litres ?? '',
    issued_by: record.issued_by ?? (isNew ? user?.fullName || '' : ''),
    remark: record.remark || ''
  })
  const [loc, setLoc] = useState(isNew ? startLocation : '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))

  // Active machines that take fuel (plus the record's own machine when editing).
  const choices = machines.filter(
    (m) => m.id === f.machine_id || (m.is_active !== false && m.fuel_type !== 'none' && (!loc || (loc === 'none' ? !m.location_id : m.location_id === loc)))
  )
  const machine = machines.find((m) => m.id === f.machine_id)

  async function save(e) {
    e.preventDefault()
    if (!f.machine_id) return setError('Choose a machine.')
    if (!(Number(f.litres) > 0)) return setError('Litres must be more than 0.')
    setBusy(true)
    setError('')
    try {
      await saveFuelRecord(company.id, {
        id: record.id,
        record_date: f.record_date,
        machine_id: f.machine_id,
        litres: Number(f.litres),
        issued_by: f.issued_by.trim() || null,
        remark: f.remark.trim() || null
      })
      await onSaved()
      onClose()
    } catch (e2) {
      setError(e2.message || 'Could not save.')
      setBusy(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={isNew ? 'New fuel usage record' : 'Edit fuel usage record'}>
      <form onSubmit={save} className="space-y-3">
        <ErrorBox>{error}</ErrorBox>
        <div className="grid grid-cols-2 gap-3">
          <F label="Date">
            <input type="date" required max={today()} value={f.record_date} onChange={set('record_date')} className={inputCls} />
          </F>
          {locations.length > 0 ? (
            <F label="Location">
              <select value={loc} onChange={(e) => setLoc(e.target.value)} className={inputCls}>
                <option value="">All locations</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
                <option value="none">No location</option>
              </select>
            </F>
          ) : (
            <span />
          )}
          <F label="Machine" span hint={choices.length === 0 ? 'No active machine here. Add machines in Machinery Manage → Machinery Profile.' : null}>
            <select required value={f.machine_id} onChange={set('machine_id')} className={inputCls}>
              <option value="">Choose a machine…</option>
              {choices.map((m) => (
                <option key={m.id} value={m.id}>
                  {vehicleLabel(m)}
                  {m.machine_type ? ` · ${m.machine_type}` : ''}
                </option>
              ))}
            </select>
          </F>
          <F label="Litres" span hint={overTank ? `More than the tank (${num(machine.tank_capacity_l, 0)} L). Check the figure.` : null}>
            <input type="number" inputMode="decimal" required min="0.01" step="0.01" value={f.litres} onChange={set('litres')} className={inputCls} />
          </F>
          <F label="Issued by" span>
            <input value={f.issued_by} onChange={set('issued_by')} maxLength={120} className={inputCls} placeholder="Who pumped the fuel" />
          </F>
          <F label="Remark" span>
            <input value={f.remark} onChange={set('remark')} maxLength={400} className={inputCls} placeholder="Optional" />
          </F>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
