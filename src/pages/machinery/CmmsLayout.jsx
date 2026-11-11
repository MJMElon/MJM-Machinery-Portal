import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { IconBack } from '../../components/icons.jsx'
import { EMBEDDED } from '../../components/Shell.jsx'

// Machinery Manage. The landing page (/cmms) is a desktop of module icons;
// each module opens in its own draggable window (see Desktop.jsx). Inside such
// a window the page is shown bare. Opened directly (a phone, or a link), the
// page shows with a button back to the desktop.
export default function CmmsLayout() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const landing = pathname === '/cmms' || pathname === '/cmms/'
  if (EMBEDDED || landing) return <Outlet />
  return (
    <div>
      <button
        onClick={() => navigate('/cmms')}
        className="-ml-2 mb-4 inline-flex h-9 items-center gap-1.5 rounded-xl px-2 text-sm font-medium text-slate-500 hover:bg-white hover:text-brand print:hidden"
      >
        <IconBack width={16} height={16} /> Back to Machinery Manage
      </button>
      <Outlet />
    </div>
  )
}
