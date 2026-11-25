import { Desktop } from '../../components/Desktop.jsx'
import { MachTrekIcon, MachineProfileIcon, SupplierIcon, WorkManageIcon } from '../../components/AppIcons.jsx'
import { EMBEDDED } from '../../components/Shell.jsx'
import { useCompany } from '../../lib/CompanyContext.jsx'
import { usePerms } from '../../lib/perms.js'

const MACHTREK_URL = import.meta.env.VITE_MACHTREK_URL || 'https://mjmelon.github.io/MachTrek/'

export const CMMS_MODULES = [
  { key: 'work', label: 'Maintenance\nWork Manage', Icon: WorkManageIcon, path: '/cmms/work' },
  { key: 'machines', label: 'Machinery\nProfile', Icon: MachineProfileIcon, path: '/cmms/machines' },
  { key: 'suppliers', label: 'Supplier\nWorkshop List', Icon: SupplierIcon, path: '/cmms/suppliers' },
  { key: 'machtrek', label: 'MachTrek', Icon: MachTrekIcon, path: '/cmms', href: MACHTREK_URL }
]

// Machinery Manage main page: the modules the person may view, as icons;
// each opens in a window. MachTrek shows with any of them.
export default function CmmsHome() {
  const { current } = useCompany()
  const perms = usePerms(current?.id)
  if (EMBEDDED)
    return <p className="p-6 text-center text-sm text-slate-500">This is the Machinery Manage main page. Close this window to go back to it.</p>
  if (!perms.loaded) return null
  const sees = (k) => (k === 'machtrek' ? perms.any(['work', 'machines', 'suppliers']) : perms.can(k, 'view'))
  const modules = CMMS_MODULES.filter((m) => sees(m.key))
  if (!modules.length)
    return <p className="mx-auto mt-10 max-w-md text-center text-sm text-slate-500">No Machinery Manage access yet. Ask your admin to give you access in CMMS 2 User Access.</p>
  return (
    <div>
      <Desktop modules={modules} orderKey="cmms" />
    </div>
  )
}
