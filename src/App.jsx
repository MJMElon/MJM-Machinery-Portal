import { useEffect } from 'react'
import { Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { useAuth } from './auth/AuthContext.jsx'
import DevLogin from './auth/DevLogin.jsx'
import { INTRANET_URL } from './lib/supabase.js'
import { Shell } from './components/Shell.jsx'
import { Button, Card, Spinner } from './components/ui.jsx'
import PortalHome from './pages/PortalHome.jsx'
import CmmsLayout from './pages/machinery/CmmsLayout.jsx'
import WorkManage from './pages/machinery/WorkManage.jsx'
import WorkConsolidated from './pages/machinery/WorkConsolidated.jsx'
import CaseDetail from './pages/machinery/CaseDetail.jsx'
import MachineryProfile from './pages/machinery/MachineryProfile.jsx'
import MachinePage from './pages/machinery/MachinePage.jsx'
import SupplierList from './pages/machinery/SupplierList.jsx'
import CmmsUsers from './pages/machinery/CmmsUsers.jsx'
import UserAccessEdit from './pages/machinery/UserAccessEdit.jsx'
import CompanySettings from './pages/settings/CompanySettings.jsx'
import DieselLayout from './pages/diesel/DieselLayout.jsx'
import DieselHome from './pages/diesel/DieselHome.jsx'
import DieselClaims from './pages/diesel/DieselClaims.jsx'
import ClaimEdit from './pages/diesel/ClaimEdit.jsx'
import ClaimView from './pages/diesel/ClaimView.jsx'
import ClaimReview from './pages/diesel/ClaimReview.jsx'
import DieselUsage from './pages/diesel/DieselUsage.jsx'
import FleetCardManage from './pages/diesel/FleetCardManage.jsx'
import DieselReport from './pages/diesel/DieselReport.jsx'

export default function App() {
  const { ready, user } = useAuth()

  if (!ready) return <FullSpinner />

  return (
    <Routes>
      {import.meta.env.DEV && <Route path="/login" element={user ? <Navigate to="/" replace /> : <DevLogin />} />}
      <Route element={<RequirePortalAdmin />}>
        <Route element={<Shell />}>
          <Route path="/" element={<PortalHome />} />
          <Route path="/settings" element={<CompanySettings />} />
          <Route path="/settings/users" element={<CmmsUsers />} />
          <Route path="/settings/users/:userId" element={<UserAccessEdit />} />
          <Route path="/admin/companies" element={<Navigate to="/settings" replace />} />
          <Route path="/cmms" element={<CmmsLayout />}>
            <Route index element={<Navigate to="/cmms/work" replace />} />
            <Route path="work" element={<WorkManage />} />
            <Route path="work/all" element={<WorkConsolidated />} />
            <Route path="work/case/:id" element={<CaseDetail />} />
            <Route path="machines" element={<MachineryProfile />} />
            <Route path="machines/new" element={<MachinePage mode="new" />} />
            <Route path="machines/:id" element={<MachinePage mode="view" />} />
            <Route path="machines/:id/edit" element={<MachinePage mode="edit" />} />
            <Route path="suppliers" element={<SupplierList />} />
            <Route path="users" element={<Navigate to="/settings/users" replace />} />
          </Route>
          <Route path="/diesel" element={<DieselLayout />}>
            <Route index element={<DieselHome />} />
            <Route path="claims" element={<DieselClaims />} />
            <Route path="claims/new" element={<ClaimEdit />} />
            <Route path="claims/review" element={<ClaimReview />} />
            <Route path="claims/:id" element={<ClaimView />} />
            <Route path="claims/:id/edit" element={<ClaimEdit />} />
            <Route path="usage" element={<DieselUsage />} />
            <Route path="cards" element={<FleetCardManage />} />
            <Route path="report" element={<DieselReport />} />
            {/* old links */}
            <Route path="all" element={<Navigate to="/diesel/claims" replace />} />
            <Route path="vehicles" element={<Navigate to="/cmms/machines" replace />} />
            <Route path="users" element={<Navigate to="/settings/users" replace />} />
          </Route>
          {/* Old links (Machinery System / Maintenance Request / Incoming Photos) */}
          <Route path="/machinery" element={<Navigate to="/cmms" replace />} />
          <Route path="/machinery/*" element={<Navigate to="/cmms/work" replace />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

// Signed in (via MJM Intranet) AND listed in machinery_portal_admins.
// The database enforces the same rule with RLS; this is just the UI gate.
// Without a session the person is sent to MJM Intranet to log in there.
function RequirePortalAdmin() {
  const { user, access, handoff, handoffError, logout } = useAuth()
  if (!user) {
    if (handoff === 'pending') return <FullSpinner label="Signing in from MJM Intranet…" />
    if (handoff === 'failed') return <GoToIntranet title="Could not sign in" body={handoffError} />
    if (import.meta.env.DEV) return <Navigate to="/login" replace />
    return <RedirectToIntranet />
  }
  if (access === 'unknown') return <FullSpinner />
  if (access !== 'granted') {
    return (
      <div className="mx-auto flex min-h-[100dvh] max-w-app items-center px-5">
        <Card className="w-full p-5 text-center">
          <p className="text-base font-semibold text-slate-800">No portal access</p>
          <p className="mt-1 text-sm text-slate-500">
            {access === 'error'
              ? 'Could not check access. Has the database migration been run?'
              : `${user.email} is signed in but is not a portal user. Open the portal from MJM Intranet to be added.`}
          </p>
          <Button className="mt-4" variant="secondary" onClick={logout}>
            Back to MJM Intranet
          </Button>
        </Card>
      </div>
    )
  }
  return <Outlet />
}

// No session and no token: this portal is reached from MJM Intranet only.
function RedirectToIntranet() {
  useEffect(() => {
    window.location.replace(INTRANET_URL)
  }, [])
  return <GoToIntranet title="Please log in at MJM Intranet" body="Taking you to MJM Intranet… open the portal from there." />
}

function GoToIntranet({ title, body }) {
  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-app items-center px-5">
      <Card className="w-full p-6 text-center">
        <p className="text-base font-semibold text-slate-800">{title}</p>
        <p className="mt-1 text-sm text-slate-500">{body}</p>
        <a
          href={INTRANET_URL}
          className="mt-4 inline-flex h-11 items-center rounded-xl bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-dark"
        >
          Go to MJM Intranet
        </a>
      </Card>
    </div>
  )
}

function FullSpinner({ label }) {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-3 text-brand">
      <Spinner className="h-8 w-8" />
      {label && <p className="text-sm text-slate-500">{label}</p>}
    </div>
  )
}
