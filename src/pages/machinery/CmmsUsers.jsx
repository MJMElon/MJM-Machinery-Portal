import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import PageHeader from '../../components/PageHeader.jsx'
import { Badge, Button, Card, Spinner, TextInput } from '../../components/ui.jsx'
import { IconEye, IconPencil, IconPlus, IconTrash } from '../../components/icons.jsx'
import { addPortalUser, listPortalUsers, removePortalUser, setUserName, userLabel } from '../../lib/cmms.js'
import { MODULES, listCompanyPerms, removePerms, summarize } from '../../lib/perms.js'
import { useAuth } from '../../auth/AuthContext.jsx'
import { useCompany } from '../../lib/CompanyContext.jsx'

// User setting (CMMS main page → Settings): the people who have access to the selected company, with
// a short summary of their modules. Edit opens the per-user access screen
// (module → section → view / add / edit / delete + special actions).
// Super admins manage it; everyone else sees their own access (View).
export default function CmmsUsers() {
  const { isSuperAdmin, user } = useAuth()
  const { current } = useCompany()
  const navigate = useNavigate()
  const [users, setUsers] = useState([])
  const [perms, setPerms] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [showAll, setShowAll] = useState(false)

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

  async function run(fn) {
    setBusy(true)
    setError('')
    try {
      const r = await fn()
      await load()
      return r ?? true
    } catch (e) {
      setError(e.message || 'Could not save.')
      return false
    } finally {
      setBusy(false)
    }
  }

  if (!isSuperAdmin) {
    return (
      <div className="space-y-4">
        <PageHeader backTo="/settings" backLabel="Back to Settings" title="User setting" subtitle={`${current?.name || ''} · your access`} />
        <Card className="max-w-xl p-5">
          <p className="text-sm text-slate-600">
            Your access in <span className="font-semibold">{current?.name}</span> is set by a super admin.
          </p>
          <Link to={`/settings/users/${user.id}`} className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-brand hover:underline">
            <IconEye width={16} height={16} /> View my access
          </Link>
        </Card>
      </div>
    )
  }

  const withAccess = users.filter((u) => u.is_super_admin || Object.keys(perms[u.user_id] || {}).length)
  const rows = showAll ? users : withAccess

  return (
    <div className="space-y-4">
      <PageHeader
        backTo="/settings"
        backLabel="Back to Settings"
        title="User setting"
        subtitle={`${current?.name || ''} · ${withAccess.length} user${withAccess.length === 1 ? '' : 's'} with access`}
        right={
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" className="h-4 w-4 accent-[#2563eb]" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
            Show every portal user
          </label>
        }
      />
      {error && <p className="rounded-xl bg-red-100 p-3 text-sm text-red-700">{error}</p>}

      <Card className="overflow-hidden">
        <form
          onSubmit={async (e) => {
            e.preventDefault()
            if (!email.trim()) return
            const ok = await run(() => addPortalUser(email))
            if (ok) {
              setEmail('')
              const u = (await listPortalUsers()).find((x) => (x.email || '').toLowerCase() === email.trim().toLowerCase())
              if (u) navigate(`/settings/users/${u.user_id}`)
            }
          }}
          className="flex flex-col gap-3 border-b border-slate-200 bg-brand-light/30 px-5 py-4 sm:flex-row sm:items-end"
        >
          <label className="flex-1">
            <span className="mb-1 block text-sm font-medium text-slate-700">Give access to a user (login e-mail)</span>
            <TextInput
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.com (an MJM Intranet login)"
            />
          </label>
          <Button type="submit" disabled={busy || !email.trim()}>
            <IconPlus width={18} height={18} /> Add & set access
          </Button>
        </form>

        {loading ? (
          <div className="flex justify-center py-12 text-brand">
            <Spinner className="h-7 w-7" />
          </div>
        ) : rows.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-slate-400">
            Nobody has access to {current?.name} yet. Add a user above, or tick “Show every portal user”.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-5 py-2.5">User</th>
                  <th className="px-3 py-2.5">Name</th>
                  <th className="px-3 py-2.5">Access</th>
                  <th className="w-40 px-3 py-2.5 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((u) => {
                  const p = perms[u.user_id] || {}
                  const summary = summarize(p)
                  return (
                    <tr key={u.user_id} className="hover:bg-slate-50/60">
                      <td className="px-5 py-3">
                        <span className="font-medium text-slate-800">{u.email || u.user_id}</span>
                        {u.is_super_admin && (
                          <Badge color="blue" className="ml-2">
                            Super admin
                          </Badge>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <NameCell user={u} disabled={busy} onSave={(name) => run(() => setUserName(u.user_id, name))} />
                      </td>
                      <td className="px-3 py-3 text-slate-600">
                        {u.is_super_admin ? (
                          <span className="text-slate-400">Everything</span>
                        ) : summary ? (
                          <div className="flex flex-wrap gap-1">
                            {MODULES.map((m) => {
                              const n = m.sections.filter((s) => (p[s.key] || []).length > 0)
                              return n.length ? (
                                <Badge key={m.key} color={m.key === 'fuel' ? 'green' : 'amber'}>
                                  {m.label}: {n.map((s) => s.label).join(', ')}
                                </Badge>
                              ) : null
                            })}
                          </div>
                        ) : (
                          <span className="text-slate-400">No access to this company</span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center justify-center gap-0.5">
                          <Link
                            to={`/settings/users/${u.user_id}`}
                            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-brand"
                            title={u.is_super_admin ? 'View' : 'Edit access'}
                          >
                            {u.is_super_admin ? <IconEye width={18} height={18} /> : <IconPencil width={18} height={18} />}
                          </Link>
                          {!u.is_super_admin && summary && (
                            <button
                              disabled={busy}
                              onClick={() =>
                                window.confirm(`Remove all access of ${u.email} to ${current.name}?`) &&
                                run(() => removePerms(current.id, u.user_id))
                              }
                              className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"
                              title="Remove access to this company"
                            >
                              <IconTrash width={18} height={18} />
                            </button>
                          )}
                          {u.user_id !== user.id && !u.is_super_admin && showAll && !summary && (
                            <button
                              disabled={busy}
                              onClick={() =>
                                window.confirm(`Remove ${u.email} from the portal entirely?`) && run(() => removePortalUser(u.user_id))
                              }
                              className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"
                              title="Remove from the portal"
                            >
                              <IconTrash width={18} height={18} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <p className="text-xs text-slate-500">
        Access is per company: switch company (top left) to set it for another company. People arriving from MJM Intranet
        are added to the portal automatically; give them access here. The name is shown in Fuel Manage lists and reports.
      </p>
    </div>
  )
}

// Display name, saved when you leave the field (Enter also saves).
function NameCell({ user, disabled, onSave }) {
  const [value, setValue] = useState(user.full_name || '')
  useEffect(() => setValue(user.full_name || ''), [user.full_name])
  const dirty = value.trim() !== (user.full_name || '')
  return (
    <TextInput
      value={value}
      disabled={disabled}
      placeholder="Full name"
      aria-label={`Name of ${user.email}`}
      className="h-10 min-w-[160px] rounded-lg border-transparent bg-transparent px-2 hover:border-slate-200 focus:bg-white"
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => dirty && onSave(value)}
      onKeyDown={(e) => e.key === 'Enter' && dirty && e.currentTarget.blur()}
    />
  )
}
