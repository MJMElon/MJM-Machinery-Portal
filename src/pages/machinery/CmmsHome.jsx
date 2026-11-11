import { Desktop } from '../../components/Desktop.jsx'
import { MachTrekIcon, MachineProfileIcon, SupplierIcon, WorkManageIcon } from '../../components/AppIcons.jsx'
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
  if (EMBEDDED)
    return <p className="p-6 text-center text-sm text-slate-500">This is the Machinery Manage main page. Close this window to go back to it.</p>
  return (
    <div>
      <Desktop modules={CMMS_MODULES} orderKey="cmms" />
    </div>
  )
}
