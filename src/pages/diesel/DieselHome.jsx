import { useOutletContext } from 'react-router-dom'
import { Desktop } from '../../components/Desktop.jsx'
import { EMBEDDED } from '../../components/Shell.jsx'
import { DieselClaimsIcon, DieselUsageIcon, FleetCardIcon, FuelUsersIcon, ReportIcon } from '../../components/AppIcons.jsx'
import { DIESEL_MODULES } from './DieselLayout.jsx'

const ART = {
  '/diesel/claims': DieselClaimsIcon,
  '/diesel/usage': DieselUsageIcon,
  '/diesel/cards': FleetCardIcon,
  '/diesel/report': ReportIcon,
  '/diesel/users': FuelUsersIcon
}

// Fuel Manage landing page: the four modules as square icons (draggable into
// any order); each opens in its own window. Modules the person has no access
// to are greyed out.
export default function DieselHome() {
  const { access } = useOutletContext()
  if (EMBEDDED) return <p className="p-6 text-center text-sm text-slate-500">This is the Fuel Manage main page. Close this window to go back to it.</p>
  const modules = DIESEL_MODULES.map((m) => {
    const allowed = m.need(access)
    return { key: m.to.replace('/', '').replace('/', '-'), label: m.label, Icon: ART[m.to], path: m.to, disabled: !allowed, note: allowed ? null : 'No access' }
  })
  return <Desktop modules={modules} orderKey="fuel" />
}
