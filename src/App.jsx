import { useEffect } from 'react'
import { Routes, Route, Navigate, Outlet, useOutletContext } from 'react-router-dom'
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
import SupplierList from './pages/machinery/SupplierList.jsx'
import CmmsUsers from './pages/machinery/CmmsUsers.jsx'
import CompanySettings from './pages/settings/CompanySettings.jsx'
import ManageCompanies from './pages/admin/ManageCompanies.jsx'
import DieselLayout from './pages/diesel/DieselLayout.jsx'
import CashClaim from './pages/diesel/CashClaim.jsx'
import Vehicles from './pages/diesel/Vehicles.jsx'
import AllClaims from './pages/diesel/AllClaims.jsx'
import FleetCard from './pages/diesel/FleetCard.jsx'
import DieselReport from './pages/diesel/DieselReport.jsx'
import DieselUsers from './pages/diesel/DieselUsers.jsx'

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
          <Route path="/admin/companies" element={<ManageCompanies />} />
          <Route path="/cmms" element={<CmmsLayout />}>
            <Route index element={<Navigate to="/cmms/work" replace />} />
            <Route path="work" element={<WorkManage />} />
            <Route path="work/all" element={<WorkConsolidated />} />
            <Route path="work/case/:id" element={<CaseDetail />} />
            <Route path="machines" element={<MachineryProfile />} />
            <Route path="suppliers" element={<SupplierList />} />
            <Route path="users" element={<CmmsUsers />} />
          </Route>
          <Route path="/diesel" element={<DieselLayout />}>
            <Route index element={<DieselIndex />} />
            <Route path="claims" element={<CashClaim />} />
            <Route path="vehicles" element={<Vehicles />} />
            <Route path="all" element={<AllClaims />} />
            <Route path="cards" element={<FleetCard />} />
            <Route path="report" element={<DieselReport />} />
            <Route path="users" element={<DieselUsers />} />
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

// Signed in (via MJM Connect) AND listed in machinery_portal_admins.
// The database enforces the same rule with RLS; this is just the UI gate.
// Without a session the person is sent to MJM Connect to log in there.
function RequirePortalAdmin() {
  const { user, access, handoff, handoffError, logout } = useAuth()
  if (!user) {
    if (handoff === 'pending') return <FullSpinner label="Signing in from MJM Connect…" />
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
              : `${user.email} is signed in but is not a portal user. Open the portal from MJM Connect to be added.`}
          </p>
          <Button className="mt-4" variant="secondary" onClick={logout}>
            Back to MJM Connect
          </Button>
        </Card>
      </div>
    )
  }
  return <Outlet />
}

// No session and no token: this portal is reached from MJM Connect only.
function RedirectToIntranet() {
  useEffect(() => {
    window.location.replace(INTRANET_URL)
  }, [])
  return <GoToIntranet title="Please log in at MJM Connect" body="Taking you to MJM Connect… open the portal from there." />
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
          Go to MJM Connect
        </a>
      </Card>
    </div>
  )
}

// Diesel Manage opens on Cash Claim when the user has it, else on Vehicles.
function DieselIndex() {
  const { access } = useOutletContext()
  return <Navigate to={access.claim ? '/diesel/claims' : '/diesel/vehicles'} replace />
}

function FullSpinner({ label }) {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-3 text-brand">
      <Spinner className="h-8 w-8" />
      {label && <p className="text-sm text-slate-500">{label}</p>}
    </div>
  )
}
