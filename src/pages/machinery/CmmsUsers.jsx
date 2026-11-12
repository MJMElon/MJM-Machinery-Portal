import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import PageHeader from '../../components/PageHeader.jsx'
import { Badge, Card, Spinner } from '../../components/ui.jsx'
import { IconEye, IconPencil } from '../../components/icons.jsx'
import { listPortalUsers } from '../../lib/cmms.js'
import { listCompanyPerms } from '../../lib/perms.js'
import { useAuth } from '../../auth/AuthContext.jsx'
import { useCompany } from '../../lib/CompanyContext.jsx'

// CMMS 2 user access (main page → User Access): everyone given the CMMS 2 or
// Fuel Claims icon in MJM Intranet, or a role in the selected company.
// View / Edit open the per-user screen (module → pages → options, approvers).
// Super admins manage it; everyone else sees their own access.
export default function CmmsUsers() {
  const { isSuperAdmin, user } = useAuth()
  const { current } = useCompany()
  const [users, setUsers] = useState([])
  const [perms, setPerms] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!current) return
    try {
      const [u, p] = await Promise.all([isSuperAdmin ? listPortalUsers() : [], listCompanyPerms(current.id)])
      setUsers(u)
      setPerms(Object.fromEntries(p.map((x) => [x.user_id, x.perms])))
      setError('')
    } catch (e) {
      setError(e.message || 'Could not load users.')
    } finally {
      setLoading(false)
    }
  }, [current, isSuperAdmin])

  useEffect(() => {
    setLoading(true)
    load()
  }, [load])

  if (!isSuperAdmin) {
    return (
      <div className="space-y-4">
        <PageHeader backTo="/" backLabel="Back to CMMS main page" title="CMMS 2 user access" />
        <Card className="max-w-xl p-5">
          <p className="text-sm text-slate-600">
            Your access in <span className="font-semibold">{current?.name}</span> is set by a super admin.
          </p>
          <Link to={`/settings/users/${user.id}`} className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-brand hover:underline">
            <IconEye width={16} height={16} /> View my role
          </Link>
        </Card>
      </div>
    )
  }

  // Everyone given CMMS 2 / Fuel Claims access in MJM Intranet, or with a role here.
  const rows = users.filter((u) => u.is_super_admin || u.intranet_cmms || u.intranet_fuel || Object.keys(perms[u.user_id] || {}).length)

  return (
    <div className="space-y-4">
      <PageHeader backTo="/" backLabel="Back to CMMS main page" title="CMMS 2 user access" />
      {error && <p className="rounded-xl bg-red-100 p-3 text-sm text-red-700">{error}</p>}

      <Card className="overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12 text-brand">
            <Spinner className="h-7 w-7" />
          </div>
        ) : rows.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-slate-400">Nobody yet. Give people the CMMS 2 or Fuel Claims icon in MJM Intranet; they appear here after they sign in or after Sync.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-5 py-2.5">User name</th>
                <th className="px-3 py-2.5">User email</th>
                <th className="w-32 px-3 py-2.5 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((u) => (
                <tr key={u.user_id} className="hover:bg-slate-50/60">
                  <td className="px-5 py-3">
                    <span className="font-medium text-slate-800">{u.full_name || '—'}</span>
                    {u.is_super_admin && (
                      <Badge color="blue" className="ml-2">
                        Super admin
                      </Badge>
                    )}
                  </td>
                  <td className="px-3 py-3 text-slate-600">{u.email}</td>
                  <td className="px-3 py-3">
                    <div className="flex items-center justify-center gap-0.5">
                      <Link to={`/settings/users/${u.user_id}?view=1`} className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-brand" title="View" aria-label="View">
                        <IconEye width={18} height={18} />
                      </Link>
                      {!u.is_super_admin ? (
                        <Link to={`/settings/users/${u.user_id}`} className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-brand" title="Edit" aria-label="Edit">
                          <IconPencil width={18} height={18} />
                        </Link>
                      ) : (
                        <span className="h-9 w-9" />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}

