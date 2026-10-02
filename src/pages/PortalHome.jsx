import { ModuleTile, TileGrid } from '../components/ModuleTile.jsx'
import { CmmsIcon, SettingsIcon } from '../components/AppIcons.jsx'

// Portal main page: one square button per module. Add new modules here.
const MODULES = [
  { to: '/cmms', label: 'CMMS 2', Icon: CmmsIcon },
  { to: '/settings', label: 'Settings', Icon: SettingsIcon }
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
