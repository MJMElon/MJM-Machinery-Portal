import { useCallback, useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Badge, Card } from '../../components/ui.jsx'
import { IconX } from '../../components/icons.jsx'
import { Empty, ErrorBox, Loading, inputCls } from '../../components/diesel/shared.jsx'
import { listPortalPeople, userLabel } from '../../lib/cmms.js'
import { FUEL_ROLES, adminModules, approveFor, fuelRole, has, listCompanyPerms, savePerms, withFuelRole } from '../../lib/perms.js'
import { useAuth } from '../../auth/AuthContext.jsx'

// Fuel Manage → Claim approval setting. For every person of the company:
//   Role        Normal user (own claims) or Accountant (sees every claim and
//               marks approved claims paid)
//   Approved by the people who review and approve this person's claims; an
//               approver sees the claims of the people named here.
// Same data as Settings → Role setup (perms.claims, perms.approve_for), seen
// from the claimant's side.
export default function DieselUsers() {
  const { company, access } = useOutletContext()
  const { isSuperAdmin } = useAuth()
  const [people, setPeople] = useState([])
  const [perms, setPerms] = useState({}) // user_id → perms
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [q, setQ] = useState('')

  const load = useCallback(async () => {
    try {
      const [pp, rows] = await Promise.all([listPortalPeople(), listCompanyPerms(company.id)])
      const byUser = Object.fromEntries(rows.map((r) => [r.user_id, r.perms || {}]))
      setPerms(byUser)
      // People of this company: Fuel icon in the Intranet, or any role here, or named as an approver / claimant
      const named = new Set(rows.flatMap((r) => approveFor(r.perms)))
      setPeople(pp.filter((p) => p.is_super_admin || p.intranet_fuel || Object.keys(byUser[p.user_id] || {}).length || named.has(p.user_id)))
      setError('')
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [company.id])

  useEffect(() => {
    load()
  }, [load])

  // approvers of a claimant = everyone whose approve_for names them
  const approversOf = (uid) =>
    people.filter((a) => a.user_id !== uid && has(perms[a.user_id], 'claims', 'approve') && approveFor(perms[a.user_id]).includes(uid))
  const approvesCount = (uid) => (has(perms[uid], 'claims', 'approve') ? approveFor(perms[uid]).length : 0)
  // Super admins and Fuel Manage admins change this; a module admin's save only touches Fuel Manage rights.
  const canEdit = isSuperAdmin || access.fuelAdmin
  const saveOpts = isSuperAdmin ? {} : { modules: ['fuel'] }

  async function save(uid, next, key) {
    setBusy(key)
    setError('')
    try {
      await savePerms(company.id, uid, next, saveOpts)
      setPerms((p) => ({ ...p, [uid]: next }))
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy('')
    }
  }

  function changeApprover(approverId, claimantId, add) {
    const cur = perms[approverId] || {}
    const claims = new Set(cur.claims || [])
    const list = new Set(has(cur, 'claims', 'approve') ? approveFor(cur) : [])
    if (add) list.add(claimantId)
    else list.delete(claimantId)
    // Approves only the people named; with nobody left the approve right goes too
    // (an empty list would mean "approves everyone").
    if (list.size) {
      claims.add('view')
      claims.add('approve')
    } else claims.delete('approve')
    save(approverId, { ...cur, claims: [...claims], approve_for: [...list] }, `${approverId}:${claimantId}`)
  }

  const changeRole = (uid, role) => save(uid, withFuelRole(perms[uid] || {}, role), `role:${uid}`)
  const isFuelAdmin = (uid) => adminModules(perms[uid]).includes('fuel')
  const setFuelAdmin = (uid, on) => {
    const cur = perms[uid] || {}
    const list = new Set(adminModules(cur))
    on ? list.add('fuel') : list.delete('fuel')
    save(uid, { ...cur, admin: [...list] }, `admin:${uid}`)
  }

  const t = q.trim().toLowerCase()
  const shown = people.filter(
    (p) =>
      !t ||
      [p.full_name, p.email].some((v) =>
        String(v || '')
          .toLowerCase()
          .includes(t),
      ),
  )

  return (
    <div className="space-y-4">
      <ErrorBox>{error}</ErrorBox>
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
          <h3 className="font-semibold text-slate-800">Users</h3>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name…" className={`${inputCls} h-10 sm:w-72`} />
        </div>
        {loading ? (
          <Loading />
        ) : shown.length === 0 ? (
          <Empty>No users yet. Users come from the MJM Intranet (User Access → Sync from MJM Intranet).</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="w-72 px-5 py-2.5">User</th>
                  <th className="w-48 px-3 py-2.5">Role</th>
                  <th className="w-24 px-3 py-2.5 text-center">Admin</th>
                  <th className="px-3 py-2.5">Claims approved by</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {shown.map((p) => {
                  const approvers = approversOf(p.user_id)
                  const options = people.filter((a) => a.user_id !== p.user_id && !approvers.some((x) => x.user_id === a.user_id))
                  const role = fuelRole(perms[p.user_id])
                  const n = approvesCount(p.user_id)
                  return (
                    <tr key={p.user_id} className="align-top">
                      <td className="px-5 py-3">
                        <p className="font-medium text-slate-800">{userLabel(p)}</p>
                        <p className="text-xs text-slate-500">{p.email}</p>
                        {n > 0 && (
                          <Badge color="green" className="mt-1">
                            Approver for {n} {n === 1 ? 'person' : 'people'}
                          </Badge>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        {p.is_super_admin ? (
                          <Badge>Super admin</Badge>
                        ) : canEdit ? (
                          <span className="block w-44">
                            <select
                              value={role}
                              disabled={busy === `role:${p.user_id}`}
                              onChange={(e) => changeRole(p.user_id, e.target.value)}
                              className={`${inputCls} h-9 px-2 ${role === 'accountant' ? 'font-semibold text-brand-dark' : ''}`}
                            >
                              {FUEL_ROLES.map(([k, label]) => (
                                <option key={k} value={k}>
                                  {label}
                                </option>
                              ))}
                            </select>
                          </span>
                        ) : (
                          <Badge color={role === 'accountant' ? 'blue' : 'slate'}>{FUEL_ROLES.find(([k]) => k === role)[1]}</Badge>
                        )}
                      </td>
                      <td className="px-3 py-3 text-center">
                        {p.is_super_admin ? (
                          <span className="text-xs text-slate-400">—</span>
                        ) : (
                          <input
                            type="checkbox"
                            checked={isFuelAdmin(p.user_id)}
                            disabled={!canEdit || busy === `admin:${p.user_id}`}
                            onChange={(e) => setFuelAdmin(p.user_id, e.target.checked)}
                            className="mt-2 h-5 w-5 rounded border-slate-300 accent-[#2563eb] disabled:opacity-60"
                            title="Fuel Manage admin: can change this page and the Fuel Manage part of User Access"
                            aria-label={`Fuel Manage admin: ${userLabel(p)}`}
                          />
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {approvers.length === 0 && <span className="text-sm text-slate-400">No approver yet</span>}
                          {approvers.map((a) => (
                            <span
                              key={a.user_id}
                              className="inline-flex h-8 items-center gap-1 rounded-full bg-brand-light pl-3 pr-1.5 text-sm font-medium text-brand-dark"
                            >
                              {userLabel(a)}
                              {canEdit && (
                                <button
                                  type="button"
                                  disabled={busy === `${a.user_id}:${p.user_id}`}
                                  onClick={() => changeApprover(a.user_id, p.user_id, false)}
                                  className="rounded-full p-0.5 hover:bg-white/60"
                                  aria-label={`Remove ${userLabel(a)}`}
                                >
                                  <IconX width={14} height={14} />
                                </button>
                              )}
                            </span>
                          ))}
                          {canEdit && options.length > 0 && (
                            <span className="w-52 shrink-0">
                              <select
                                value=""
                                onChange={(e) => e.target.value && changeApprover(e.target.value, p.user_id, true)}
                                disabled={busy.endsWith(`:${p.user_id}`)}
                                className={`${inputCls} h-8 px-2 text-xs`}
                              >
                                <option value="">+ Add approver…</option>
                                {options.map((a) => (
                                  <option key={a.user_id} value={a.user_id}>
                                    {userLabel(a)}
                                  </option>
                                ))}
                              </select>
                            </span>
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
      {!canEdit && <p className="text-xs text-slate-500">Only super admins and Fuel Manage admins can change this.</p>}
    </div>
  )
}
