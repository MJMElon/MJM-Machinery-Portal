import { ModuleTile, TileGrid } from '../components/ModuleTile.jsx'
import { CmmsLogo } from '../components/CmmsLogo.jsx'
import { IconBuilding } from '../components/icons.jsx'

// Portal main page: one square button per module. Add new modules here.
const MODULES = [
  { to: '/cmms', label: 'CMMS 2', Logo: CmmsLogo },
  { to: '/settings', label: 'Company Settings', Icon: IconBuilding }
]

export default function PortalHome() {
  return (
    <TileGrid>
      {MODULES.map((m) => (
        <ModuleTile key={m.to} {...m} />
      ))}
    </TileGrid>
  )
}
