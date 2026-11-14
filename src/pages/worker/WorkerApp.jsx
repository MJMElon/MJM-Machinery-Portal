import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Badge, Spinner } from '../../components/ui.jsx'
import { IconBack, IconCheck, IconFuel, IconLogout, IconWarning, IconWrench } from '../../components/icons.jsx'
import { CompanyProvider, useCompany } from '../../lib/CompanyContext.jsx'
import { useAuth } from '../../auth/AuthContext.jsx'
import { usePerms } from '../../lib/perms.js'
import { INTRANET_URL } from '../../lib/supabase.js'
import { caseNo, caseSummary } from '../../lib/cases.js'
import { listMachines, listMyCases } from '../../lib/cmms.js'
import { listLocations } from '../../lib/companies.js'
import { SITE_LOCATION_KEY, myStatus } from '../machinery/RepairMobile.jsx'

// The Site App (/app): what site workers use on a phone, apart from the
// office pages of CMMS 2. One start screen with big buttons — diesel taken,
// need a mechanic, I fixed something, request a service — and nothing else:
// no module windows, no settings. It has its own icon in MJM Intranet
// (link …/#/app) and shares the login and the database with CMMS 2.

const big = 'h-14 w-full rounded-2xl border border-slate-300 bg-white px-4 text-lg text-slate-900 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30'
const shortDay = (d) => new Date(String(d).slice(0, 10) + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

export function WorkerShell() {
  return (
    <CompanyProvider>
      <div className="flex min-h-[100dvh] w-full flex-col">
        <WorkerBar />
        <main className="w-full flex-1 px-4 pb-10 pt-5">
          <Outlet />
        </main>
      </div>
    </CompanyProvider>
  )
}

function WorkerBar() {
  const { logout } = useAuth()
  const { pathname } = useLocation()
  const start = pathname.replace(/\/$/, '') === '/app'
  const btn = 'flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 active:bg-slate-100'
  return (
    <header className="pt-safe sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto grid h-16 max-w-md grid-cols-[44px_1fr_44px] items-center gap-2 px-4">
        {start ? (
          <a href={INTRANET_URL} className={btn} aria-label="Back to MJM Intranet" title="Back to MJM Intranet">
            <IconBack width={20} height={20} />
          </a>
        ) : (
          <Link to="/app" className={btn} aria-label="Back to start" title="Back to start">
            <IconBack width={20} height={20} />
          </Link>
        )}
        <Link to="/app" className="text-center">
          <span className="block font-display text-[11px] font-bold uppercase tracking-[0.3em] text-slate-400">CMMS 2</span>
          <span className="block font-display text-xl font-extrabold tracking-tight text-slate-900">Site App</span>
        </Link>
        <button onClick={logout} className={btn} aria-label="Log out" title="Log out">
          <IconLogout width={19} height={19} />
        </button>
      </div>
    </header>
  )
}

/** Fuel form: the company and the person's Fuel rights, as the Fuel Manage pages get them. */
export function WorkerFuel() {
  const { current, loaded } = useCompany()
  const access = usePerms(current?.diesel_enabled ? current.id : null)
  if (!loaded || !access.loaded) return <Loading />
  if (!current?.diesel_enabled) return <Notice title="Not available" body="Fuel Manage is not enabled for this company." />
  return <Outlet context={{ company: current, access }} />
}

export function WorkerHome() {
  const { current, companies, select, loaded } = useCompany()
  const { user } = useAuth()
  const navigate = useNavigate()
  const perms = usePerms(current?.id)
  const [locations, setLocations] = useState([])
  const [machines, setMachines] = useState([])
  const [mine, setMine] = useState([])
  const [loc, setLoc] = useState(() => {
    try {
      return localStorage.getItem(SITE_LOCATION_KEY) || ''
    } catch {
      return ''
    }
  })

  const canFuel = Boolean(current?.diesel_enabled) && perms.can('fuel_record', 'add')
  const canRepair = Boolean(current?.cmms_enabled) && perms.can('work', 'add')

  const load = useCallback(async () => {
    if (!current || !user) return
    const [l, m, c] = await Promise.all([
      listLocations(current.id).catch(() => []),
      listMachines(current.id).catch(() => []),
      listMyCases(current.id, user.id).catch(() => [])
    ])
    setLocations(l)
    setMachines(m)
    setMine(c)
    setLoc((v) => (v && !l.some((x) => x.id === v) ? '' : v))
  }, [current, user])
  useEffect(() => {
    load()
  }, [load])

  function pickLocation(v) {
    setLoc(v)
    try {
      localStorage.setItem(SITE_LOCATION_KEY, v)
    } catch {
      // private mode: just not remembered
    }
  }

  const machineById = useMemo(() => new Map(machines.map((m) => [m.id, m])), [machines])
  // Companies that have at least one of the two modules.
  const choices = useMemo(() => companies.filter((c) => c.is_active !== false && (c.cmms_enabled || c.diesel_enabled)), [companies])

  if (!loaded || !perms.loaded) return <Loading />
  if (!current) return <Notice title="No company" body="No company is set up for this app yet. Ask the office." />

  return (
    <div className="mx-auto max-w-md space-y-4">
      <p className="text-center text-sm text-slate-600">
        <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-green-600 align-middle" />
        {user?.fullName || user?.email}
      </p>
      {choices.length > 1 ? (
        <select value={current.id} onChange={(e) => select(e.target.value)} className={`${big} font-semibold`} aria-label="Company">
          {choices.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      ) : (
        <p className="text-center text-base font-semibold text-slate-800">{current.name}</p>
      )}
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

      {!canFuel && !canRepair ? (
        <Notice
          title="No access yet"
          body={`You cannot record anything for ${current.name} yet. Ask your admin to tick “Add records” (Fuel Usage Record) or “Send requests from the mobile app” (Maintenance Work Manage) for you.`}
        />
      ) : (
        <>
          <p className="pt-1 text-base font-semibold text-slate-700">What do you want to record?</p>
          {canFuel && <Choice tone="green" Icon={IconFuel} title="Diesel taken" sub="Photo of the pump meter · machine · litres" onClick={() => navigate('/app/fuel')} />}
          {canRepair && (
            <>
              <Choice tone="red" Icon={IconWarning} title="Need a mechanic" sub="Repair request · machine has a problem" onClick={() => navigate('/app/repair/repair')} />
              <Choice tone="amber" Icon={IconWrench} title="I fixed something" sub="Corrective · e.g. changed a tyre, hose, battery" onClick={() => navigate('/app/repair/fixed')} />
              <Choice tone="blue" Icon={IconCheck} title="Request a service" sub="Preventive · when the machine is due" onClick={() => navigate('/app/repair/service')} />
            </>
          )}
        </>
      )}

      {canRepair && (
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
      )}
    </div>
  )
}

const TONES = {
  green: 'bg-green-100 text-green-700',
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

function Loading() {
  return (
    <div className="flex justify-center py-16 text-brand">
      <Spinner className="h-8 w-8" />
    </div>
  )
}
