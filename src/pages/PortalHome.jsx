import { Link } from 'react-router-dom'
import { ModuleTile, TileGrid } from '../components/ModuleTile.jsx'
import { DieselIcon, MachineryIcon, RenewalIcon, UserAccessIcon, WorkerIcon } from '../components/AppIcons.jsx'
import { Card, Spinner } from '../components/ui.jsx'
import { useAuth } from '../auth/AuthContext.jsx'
import { useCompany } from '../lib/CompanyContext.jsx'
import { useWindows } from '../components/Windows.jsx'
import { EMBEDDED } from '../components/Shell.jsx'
import { usePerms } from '../lib/perms.js'

// Portal main page: the selected company's modules in two boxes,
// Operation (Machinery Manage, Fuel Manage, Worker CMMS) and HQ Admin
// (Machinery Renewal, User Access). Only modules the person has access to
// (CMMS 2 User Access) are shown.
export default function PortalHome() {
  const { isSuperAdmin } = useAuth()
  const { current, loaded, error } = useCompany()
  const { open } = useWindows()
  const perms = usePerms(current?.id)
  // User Access: super admins, and module admins (for their module)
  const userAccess = isSuperAdmin || perms.adminModules.length > 0
  // Only the modules the person has access to (User Access) are shown.
  const can = (section, action) => perms.can(section, action)
  const show = current
    ? {
        cmms: current.cmms_enabled && perms.any(['work', 'machines', 'suppliers']),
        fuel: current.diesel_enabled && perms.any(['claims', 'usage', 'cards', 'report', 'fuel_record', 'topup']),
        worker: (current.diesel_enabled && can('fuel_record', 'add')) || (current.cmms_enabled && can('work', 'add')),
        renewal: current.cmms_enabled && can('machines', 'view')
      }
    : {}
  const operation = show.cmms || show.fuel || show.worker
  const hq = show.renewal || userAccess
  if (EMBEDDED) return <p className="p-6 text-center text-sm text-slate-500">This is the CMMS 2 main page. Close this window to go back to it.</p>

  if (!loaded || (current && !perms.loaded))
    return (
      <div className="flex justify-center py-16 text-brand">
        <Spinner className="h-7 w-7" />
      </div>
    )

  if (!current)
    return (
      <Card className="mx-auto mt-6 max-w-lg p-8 text-center">
        <p className="text-lg font-bold text-slate-800">No company yet</p>
        <p className="mt-1 text-sm text-slate-500">
          {error ||
            (isSuperAdmin
              ? 'Companies come from MJM Intranet. Open User Access and press “Sync from MJM Intranet”.'
              : 'You have not been given a company yet. Ask HR to allocate you to your company in MJM Intranet (Business → Company), then sign in again.')}
        </p>
        {isSuperAdmin && (
          <Link
            to="/settings/users"
            className="mt-5 inline-flex h-11 items-center rounded-xl bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-dark"
          >
            Open User Access
          </Link>
        )}
      </Card>
    )

  if (!operation && !hq)
    return (
      <Card className="mx-auto mt-6 max-w-lg p-8 text-center">
        <p className="text-lg font-bold text-slate-800">No module access yet</p>
        <p className="mt-1 text-sm text-slate-500">Ask your admin to give you access in CMMS 2 User Access for {current.name}.</p>
      </Card>
    )

  return (
    <div className="mx-auto flex max-w-5xl flex-wrap items-start justify-center gap-5 pt-4 sm:gap-6 sm:pt-10">
      {operation && (
        <Group title="Operation">
          <TileGrid orderKey="home-operation">
            {show.cmms && <ModuleTile key="cmms" to="/cmms" label="Machinery Manage" Icon={MachineryIcon} />}
            {show.fuel && <ModuleTile key="diesel" to="/diesel" label="Fuel Manage" Icon={DieselIcon} />}
            {show.worker && (
              <ModuleTile
                key="worker"
                // Its own tab (a phone-style app, apart from the office pages); a fresh ?v= so it is never a cached copy.
                onClick={() => window.open(`${window.location.pathname}?v=${Date.now()}#/app`, '_blank')}
                label="Worker CMMS"
                Icon={WorkerIcon}
              />
            )}
          </TileGrid>
        </Group>
      )}
      {hq && (
        <Group title="HQ Admin">
          <TileGrid orderKey="home-hq">
            {show.renewal && (
              <ModuleTile
                key="renewal"
                onClick={() => open({ key: 'renewal', label: 'Machinery\nRenewal', Icon: RenewalIcon, path: '/renewal' })}
                label={'Machinery\nRenewal'}
                Icon={RenewalIcon}
              />
            )}
            {userAccess && (
              <ModuleTile
                key="users"
                onClick={() => open({ key: 'users', label: 'User Access', Icon: UserAccessIcon, path: '/settings/users' })}
                label="User Access"
                Icon={UserAccessIcon}
              />
            )}
          </TileGrid>
        </Group>
      )}
    </div>
  )
}

// A category box on the main page: its name on top, the module icons inside.
function Group({ title, children }) {
  return (
    <section className="rounded-3xl border border-white/80 bg-white/55 px-4 pb-4 pt-3 shadow-sm backdrop-blur-sm sm:px-6 sm:pb-5">
      <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-slate-500">{title}</h2>
      {children}
    </section>
  )
}
