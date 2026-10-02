import { useNavigate } from 'react-router-dom'
import PageHeader from '../../components/PageHeader.jsx'
import { ModuleTile, TileGrid } from '../../components/ModuleTile.jsx'
import { IconList, IconWrench } from '../../components/icons.jsx'

const MACHTREK_URL = import.meta.env.VITE_MACHTREK_URL || 'https://mjmelon.github.io/MachTrek/'

// CMMS 2 home. MachTrek is linked, not embedded — it stays its own app and is
// not modified by this portal.
export default function CmmsHome() {
  const navigate = useNavigate()
  return (
    <div>
      <PageHeader title="CMMS 2" onBack={() => navigate('/')} />
      <div className="mt-4">
        <TileGrid>
          <ModuleTile to="/cmms/work" label="Maintenance Work Manage" Icon={IconWrench} />
          <ModuleTile href={MACHTREK_URL} label="MachTrek" Icon={IconList} />
        </TileGrid>
      </div>
    </div>
  )
}
