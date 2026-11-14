import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { Spinner } from '../../components/ui.jsx'
import { IconCamera, IconCheck } from '../../components/icons.jsx'
import { listFuelRecords, listVehicles, removeRecordPhoto, saveFuelRecord, uploadRecordPhoto, vehicleLabel } from '../../lib/diesel.js'
import { listLocations } from '../../lib/companies.js'
import { METER_READER_VERSION, readMeterPhoto } from '../../lib/ocr.js'
import { useAuth } from '../../auth/AuthContext.jsx'
import { day, num, sum, today } from '../../lib/format.js'
import { useT } from '../worker/prefs.jsx'

// Diesel Usage Record in Worker CMMS (/app/fuel), for site workers: photograph the pump meter,
// pick the machine, check the litres, send. The date is today, the litres are
// read off the photo (a draft the worker checks), the name is the signed-in
// person. Entries land in Fuel Usage Record with the photo attached.
const big = 'h-14 w-full rounded-2xl border border-slate-300 bg-white px-4 text-lg text-slate-900 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30'
const LAST_LOCATION = 'mjm-fuel-record-location'

export default function FuelRecordMobile() {
  const t = useT()
  const { company, access } = useOutletContext()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [machines, setMachines] = useState([])
  const [locations, setLocations] = useState([])
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [loc, setLoc] = useState(() => {
    try {
      return localStorage.getItem(LAST_LOCATION) || ''
    } catch {
      return ''
    }
  })
  const [machineId, setMachineId] = useState('')
  const [date, setDate] = useState(today())
  const [litres, setLitres] = useState('')
  const [photo, setPhoto] = useState(null) // { file, url }
  const [reading, setReading] = useState(false)
  const [readNote, setReadNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(null) // the entry just sent
  const fileInput = useRef(null)
  const scan = useRef(0)

  const canAdd = access.can('fuel_record', 'add')

  const load = useCallback(async () => {
    try {
      const [m, l, r] = await Promise.all([listVehicles(company.id), listLocations(company.id).catch(() => []), listFuelRecords(company.id)])
      setMachines(m)
      setLocations(l)
      setRecords(r)
      setLoc((v) => (v && !l.some((x) => x.id === v) ? '' : v))
      setError('')
    } catch (e) {
      setError(e.message || t('Could not load.'))
    } finally {
      setLoading(false)
    }
  }, [company.id])

  useEffect(() => {
    load()
  }, [load])
  useEffect(() => () => photo?.url && URL.revokeObjectURL(photo.url), [photo])

  const machineById = useMemo(() => new Map(machines.map((m) => [m.id, m])), [machines])
  const choices = machines.filter((m) => m.is_active !== false && m.fuel_type !== 'none' && (!loc || m.location_id === loc))
  const machine = machineById.get(machineId)
  const mine = records.filter((r) => r.created_by === user?.id && r.record_date === today())
  const overTank = machine?.tank_capacity_l && Number(litres) > Number(machine.tank_capacity_l)

  function pickLocation(v) {
    setLoc(v)
    if (v && machine && machine.location_id !== v) setMachineId('')
    try {
      localStorage.setItem(LAST_LOCATION, v)
    } catch {
      // private mode: just not remembered
    }
  }

  async function takePhoto(file) {
    if (!file) return
    if (!file.type.startsWith('image/')) return setError(t('Please take a photo.'))
    setError('')
    setPhoto({ file, url: URL.createObjectURL(file) })
    const n = ++scan.current
    setReading(true)
    setReadNote('')
    const r = await readMeterPhoto(file)
    if (n !== scan.current) return // a newer photo was taken meanwhile
    setReading(false)
    if (r.litres != null) {
      setLitres(String(r.litres))
      setReadNote('read')
    } else {
      setReadNote('unread')
    }
  }

  async function submit(e) {
    e.preventDefault()
    if (!photo) return setError(t('Take a photo of the meter first.'))
    if (!machineId) return setError(t('Choose the machine or vehicle.'))
    if (!(Number(litres) > 0)) return setError(t('Enter the litres taken.'))
    setBusy(true)
    setError('')
    let path = null
    try {
      path = await uploadRecordPhoto(company.id, user.id, photo.file)
      await saveFuelRecord(company.id, {
        record_date: date,
        machine_id: machineId,
        litres: Number(litres),
        issued_by: user.fullName || user.email || null,
        photo_path: path
      })
      setSaved({ machine: vehicleLabel(machine), litres: Number(litres), date })
      setPhoto(null)
      setLitres('')
      setMachineId('')
      setReadNote('')
      setDate(today())
      load()
    } catch (e2) {
      removeRecordPhoto(path)
      setError(e2.message || t('Could not send. Please try again.'))
    } finally {
      setBusy(false)
    }
  }

  if (loading)
    return (
      <div className="flex justify-center py-16 text-brand">
        <Spinner className="h-8 w-8" />
      </div>
    )

  if (!canAdd)
    return (
      <div className="mx-auto max-w-md rounded-2xl bg-amber-50 p-5 text-center text-amber-900">
        <p className="text-lg font-bold">{t('No access')}</p>
        <p className="mt-1 text-sm">{t('You cannot add fuel records for {company}. Ask your admin to tick “Add records” for you (Fuel Usage Record).', { company: company.name })}</p>
      </div>
    )

  if (saved)
    return (
      <div className="mx-auto max-w-md space-y-5 text-center">
        <div className="rounded-3xl bg-green-50 p-8">
          <span className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-green-600 text-white">
            <IconCheck width={44} height={44} />
          </span>
          <p className="mt-4 text-2xl font-bold text-green-900">{t('Sent')}</p>
          <p className="mt-1 text-lg text-green-900">
            {num(saved.litres, 2)} L · {saved.machine}
          </p>
          <p className="text-sm text-green-800">{day(saved.date)}</p>
        </div>
        <button onClick={() => setSaved(null)} className="h-16 w-full rounded-2xl bg-brand text-xl font-bold text-white active:bg-brand-dark">
          {t('Add another')}
        </button>
        <button onClick={() => navigate('/app')} className="h-14 w-full rounded-2xl border border-slate-300 bg-white text-lg font-semibold text-slate-700">
          {t('Back to Worker CMMS')}
        </button>
        <Today mine={mine} machineById={machineById} />
      </div>
    )

  return (
    <form onSubmit={submit} className="mx-auto max-w-md space-y-5 pb-10">
      <p className="text-center text-sm text-slate-500">
        {company.name} · {user?.fullName || user?.email}
      </p>
      {error && <p className="rounded-2xl bg-red-100 p-4 text-base font-medium text-red-800">{error}</p>}

      {/* 1. Photo of the meter */}
      <Step n="1" title={t('Photo of the meter')}>
        <input ref={fileInput} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { takePhoto(e.target.files?.[0]); e.target.value = '' }} />
        {photo ? (
          <div className="space-y-2">
            <img src={photo.url} alt="Meter" className="max-h-64 w-full rounded-2xl border border-slate-200 object-contain" />
            <button type="button" onClick={() => fileInput.current?.click()} className="h-12 w-full rounded-2xl border border-slate-300 bg-white text-base font-semibold text-slate-700">
              {t('Take again')}
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => fileInput.current?.click()} className="flex h-36 w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-brand bg-brand-light/40 text-brand active:bg-brand-light">
            <IconCamera width={44} height={44} />
            <span className="text-xl font-bold">{t('Take photo')}</span>
          </button>
        )}
      </Step>

      {/* 2. Machine */}
      <Step n="2" title={t('Machine / vehicle')}>
        {locations.length > 0 && (
          <select value={loc} onChange={(e) => pickLocation(e.target.value)} className={`${big} mb-2`} aria-label={t('Location')}>
            <option value="">{t('All locations')}</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        )}
        <select value={machineId} onChange={(e) => setMachineId(e.target.value)} className={`${big} font-semibold`} aria-label={t('Machine or vehicle')}>
          <option value="">{t('Choose…')}</option>
          {choices.map((m) => (
            <option key={m.id} value={m.id}>
              {vehicleLabel(m)}
              {m.machine_type ? ` · ${m.machine_type}` : ''}
            </option>
          ))}
        </select>
        {choices.length === 0 && <p className="mt-1 text-sm text-slate-500">{t('No machine in this location.')}</p>}
      </Step>

      {/* 3. Litres */}
      <Step n="3" title={t('Diesel taken (litres)')}>
        <div className="relative">
          <input
            type="number"
            inputMode="decimal"
            min="0.01"
            step="0.01"
            value={litres}
            onChange={(e) => {
              setLitres(e.target.value)
              setReadNote('')
            }}
            placeholder={reading ? t('Reading the photo…') : '0'}
            className="h-20 w-full rounded-2xl border border-slate-300 bg-white px-4 pr-14 text-center text-4xl font-bold tabular-nums text-slate-900 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
            aria-label={t('Litres')}
          />
          <span className="pointer-events-none absolute right-5 top-1/2 -translate-y-1/2 text-2xl font-semibold text-slate-400">L</span>
        </div>
        {reading && (
          <p className="mt-2 flex items-center gap-2 text-sm text-slate-500">
            <Spinner className="h-4 w-4" /> {t('Reading the meter from the photo…')}
          </p>
        )}
        {!reading && readNote && (
          <p className="mt-2 text-sm font-medium text-amber-700">{t(readNote === 'read' ? 'Read from the photo. Check the number.' : 'Could not read the meter. Type the litres.')}</p>
        )}
        {overTank && <p className="mt-2 text-sm font-medium text-red-700">{t('More than the tank ({tank} L). Check the number.', { tank: num(machine.tank_capacity_l, 0) })}</p>}
      </Step>

      <label className="flex items-center justify-between gap-3 rounded-2xl bg-slate-100 px-4 py-3 text-base text-slate-700">
        <span className="font-semibold">{t('Date')}</span>
        <input type="date" required max={today()} value={date} onChange={(e) => setDate(e.target.value)} className="h-10 rounded-lg border border-slate-300 bg-white px-2 text-base" />
      </label>

      <button type="submit" disabled={busy || reading} className="h-16 w-full rounded-2xl bg-brand text-xl font-bold text-white active:bg-brand-dark disabled:opacity-50">
        {busy ? t('Sending…') : t('Send')}
      </button>

      <Today mine={mine} machineById={machineById} />
      <p className="text-center text-xs text-slate-400">{t('Meter reader')} v{METER_READER_VERSION}</p>
    </form>
  )
}

function Step({ n, title, children }) {
  return (
    <section>
      <h2 className="mb-2 flex items-center gap-2 text-lg font-bold text-slate-800">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-base text-white">{n}</span>
        {title}
      </h2>
      {children}
    </section>
  )
}

// What this person sent today, so nothing is sent twice.
function Today({ mine, machineById }) {
  const t = useT()
  if (!mine.length) return null
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 text-left">
      <p className="mb-2 text-sm font-semibold text-slate-500">
        {t('Sent by you today')} · {num(sum(mine, 'litres'), 2)} L
      </p>
      <ul className="divide-y divide-slate-100">
        {mine.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-3 py-2 text-base">
            <span className="min-w-0 truncate text-slate-800">{vehicleLabel(machineById.get(r.machine_id))}</span>
            <span className="shrink-0 font-semibold tabular-nums text-slate-900">{num(r.litres, 2)} L</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
