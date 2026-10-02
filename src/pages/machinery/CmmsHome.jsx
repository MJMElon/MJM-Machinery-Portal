import PageHeader from '../../components/PageHeader.jsx'
import { ModuleTile, TileGrid } from '../../components/ModuleTile.jsx'
import { MachTrekIcon, WorkIcon } from '../../components/AppIcons.jsx'

const MACHTREK_URL = import.meta.env.VITE_MACHTREK_URL || 'https://mjmelon.github.io/MachTrek/'

// CMMS 2 home. MachTrek (machine work-done records) is linked, not embedded —
// it stays its own app and is not modified by this portal.
export default function CmmsHome() {
  return (
    <div>
      <PageHeader backTo="/" backLabel="Back to main page" />
      <div className="pt-2 sm:pt-6">
        <TileGrid>
          <ModuleTile size="sm" to="/cmms/work" label={'Maintenance\nWork Manage'} Icon={WorkIcon} />
          <ModuleTile size="sm" href={MACHTREK_URL} label="MachTrek" Icon={MachTrekIcon} />
        </TileGrid>
      </div>
    </div>
  )
}
