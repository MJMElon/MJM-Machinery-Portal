import { useOutletContext } from 'react-router-dom'
import PageHeader from '../../components/PageHeader.jsx'
import { ModuleTile, TileGrid } from '../../components/ModuleTile.jsx'
import { DieselClaimsIcon, DieselUsageIcon, FleetCardIcon, ReportIcon } from '../../components/AppIcons.jsx'
import { DIESEL_MODULES } from './DieselLayout.jsx'

const ART = {
  '/diesel/claims': DieselClaimsIcon,
  '/diesel/usage': DieselUsageIcon,
  '/diesel/cards': FleetCardIcon,
  '/diesel/report': ReportIcon
}

// Diesel Manage landing page: the four modules as square icon buttons.
// Modules the person has no access to are shown greyed out.
export default function DieselHome() {
  const { company, access } = useOutletContext()
  return (
    <div className="space-y-4">
      <PageHeader title="Diesel Manage" subtitle={`${company.name} · choose a module`} />
      <div className="pt-2">
        <TileGrid>
          {DIESEL_MODULES.map((m) => {
            const allowed = m.need(access)
            return (
              <ModuleTile
                key={m.to}
                to={m.to}
                label={m.label}
                Icon={ART[m.to]}
                size="md"
                disabled={!allowed}
                note={allowed ? null : 'No access'}
              />
            )
          })}
        </TileGrid>
      </div>
      <ul className="mx-auto max-w-3xl space-y-1 pt-4 text-center text-xs text-slate-500">
        {DIESEL_MODULES.map((m) => (
          <li key={m.to}>
            <span className="font-semibold text-slate-700">{m.label}</span> · {m.hint}
          </li>
        ))}
      </ul>
    </div>
  )
}
