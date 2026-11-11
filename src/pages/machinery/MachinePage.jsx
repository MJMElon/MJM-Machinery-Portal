import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import PageHeader from '../../components/PageHeader.jsx'
import { Badge, Button, Card, Spinner } from '../../components/ui.jsx'
import { IconImage, IconPencil, IconTrash, IconWarning, IconX } from '../../components/icons.jsx'
import {
  MACHINE_TYPES,
  SERVICE_UNITS,
  coverState,
  deleteMachine,
  getMachine,
  isPdf,
  listPortalPeople,
  machineFileUrl,
  machineNo,
  openMachineFile,
  removeMachineFile,
  saveMachine,
  uploadMachineFile,
  useCmmsAccess,
  userLabel
} from '../../lib/cmms.js'
import { listCompanyPerms } from '../../lib/perms.js'
import { useCompany } from '../../lib/CompanyContext.jsx'
import { day, money } from '../../lib/format.js'

// One machine / vehicle: the full particulars (same as the old CMMS "Machine
// Particular" screen) in two columns, then the fuel details and the drivers.
// /cmms/machines/new and /cmms/machines/:id/edit edit; /cmms/machines/:id views.
const EMPTY = {
  name: '',
  machine_type: '',
  brand: '',
  model: '',
  reg_no: '',
  is_active: true,
  serial_no: '',
  chassis_no: '',
  engine_no: '',
  market_value: '',
  ideal_fuel_consumption: '',
  possible_working_units: '',
  service_unit: 'Liter/Km',
  acc_code: '',
  year_made: '',
  purchase_date: '',
  purchase_price: '',
  notes: '',
  insurance_from: '',
  insurance_to: '',
  road_tax_from: '',
  road_tax_to: '',
  puspakom_from: '',
  puspakom_to: '',
  photos: [],
  reg_card_path: '',
  resolution_path: '',
  fuel_type: 'diesel',
  tank_capacity_l: '',
  kpdn_subsidy: false,
  general_use: false,
  driver_ids: []
}
const NUMBER_FIELDS = ['market_value', 'ideal_fuel_consumption', 'possible_working_units', 'year_made', 'purchase_price', 'tank_capacity_l']
const DATE_FIELDS = ['purchase_date', 'insurance_from', 'insurance_to', 'road_tax_from', 'road_tax_to', 'puspakom_from', 'puspakom_to']
const TEXT_FIELDS = ['name', 'machine_type', 'brand', 'model', 'reg_no', 'serial_no', 'chassis_no', 'engine_no', 'service_unit', 'acc_code', 'notes', 'reg_card_path', 'resolution_path']

