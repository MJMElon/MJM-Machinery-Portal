import { useEffect } from 'react'
import { Outlet, useLocation, useMatch, useNavigate } from 'react-router-dom'
import { Button, Card, Spinner } from '../../components/ui.jsx'
import { IconBack, IconCard, IconFuel, IconLock, IconReceipt, IconUsers } from '../../components/icons.jsx'
import { useCompany } from '../../lib/CompanyContext.jsx'
import { useDieselAccess } from '../../lib/diesel.js'
import { useAuth } from '../../auth/AuthContext.jsx'
import { DieselClaimsIcon, DieselUsageIcon, FleetCardIcon, FuelRecordIcon, FuelUsersIcon } from '../../components/AppIcons.jsx'
import { useWindows } from '../../components/Windows.jsx'
import { EMBEDDED } from '../../components/Shell.jsx'

// Fuel Manage: four modules. The landing page shows them as square icons;
// inside a module the same four sit in the left sidebar. Which ones a person
// gets depends on their Diesel access for the selected company (set under
// Settings → User setting).
export const DIESEL_MODULES = [
  { to: '/diesel/claims', label: 'Fuel Claims', Icon: IconReceipt, need: (a) => a.can('claims', 'view'), hint: 'Cash fuel claims with receipt photos; review and payment' },
  {
    to: '/diesel/records',
    label: 'Estate Fuel Record',
    Icon: IconFuel,
    need: (a) => a.can('fuel_record', 'view') || a.can('fuel_record', 'add'),
    hint: 'Diesel issued to each machine from the company tank, listed'
  },
  {
    to: '/diesel/usage',
    label: 'Reports',
    Icon: IconFuel,
    need: (a) => a.can('usage', 'view') || a.can('report', 'view'),
    hint: 'Monthly fuel usage by HQ vehicle and estate machine'
  },
  { to: '/diesel/cards', label: 'Fleet Card Manage', Icon: IconCard, need: (a) => a.can('cards', 'view') || a.can('topup', 'approve') || a.can('topup', 'process'), hint: 'Fleet cards, reloads, balances, top-up requests and KPDN subsidy vehicles' },
  { to: '/diesel/users', label: 'User\nsetting', Icon: IconUsers, need: (a) => a.fuelAdmin, hint: 'Role, approvers of fuel claims and top-up requests, and fuel limit of each person' }
]

const ART = {
  '/diesel/claims': DieselClaimsIcon,
  '/diesel/records': FuelRecordIcon,
  '/diesel/usage': DieselUsageIcon,
  '/diesel/cards': FleetCardIcon,
  '/diesel/users': FuelUsersIcon
}
/** A Fuel Manage module as a module window ({ key, label, Icon, path }). */
export const fuelWindow = (m) => ({ key: m.to.replace('/', '').replace('/', '-'), label: m.label, Icon: ART[m.to] || m.Icon, path: m.to })

export default function DieselLayout() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { open } = useWindows()
  const { current, loaded } = useCompany()
  const { isSuperAdmin } = useAuth()
  const access = useDieselAccess(current?.diesel_enabled ? current.id : null)
  const landing = Boolean(useMatch({ path: '/diesel', end: true }))
  const back = () => navigate('/')
  // Fuel Manage theme (index.css .fuel-theme): dark buttons, glowing tabs.
  // On <html> so pop-ups (rendered outside this page) get it too.
  useEffect(() => {
    document.documentElement.classList.add('fuel-theme')
    return () => document.documentElement.classList.remove('fuel-theme')
  }, [])

  // Opened straight on a module (e.g. the Fuel Claims icon in MJM Intranet
  // links to #/diesel/claims): show the Fuel Manage page with that module in
  // its window on top, as when it is opened inside CMMS 2 — closing the
  // window (X) leaves the person on the Fuel Manage page.
  const direct = !EMBEDDED && DIESEL_MODULES.find((m) => m.to === pathname)
  // The window starts loading as soon as the company is known; the module in
  // it checks the person's access itself (no waiting for it here first).
  const ready = loaded && current?.diesel_enabled
  useEffect(() => {
    if (!direct || !ready) return
    navigate('/diesel', { replace: true })
    open(fuelWindow(direct))
  }, [direct, ready]) // eslint-disable-line react-hooks/exhaustive-deps

  // About to switch to the Fuel Manage page with the module in a window.
  if (direct && ready)
    return (
      <div className="flex justify-center py-16 text-brand">
        <Spinner className="h-7 w-7" />
      </div>
    )

  if (!loaded || !access.loaded)
    return (
      <div className="flex justify-center py-16 text-brand">
        <Spinner className="h-7 w-7" />
      </div>
    )

  if (!current || !current.diesel_enabled)
    return (
      <Blocked
        title={current ? 'Fuel Manage is not enabled' : 'No company yet'}
        body={
          current
            ? `${current.name} does not have Fuel Manage yet. ${
                isSuperAdmin ? 'Turn it on under Businesses & Companies (gear icon, top right).' : 'Ask a super admin to turn it on.'
              }`
            : 'You have not been given a company yet. Ask HR to allocate you to your company in MJM Intranet, then sign in again.'
        }
        onBack={back}
      />
    )

  if (!access.use)
    return (
      <Blocked
        title="No access to Fuel Manage"
        body={
          access.error ||
          `You are not on the Fuel Manage user list of ${current.name}. A super admin gives access under Settings → User setting.`
        }
        onBack={back}
      />
    )

  const nav = DIESEL_MODULES.filter((n) => n.need(access))

  // Landing page and every module: just "Back to CMMS main page" and the content.
  // The top bar names the module (Fuel Claims, Estate Fuel Record, …).
  return (
    <div>
      <Outlet context={{ company: current, access }} />
      {landing && nav.length === 0 && (
        <p className="mx-auto mt-6 max-w-xl rounded-xl bg-amber-50 px-3 py-2 text-center text-xs text-amber-800">
          You have Fuel Manage access but no module yet. A super admin gives access under Machinery Manage → CMMS User
          Setting.
        </p>
      )}
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
