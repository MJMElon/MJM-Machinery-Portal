import { Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { useAuth } from './auth/AuthContext.jsx'
import Login from './auth/Login.jsx'
import { Shell } from './components/Shell.jsx'
import { Button, Card, Spinner } from './components/ui.jsx'
import PortalHome from './pages/PortalHome.jsx'
import MachineryHome from './pages/machinery/MachineryHome.jsx'
import MaintenanceRequest from './pages/machinery/MaintenanceRequest.jsx'
import MessageDetail from './pages/machinery/MessageDetail.jsx'

export default function App() {
  const { ready, user } = useAuth()

  if (!ready) return <FullSpinner />

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route element={<RequirePortalAdmin />}>
        <Route element={<Shell />}>
          <Route path="/" element={<PortalHome />} />
          <Route path="/machinery" element={<MachineryHome />} />
          <Route path="/machinery/maintenance" element={<MaintenanceRequest />} />
          <Route path="/machinery/maintenance/:id" element={<MessageDetail />} />
          {/* Old Incoming Photos links */}
          <Route path="/machinery/photos" element={<Navigate to="/machinery/maintenance" replace />} />
          <Route path="/machinery/photos/:id" element={<MessageDetail />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

// Signed in (Supabase Auth) AND listed in machinery_portal_admins.
// The database enforces the same rule with RLS; this is just the UI gate.
function RequirePortalAdmin() {
  const { user, access, logout } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (access === 'unknown') return <FullSpinner />
  if (access !== 'granted') {
    return (
      <div className="mx-auto flex min-h-[100dvh] max-w-app items-center px-5">
        <Card className="w-full p-5 text-center">
          <p className="text-base font-semibold text-slate-800">No portal access</p>
          <p className="mt-1 text-sm text-slate-500">
            {access === 'error'
              ? 'Could not check access. Has the database migration been run?'
              : `${user.email} is signed in but is not a portal admin. Ask the system admin to add you.`}
          </p>
          <Button className="mt-4" variant="secondary" onClick={logout}>
            Log out
          </Button>
        </Card>
      </div>
    )
  }
  return <Outlet />
}

function FullSpinner() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center text-brand">
      <Spinner className="h-8 w-8" />
    </div>
  )
}