export default function MachinePage({ mode }) {
  const { current } = useCompany()
  const { id } = useParams()
  const navigate = useNavigate()
  const access = useCmmsAccess(current?.id)
  const editing = mode === 'edit' || mode === 'new'
  const [form, setForm] = useState(EMPTY)
  const [machine, setMachine] = useState(null)
  const [people, setPeople] = useState([])
  const [loading, setLoading] = useState(mode !== 'new')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [urls, setUrls] = useState({})
  const uploaded = useRef([]) // files put up during this edit; removed again on Cancel

  const load = useCallback(async () => {
    if (!current) return
    try {
      const [m, pp, perms] = await Promise.all([
        id ? getMachine(id) : null,
        listPortalPeople().catch(() => []),
        listCompanyPerms(current.id).catch(() => [])
      ])
      if (id && (!m || m.company_id !== current.id)) throw new Error('Machine not found in this company.')
      // Drivers: the users who have CMMS 2 access (Intranet icon or a role here).
      const withRole = new Set(perms.filter((p) => Object.keys(p.perms || {}).length).map((p) => p.user_id))
      setPeople(pp.filter((p) => p.is_super_admin || p.intranet_cmms || p.intranet_fuel || withRole.has(p.user_id) || m?.driver_ids?.includes(p.user_id)))
      setMachine(m)
      if (m) {
        const f = { ...EMPTY }
        for (const k of Object.keys(EMPTY)) if (m[k] != null) f[k] = m[k]
        f.is_active = m.is_active !== false
        f.driver_ids = m.driver_ids?.length ? m.driver_ids : m.driver_id ? [m.driver_id] : []
        f.photos = m.photos || []
        setForm(f)
        const u = {}
        for (const p of [...f.photos, f.reg_card_path, f.resolution_path]) if (p && !isPdf(p)) u[p] = await machineFileUrl(p)
        setUrls(u)
      }
      setError('')
    } catch (e) {
      setError(e.message || 'Could not load.')
    } finally {
      setLoading(false)
    }
  }, [current, id])

  useEffect(() => {
    load()
  }, [load])

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e }))
  const person = useMemo(() => new Map(people.map((p) => [p.user_id, p])), [people])

  async function putFile(file, { image } = {}) {
    const path = await uploadMachineFile(current.id, file, { image })
    uploaded.current.push(path)
    if (!isPdf(path)) setUrls((u) => ({ ...u, [path]: URL.createObjectURL(file) }))
    return path
  }
  const addPhoto = async (file) => {
    if (!file || form.photos.length >= 4) return
    setBusy(true)
    try {
      const path = await putFile(file, { image: true })
      setForm((f) => ({ ...f, photos: [...f.photos, path] }))
      setError('')
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }
  const setDoc = (key) => async (file) => {
    if (!file) return
    setBusy(true)
    try {
      const path = await putFile(file)
      setForm((f) => ({ ...f, [key]: path }))
      setError('')
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function save(e) {
    e.preventDefault()
    if (!form.name.trim()) return setError('Code / name is required.')
    setBusy(true)
    setError('')
    try {
      const row = { id: id || undefined }
      for (const k of TEXT_FIELDS) row[k] = form[k]?.trim?.() ? form[k].trim() : null
      for (const k of NUMBER_FIELDS) row[k] = form[k] === '' || form[k] == null ? null : Number(form[k])
      for (const k of DATE_FIELDS) row[k] = form[k] || null
      row.is_active = form.is_active !== false && form.is_active !== 'false'
      row.fuel_type = form.fuel_type || 'diesel'
      row.kpdn_subsidy = Boolean(form.kpdn_subsidy)
      row.general_use = Boolean(form.general_use)
      row.driver_ids = form.driver_ids
      row.photos = form.photos
      const savedId = await saveMachine(current.id, row)
      uploaded.current = []
      navigate(`/cmms/machines/${savedId}`, { replace: true })
    } catch (e2) {
      setError(e2.message || 'Could not save.')
    } finally {
      setBusy(false)
    }
  }
  function cancel() {
    uploaded.current.forEach(removeMachineFile)
    uploaded.current = []
    navigate(id ? `/cmms/machines/${id}` : '/cmms/machines')
  }
  async function remove() {
    if (!window.confirm(`Delete ${form.name}? This cannot be undone.`)) return
    setBusy(true)
    try {
      await deleteMachine(id)
      ;[...form.photos, form.reg_card_path, form.resolution_path].forEach(removeMachineFile)
      navigate('/cmms/machines', { replace: true })
    } catch (e) {
      setError(e.message)
      setBusy(false)
    }
  }

  if (loading)
    return (
      <div className="flex justify-center py-12 text-brand">
        <Spinner className="h-7 w-7" />
      </div>
    )

  const ro = !editing
  const title = mode === 'new' ? 'New machine / vehicle' : `${machineNo(machine)} · ${form.name || 'Machine'}`

  return (
    <form onSubmit={save} className="space-y-4">
      <PageHeader
        backTo={mode === 'edit' ? `/cmms/machines/${id}` : '/cmms/machines'}
        backLabel={mode === 'edit' ? 'Back to profile' : 'Back to listing'}
        title={
          <span className="inline-flex flex-wrap items-center gap-3">
            {title}
            {ro && <Badge color={form.is_active ? 'green' : 'slate'}>{form.is_active ? 'Active' : 'Inactive'}</Badge>}
            {ro && form.general_use && <Badge color="blue">General-use car</Badge>}
          </span>
        }
        right={
          editing ? (
            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={cancel} disabled={busy}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? 'Saving…' : 'Save'}
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              {access.can('machines', 'edit') && (
                <Button type="button" variant="secondary" onClick={() => navigate(`/cmms/machines/${id}/edit`)}>
                  <IconPencil width={18} height={18} /> Edit
                </Button>
              )}
              {access.can('machines', 'delete') && (
                <Button type="button" variant="secondary" className="text-red-600" onClick={remove} disabled={busy}>
                  <IconTrash width={18} height={18} /> Delete
                </Button>
              )}
            </div>
          )
        }
      />
      {error && <p className="rounded-xl bg-red-100 p-3 text-sm text-red-700">{error}</p>}

      <Card className="p-5 sm:p-6">
        <h3 className="mb-4 font-display text-lg font-bold text-slate-900 underline decoration-slate-300 underline-offset-4">Machine Particular</h3>
        <div className="grid gap-x-10 gap-y-1 lg:grid-cols-2">
          <div>
            <Row ro label="Machine no." value={mode === 'new' ? 'Given on save' : machineNo(machine)} />
            <Row ro={ro} label="Code / name" required value={form.name} onChange={set('name')} placeholder="e.g. VNL1234 or EX-03" />
            <Row ro={ro} label="Type" value={form.machine_type} onChange={set('machine_type')} list="machine-types" placeholder="Light vehicle, Lorry, Excavator…" />
            <Row ro={ro} label="Brand" value={form.brand} onChange={set('brand')} placeholder="Toyota" />
            <Row ro={ro} label="Model" value={form.model} onChange={set('model')} placeholder="Hilux 2 cabs" />
            <Row ro={ro} label="Registration no." value={form.reg_no} onChange={set('reg_no')} placeholder="VNL 1234" />
            <Row ro={ro} label="Status" type="select" value={form.is_active ? 'true' : 'false'} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.value === 'true' }))} options={[['true', 'Active'], ['false', 'Inactive']]} show={form.is_active ? 'Active' : 'Inactive'} />
            <Row ro={ro} label="Serial no." value={form.serial_no} onChange={set('serial_no')} />
            <Row ro={ro} label="Chassis no." value={form.chassis_no} onChange={set('chassis_no')} />
            <Row ro={ro} label="Engine no." value={form.engine_no} onChange={set('engine_no')} />
            <Row ro={ro} label="Market value" type="number" step="0.01" value={form.market_value} onChange={set('market_value')} show={form.market_value !== '' ? money(form.market_value) : ''} />
            <Row ro={ro} label="Ideal fuel consumption" type="number" step="0.001" value={form.ideal_fuel_consumption} onChange={set('ideal_fuel_consumption')} />
            <Row ro={ro} label="Possible working units" type="number" step="0.01" value={form.possible_working_units} onChange={set('possible_working_units')} />
            <Row ro={ro} label="Service unit" type="select" value={form.service_unit} onChange={set('service_unit')} options={SERVICE_UNITS} show={SERVICE_UNITS.find((o) => o[0] === form.service_unit)?.[1] || form.service_unit} />
            <FileRow label="Reg card" path={form.reg_card_path} url={urls[form.reg_card_path]} ro={ro} busy={busy} onPick={setDoc('reg_card_path')} onClear={() => setForm((f) => ({ ...f, reg_card_path: '' }))} />
            <FileRow label="Director circular resolution" path={form.resolution_path} url={urls[form.resolution_path]} ro={ro} busy={busy} onPick={setDoc('resolution_path')} onClear={() => setForm((f) => ({ ...f, resolution_path: '' }))} />
          </div>
          <div>
            <Row ro={ro} label="ACC code" value={form.acc_code} onChange={set('acc_code')} placeholder="machinery00086" />
            <Row ro={ro} label="Year made" type="number" step="1" min="1950" max="2100" value={form.year_made} onChange={set('year_made')} />
            <Row ro={ro} label="Date purchase" type="date" value={form.purchase_date} onChange={set('purchase_date')} show={form.purchase_date ? day(form.purchase_date) : ''} />
            <Row ro={ro} label="Purchase price" type="number" step="0.01" value={form.purchase_price} onChange={set('purchase_price')} show={form.purchase_price !== '' ? money(form.purchase_price) : ''} />
            <Row ro={ro} label="Remarks" type="textarea" value={form.notes} onChange={set('notes')} />
            <Photos photos={form.photos} urls={urls} ro={ro} busy={busy} onAdd={addPhoto} onRemove={(p) => setForm((f) => ({ ...f, photos: f.photos.filter((x) => x !== p) }))} />
            <Period label="Insurance" from={form.insurance_from} to={form.insurance_to} ro={ro} onFrom={set('insurance_from')} onTo={set('insurance_to')} />
            <Period label="Road tax" from={form.road_tax_from} to={form.road_tax_to} ro={ro} onFrom={set('road_tax_from')} onTo={set('road_tax_to')} />
            <Period label="Puspakom" from={form.puspakom_from} to={form.puspakom_to} ro={ro} onFrom={set('puspakom_from')} onTo={set('puspakom_to')} />
          </div>
        </div>
        <datalist id="machine-types">
          {MACHINE_TYPES.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
      </Card>

      <Card className="p-5 sm:p-6">
        <h3 className="mb-1 font-display text-lg font-bold text-slate-900 underline decoration-slate-300 underline-offset-4">Fuel &amp; drivers</h3>
        <div className="mb-3" />
        <div className="grid gap-x-10 gap-y-1 lg:grid-cols-2">
          <div>
            <Row ro={ro} label="Fuel" type="select" value={form.fuel_type} onChange={set('fuel_type')} options={[['diesel', 'Diesel'], ['petrol', 'Petrol'], ['none', 'None']]} show={{ diesel: 'Diesel', petrol: 'Petrol', none: 'None' }[form.fuel_type]} />
            <Row ro={ro} label="Tank capacity (L)" type="number" step="1" value={form.tank_capacity_l} onChange={set('tank_capacity_l')} />
            <Tick label="General-use car" checked={form.general_use} onChange={set('general_use')} ro={ro} />
            <Tick label="KPDN diesel subsidy" checked={form.kpdn_subsidy} onChange={set('kpdn_subsidy')} ro={ro} />
          </div>
          <div>
            <div className="grid grid-cols-[180px_minmax(0,1fr)] items-start gap-3 border-b border-slate-100 py-2.5">
              <span className="pt-2 text-sm font-semibold text-slate-700">Driver</span>
              {ro ? (
                <p className="py-2 text-sm text-slate-800">{form.driver_ids[0] ? userLabel(person.get(form.driver_ids[0])) : <span className="text-slate-400">—</span>}</p>
              ) : (
                <DriverPicker
                  value={form.driver_ids[0] || ''}
                  people={people}
                  onChange={(uid) => setForm((f) => ({ ...f, driver_ids: uid ? [uid] : [] }))}
                />
              )}
            </div>
          </div>
        </div>
      </Card>

      {editing && (
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={cancel} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </Button>
        </div>
      )}
    </form>
  )
}

