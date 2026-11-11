import { Outlet } from 'react-router-dom'

// Machinery Manage. The landing page (/cmms) is a desktop of module icons;
// each module opens in its own window (see Windows.jsx). The top bar's "<"
// takes the person back, so nothing is added around the pages here.
export default function CmmsLayout() {
  return <Outlet />
}
