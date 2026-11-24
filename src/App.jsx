import { Suspense, useEffect } from 'react'
import { PageErrorBoundary, lazyPage } from './lib/lazyPage.jsx'
import { Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { useAuth } from './auth/AuthContext.jsx'
import DevLogin from './auth/DevLogin.jsx'
import { INTRANET_URL } from './lib/supabase.js'
import { Shell } from './components/Shell.jsx'
import { Button, Card, Spinner } from './components/ui.jsx'
import PortalHome from './pages/PortalHome.jsx'
import CmmsLayout from './pages/machinery/CmmsLayout.jsx'
import DieselLayout from './pages/diesel/DieselLayout.jsx'

// Pages load when first opened (smaller first download; each module window
// only fetches what it shows).
const WorkManage = lazyPage(() => import('./pages/machinery/WorkManage.jsx'))
const RepairMobile = lazyPage(() => import('./pages/machinery/RepairMobile.jsx'))
const WorkConsolidated = lazyPage(() => import('./pages/machinery/WorkConsolidated.jsx'))
const CaseDetail = lazyPage(() => import('./pages/machinery/CaseDetail.jsx'))
const MachineryProfile = lazyPage(() => import('./pages/machinery/MachineryProfile.jsx'))
const MachinePage = lazyPage(() => import('./pages/machinery/MachinePage.jsx'))
const CmmsHome = lazyPage(() => import('./pages/machinery/CmmsHome.jsx'))
const MachineImport = lazyPage(() => import('./pages/machinery/MachineImport.jsx'))
const MachineryRenewal = lazyPage(() => import('./pages/machinery/MachineryRenewal.jsx'))
const SupplierList = lazyPage(() => import('./pages/machinery/SupplierList.jsx'))
const CmmsUsers = lazyPage(() => import('./pages/machinery/CmmsUsers.jsx'))
const UserAccessEdit = lazyPage(() => import('./pages/machinery/UserAccessEdit.jsx'))
const CompanySettings = lazyPage(() => import('./pages/settings/CompanySettings.jsx'))
const DieselHome = lazyPage(() => import('./pages/diesel/DieselHome.jsx'))
const DieselClaims = lazyPage(() => import('./pages/diesel/DieselClaims.jsx'))
const ClaimEdit = lazyPage(() => import('./pages/diesel/ClaimEdit.jsx'))
const ClaimView = lazyPage(() => import('./pages/diesel/ClaimView.jsx'))
const ClaimReview = lazyPage(() => import('./pages/diesel/ClaimReview.jsx'))
const DieselUsage = lazyPage(() => import('./pages/diesel/DieselUsage.jsx'))
const FuelRecords = lazyPage(() => import('./pages/diesel/FuelRecords.jsx'))
const FuelRecordMobile = lazyPage(() => import('./pages/diesel/FuelRecordMobile.jsx'))
const FleetCardManage = lazyPage(() => import('./pages/diesel/FleetCardManage.jsx'))
const FleetCardPage = lazyPage(() => import('./pages/diesel/FleetCardPage.jsx'))
const DieselUsers = lazyPage(() => import('./pages/diesel/DieselUsers.jsx'))
const WorkerFuel = lazyPage(() => import('./pages/worker/WorkerApp.jsx').then((m) => ({ default: m.WorkerFuel })))
const WorkerHome = lazyPage(() => import('./pages/worker/WorkerApp.jsx').then((m) => ({ default: m.WorkerHome })))
const WorkerService = lazyPage(() => import('./pages/worker/WorkerApp.jsx').then((m) => ({ default: m.WorkerService })))
const WorkerShell = lazyPage(() => import('./pages/worker/WorkerApp.jsx').then((m) => ({ default: m.WorkerShell })))

export default function App() {
  const { ready, user } = useAuth()

  if (!ready) return <FullSpinner />

  return (
    <PageErrorBoundary>
    <Suspense fallback={<FullSpinner />}>
    <Routes>
      {import.meta.env.DEV && <Route path="/login" element={user ? <Navigate to="/" replace /> : <DevLogin />} />}
      <Route element={<RequirePortalAdmin />}>
        {/* Worker CMMS for site workers: its own shell and two modules, apart from the office pages. */}
        <Route path="/app" element={<WorkerShell />}>
          <Route index element={<WorkerHome />} />
          <Route path="fuel" element={<WorkerFuel />}>
            <Route index element={<FuelRecordMobile />} />
          </Route>
          <Route path="service" element={<WorkerService />} />
          <Route path="repair/:kind" element={<RepairMobile />} />
          <Route path="*" element={<Navigate to="/app" replace />} />
        </Route>
        <Route element={<Shell />}>
          <Route path="/" element={<PortalHome />} />
          <Route path="/settings" element={<CompanySettings />} />
          <Route path="/renewal" element={<MachineryRenewal />} />
          <Route path="/settings/users" element={<CmmsUsers />} />
          <Route path="/settings/users/:userId" element={<UserAccessEdit />} />
          <Route path="/admin/companies" element={<Navigate to="/settings" replace />} />
          <Route path="/cmms" element={<CmmsLayout />}>
            <Route index element={<CmmsHome />} />
            <Route path="work" element={<WorkManage />} />
            <Route path="work/all" element={<WorkConsolidated />} />
            <Route path="work/mobile" element={<Navigate to="/app/service" replace />} />
            <Route path="work/case/:id" element={<CaseDetail />} />
            <Route path="machines" element={<MachineryProfile />} />
            <Route path="machines/new" element={<MachinePage key="new" mode="new" />} />
            <Route path="machines/import" element={<MachineImport />} />
            <Route path="machines/:id" element={<MachinePage key="view" mode="view" />} />
            <Route path="machines/:id/edit" element={<MachinePage key="edit" mode="edit" />} />
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
            <Route path="records" element={<FuelRecords />} />
            <Route path="records/mobile" element={<Navigate to="/app/fuel" replace />} />
            <Route path="cards" element={<FleetCardManage />} />
            <Route path="cards/topup" element={<Navigate to="/diesel/claims/review?tab=pending" replace />} />
            <Route path="cards/new" element={<FleetCardPage key="new" mode="new" />} />
            <Route path="cards/:id" element={<FleetCardPage key="view" mode="view" />} />
            <Route path="cards/:id/edit" element={<FleetCardPage key="edit" mode="edit" />} />
            <Route path="report" element={<Navigate to="/diesel/usage" replace />} />
            {/* old links */}
            <Route path="all" element={<Navigate to="/diesel/claims" replace />} />
            <Route path="vehicles" element={<Navigate to="/cmms/machines" replace />} />
            <Route path="users" element={<DieselUsers />} />
          </Route>
          {/* Old links (Machinery System / Maintenance Request / Incoming Photos) */}
          <Route path="/machinery" element={<Navigate to="/cmms" replace />} />
          <Route path="/machinery/*" element={<Navigate to="/cmms/work" replace />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
    </PageErrorBoundary>
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
