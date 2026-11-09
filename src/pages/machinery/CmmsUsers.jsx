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
  setUserName,
  useCmmsAccess
} from '../../lib/cmms.js'
import { useAuth } from '../../auth/AuthContext.jsx'
import { useCompany } from '../../lib/CompanyContext.jsx'
import { listPeople as listDieselPeople, removeMember as removeDieselMember, setMember as setDieselMember } from '../../lib/diesel.js'

// Fuel Manage access, per company (Access = may open Fuel Manage;
// Cash Claim / Report = its modules; Admin = vehicles review, cards, everything).
const DIESEL_COLS = [
  { key: 'has_access', label: 'Access', hint: 'May open Fuel Manage' },
  { key: 'can_claim', label: 'Cash Claim', hint: 'Submit own fuel claims (Fuel Claims)' },
  { key: 'can_report', label: 'Report', hint: 'All claims, Fuel Usage, Fleet Card Manage, Report (view)' },
  { key: 'is_admin', label: 'Admin', hint: 'Review claims, record reloads / fill-ups, manage cards' }
]

// Who may do what in CMMS 2 for the selected company. Super admins set it;
// other users see their own access.
export default function CmmsUsers() {
  const { isSuperAdmin, user } = useAuth()
  const { current } = useCompany()
  const mine = useCmmsAccess(current?.id)

  return (
    <div className="space-y-4">
      <PageHeader title="CMMS User Setting" subtitle={`${current?.name || ''} · who can do what in Machinery Manage and Fuel Manage`} />
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
  const [diesel, setDiesel] = useState({})
  const [dieselReady, setDieselReady] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!companyId) return
    try {
      const [u, m, d] = await Promise.all([
        listPortalUsers(),
        listMembers(companyId),
        listDieselPeople(companyId).catch(() => null) // null = diesel migration not run yet
      ])
      setUsers(u)
      setMembers(Object.fromEntries(m.map((x) => [x.user_id, x])))
      setDieselReady(d !== null)
      setDiesel(Object.fromEntries((d || []).map((x) => [x.user_id, x])))
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

  // Diesel columns: Access adds/removes the member row; the others flip one flag.
  const toggleDiesel = (u, key) => {
    const d = diesel[u.user_id] || { has_access: false, is_admin: false, can_claim: false, can_report: false }
    return run(async () => {
      if (key === 'has_access') {
        if (d.has_access) await removeDieselMember(companyId, u.user_id)
        else await setDieselMember(companyId, u.user_id, { is_admin: false, can_claim: false, can_report: false })
      } else {
        await setDieselMember(companyId, u.user_id, { is_admin: d.is_admin, can_claim: d.can_claim, can_report: d.can_report, [key]: !d[key] })
      }
    })
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
            <table className="w-full min-w-[1180px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-left text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  <th className="px-5 pt-2.5" colSpan={2} />
                  <th className="px-3 pt-2.5 text-center" colSpan={PERMISSIONS.length}>
                    Machinery Manage
                  </th>
                  <th className="border-l border-slate-200 px-3 pt-2.5 text-center" colSpan={DIESEL_COLS.length}>
                    Fuel Manage
                  </th>
                  <th />
                </tr>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-5 py-2.5">User</th>
                  <th className="px-3 py-2.5">Name</th>
                  {PERMISSIONS.map((p) => (
                    <th key={p.key} className="px-3 py-2.5 text-center" title={p.hint}>
                      {p.label}
                    </th>
                  ))}
                  {DIESEL_COLS.map((c, i) => (
                    <th key={c.key} className={`px-3 py-2.5 text-center ${i === 0 ? 'border-l border-slate-200' : ''}`} title={c.hint}>
                      {c.label}
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
                      <td className="px-3 py-2">
                        <NameCell user={u} disabled={busy} onSave={(name) => run(() => setUserName(u.user_id, name))} />
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
                      {DIESEL_COLS.map((c, i) => {
                        const d = diesel[u.user_id]
                        const on = Boolean(d?.[c.key])
                        const locked = c.key !== 'has_access' && (!d?.has_access || (c.key !== 'is_admin' && d?.is_admin))
                        return (
                          <td key={c.key} className={`px-3 py-3 text-center ${i === 0 ? 'border-l border-slate-200' : ''}`}>
                            {u.is_super_admin ? (
                              <span className="text-xs font-medium text-slate-400">All</span>
                            ) : !dieselReady ? (
                              <span className="text-xs text-slate-300">—</span>
                            ) : (
                              <input
                                type="checkbox"
                                className="h-5 w-5 cursor-pointer accent-[#059669] disabled:cursor-not-allowed disabled:opacity-40"
                                checked={on}
                                disabled={busy || locked}
                                onChange={() => toggleDiesel(u, c.key)}
                                aria-label={`Fuel ${c.label} for ${u.email}`}
                                title={
                                  !d?.has_access && c.key !== 'has_access'
                                    ? 'Tick Access first'
                                    : d?.is_admin && c.key !== 'has_access' && c.key !== 'is_admin'
                                      ? 'Admins have every module'
                                      : c.hint
                                }
                              />
                            )}
                          </td>
                        )
                      })}
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
        Access is per company: switch company (top left) to set it for another company. People arriving from MJM
        Intranet are added here automatically; the name is shown in Fuel Manage lists and reports. Fuel: tick Access
        first, then Cash Claim and/or Report; Admin covers everything (review claims, cards, reloads, fill-ups).
      </p>
    </>
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
