import { useOutletContext } from 'react-router-dom'
import { ModuleList } from '../../components/Desktop.jsx'
import { EMBEDDED } from '../../components/Shell.jsx'
import { DIESEL_MODULES, fuelWindow } from './DieselLayout.jsx'
import { MyFleetCards } from '../../components/diesel/MyFleetCards.jsx'

// Fuel Manage landing page: the modules as a list of wide buttons (icon,
// then the name); each opens in its own window. Modules the person has no
// access to are greyed out. On top: My fleet card (the person's own cards:
// this month's quota meter and the latest purchases).
export default function DieselHome() {
  const { access, company } = useOutletContext()
  if (EMBEDDED) return <p className="p-6 text-center text-sm text-slate-500">This is the Fuel Manage main page. Close this window to go back to it.</p>
  const modules = DIESEL_MODULES.map((m) => {
    const allowed = m.need(access)
    return { ...fuelWindow(m), disabled: !allowed, note: allowed ? null : 'No access' }
  })
  return (
    <div>
      <MyFleetCards company={company} />
      <ModuleList modules={modules} orderKey="fuel-list" />
    </div>
  )
}
