import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Badge, Spinner } from '../../components/ui.jsx'
import { IconBack, IconCheck, IconFuel, IconLogout, IconWarning, IconWrench } from '../../components/icons.jsx'
import { CompanyProvider, useCompany } from '../../lib/CompanyContext.jsx'
import { useAuth } from '../../auth/AuthContext.jsx'
import { usePerms } from '../../lib/perms.js'
import { caseNo, caseSummary } from '../../lib/cases.js'
import { listMachines, listMyCases } from '../../lib/cmms.js'
import { listLocations } from '../../lib/companies.js'
import { SITE_LOCATION_KEY, myStatus } from '../machinery/RepairMobile.jsx'
import { WorkerPrefs, usePrefs, useT } from './prefs.jsx'

// Worker CMMS (/app): what site workers use on a phone, apart from the
// office pages of CMMS 2. It is an icon on the CMMS 2 main page and has two
// modules of its own:
//   /app/fuel     Diesel Usage Record            the diesel-taken form
//   /app/service  Machine Service & Maintenance  need a mechanic, I fixed
//                                                something, request a service
// The "Mobile view" buttons of the office pages open their own module directly.
// The header has the language (English / Bahasa Melayu) and bright / dark mode;
// both are remembered on the phone (prefs.jsx).

const big = 'h-14 w-full rounded-2xl border border-slate-300 bg-white px-4 text-lg text-slate-900 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30'
const shortDay = (d) => new Date(String(d).slice(0, 10) + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

export function WorkerShell() {
  return (
    <WorkerPrefs>
      <CompanyProvider>
        <Frame />
      </CompanyProvider>
    </WorkerPrefs>
  )
}

// `wk-dark` switches the whole app to dark colours (see index.css).
function Frame() {
  const { theme } = usePrefs()
  return (
    <div className={`wk flex min-h-[100dvh] w-full flex-col ${theme === 'dark' ? 'wk-dark' : ''}`}>
      <WorkerBar />
      <main className="w-full flex-1 px-4 pb-10 pt-5">
        <Outlet />
      </main>
    </div>
  )
}

function WorkerBar() {
  const { logout } = useAuth()
  const { lang, theme, t, setLang, setTheme } = usePrefs()
  const { pathname } = useLocation()
  const path = pathname.replace(/\/$/, '')
  const start = path === '/app'
  // One step back: a repair form → its module; a module → the start screen; the start screen → CMMS 2.
  const back = start ? ['/', 'Back to CMMS 2 main page'] : path.startsWith('/app/repair') ? ['/app/service', 'Back to Machine Service & Maintenance'] : ['/app', 'Back to Worker CMMS']
  const btn = 'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 active:bg-slate-100'
  const dark = theme === 'dark'
  return (
    <header className="pt-safe sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-md items-center gap-2 px-4">
        {start && window.opener ? (
          // Opened in its own tab from CMMS 2: going back means closing this tab.
          <button onClick={() => window.close()} className={btn} aria-label={t(back[1])} title={t(back[1])}>
            <IconBack width={20} height={20} />
          </button>
        ) : (
          <Link to={back[0]} className={btn} aria-label={t(back[1])} title={t(back[1])}>
            <IconBack width={20} height={20} />
          </Link>
        )}
        <Link to="/app" className="min-w-0 flex-1 pl-1">
          <span className="block font-display text-[10px] font-bold uppercase tracking-[0.3em] text-slate-400">CMMS 2</span>
          <span className="block truncate font-display text-lg font-extrabold tracking-tight text-slate-900">{t('Worker CMMS')}</span>
        </Link>
        {/* Language: shows the one in use; press to switch */}
        <button onClick={() => setLang(lang === 'ms' ? 'en' : 'ms')} className={`${btn} text-sm font-bold`} aria-label={t('Change language')} title={t('Change language')}>
          {lang === 'ms' ? 'BM' : 'EN'}
        </button>
        <button onClick={() => setTheme(dark ? 'light' : 'dark')} className={btn} aria-label={t(dark ? 'Bright mode' : 'Dark mode')} title={t(dark ? 'Bright mode' : 'Dark mode')} aria-pressed={dark}>
          {dark ? <IconSun /> : <IconMoon />}
        </button>
        <button onClick={logout} className={btn} aria-label={t('Log out')} title={t('Log out')}>
          <IconLogout width={19} height={19} />
        </button>
      </div>
    </header>
  )
}

const svg = { width: 19, height: 19, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }
const IconSun = () => (
  <svg {...svg}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
)
const IconMoon = () => (
  <svg {...svg}>
    <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
  </svg>
)

/** Fuel form: the company and the person's Fuel rights, as the Fuel Manage pages get them. */
export function WorkerFuel() {
  const t = useT()
  const { current, loaded } = useCompany()
  const access = usePerms(current?.diesel_enabled ? current.id : null)
  if (!loaded || !access.loaded) return <Loading />
  if (!current?.diesel_enabled) return <Notice title={t('Not available')} body={t('Fuel Manage is not enabled for this company.')} />
  return <Outlet context={{ company: current, access }} />
}

// The person's company, site and rights, shared by the start screen and the service module.
function useWorker() {
  const { current, companies, select, loaded } = useCompany()
  const { user } = useAuth()
  const perms = usePerms(current?.id)
  const [locations, setLocations] = useState([])
  const [loc, setLoc] = useState(() => {
    try {
      return localStorage.getItem(SITE_LOCATION_KEY) || ''
    } catch {
      return ''
    }
  })
  useEffect(() => {
    if (!current) return
    let active = true
    listLocations(current.id)
      .catch(() => [])
      .then((l) => {
        if (!active) return
        setLocations(l)
        setLoc((v) => (v && !l.some((x) => x.id === v) ? '' : v))
      })
    return () => {
      active = false
    }
  }, [current])
  function pickLocation(v) {
    setLoc(v)
    try {
      localStorage.setItem(SITE_LOCATION_KEY, v)
    } catch {
      // private mode: just not remembered
    }
  }
  // Companies that have at least one of the two modules.
  const choices = useMemo(() => companies.filter((c) => c.is_active !== false && (c.cmms_enabled || c.diesel_enabled)), [companies])
  return {
    current,
    choices,
    select,
    user,
    locations,
    loc,
    pickLocation,
    ready: loaded && perms.loaded,
    canFuel: Boolean(current?.diesel_enabled) && perms.can('fuel_record', 'add'),
    canService: Boolean(current?.cmms_enabled) && perms.can('work', 'add')
  }
}

// Who, which company, which site.
function Where({ w }) {
  const t = useT()
  return (
    <>
      <p className="text-center text-sm text-slate-600">
        <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-green-600 align-middle" />
        {w.user?.fullName || w.user?.email}
      </p>
      {w.choices.length > 1 ? (
        <select value={w.current.id} onChange={(e) => w.select(e.target.value)} className={`${big} font-semibold`} aria-label={t('Company')}>
          {w.choices.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      ) : (
        <p className="text-center text-base font-semibold text-slate-800">{w.current.name}</p>
      )}
      {w.locations.length > 0 && (
        <select value={w.loc} onChange={(e) => w.pickLocation(e.target.value)} className={big} aria-label={t('Your location')}>
          <option value="">{t('All locations')}</option>
          {w.locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      )}
    </>
  )
}

// Start screen: the two modules. One the person has no rights for is greyed out.
export function WorkerHome() {
  const t = useT()
  const w = useWorker()
  const navigate = useNavigate()
  if (!w.ready) return <Loading />
  if (!w.current) return <Notice title={t('No company')} body={t('No company is set up for this app yet. Ask the office.')} />
  return (
    <div className="mx-auto max-w-md space-y-4">
      <Where w={w} />
      <div className="grid grid-cols-2 gap-3 pt-2">
        <ModuleTile tone="green" Icon={IconFuel} title={t('Diesel Usage Record')} disabled={!w.canFuel} note={t('No access')} onClick={() => navigate('/app/fuel')} />
        <ModuleTile tone="blue" Icon={IconWrench} title={t('Machine Service & Maintenance')} disabled={!w.canService} note={t('No access')} onClick={() => navigate('/app/service')} />
      </div>
    </div>
  )
}

// Machine Service & Maintenance: the three things to record, and the person's own requests.
export function WorkerService() {
  const t = useT()
  const w = useWorker()
  const navigate = useNavigate()
  const [machines, setMachines] = useState([])
  const [mine, setMine] = useState([])
  const { current, user } = w

  const load = useCallback(async () => {
    if (!current || !user) return
    const [m, c] = await Promise.all([listMachines(current.id).catch(() => []), listMyCases(current.id, user.id).catch(() => [])])
    setMachines(m)
    setMine(c)
  }, [current, user])
  useEffect(() => {
    load()
  }, [load])
  const machineById = useMemo(() => new Map(machines.map((m) => [m.id, m])), [machines])

  if (!w.ready) return <Loading />
  if (!current) return <Notice title={t('No company')} body={t('No company is set up for this app yet. Ask the office.')} />

  return (
    <div className="mx-auto max-w-md space-y-4">
      <p className="text-center font-display text-xl font-extrabold tracking-tight text-slate-900">{t('Machine Service & Maintenance')}</p>
      <Where w={w} />
      {!w.canService ? (
        <Notice
          title={t('No access yet')}
          body={t('You cannot send requests for {company} yet. Ask your admin to tick “Send requests from the mobile app” (Maintenance Work Manage) for you.', { company: current.name })}
        />
      ) : (
        <>
          <p className="pt-1 text-base font-semibold text-slate-700">{t('What do you want to record?')}</p>
          <Choice tone="red" Icon={IconWarning} title={t('Need a mechanic')} sub={t('Repair request · machine has a problem')} onClick={() => navigate('/app/repair/repair')} />
          <Choice tone="amber" Icon={IconWrench} title={t('I fixed something')} sub={t('Corrective · e.g. changed a tyre, hose, battery')} onClick={() => navigate('/app/repair/fixed')} />
          <Choice tone="blue" Icon={IconCheck} title={t('Request a service')} sub={t('Preventive · when the machine is due')} onClick={() => navigate('/app/repair/service')} />

          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <p className="mb-1 text-sm font-semibold text-slate-600">{t('Your requests')}</p>
            {mine.length === 0 ? (
              <p className="py-4 text-center text-sm text-slate-400">{t('Nothing sent yet.')}</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {mine.map((c) => {
                  const s = myStatus(c)
                  return (
                    <li key={c.id} className="flex items-center justify-between gap-3 py-2.5">
                      <span className="min-w-0">
                        <span className="block truncate text-base font-bold text-slate-900">
                          {t('Case')} {caseNo(c)} · {c.machine_name || t('Machine')}
                        </span>
                        <span className="block truncate text-sm text-slate-500">
                          {caseSummary(c, machineById.get(c.machine_id)) || t('Request')} · {shortDay(c.opened_at)}
                        </span>
                      </span>
                      <Badge color={s.color} className="shrink-0 px-2.5 py-1 text-[13px] font-semibold">
                        {t(s.label)}
                      </Badge>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </>
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
function Choice({ tone, Icon, title, sub, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center gap-4 rounded-2xl border-2 border-slate-200 bg-white p-4 text-left shadow-sm active:border-brand active:bg-brand-light/30 disabled:bg-slate-100 disabled:opacity-60"
    >
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

// A module on the start screen: just its icon and its name.
function ModuleTile({ tone, Icon, title, onClick, disabled, note }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={disabled ? note : title}
      className="flex min-h-[9.5rem] flex-col items-center justify-center gap-3 rounded-2xl border-2 border-slate-200 bg-white p-4 text-center shadow-sm active:border-brand active:bg-brand-light/30 disabled:bg-slate-100 disabled:opacity-50"
    >
      <span className={`flex h-16 w-16 items-center justify-center rounded-2xl ${TONES[tone]}`}>
        <Icon width={34} height={34} />
      </span>
      <span className="text-base font-bold leading-tight text-slate-900">{title}</span>
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
