import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge, Spinner } from '../../components/ui.jsx'
import { IconBack, IconCamera, IconCheck, IconWarning, IconWrench } from '../../components/icons.jsx'
import { ACTIONS_DONE, PARTS, PROBLEMS, caseNo, caseSummary, caseType, serviceCheck, smuUnit } from '../../lib/cases.js'
import { lastSmu, listMachines, listMyCases, listSuppliers, removeCaseFile, submitCase, uploadCaseFile, useCmmsAccess } from '../../lib/cmms.js'
import { listLocations } from '../../lib/companies.js'
import { useCompany } from '../../lib/CompanyContext.jsx'
import { useAuth } from '../../auth/AuthContext.jsx'
import { day, today } from '../../lib/format.js'

// Repair & Maintenance on a phone, for site workers. Three things to record:
//   Need a mechanic    – repair request (machine has a problem)
//   I fixed something  – corrective job already done
//   Request a service  – preventive, when the machine is due
// Each becomes a case in Maintenance Work Manage; the office does the rest.
const big = 'h-14 w-full rounded-2xl border border-slate-300 bg-white px-4 text-lg text-slate-900 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30 disabled:bg-slate-100 disabled:text-slate-400'
const LAST_LOCATION = 'mjm-fuel-record-location' // the same site as in the fuel form
const n = (v) => Number(v).toLocaleString('en-MY', { maximumFractionDigits: 1 })
const shortDay = (d) => new Date(String(d).slice(0, 10) + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

export default function RepairMobile() {
  const { current, loaded } = useCompany()
  const { user } = useAuth()
  const company = current?.cmms_enabled ? current : null
  const access = useCmmsAccess(company?.id)
  const [screen, setScreen] = useState('home') // home | repair | fixed | service
  const [machines, setMachines] = useState([])
  const [locations, setLocations] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [mine, setMine] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(null) // the case just sent
  const [loc, setLoc] = useState(() => {
    try {
      return localStorage.getItem(LAST_LOCATION) || ''
    } catch {
      return ''
    }
  })

  const load = useCallback(async () => {
    if (!company || !user) return setLoading(false)
    try {
      const [m, l, s, c] = await Promise.all([
        listMachines(company.id),
        listLocations(company.id).catch(() => []),
        listSuppliers(company.id).catch(() => []),
        listMyCases(company.id, user.id).catch(() => [])
      ])
      setMachines(m.filter((x) => x.is_active !== false))
      setLocations(l)
      setSuppliers(s)
      setMine(c)
      setLoc((v) => (v && !l.some((x) => x.id === v) ? '' : v))
      setError('')
    } catch (e) {
      setError(e.message || 'Could not load.')
    } finally {
      setLoading(false)
    }
  }, [company, user])

  useEffect(() => {
    load()
  }, [load])

  function pickLocation(v) {
    setLoc(v)
    try {
      localStorage.setItem(LAST_LOCATION, v)
    } catch {
      // private mode: just not remembered
    }
  }

  const machineById = useMemo(() => new Map(machines.map((m) => [m.id, m])), [machines])
  const shown = machines.filter((m) => !loc || m.location_id === loc)
  const locName = locations.find((l) => l.id === loc)?.name

  if (!loaded || loading || !access.loaded)
    return (
      <div className="flex justify-center py-16 text-brand">
        <Spinner className="h-8 w-8" />
      </div>
    )
  if (!company) return <Notice title="Not available" body="Machinery Manage is not enabled for this company. Choose another company (top left)." />
  if (!access.can_add)
    return (
      <Notice
        title="No access"
        body={`You cannot send requests for ${company.name}. Ask your admin to tick “Send requests from the mobile app” for you (Maintenance Work Manage).`}
      />
    )

  if (sent)
    return (
      <div className="mx-auto max-w-md space-y-5 text-center">
        <div className="rounded-3xl bg-green-50 p-8">
          <span className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-green-600 text-white">
            <IconCheck width={44} height={44} />
          </span>
          <p className="mt-4 text-2xl font-bold text-green-900">Sent · Case {caseNo(sent)}</p>
          <p className="mt-1 text-lg text-green-900">{sent.machine_name}</p>
          <p className="mt-2 text-sm text-green-800">
            The office has it now. You can still add photos by WhatsApp with “{caseNo(sent)}” in the caption.
          </p>
        </div>
        <button
          onClick={() => {
            setSent(null)
            setScreen('home')
          }}
          className="h-16 w-full rounded-2xl bg-brand text-xl font-bold text-white active:bg-brand-dark"
        >
          Back to start
        </button>
      </div>
    )

  const formProps = {
    company,
    user,
    machines: shown,
    allMachines: machines,
    locations,
    loc,
    pickLocation,
    onBack: () => setScreen('home'),
    onSent: (c) => {
      setSent(c)
      load()
    }
  }
  if (screen === 'repair') return <RepairForm {...formProps} />
  if (screen === 'fixed') return <FixedForm {...formProps} />
  if (screen === 'service') return <ServiceForm {...formProps} suppliers={suppliers} />

  return (
    <div className="mx-auto max-w-md space-y-4 pb-10">
      <p className="text-center text-sm text-slate-600">
        <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-green-600 align-middle" />
        {company.name}
        {locName ? ` · ${locName}` : ''}
      </p>
      {error && <p className="rounded-2xl bg-red-100 p-4 text-base font-medium text-red-800">{error}</p>}
      {locations.length > 0 && (
        <select value={loc} onChange={(e) => pickLocation(e.target.value)} className={big} aria-label="Your location">
          <option value="">All locations</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      )}
      <p className="pt-1 text-base font-semibold text-slate-700">What do you want to record?</p>
      <Choice tone="red" Icon={IconWarning} title="Need a mechanic" sub="Repair request · machine has a problem" onClick={() => setScreen('repair')} />
      <Choice tone="amber" Icon={IconWrench} title="I fixed something" sub="Corrective · e.g. changed a tyre, hose, battery" onClick={() => setScreen('fixed')} />
      <Choice tone="blue" Icon={IconCheck} title="Request a service" sub="Preventive · when the machine is due" onClick={() => setScreen('service')} />

      <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <p className="mb-1 text-sm font-semibold text-slate-600">Your requests</p>
        {mine.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-400">Nothing sent yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {mine.map((c) => {
              const s = myStatus(c)
              return (
                <li key={c.id} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="min-w-0">
                    <span className="block truncate text-base font-bold text-slate-900">
                      Case {caseNo(c)} · {c.machine_name || 'Machine'}
                    </span>
                    <span className="block truncate text-sm text-slate-500">
                      {caseSummary(c, machineById.get(c.machine_id)) || 'Request'} · {shortDay(c.opened_at)}
                    </span>
                  </span>
                  <Badge color={s.color} className="shrink-0 px-2.5 py-1 text-[13px] font-semibold">
                    {s.label}
                  </Badge>
                </li>
              )
            })}
          </ul>
        )}
      </div>
      {access.can_view && (
        <p className="text-center">
          <Link to="/cmms/work" className="text-sm font-medium text-brand underline">
            Open Maintenance Work Manage (office)
          </Link>
        </p>
      )}
    </div>
  )
}