const box = 'h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30'

// Label on the left, value / input on the right (the old CMMS layout).
function Row({ label, required, type = 'text', value, onChange, options, show, hint, ro, list, ...rest }) {
  let control
  if (ro) {
    const text = show ?? (value === '' || value == null ? '' : String(value))
    control = <p className="min-h-10 whitespace-pre-wrap py-2 text-sm text-slate-800">{text || <span className="text-slate-400">—</span>}</p>
  } else if (type === 'select') {
    control = (
      <select value={value} onChange={onChange} className={box}>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    )
  } else if (type === 'textarea') {
    control = <textarea rows={3} value={value} onChange={onChange} className={`${box} h-auto py-2`} {...rest} />
  } else {
    control = <input type={type} value={value} onChange={onChange} list={list} className={box} {...rest} />
  }
  return (
    <div className="grid grid-cols-[180px_minmax(0,1fr)] items-start gap-3 border-b border-slate-100 py-2.5">
      <span className="pt-2 text-sm font-semibold text-slate-700">
        {label} {required && !ro && <span className="text-red-500">*</span>}
      </span>
      <div>
        {control}
        {hint && !ro && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
      </div>
    </div>
  )
}

function Tick({ label, checked, onChange, ro, hint }) {
  return (
    <div className="grid grid-cols-[180px_minmax(0,1fr)] items-start gap-3 border-b border-slate-100 py-2.5">
      <span className="pt-2 text-sm font-semibold text-slate-700">{label}</span>
      <div className="pt-2.5">
        <input type="checkbox" checked={Boolean(checked)} onChange={onChange} disabled={ro} className="h-5 w-5 rounded border-slate-300 text-brand disabled:opacity-100" title={hint} />
      </div>
    </div>
  )
}

// From / To dates in one row, with an expiry chip.
function Period({ label, from, to, ro, onFrom, onTo }) {
  const s = coverState(to)
  const chip = s && (
    <Badge color={s === 'expired' ? 'red' : s === 'soon' ? 'amber' : 'green'} className="ml-2">
      {s === 'expired' ? 'Expired' : s === 'soon' ? 'Expiring soon' : 'Valid'}
    </Badge>
  )
  return (
    <div className="grid grid-cols-[180px_minmax(0,1fr)] items-start gap-3 border-b border-slate-100 py-2.5">
      <span className="pt-2 text-sm font-semibold text-slate-700">{label}</span>
      {ro ? (
        <p className="py-2 text-sm text-slate-800">
          {from || to ? `From ${from ? day(from) : '—'} to ${to ? day(to) : '—'}` : <span className="text-slate-400">—</span>}
          {chip}
        </p>
      ) : (
        <div className="grid grid-cols-[auto_minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 text-sm text-slate-500">
          <span>From</span>
          <input type="date" value={from} onChange={onFrom} className={box.replace('w-full', 'w-auto min-w-0')} />
          <span>to</span>
          <input type="date" value={to} onChange={onTo} className={box.replace('w-full', 'w-auto min-w-0')} />
          {chip && <span className="col-span-4">{chip}</span>}
        </div>
      )}
    </div>
  )
}

// A document slot: shows the file (opens it), or a chooser.
function FileRow({ label, path, url, ro, busy, onPick, onClear }) {
  return (
    <div className="grid grid-cols-[180px_minmax(0,1fr)] items-start gap-3 border-b border-slate-100 py-2.5">
      <span className="pt-2 text-sm font-semibold text-slate-700">{label}</span>
      <div className="flex flex-wrap items-center gap-2 pt-1">
        {path ? (
          <>
            <button type="button" onClick={() => openMachineFile(path).catch((e) => window.alert(e.message))} className="inline-flex h-8 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-sm text-brand hover:border-brand">
              {url ? <img src={url} alt="" className="h-6 w-6 rounded object-cover" /> : <IconImage width={16} height={16} />}
              {isPdf(path) ? 'Open PDF' : 'Open photo'}
            </button>
            {!ro && (
              <button type="button" onClick={onClear} className="text-xs text-slate-500 hover:text-red-600">
                Remove
              </button>
            )}
          </>
        ) : ro ? (
          <span className="inline-flex items-center gap-1.5 text-sm text-slate-500">
            No attachment is found. <IconWarning width={16} height={16} className="text-red-500" />
          </span>
        ) : null}
        {!ro && !path && (
          <label className="inline-flex h-8 cursor-pointer items-center rounded-lg border border-dashed border-slate-300 px-2.5 text-sm text-slate-600 hover:border-brand hover:text-brand">
            {busy ? 'Uploading…' : 'Upload PDF or photo'}
            <input type="file" accept="image/*,application/pdf" className="hidden" disabled={busy} onChange={(e) => onPick(e.target.files?.[0])} />
          </label>
        )}
      </div>
    </div>
  )
}

// Up to 4 photos in a row, like the old screen.
function Photos({ photos, urls, ro, busy, onAdd, onRemove }) {
  const slots = [...photos, ...Array(Math.max(0, 4 - photos.length)).fill(null)].slice(0, 4)
  return (
    <div className="grid grid-cols-[180px_minmax(0,1fr)] items-start gap-3 border-b border-slate-100 py-2.5">
      <span className="pt-2 text-sm font-semibold text-slate-700">Photos</span>
      <div className="flex flex-wrap gap-2">
        {slots.map((p, i) =>
          p ? (
            <div key={p} className="flex flex-col items-center gap-1">
              <button type="button" onClick={() => openMachineFile(p).catch((e) => window.alert(e.message))} className="flex h-20 w-24 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50 hover:border-brand" title="View photo">
                {urls[p] ? <img src={urls[p]} alt={`Photo ${i + 1}`} className="h-full w-full object-cover" /> : <IconImage width={22} height={22} className="text-slate-400" />}
              </button>
              {ro ? (
                <button type="button" onClick={() => openMachineFile(p).catch((e) => window.alert(e.message))} className="text-xs text-red-600 hover:underline">
                  View
                </button>
              ) : (
                <button type="button" onClick={() => onRemove(p)} className="text-xs text-slate-500 hover:text-red-600">
                  Remove
                </button>
              )}
            </div>
          ) : ro ? (
            <div key={`e${i}`} className="flex h-20 w-24 items-center justify-center rounded-lg border border-dashed border-slate-200 text-slate-300">
              <IconImage width={22} height={22} />
            </div>
          ) : (
            <label key={`e${i}`} className="flex h-20 w-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-slate-300 text-xs text-slate-500 hover:border-brand hover:text-brand">
              <IconImage width={20} height={20} />
              {busy ? 'Uploading…' : 'Add photo'}
              <input type="file" accept="image/*" className="hidden" disabled={busy} onChange={(e) => onAdd(e.target.files?.[0])} />
            </label>
          )
        )}
      </div>
    </div>
  )
}

// Searchable driver list: type part of a name or e-mail, pick from the matches.
function DriverPicker({ value, people, onChange }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const chosen = people.find((p) => p.user_id === value)
  const t = q.trim().toLowerCase()
  const matches = people.filter((p) => !t || [p.full_name, p.email].some((v) => String(v || '').toLowerCase().includes(t))).slice(0, 12)
  return (
    <div className="relative">
      {chosen && !open ? (
        <div className="flex items-center gap-2">
          <span className="inline-flex h-10 items-center rounded-lg bg-brand-light px-3 text-sm font-medium text-brand-dark">{userLabel(chosen)}</span>
          <button type="button" onClick={() => onChange('')} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-red-600" aria-label="Remove driver">
            <IconX width={16} height={16} />
          </button>
        </div>
      ) : (
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Type a name to search…"
          className={box}
        />
      )}
      {open && !chosen && (
        <ul className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {matches.length === 0 && <li className="px-3 py-2 text-sm text-slate-400">No match</li>}
          {matches.map((p) => (
            <li key={p.user_id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(p.user_id)
                  setQ('')
                  setOpen(false)
                }}
                className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-slate-50"
              >
                <span className="font-medium text-slate-800">{p.full_name || p.email}</span>
                {p.full_name && <span className="text-xs text-slate-400">{p.email}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
