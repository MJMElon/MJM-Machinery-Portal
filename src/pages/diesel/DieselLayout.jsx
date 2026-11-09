import { Outlet, useMatch, useNavigate } from 'react-router-dom'
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
  { to: '/diesel/claims', label: 'Fuel Claims', Icon: IconReceipt, need: (a) => a.can('claims', 'view'), hint: 'Cash fuel claims with receipt photos; review and payment' },
  { to: '/diesel/usage', label: 'Fuel Usage', Icon: IconFuel, need: (a) => a.can('usage', 'view'), hint: 'Every fill-up (cash and fleet card) by vehicle and driver' },
  { to: '/diesel/cards', label: 'Fleet Card Manage', Icon: IconCard, need: (a) => a.can('cards', 'view'), hint: 'Fleet cards, reloads, balances and KPDN subsidy vehicles' },
  { to: '/diesel/report', label: 'Report', Icon: IconChart, need: (a) => a.can('report', 'view'), hint: 'Monthly totals by vehicle and driver, export' }
]

export default function DieselLayout() {
  const navigate = useNavigate()
  const { current, loaded } = useCompany()
  const { isSuperAdmin } = useAuth()
  const access = useDieselAccess(current?.diesel_enabled ? current.id : null)
  const landing = Boolean(useMatch({ path: '/diesel', end: true }))
  const back = () => navigate('/')

  if (!loaded || !access.loaded)
    return (
      <div className="flex justify-center py-16 text-brand">
        <Spinner className="h-7 w-7" />
      </div>
    )

  if (!current || !current.diesel_enabled)
    return (
      <Blocked
        title="Fuel Manage is not enabled"
        body={
          current
            ? `${current.name} does not have Fuel Manage yet. ${
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
        title="No access to Fuel Manage"
        body={
          access.error ||
          `You are not on the Fuel Manage user list of ${current.name}. A super admin gives access under Machinery Manage → CMMS User Setting.`
        }
        onBack={back}
      />
    )

  const nav = DIESEL_MODULES.filter((n) => n.need(access))

  // Landing page and every module: just "Back to CMMS main page" and the content.
  // The top bar names the module (Fuel Claims, Fuel Usage, …).
  return (
    <div>
      <button
        onClick={back}
        className="-ml-2 mb-4 inline-flex h-9 items-center gap-1.5 rounded-xl px-2 text-sm font-medium text-slate-500 hover:bg-white hover:text-brand print:hidden"
      >
        <IconBack width={16} height={16} /> Back to CMMS main page
      </button>
      <Outlet context={{ company: current, access }} />
      {landing && !access.claim && !access.report && (
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
