import { useNavigate } from 'react-router-dom'
import { Desktop } from '../../components/Desktop.jsx'
import { MachTrekIcon, MachineProfileIcon, SupplierIcon, WorkManageIcon } from '../../components/AppIcons.jsx'
import { IconBack } from '../../components/icons.jsx'
import { EMBEDDED } from '../../components/Shell.jsx'

const MACHTREK_URL = import.meta.env.VITE_MACHTREK_URL || 'https://mjmelon.github.io/MachTrek/'

export const CMMS_MODULES = [
  { key: 'work', label: 'Maintenance\nWork Manage', Icon: WorkManageIcon, path: '/cmms/work' },
  { key: 'machines', label: 'Machinery\nProfile', Icon: MachineProfileIcon, path: '/cmms/machines' },
  { key: 'suppliers', label: 'Supplier\nWorkshop List', Icon: SupplierIcon, path: '/cmms/suppliers' },
  { key: 'machtrek', label: 'MachTrek', Icon: MachTrekIcon, path: '/cmms', href: MACHTREK_URL }
]

// Machinery Manage main page: the modules as icons; each opens in a window.
export default function CmmsHome() {
  const navigate = useNavigate()
  if (EMBEDDED)
    return <p className="p-6 text-center text-sm text-slate-500">This is the Machinery Manage main page. Close this window to go back to it.</p>
  return (
    <div>
      <button
        onClick={() => navigate('/')}
        className="-ml-2 mb-2 inline-flex h-9 items-center gap-1.5 rounded-xl px-2 text-sm font-medium text-slate-500 hover:bg-white hover:text-brand print:hidden"
      >
        <IconBack width={16} height={16} /> Back to CMMS main page
      </button>
      <Desktop modules={CMMS_MODULES} orderKey="cmms" title="Machinery Manage" />
    </div>
  )
}
