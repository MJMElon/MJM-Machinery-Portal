import { ModuleTile, TileGrid } from '../components/ModuleTile.jsx'
import { IconTruck } from '../components/icons.jsx'

// Portal main page: one square button per module. Add new modules here.
const MODULES = [{ to: '/machinery', label: 'Machinery System', Icon: IconTruck }]

export default function PortalHome() {
  return (
    <TileGrid>
      {MODULES.map((m) => (
        <ModuleTile key={m.to} {...m} />
      ))}
    </TileGrid>
  )
}