// What the worker sees for a request of their own.
function myStatus(c) {
  if (c.status === 'solved') return { label: 'Done', color: 'slate' }
  const t = caseType(c)
  if (t === 'service_request') return c.approved_at ? { label: c.sent_at ? 'Sent to supplier' : 'Approved', color: 'green' } : { label: 'Waiting approval', color: 'amber' }
  if (t === 'repair_done') return { label: 'Recorded', color: 'slate' }
  return c.sent_at ? { label: 'At workshop', color: 'amber' } : { label: 'Pending', color: 'amber' }
}

const TONES = {
  red: 'bg-red-100 text-red-700',
  amber: 'bg-orange-100 text-orange-700',
  blue: 'bg-brand-light text-brand'
}
function Choice({ tone, Icon, title, sub, onClick }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-4 rounded-2xl border-2 border-slate-200 bg-white p-4 text-left shadow-sm active:border-brand active:bg-brand-light/30">
      <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-xl ${TONES[tone]}`}>
        <Icon width={28} height={28} />
      </span>
      <span className="min-w-0">
        <span className="block text-xl font-bold text-slate-900">{title}</span>
        <span className="block text-sm text-slate-600">{sub}</span>
      </span>
    </button>
  )
}

function Notice({ title, body }) {
  return (
    <div className="mx-auto max-w-md rounded-2xl bg-amber-50 p-5 text-center text-amber-900">
      <p className="text-lg font-bold">{title}</p>
      <p className="mt-1 text-sm">{body}</p>
    </div>
  )
}

// ---- shared pieces of the three forms ---------------------------------------------

function FormShell({ kicker, title, onBack, error, children, onSubmit }) {
  return (
    <form onSubmit={onSubmit} className="mx-auto max-w-md space-y-5 pb-10">
      <div className="flex items-center gap-3">
        <button type="button" onClick={onBack} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-slate-300 bg-white text-slate-700" aria-label="Back">
          <IconBack width={20} height={20} />
        </button>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{kicker}</p>
          <p className="font-display text-2xl font-extrabold tracking-tight text-slate-900">{title}</p>
        </div>
      </div>
      {error && <p className="rounded-2xl bg-red-100 p-4 text-base font-medium text-red-800">{error}</p>}
      {children}
    </form>
  )
}

function Step({ n: no, title, children, dim }) {
  return (
    <section className={dim ? 'opacity-50' : ''}>
      <h2 className="mb-2 flex items-center gap-2 text-lg font-bold text-slate-800">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-base text-white">{no}</span>
        {title}
      </h2>
      {children}
    </section>
  )
}

function MachinePick({ machines, locations, loc, pickLocation, value, onChange }) {
  return (
    <>
      {locations.length > 0 && (
        <select value={loc} onChange={(e) => pickLocation(e.target.value)} className={`${big} mb-2`} aria-label="Location">
          <option value="">All locations</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      )}
      <select value={value} onChange={(e) => onChange(e.target.value)} className={`${big} font-semibold`} aria-label="Machine">
        <option value="">Choose…</option>
        {machines.map((m) => (
          <option key={m.id} value={m.id}>
            {[m.name, m.reg_no && m.reg_no.trim().toUpperCase() !== m.name.trim().toUpperCase() ? m.reg_no : null, m.machine_type || [m.brand, m.model].filter(Boolean).join(' ')].filter(Boolean).join(' · ')}
          </option>
        ))}
      </select>
      {machines.length === 0 && <p className="mt-1 text-sm text-slate-500">No machine in this location.</p>}
    </>
  )
}

function Chips({ options, value, onChange, square }) {
  return (
    <div className={square ? 'grid grid-cols-3 gap-2' : 'flex flex-wrap gap-2'}>
      {options.map((o) => (
        <button
          key={o}
          type="button"
          aria-pressed={value === o}
          onClick={() => onChange(value === o ? '' : o)}
          className={`h-12 px-4 text-base font-semibold ${square ? 'rounded-xl' : 'rounded-full'} ${
            value === o ? 'border-2 border-brand bg-brand text-white' : 'border border-slate-300 bg-white text-slate-800'
          }`}
        >
          {o}
        </button>
      ))}
    </div>
  )
}

// Photo / video tiles. `files` = [{ file, url, kind }]; nothing is uploaded until Send.
function FileTiles({ files, onAdd, onRemove, video, slots }) {
  const inputs = useRef({})
  const pick = (kind) => (e) => {
    for (const file of e.target.files || []) onAdd({ file, kind, url: URL.createObjectURL(file) })
    e.target.value = ''
  }
  const tile = 'relative flex h-24 items-center justify-center overflow-hidden rounded-2xl'
  return (
    <div className="grid grid-cols-3 gap-2">
      {files.map((f, i) => (
        <div key={f.url} className={`${tile} bg-slate-800`}>
          {f.file.type.startsWith('video/') ? <span className="text-sm font-semibold text-white">Video</span> : <img src={f.url} alt="" className="h-full w-full object-cover" />}
          {f.kind !== 'photo' && <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 text-xs capitalize text-white">{f.kind}</span>}
          <button type="button" onClick={() => onRemove(i)} className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white" aria-label="Remove">
            ✕
          </button>
        </div>
      ))}
      {slots.map(({ kind, label }) => (
        <button key={kind} type="button" onClick={() => inputs.current[kind]?.click()} className={`${tile} border-2 border-dashed border-brand/60 bg-brand-light/40 text-base font-semibold text-brand`}>
          {label}
          <input ref={(el) => (inputs.current[kind] = el)} type="file" accept={video ? 'image/*,video/*' : 'image/*'} multiple={kind === 'photo'} className="hidden" onChange={pick(kind)} />
        </button>
      ))}
    </div>
  )
}

// Hour meter / km with a camera button for a photo of the meter.
function SmuInput({ value, onChange, photo, onPhoto, unit, hint }) {
  const input = useRef(null)
  return (
    <>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => input.current?.click()}
          className={`flex h-14 w-16 shrink-0 items-center justify-center rounded-2xl text-sm font-semibold ${photo ? 'bg-slate-800 text-white' : 'border-2 border-dashed border-brand/60 bg-brand-light/40 text-brand'}`}
          aria-label="Photo of the meter"
        >
          {photo ? 'photo ✓' : <IconCamera width={24} height={24} />}
        </button>
        <input
          ref={input}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) onPhoto({ file, kind: 'meter', url: URL.createObjectURL(file) })
            e.target.value = ''
          }}
        />
        <div className="relative flex-1">
          <input type="number" inputMode="decimal" min="0" step="0.1" value={value} onChange={(e) => onChange(e.target.value)} className={`${big} pr-12 text-xl font-bold tabular-nums`} aria-label="Meter reading" />
          <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-base font-semibold text-slate-400">{unit}</span>
        </div>
      </div>
      {hint && <p className="mt-1.5 text-sm text-slate-500">{hint}</p>}
    </>
  )
}

/** Last meter reading recorded for a machine (from its earlier cases). */
function useLastSmu(machineId) {
  const [last, setLast] = useState(null)
  useEffect(() => {
    setLast(null)
    if (!machineId) return
    let active = true
    lastSmu(machineId).then((r) => active && setLast(r))
    return () => {
      active = false
    }
  }, [machineId])
  return last
}

/** Uploads the picked files, sends the case; on failure removes what was uploaded. */
function useSend(company, user, onSent) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function send(type, data, files) {
    setBusy(true)
    setError('')
    const paths = []
    try {
      const attachments = []
      for (const f of files) {
        const path = await uploadCaseFile(company.id, user.id, f.file)
        paths.push(path)
        attachments.push({ path, kind: f.kind })
      }
      onSent(await submitCase(company.id, type, { ...data, attachments }))
    } catch (e) {
      paths.forEach(removeCaseFile)
      setError(e.message || 'Could not send. Please try again.')
      setBusy(false)
    }
  }
  return { busy, error, setError, send }
}

const SendButton = ({ busy, disabled, children }) => (
  <button type="submit" disabled={busy || disabled} className="h-16 w-full rounded-2xl bg-brand text-xl font-bold text-white active:bg-brand-dark disabled:bg-slate-300 disabled:text-slate-500">
    {busy ? 'Sending…' : children}
  </button>
)

// ---- 1. Need a mechanic --------------------------------------------------------------

function RepairForm({ company, user, machines, allMachines, locations, loc, pickLocation, onBack, onSent }) {
  const [machineId, setMachineId] = useState('')
  const [category, setCategory] = useState('')
  const [detail, setDetail] = useState('')
  const [stopped, setStopped] = useState(null)
  const [files, setFiles] = useState([])
  const [smu, setSmu] = useState('')
  const { busy, error, setError, send } = useSend(company, user, onSent)
  const unit = smuUnit(allMachines.find((m) => m.id === machineId))

  function submit(e) {
    e.preventDefault()
    if (!machineId) return setError('Choose the machine.')
    if (!category && !detail.trim()) return setError('Say what the problem is.')
    if (stopped == null) return setError('Can the machine still work? Choose Yes or No.')
    send('repair_request', { machine_id: machineId, category, problem: detail.trim(), machine_stopped: stopped, smu }, files)
  }

  return (
    <FormShell kicker="Repair request" title="Need a mechanic" onBack={onBack} error={error} onSubmit={submit}>
      <Step n="1" title="Machine">
        <MachinePick machines={machines} locations={locations} loc={loc} pickLocation={pickLocation} value={machineId} onChange={setMachineId} />
      </Step>
      <Step n="2" title="What is the problem?">
        <Chips options={PROBLEMS} value={category} onChange={setCategory} />
        <p className="mb-1 mt-3 text-sm text-slate-500">Tell us more (optional)</p>
        <input value={detail} onChange={(e) => setDetail(e.target.value)} maxLength={300} className={big} placeholder="e.g. Hydraulic leak at boom cylinder" />
      </Step>
      <Step n="3" title="Can the machine still work?">
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setStopped(false)} aria-pressed={stopped === false} className={`h-14 rounded-2xl text-base font-semibold ${stopped === false ? 'border-2 border-brand bg-brand-light text-brand-dark' : 'border border-slate-300 bg-white text-slate-800'}`}>
            Yes, still working
          </button>
          <button type="button" onClick={() => setStopped(true)} aria-pressed={stopped === true} className={`h-14 rounded-2xl text-base font-bold ${stopped === true ? 'border-2 border-red-600 bg-red-50 text-red-700' : 'border border-slate-300 bg-white text-slate-800'}`}>
            No, stopped
          </button>
        </div>
        <p className="mt-1.5 text-sm text-slate-500">“Stopped” counts as a breakdown from today until the case is solved.</p>
      </Step>
      <Step n="4" title="Photos or video">
        <FileTiles files={files} video onAdd={(f) => setFiles((x) => [...x, f].slice(0, 6))} onRemove={(i) => setFiles((x) => x.filter((_, k) => k !== i))} slots={files.length < 6 ? [{ kind: 'photo', label: '+' }] : []} />
      </Step>
      <Step n="5" title={`Hour meter (SMU) · optional`}>
        <div className="relative">
          <input type="number" inputMode="decimal" min="0" step="0.1" value={smu} onChange={(e) => setSmu(e.target.value)} className={`${big} pr-12 text-xl font-bold tabular-nums`} aria-label="Meter reading" />
          <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-base font-semibold text-slate-400">{unit}</span>
        </div>
      </Step>
      <SendButton busy={busy}>Send to office</SendButton>
      <p className="text-center text-sm text-slate-500">A case number is made (e.g. #8). The office picks the mechanic or workshop. You can still add photos by WhatsApp with “#8”.</p>
    </FormShell>
  )
}

// ---- 2. I fixed something ------------------------------------------------------------

function FixedForm({ company, user, machines, allMachines, locations, loc, pickLocation, onBack, onSent }) {
  const [machineId, setMachineId] = useState('')
  const [smu, setSmu] = useState('')
  const [meter, setMeter] = useState(null)
  const [part, setPart] = useState('')
  const [action, setAction] = useState('')
  const [note, setNote] = useState('')
  const [parts, setParts] = useState([{ name: '', qty: '1' }])
  const [files, setFiles] = useState([])
  const [from, setFrom] = useState('')
  const [fixed, setFixed] = useState('')
  const { busy, error, setError, send } = useSend(company, user, onSent)
  const machine = allMachines.find((m) => m.id === machineId)
  const unit = smuUnit(machine)
  const last = useLastSmu(machineId)
  const setPartRow = (i, k, v) => setParts((rows) => rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)))
  const has = (kind) => files.some((f) => f.kind === kind)

  function submit(e) {
    e.preventDefault()
    if (!machineId) return setError('Choose the machine.')
    if (!part) return setError('Choose the part.')
    if (!action) return setError('Choose what was done.')
    if (fixed && !from) return setError('Fill in “From” as well, or clear “Fixed on”.')
    if (from && fixed && fixed < from) return setError('“Fixed on” cannot be before “From”.')
    if (last && smu !== '' && Number(smu) < last.smu && !window.confirm(`The reading is lower than the last one (${n(last.smu)} ${unit}). Send anyway?`)) return
    send(
      'repair_done',
      {
        machine_id: machineId,
        smu,
        category: part,
        action_done: action,
        problem: note.trim(),
        parts: parts.filter((p) => p.name.trim()).map((p) => ({ name: p.name.trim(), qty: Number(p.qty) > 0 ? Number(p.qty) : 1 })),
        stopped_from: from,
        fixed_on: fixed
      },
      [...(meter ? [meter] : []), ...files]
    )
  }

  return (
    <FormShell kicker="Corrective" title="Record a repair" onBack={onBack} error={error} onSubmit={submit}>
      <Step n="1" title="Machine">
        <MachinePick machines={machines} locations={locations} loc={loc} pickLocation={pickLocation} value={machineId} onChange={setMachineId} />
      </Step>
      <Step n="2" title="Hour meter (SMU)">
        <SmuInput value={smu} onChange={setSmu} photo={meter} onPhoto={setMeter} unit={unit} hint={last ? `Last reading: ${n(last.smu)} ${unit} on ${shortDay(last.date)}` : null} />
      </Step>
      <Step n="3" title="What part?">
        <Chips options={PARTS} value={part} onChange={setPart} />
      </Step>
      <Step n="4" title="What was done?">
        <Chips options={ACTIONS_DONE} value={action} onChange={setAction} square />
        <p className="mb-1 mt-3 text-sm text-slate-500">Note (optional)</p>
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} className={big} placeholder="e.g. Front left tyre burst" />
      </Step>
      <Step n="5" title="Parts used (optional)">
        <div className="space-y-2">
          {parts.map((p, i) => (
            <div key={i} className="flex gap-2">
              <input value={p.name} onChange={(e) => setPartRow(i, 'name', e.target.value)} maxLength={80} className={`${big.replace('w-full', 'min-w-0 flex-1')}`} placeholder="e.g. Tyre 12.5/80-18" aria-label="Part" />
              <input type="number" inputMode="numeric" min="1" step="1" value={p.qty} onChange={(e) => setPartRow(i, 'qty', e.target.value)} className={`${big.replace('w-full', 'w-20 shrink-0').replace('px-4', 'px-2')} text-center`} aria-label="Quantity" />
            </div>
          ))}
        </div>
        {parts.length < 5 && parts[parts.length - 1].name.trim() && (
          <button type="button" onClick={() => setParts((r) => [...r, { name: '', qty: '1' }])} className="mt-2 text-base font-semibold text-brand">
            + Another part
          </button>
        )}
      </Step>
      <Step n="6" title="Photos">
        <FileTiles
          files={files}
          onAdd={(f) => setFiles((x) => [...x.filter((y) => y.kind !== f.kind), f])}
          onRemove={(i) => setFiles((x) => x.filter((_, k) => k !== i))}
          slots={[!has('before') && { kind: 'before', label: '+ Before' }, !has('after') && { kind: 'after', label: '+ After' }].filter(Boolean)}
        />
      </Step>
      <Step n="7" title="Machine stopped">
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-sm text-slate-600">
            From
            <input type="date" max={today()} value={from} onChange={(e) => setFrom(e.target.value)} className={`${big} mt-1 px-3 text-base`} />
          </label>
          <label className="block text-sm text-slate-600">
            Fixed on
            <input type="date" max={today()} value={fixed} onChange={(e) => setFixed(e.target.value)} className={`${big} mt-1 px-3 text-base`} />
          </label>
        </div>
        <p className="mt-1.5 text-sm text-slate-500">Machine did not stop? Leave both empty. Not fixed yet? Leave “Fixed on” empty — the job stays Open.</p>
      </Step>
      <SendButton busy={busy}>Send</SendButton>
    </FormShell>
  )
}

// ---- 3. Request a service ------------------------------------------------------------

function ServiceForm({ company, user, machines, allMachines, locations, loc, pickLocation, suppliers, onBack, onSent }) {
  const [machineId, setMachineId] = useState('')
  const [smu, setSmu] = useState('')
  const [meter, setMeter] = useState(null)
  const [date, setDate] = useState('')
  const { busy, error, setError, send } = useSend(company, user, onSent)
  const machine = allMachines.find((m) => m.id === machineId)
  const unit = smuUnit(machine)
  const check = machine ? serviceCheck(machine, smu) : null
  const early = check?.state === 'early'
  const supplier = machine ? suppliers.filter((s) => (s.machine_ids || []).includes(machine.id)).sort((a, b) => a.name.localeCompare(b.name))[0] : null

  function submit(e) {
    e.preventDefault()
    if (!machineId) return setError('Choose the machine.')
    if (smu === '') return setError('Enter the meter reading.')
    if (early) return setError(`Too early. You can request from ${n(check.from)} ${unit}.`)
    send('service_request', { machine_id: machineId, smu, preferred_date: date }, meter ? [meter] : [])
  }

  return (
    <FormShell kicker="Preventive" title="Request a service" onBack={onBack} error={error} onSubmit={submit}>
      <Step n="1" title="Machine">
        <MachinePick machines={machines} locations={locations} loc={loc} pickLocation={pickLocation} value={machineId} onChange={setMachineId} />
      </Step>
      <Step n="2" title="Hour meter (SMU) now">
        <SmuInput value={smu} onChange={setSmu} photo={meter} onPhoto={setMeter} unit={unit} />
      </Step>

      {machine && !check && (
        <p className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">
          No service schedule is set for this machine yet, so it cannot be checked here. You can still send; the office will check it.
        </p>
      )}
      {check && (
        <div className="space-y-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <Line label="Last service" value={`${n(machine.last_service_smu)} ${unit}${machine.last_service_date ? ` · ${shortDay(machine.last_service_date)}` : ''}`} />
          <Line label="This service" value={`${n(check.interval)} ${unit} service at ${n(check.due)} ${unit}`} />
          <WindowBar check={check} smu={smu} />
          {check.state === 'ok' && (
            <p className="flex items-start gap-2 rounded-xl bg-green-100 p-3 text-base font-semibold text-green-800">
              <IconCheck width={20} height={20} className="mt-0.5 shrink-0" />
              In the service window ({check.gap === 0 ? 'due now' : `${n(Math.abs(check.gap))} ${unit} ${check.gap < 0 ? 'early' : 'over'}`}). You can send.
            </p>
          )}
          {check.state === 'early' && (
            <p className="flex items-start gap-2 rounded-xl bg-orange-100 p-3 text-base font-semibold text-orange-800">
              <IconWarning width={20} height={20} className="mt-0.5 shrink-0" />
              Too early. {n(check.from - Number(smu))} {unit} more — you can request from {n(check.from)} {unit}.
            </p>
          )}
          {check.state === 'late' && (
            <p className="flex items-start gap-2 rounded-xl bg-red-100 p-3 text-base font-semibold text-red-800">
              <IconWarning width={20} height={20} className="mt-0.5 shrink-0" />
              Late by {n(check.gap)} {unit}. Send the request now.
            </p>
          )}
        </div>
      )}

      <Step n="3" title="Preferred date" dim={early}>
        <input type="date" min={today()} value={date} onChange={(e) => setDate(e.target.value)} disabled={early} className={big} />
      </Step>
      {machine && !early && (
        <p className="rounded-2xl bg-white px-4 py-3 text-sm text-slate-700 shadow-sm ring-1 ring-slate-200">
          Will be sent to: <span className="font-bold">{supplier ? supplier.name : 'the office (it picks the workshop)'}</span>
          {supplier ? ' · after the office approves' : ''}
        </p>
      )}
      <SendButton busy={busy} disabled={early}>
        Send request
      </SendButton>
      {early && <p className="text-center text-sm text-slate-500">Meter reading wrong? Retake the photo and fix the number.</p>}
    </FormShell>
  )
}

const Line = ({ label, value }) => (
  <div className="flex items-baseline justify-between gap-3 text-base">
    <span className="text-slate-600">{label}</span>
    <span className="text-right font-bold text-slate-900">{value}</span>
  </div>
)

// The reading on a scale around the due point; the green part is the service window.
function WindowBar({ check, smu }) {
  const w = check.to - check.due
  const lo = check.due - 2 * w
  const hi = check.due + 2 * w
  const pos = (v) => `${Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100))}%`
  const has = smu !== '' && !Number.isNaN(Number(smu))
  return (
    <div>
      <div className="relative h-3 rounded-full bg-slate-200">
        <span className="absolute inset-y-0 rounded-full bg-green-300" style={{ left: pos(check.from), right: `calc(100% - ${pos(check.to)})` }} />
        {has && <span className={`absolute -top-1.5 h-6 w-1.5 -translate-x-1/2 rounded ${check.state === 'ok' ? 'bg-green-800' : 'bg-red-700'}`} style={{ left: pos(Number(smu)) }} />}
      </div>
      <div className="relative mt-1 h-5 text-xs tabular-nums text-slate-500">
        {[check.from, check.due, check.to].map((v) => (
          <span key={v} className="absolute -translate-x-1/2" style={{ left: pos(v) }}>
            {n(v)}
          </span>
        ))}
      </div>
    </div>
  )
}
