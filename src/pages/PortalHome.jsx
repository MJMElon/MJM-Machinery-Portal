import { Link } from 'react-router-dom'
import { ModuleTile, TileGrid } from '../components/ModuleTile.jsx'
import { CmmsScene, SettingsIcon } from '../components/AppIcons.jsx'
import { Card, Spinner } from '../components/ui.jsx'
import { useAuth } from '../auth/AuthContext.jsx'
import { useCompany } from '../lib/CompanyContext.jsx'

// Portal main page: the selected company (top-right switcher) and its modules.
export default function PortalHome() {
  const { isSuperAdmin } = useAuth()
  const { current, loaded, error } = useCompany()

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
              ? 'Create your first company to start using the modules.'
              : 'Ask a super admin to create your company and give you access.')}
        </p>
        {isSuperAdmin && (
          <Link
            to="/admin/companies"
            className="mt-5 inline-flex h-11 items-center rounded-xl bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-dark"
          >
            Create a company
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
          label="CMMS 2"
          Art={CmmsScene}
          disabled={!current.cmms_enabled}
          note={current.cmms_enabled ? null : 'Not enabled'}
        />
        <ModuleTile key="settings" to="/settings" label="Settings" Icon={SettingsIcon} />
      </TileGrid>
    </div>
  )
}
