import { useCallback, useEffect, useState } from 'react'
import PageHeader from '../../components/PageHeader.jsx'
import { Badge, Button, Card, Spinner, TextInput } from '../../components/ui.jsx'
import { IconPlus, IconTrash } from '../../components/icons.jsx'
import {
  PERMISSIONS,
  addPortalUser,
  listMembers,
  listPortalUsers,
  removePortalUser,
  setMember,
  useCmmsAccess
} from '../../lib/cmms.js'
import { useAuth } from '../../auth/AuthContext.jsx'
import { useCompany } from '../../lib/CompanyContext.jsx'

// Who may do what in CMMS 2 for the selected company. Super admins set it;
// other users see their own access.
export default function CmmsUsers() {
  const { isSuperAdmin, user } = useAuth()
  const { current } = useCompany()
  const mine = useCmmsAccess(current?.id)

  return (
    <div className="space-y-4">
      <PageHeader
        backTo="/cmms"
        backLabel="Back to CMMS 2"
        title={current?.name}
        subtitle="CMMS 2 user access for this company"
      />
      {isSuperAdmin ? (
        <AccessTable companyId={current?.id} me={user?.id} />
      ) : (
        <Card className="max-w-xl p-5">
          <p className="font-semibold text-slate-800">Your access</p>
          <ul className="mt-3 space-y-2 text-sm">
            {PERMISSIONS.map((p) => (
              <li key={p.key} className="flex items-center justify-between gap-3">
                <span>
                  <span className="font-medium text-slate-800">{p.label}</span>
                  <span className="block text-xs text-slate-500">{p.hint}</span>
                </span>
                <Badge color={mine[p.key] ? 'green' : 'slate'}>{mine[p.key] ? 'Yes' : 'No'}</Badge>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-slate-500">Ask a super admin to change your access.</p>
        </Card>
      )}
    </div>
  )
}

function AccessTable({ companyId, me }) {
  const [users, setUsers] = useState([])
  const [members, setMembers] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!companyId) return
    try {
      const [u, m] = await Promise.all([listPortalUsers(), listMembers(companyId)])
      setUsers(u)
      setMembers(Object.fromEntries(m.map((x) => [x.user_id, x])))
      setError('')
    } catch (e) {
      setError(e.message || 'Could not load users.')
    } finally {
      setLoading(false)
    }
  }, [companyId])

  useEffect(() => {
    setLoading(true)
    load()
  }, [load])

  async function run(fn) {
    setBusy(true)
    setError('')
    try {
      await fn()
      await load()
      return true
    } catch (e) {
      setError(e.message || 'Could not save.')
      return false
    } finally {
      setBusy(false)
    }
  }

  const permsOf = (u) => {
    const m = members[u.user_id]
    return Object.fromEntries(PERMISSIONS.map((p) => [p.key, Boolean(m?.[p.key])]))
  }

  return (
    <>
      {error && <p className="rounded-xl bg-red-100 p-3 text-sm text-red-700">{error}</p>}
      <Card className="overflow-hidden">
        <form
          onSubmit={async (e) => {
            e.preventDefault()
            if (email.trim() && (await run(() => addPortalUser(email)))) setEmail('')
          }}
          className="flex flex-col gap-3 border-b border-slate-200 bg-brand-light/30 px-5 py-4 sm:flex-row sm:items-end"
        >
          <label className="flex-1">
            <span className="mb-1 block text-sm font-medium text-slate-700">Add a user by login e-mail</span>
            <TextInput
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.com (must already have a login)"
            />
          </label>
          <Button type="submit" disabled={busy || !email.trim()}>
            <IconPlus width={18} height={18} /> Add user
          </Button>
        </form>

        {loading ? (
          <div className="flex justify-center py-12 text-brand">
            <Spinner className="h-7 w-7" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-5 py-2.5">User</th>
                  {PERMISSIONS.map((p) => (
                    <th key={p.key} className="px-3 py-2.5 text-center" title={p.hint}>
                      {p.label}
                    </th>
                  ))}
                  <th className="w-14 px-3 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((u) => {
                  const perms = permsOf(u)
                  return (
                    <tr key={u.user_id}>
                      <td className="px-5 py-3">
                        <span className="font-medium text-slate-800">{u.email || u.user_id}</span>
                        {u.is_super_admin && (
                          <Badge color="blue" className="ml-2">
                            Super admin
                          </Badge>
                        )}
                      </td>
                      {PERMISSIONS.map((p) => (
                        <td key={p.key} className="px-3 py-3 text-center">
                          {u.is_super_admin ? (
                            <span className="text-xs font-medium text-slate-400">All</span>
                          ) : (
                            <input
                              type="checkbox"
                              className="h-5 w-5 cursor-pointer accent-[#2563eb]"
                              checked={perms[p.key]}
                              disabled={busy}
                              onChange={() =>
                                run(() => setMember(companyId, u.user_id, { ...perms, [p.key]: !perms[p.key] }))
                              }
                              aria-label={`${p.label} for ${u.email}`}
                            />
                          )}
                        </td>
                      ))}
                      <td className="px-3 py-3 text-right">
                        {u.user_id !== me && !u.is_super_admin && (
                          <button
                            disabled={busy}
                            onClick={() =>
                              window.confirm(`Remove ${u.email} from the portal?`) &&
                              run(() => removePortalUser(u.user_id))
                            }
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"
                            aria-label={`Remove ${u.email}`}
                          >
                            <IconTrash width={17} height={17} />
                          </button>
                        )}
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
        Access is per company: switch company (top left) to set it for another company. New logins are created in
        Supabase → Authentication → Users, then added here.
      </p>
    </>
  )
}
