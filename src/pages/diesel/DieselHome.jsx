import { useOutletContext } from 'react-router-dom'
import { ModuleList } from '../../components/Desktop.jsx'
import { EMBEDDED } from '../../components/Shell.jsx'
import { DIESEL_MODULES, fuelWindow } from './DieselLayout.jsx'
import { MyFleetCards } from '../../components/diesel/MyFleetCards.jsx'
import { TaskBar } from '../../components/diesel/TaskBar.jsx'

// Fuel Manage landing page: the modules as wide buttons in two equal
// columns (icon, then the name; press and hold to drag them into another order); each opens in its own window. Modules the person has no
// access to are not shown. On top: My fleet card (the person's own cards:
// this month's quota meter and the latest purchases), then the task bar
// (pending tasks: approvals, top ups, claims to pay, fill-ups to claim).
export default function DieselHome() {
  const { access, company } = useOutletContext()
  if (EMBEDDED) return <p className="p-6 text-center text-sm text-slate-500">This is the Fuel Manage main page. Close this window to go back to it.</p>
  // Only the modules the person has access to
  const modules = DIESEL_MODULES.filter((m) => m.need(access)).map(fuelWindow)
  return (
    <div>
      <MyFleetCards company={company} />
      <TaskBar company={company} access={access} />
      <ModuleList modules={modules} orderKey="fuel-list" columns={2} />
    </div>
  )
}
