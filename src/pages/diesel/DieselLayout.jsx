import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { Button, Card, Spinner } from '../../components/ui.jsx'
import { IconBack, IconCard, IconChart, IconFuel, IconLock, IconReceipt } from '../../components/icons.jsx'
import { useCompany } from '../../lib/CompanyContext.jsx'
import { useDieselAccess } from '../../lib/diesel.js'
import { useAuth } from '../../auth/AuthContext.jsx'

// Diesel Manage: four modules. The landing page shows them as square icons;
// inside a module the same four sit in the left sidebar. Which ones a person
// gets depends on their Diesel access for the selected company (set under
// Machinery Manage → CMMS User Setting).
export const DIESEL_MODULES = [
  { to: '/diesel/claims', label: 'Diesel Claims', Icon: IconReceipt, need: (a) => a.claim || a.report, hint: 'Cash fuel claims with receipt photos; review and payment' },
  { to: '/diesel/usage', label: 'Diesel Usage', Icon: IconFuel, need: (a) => a.report, hint: 'Every fill-up (cash and fleet card) by vehicle and driver' },
  { to: '/diesel/cards', label: 'Fleet Card Manage', Icon: IconCard, need: (a) => a.report, hint: 'Fleet cards, reloads, balances and KPDN subsidy vehicles' },
  { to: '/diesel/report', label: 'Report', Icon: IconChart, need: (a) => a.report, hint: 'Monthly totals by vehicle and driver, export' }
]

export default function DieselLayout() {
  const navigate = useNavigate()
  const { current, loaded } = useCompany()
  const { isSuperAdmin } = useAuth()
  const access = useDieselAccess(current?.diesel_enabled ? current.id : null)
  const back = () => navigate('/')
  const item = (active) =>
    `flex items-center gap-3 rounded-xl px-3.5 py-2.5 font-display text-[14px] font-semibold tracking-tight transition whitespace-nowrap ${
      active ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
    }`

  if (!loaded || !access.loaded)
    return (
      <div className="flex justify-center py-16 text-brand">
        <Spinner className="h-7 w-7" />
      </div>
    )

  if (!current || !current.diesel_enabled)
    return (
      <Blocked
        title="Diesel Manage is not enabled"
        body={
          current
            ? `${current.name} does not have Diesel Manage yet. ${
                isSuperAdmin ? 'Turn it on under Businesses & Companies (gear icon, top right).' : 'Ask a super admin to turn it on.'
              }`
            : 'Choose a company first.'
        }
        onBack={back}
      />
    )

  if (!access.use)
    return (
      <Blocked
        title="No access to Diesel Manage"
        body={
          access.error ||
          `You are not on the Diesel Manage user list of ${current.name}. A super admin gives access under Machinery Manage → CMMS User Setting.`
        }
        onBack={back}
      />
    )

  const nav = DIESEL_MODULES.filter((n) => n.need(access))

  return (
    <div className="lg:grid lg:grid-cols-[290px_minmax(0,1fr)] lg:items-start lg:gap-6">
      <aside className="mb-5 lg:sticky lg:top-[96px] lg:mb-0">
        <div className="mb-4 lg:mb-5 lg:flex lg:h-14 lg:items-end">
          <button
            onClick={back}
            className="-ml-2 inline-flex h-9 items-center gap-1.5 rounded-xl px-2 text-sm font-medium text-slate-500 hover:bg-white hover:text-brand"
          >
            <IconBack width={16} height={16} /> Back to CMMS main page
          </button>
        </div>
        <nav className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:rounded-2xl lg:border lg:border-slate-200 lg:bg-white lg:p-3 lg:shadow-sm">
          <p className="hidden px-3 pb-1 pt-1.5 font-display text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400 lg:block">
            Diesel Manage
          </p>
          <NavLink to="/diesel" end className={({ isActive }) => item(isActive)}>
            <span className="grid h-[19px] w-[19px] shrink-0 grid-cols-2 gap-0.5">
              {[0, 1, 2, 3].map((i) => (
                <span key={i} className="rounded-[3px] bg-current opacity-80" />
              ))}
            </span>
            Modules
          </NavLink>
          {nav.map(({ to, label, Icon }) => (
            <NavLink key={to} to={to} className={({ isActive }) => item(isActive)}>
              <Icon width={19} height={19} className="shrink-0" />
              <span className="lg:whitespace-normal lg:leading-snug">{label}</span>
            </NavLink>
          ))}
        </nav>
        {!access.claim && !access.report && (
          <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
            You have Diesel access but no module yet. A super admin gives Cash Claim or Report under Machinery Manage →
            CMMS User Setting.
          </p>
        )}
      </aside>
      <section className="min-w-0">
        <Outlet context={{ company: current, access }} />
      </section>
    </div>
  )
}

function Blocked({ title, body, onBack }) {
  return (
    <Card className="mx-auto mt-6 max-w-md p-8 text-center">
      <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-600">
        <IconLock width={26} height={26} />
      </span>
      <p className="text-lg font-bold text-slate-800">{title}</p>
      <p className="mt-1 text-sm text-slate-500">{body}</p>
      <Button className="mt-5" variant="secondary" onClick={onBack}>
        <IconBack width={16} height={16} /> Back to CMMS main page
      </Button>
    </Card>
  )
}
