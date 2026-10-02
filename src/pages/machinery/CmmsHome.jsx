import PageHeader from '../../components/PageHeader.jsx'
import { ModuleTile, TileGrid } from '../../components/ModuleTile.jsx'
import { MachTrekIcon, MachinesIcon, SuppliersIcon, UsersIcon, WorkIcon } from '../../components/AppIcons.jsx'

const MACHTREK_URL = import.meta.env.VITE_MACHTREK_URL || 'https://mjmelon.github.io/MachTrek/'

// CMMS 2 home. MachTrek (machine work-done records) is linked, not embedded —
// it stays its own app and is not modified by this portal.
export default function CmmsHome() {
  return (
    <div>
      <PageHeader backTo="/" backLabel="Back to main page" />
      <div className="pt-2 sm:pt-6">
        <TileGrid orderKey="cmms">
          <ModuleTile key="work" size="sm" to="/cmms/work" label={'Maintenance\nWork Manage'} Icon={WorkIcon} />
          <ModuleTile key="machines" size="sm" to="/cmms/machines" label={'Machinery\nProfile'} Icon={MachinesIcon} />
          <ModuleTile
            key="suppliers"
            size="sm"
            to="/cmms/suppliers"
            label={'Supplier\nWorkshop List'}
            Icon={SuppliersIcon}
          />
          <ModuleTile key="users" size="sm" to="/cmms/users" label={'CMMS\nUser Setting'} Icon={UsersIcon} />
          <ModuleTile key="machtrek" size="sm" href={MACHTREK_URL} label="MachTrek" Icon={MachTrekIcon} />
        </TileGrid>
      </div>
    </div>
  )
}
