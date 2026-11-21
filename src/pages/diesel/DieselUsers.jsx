import { useCallback, useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Badge, Button, Card } from '../../components/ui.jsx'
import { IconX } from '../../components/icons.jsx'
import { Empty, ErrorBox, Loading, inputCls } from '../../components/diesel/shared.jsx'
import { EMBEDDED } from '../../components/Shell.jsx'
import { listPortalPeople, userLabel } from '../../lib/cmms.js'
import { FUEL_ROLES, approveFor, fuelRole, has, listCompanyPerms, savePerms, topupApproveFor, withFuelRole } from '../../lib/perms.js'
import { useAuth } from '../../auth/AuthContext.jsx'

// Fuel Manage → Approval setting. For every person of the company:
//   Role                 Normal user / Accountant / Claim approver / Procurement,
//                        with what the role allows written beside it
//   Claims approved by   who approves this person's claims (chosen from the
//                        people whose role is Claim approver)
//   Top-up requests      who approves this person's fleet card top-up requests
//   approved by          (also chosen from the Claim approvers)
// Changes stay on the page until Update (Cancel throws them away). The bar
// with the search, Cancel and Update stays on top while scrolling. Module
// admins are set in CMMS 2 user access, not here.
export default function DieselUsers() {
  const { company, access } = useOutletContext()
  const { isSuperAdmin } = useAuth()
  const [people, setPeople] = useState([])
  const [saved, setSaved] = useState({}) // user_id → perms in the database
  const [perms, setPerms] = useState({}) // user_id → perms on the page (with unsaved changes)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')

  const load = useCallback(async () => {
    try {
      const [pp, rows] = await Promise.all([listPortalPeople(), listCompanyPerms(company.id)])
      const byUser = Object.fromEntries(rows.map((r) => [r.user_id, r.perms || {}]))
      setSaved(byUser)
      setPerms(byUser)
      // People of this company: Fuel icon in the Intranet, or any role here, or named as an approver
      const named = new Set(rows.flatMap((r) => [...approveFor(r.perms), ...topupApproveFor(r.perms)]))
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

  const approves = (uid) => (has(perms[uid], 'claims', 'approve') ? approveFor(perms[uid]) : [])
  const approvesTopup = (uid) => (has(perms[uid], 'topup', 'approve') ? topupApproveFor(perms[uid]) : [])
  const approversOf = (uid) => people.filter((a) => a.user_id !== uid && approves(a.user_id).includes(uid))
  const topupApproversOf = (uid) => people.filter((a) => a.user_id !== uid && approvesTopup(a.user_id).includes(uid))
  // Who can be chosen as an approver: the Claim approvers (and super admins)
  const isApprover = (p) => p.is_super_admin || fuelRole(perms[p.user_id]) === 'approver'
  // Super admins and Fuel Manage admins change this; a module admin's update only touches Fuel Manage rights.
  const canEdit = isSuperAdmin || access.fuelAdmin

  const changed = (uid) => JSON.stringify(perms[uid] || {}) !== JSON.stringify(saved[uid] || {})
  const changedIds = [...new Set([...Object.keys(perms), ...Object.keys(saved)])].filter(changed)
  const dirty = changedIds.length > 0

  const edit = (uid, next) => {
    setPerms((p) => ({ ...p, [uid]: next }))
  }

  // Claims: approver's perms.claims 'approve' + approve_for = [people]
  function changeApprover(approverId, claimantId, add) {
    const cur = perms[approverId] || {}
    const claims = new Set(cur.claims || [])
    const list = new Set(approves(approverId))
    if (add) list.add(claimantId)
    else list.delete(claimantId)
    // Approves only the people named; with nobody left the approve right goes too
    // (an empty list would mean "approves everyone").
    if (list.size) {
      claims.add('view')
      claims.add('approve')
    } else claims.delete('approve')
    const next = { ...cur, claims: [...claims], approve_for: [...list] }
    if (!list.size) delete next.approve_for
    edit(approverId, next)
  }
  // Top-up requests: perms.topup 'approve' + topup_approve_for; also Fleet Card Manage (view)
  function changeTopupApprover(approverId, requesterId, add) {
    const cur = perms[approverId] || {}
    const topup = new Set(cur.topup || [])
    const list = new Set(approvesTopup(approverId))
    if (add) list.add(requesterId)
    else list.delete(requesterId)
    const next = { ...cur }
    if (list.size) {
      topup.add('approve')
      next.cards = [...new Set([...(cur.cards || []), 'view'])]
      next.topup_approve_for = [...list]
    } else {
      topup.delete('approve')
      delete next.topup_approve_for
    }
    next.topup = [...topup]
    if (!next.topup.length) delete next.topup
    edit(approverId, next)
  }
  function changeRole(p, role) {
    const uid = p.user_id
    const n = approves(uid).length + approvesTopup(uid).length
    if (fuelRole(perms[uid]) === 'approver' && role !== 'approver' && n > 0) {
      const ok = window.confirm(`${userLabel(p)} is an approver for ${n} ${n === 1 ? 'entry' : 'entries'}. Changing the role removes them as approver. Continue?`)
      if (!ok) return
    }
    edit(uid, withFuelRole(perms[uid] || {}, role))
  }

  async function update() {
    setSaving(true)
    setError('')
    try {
      for (const uid of changedIds) {
        await savePerms(company.id, uid, perms[uid] || {}, isSuperAdmin ? {} : { modules: ['fuel'] })
        setSaved((s) => ({ ...s, [uid]: perms[uid] || {} }))
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }
  const cancel = () => {
    setPerms(saved)
  }

  const t = q.trim().toLowerCase()
  const shown = people.filter((p) => !t || [p.full_name, p.email].some((v) => String(v || '').toLowerCase().includes(t)))
  const approverPool = people.filter(isApprover)

  return (
    <div className="space-y-4">
      {/* Bar on top: stays while scrolling */}
      <div
        className={`sticky z-20 -mx-1 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur ${
          EMBEDDED ? 'top-2' : 'top-[68px] sm:top-[80px]'
        }`}
      >
        <span className="w-full sm:w-72">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name…" className={`${inputCls} h-10`} />
        </span>
        {canEdit && (
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" disabled={!dirty || saving} onClick={cancel}>
              Cancel
            </Button>
            <Button size="sm" disabled={!dirty || saving} onClick={update}>
              {saving ? 'Updating…' : 'Update'}
            </Button>
          </div>
        )}
      </div>
      <ErrorBox>{error}</ErrorBox>

      <Card>
        {loading ? (
          <Loading />
        ) : shown.length === 0 ? (
          <Empty>{t ? 'Nobody matches the search.' : 'No users yet. Users come from the MJM Intranet (User Access → Sync from MJM Intranet).'}</Empty>
        ) : (
          <div className="overflow-x-auto rounded-2xl">
            <table className="w-full min-w-[1180px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="w-64 px-5 py-2.5">User</th>
                  <th className="w-[19rem] px-3 py-2.5">Role</th>
                  <th className="px-3 py-2.5">Claims approved by</th>
                  <th className="px-3 py-2.5">Top-up requests approved by</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {shown.map((p) => {
                  const role = fuelRole(perms[p.user_id])
                  const roleInfo = FUEL_ROLES.find(([k]) => k === role)
                  const approvers = approversOf(p.user_id)
                  const topupApprovers = topupApproversOf(p.user_id)
                  const pool = approverPool.filter((a) => a.user_id !== p.user_id)
                  // a row is marked when its own role changed or its approvers changed
                  const rowChanged =
                    changed(p.user_id) ||
                    people.some(
                      (a) =>
                        changed(a.user_id) &&
                        (approveFor(saved[a.user_id]).includes(p.user_id) !== approves(a.user_id).includes(p.user_id) ||
                          topupApproveFor(saved[a.user_id]).includes(p.user_id) !== approvesTopup(a.user_id).includes(p.user_id))
                    )
                  return (
                    <tr key={p.user_id} className={`align-top ${rowChanged ? 'bg-amber-50/70' : ''}`}>
                      <td className="px-5 py-3">
                        <p className="font-medium text-slate-800">{userLabel(p)}</p>
                        <p className="text-xs text-slate-500">{p.email}</p>
                      </td>
                      <td className="px-3 py-3">
                        {p.is_super_admin ? (
                          <Badge>Super admin</Badge>
                        ) : canEdit ? (
                          <select
                            value={role}
                            disabled={saving}
                            onChange={(e) => changeRole(p, e.target.value)}
                            className={`${inputCls} h-9 w-48 px-2 ${role !== 'user' ? 'font-semibold text-brand-dark' : ''}`}
                          >
                            {FUEL_ROLES.map(([k, label]) => (
                              <option key={k} value={k}>
                                {label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <Badge color={role === 'user' ? 'slate' : 'blue'}>{roleInfo[1]}</Badge>
                        )}
                        {!p.is_super_admin && role === 'accountant' && <p className="mt-1.5 text-xs text-slate-500">Can see all users&apos; submitted claims</p>}
                      </td>
                      <td className="px-3 py-3">
                        <ApproverChips
                          approvers={approvers}
                          options={pool.filter((a) => !approvers.some((x) => x.user_id === a.user_id))}
                          canEdit={canEdit}
                          saving={saving}
                          tone="blue"
                          onAdd={(aid) => changeApprover(aid, p.user_id, true)}
                          onRemove={(aid) => changeApprover(aid, p.user_id, false)}
                        />
                      </td>
                      <td className="px-3 py-3">
                        {/* Top-up requests: only for Claim approvers (they request top-ups) */}
                        {(role === 'approver' || topupApprovers.length > 0) && (
                        <ApproverChips
                          approvers={topupApprovers}
                          options={pool.filter((a) => !topupApprovers.some((x) => x.user_id === a.user_id))}
                          canEdit={canEdit}
                          saving={saving}
                          tone="green"
                          onAdd={(aid) => changeTopupApprover(aid, p.user_id, true)}
                          onRemove={(aid) => changeTopupApprover(aid, p.user_id, false)}
                        />
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
      {!canEdit && <p className="text-xs text-slate-500">Only super admins and Fuel Manage admins can change this.</p>}
    </div>
  )
}

// Approvers of one person as chips (× to remove) and "+ Add approver…".
function ApproverChips({ approvers, options, canEdit, saving, tone, onAdd, onRemove }) {
  const chip = tone === 'green' ? 'bg-emerald-50 text-emerald-800' : 'bg-brand-light text-brand-dark'
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {approvers.length === 0 && !canEdit && <span className="text-sm text-slate-400">—</span>}
      {approvers.map((a) => (
        <span key={a.user_id} className={`inline-flex h-8 items-center gap-1 rounded-full pl-3 pr-1.5 text-sm font-medium ${chip}`}>
          {userLabel(a)}
          {canEdit && (
            <button type="button" disabled={saving} onClick={() => onRemove(a.user_id)} className="rounded-full p-0.5 hover:bg-white/60" aria-label={`Remove ${userLabel(a)}`}>
              <IconX width={14} height={14} />
            </button>
          )}
        </span>
      ))}
      {canEdit && options.length > 0 && (
        <span className="w-52 shrink-0">
          <select value="" onChange={(e) => e.target.value && onAdd(e.target.value)} disabled={saving} className={`${inputCls} h-8 px-2 text-xs`}>
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
  )
}
