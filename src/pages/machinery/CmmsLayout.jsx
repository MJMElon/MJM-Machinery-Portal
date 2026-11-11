import { Outlet, useLocation } from 'react-router-dom'
import BackButton from '../../components/BackButton.jsx'
import { EMBEDDED } from '../../components/Shell.jsx'

// Machinery Manage. The landing page (/cmms) is a desktop of module icons;
// each module opens in its own draggable window (see Desktop.jsx). Inside such
// a window the page is shown bare. Opened directly (a phone, or a link), the
// page shows with a button back to the desktop.
export default function CmmsLayout() {
  const { pathname } = useLocation()
  const landing = pathname === '/cmms' || pathname === '/cmms/'
  // Deeper pages (a machine's profile, a case) have their own back button.
  const deep = pathname.split('/').filter(Boolean).length > 2
  if (EMBEDDED || landing || deep) return <Outlet />
  return (
    <div>
      <div className="mb-4">
        <BackButton to="/cmms" label="Back to Machinery Manage" />
      </div>
      <Outlet />
    </div>
  )
}
