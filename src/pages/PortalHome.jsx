import { Link } from 'react-router-dom'
import { Card, SectionTitle } from '../components/ui.jsx'
import { IconChevron, IconTruck } from '../components/icons.jsx'

// Portal main page: one tile per module. Only Machinery exists for now;
// company settings and other modules get their own tiles later.
const MODULES = [
  {
    to: '/machinery',
    title: 'Machinery',
    subtitle: 'All companies · MachTrek, incoming WhatsApp photos',
    Icon: IconTruck
  }
]

export default function PortalHome() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold text-slate-800">Modules</h1>
        <p className="text-sm text-slate-500">Choose a module to open.</p>
      </div>
      <SectionTitle>Available</SectionTitle>
      <div className="grid gap-3 sm:grid-cols-2">
        {MODULES.map(({ to, title, subtitle, Icon }) => (
          <Link key={to} to={to}>
            <Card className="flex items-center gap-3 p-4 active:bg-slate-50">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-light text-brand">
                <Icon width={26} height={26} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-slate-800">{title}</span>
                <span className="block truncate text-sm text-slate-500">{subtitle}</span>
              </span>
              <IconChevron width={20} height={20} className="text-slate-500" />
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
