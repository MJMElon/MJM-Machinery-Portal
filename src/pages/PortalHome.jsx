import { Link } from 'react-router-dom'
import { ModuleTile, TileGrid } from '../components/ModuleTile.jsx'
import { DieselIcon, MachineryIcon, RenewalIcon, SettingsIcon } from '../components/AppIcons.jsx'
import { Card, Spinner } from '../components/ui.jsx'
import { useAuth } from '../auth/AuthContext.jsx'
import { useCompany } from '../lib/CompanyContext.jsx'
import { useWindows } from '../components/Windows.jsx'
import { EMBEDDED } from '../components/Shell.jsx'

// Portal main page: the selected company (top-right switcher) and its modules.
export default function PortalHome() {
  const { isSuperAdmin } = useAuth()
  const { current, loaded, error } = useCompany()
  const { open } = useWindows()
  if (EMBEDDED) return <p className="p-6 text-center text-sm text-slate-500">This is the CMMS 2 main page. Close this window to go back to it.</p>

  if (!loaded)
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
              ? 'Companies come from MJM Intranet. Open Settings and press “Sync from MJM Intranet”.'
              : 'Ask a super admin to sync the companies from MJM Intranet and give you access.')}
        </p>
        {isSuperAdmin && (
          <Link
            to="/settings"
            className="mt-5 inline-flex h-11 items-center rounded-xl bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-dark"
          >
            Open Settings
          </Link>
        )}
      </Card>
    )

  return (
    <div className="pt-4 sm:pt-10">
      <TileGrid orderKey="home">
        <ModuleTile
          key="cmms"
          to="/cmms"
          label="Machinery Manage"
          Icon={MachineryIcon}
          disabled={!current.cmms_enabled}
          note={current.cmms_enabled ? null : 'Not enabled'}
        />
        <ModuleTile
          key="diesel"
          to="/diesel"
          label="Fuel Manage"
          Icon={DieselIcon}
          disabled={!current.diesel_enabled}
          note={current.diesel_enabled ? null : 'Not enabled'}
        />
        <ModuleTile
          key="renewal"
          onClick={current.cmms_enabled ? () => open({ key: 'renewal', label: 'Machinery\nRenewal', Icon: RenewalIcon, path: '/renewal' }) : undefined}
          label={'Machinery\nRenewal'}
          Icon={RenewalIcon}
          disabled={!current.cmms_enabled}
          note={current.cmms_enabled ? null : 'Not enabled'}
        />
        <ModuleTile key="settings" onClick={() => open({ key: 'settings', label: 'Settings', Icon: SettingsIcon, path: '/settings' })} label="Settings" Icon={SettingsIcon} />
      </TileGrid>
    </div>
  )
}
