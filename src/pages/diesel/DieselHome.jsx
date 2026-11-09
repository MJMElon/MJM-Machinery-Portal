import { useOutletContext } from 'react-router-dom'
import { ModuleTile, TileGrid } from '../../components/ModuleTile.jsx'
import { DieselClaimsIcon, DieselUsageIcon, FleetCardIcon, ReportIcon } from '../../components/AppIcons.jsx'
import { DIESEL_MODULES } from './DieselLayout.jsx'

const ART = {
  '/diesel/claims': DieselClaimsIcon,
  '/diesel/usage': DieselUsageIcon,
  '/diesel/cards': FleetCardIcon,
  '/diesel/report': ReportIcon
}

// Fuel Manage landing page: the four modules as square icon buttons that can
// be dragged into any arrangement (remembered per user in this browser).
// Modules the person has no access to are shown greyed out.
export default function DieselHome() {
  const { access } = useOutletContext()
  return (
    <div className="pt-2 sm:pt-6">
      <TileGrid orderKey="fuel">
        {DIESEL_MODULES.map((m) => {
          const allowed = m.need(access)
          return (
            <ModuleTile
              key={m.to}
              to={m.to}
              label={m.label}
              Icon={ART[m.to]}
              disabled={!allowed}
              note={allowed ? null : 'No access'}
            />
          )
        })}
      </TileGrid>
    </div>
  )
}
