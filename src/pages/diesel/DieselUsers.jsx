import { useCallback, useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Badge, Button, Card, Modal } from '../../components/ui.jsx'
import { IconX } from '../../components/icons.jsx'
import { Empty, ErrorBox, Loading, inputCls } from '../../components/diesel/shared.jsx'
import { EMBEDDED } from '../../components/Shell.jsx'
import { listPortalPeople, userLabel } from '../../lib/cmms.js'
import { FUEL_ROLES, approveFor, fuelRole, has, listCompanyPerms, savePerms, topupApproveFor, withFuelRole } from '../../lib/perms.js'
import { useAuth } from '../../auth/AuthContext.jsx'

// Fuel Manage → User setting. For every person of the company:
//   Role                 Normal user / Accountant / Procurement
//   Claims approved by   who approves this person's claims
//   Top-up requests      who approves this person's fleet card top-up requests
//   approved by          (shown for Procurement, who request the top-ups)
//   Fuel limit (Litre)   a number per person (perms.fuel_limit = [litres]),
//                        for the dashboards and reports
// "+ Add approver" opens a list of names to add from.
// Changes stay on the page until Update (Cancel throws them away); Cancel and
// Update only show while there are changes. The bar with the search, Cancel
// and Update stays on top while scrolling. Module
// admins are set in CMMS 2 user access, not here.
export default function DieselUsers() {
  const { company, access } = useOutletContext()
  const { isSuperAdmin, user } = useAuth()
  // A module admin cannot change their own access (another admin or a super admin does)
  const isMe = (uid) => !isSuperAdmin && uid === user?.id
  const [people, setPeople] = useState([])
  const [saved, setSaved] = useState({}) // user_id → perms in the database
  const [perms, setPerms] = useState({}) // user_id → perms on the page (with unsaved changes)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [done, setDone] = useState(false) // "Updated" for a moment after saving

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
  // Fuel limit (litres): perms.fuel_limit = [n]; empty = no limit
  const fuelLimit = (uid) => (Array.isArray(perms[uid]?.fuel_limit) ? perms[uid].fuel_limit[0] : '')
  function changeLimit(uid, value) {
    const next = { ...(perms[uid] || {}) }
    const n = value === '' ? null : Number(value)
    if (n == null || !(n >= 0)) delete next.fuel_limit
    else next.fuel_limit = [Math.round(n * 100) / 100]
    edit(uid, next)
  }
  const changeRole = (p, role) => edit(p.user_id, withFuelRole(perms[p.user_id] || {}, role))
  const [picking, setPicking] = useState(null) // { person, kind: 'claims' | 'topup' }

  async function update() {
    setSaving(true)
    setError('')
    try {
      for (const uid of changedIds) {
        await savePerms(company.id, uid, perms[uid] || {}, isSuperAdmin ? {} : { modules: ['fuel'] })
        setSaved((s) => ({ ...s, [uid]: perms[uid] || {} }))
      }
      setDone(true)
      setTimeout(() => setDone(false), 2500)
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
        {/* Cancel / Update only while there are changes; after Update they go away */}
        {canEdit && (dirty || saving) ? (
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" disabled={saving} onClick={cancel}>
              Cancel
            </Button>
            <Button size="sm" disabled={saving} onClick={update}>
              {saving ? 'Updating…' : 'Update'}
            </Button>
          </div>
        ) : (
          done && <span className="text-sm font-semibold text-emerald-700">Updated ✓</span>
        )}
      </div>
      <ErrorBox>{error}</ErrorBox>

      <Card>
        {loading ? (
          <Loading />
        ) : shown.length === 0 ? (
          <Empty>{t ? 'Nobody matches the search.' : 'No users yet. Users come from the MJM Intranet (User Access → Sync from MJM Intranet).'}</Empty>
        ) : (
          <div className="rounded-2xl">
            <table className="w-full table-fixed text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="w-[23%] px-4 py-2.5">User</th>
                  <th className="w-[18%] px-3 py-2.5">Role</th>
                  <th className="w-[24%] px-3 py-2.5">Claims approved by</th>
                  <th className="w-[22%] px-3 py-2.5">Top-up requests approved by</th>
                  <th className="w-[13%] px-3 py-2.5">Fuel limit (Litre)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {shown.map((p) => {
                  const role = fuelRole(perms[p.user_id])
                  const roleInfo = FUEL_ROLES.find(([k]) => k === role)
                  const approvers = approversOf(p.user_id)
                  const topupApprovers = topupApproversOf(p.user_id)
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
                    <tr key={p.user_id} className={`align-middle ${rowChanged ? 'bg-amber-50/70' : ''}`}>
                      <td className="px-4 py-3">
                        <p className="break-words font-medium text-slate-800">{userLabel(p)}</p>
                        <p className="break-all text-xs text-slate-500">{p.email}</p>
                        {isMe(p.user_id) && canEdit && <p className="mt-0.5 text-[11px] text-slate-400">You · another admin sets your access</p>}
                      </td>
                      <td className="px-3 py-3">
                        {p.is_super_admin ? (
                          <Badge>Super admin</Badge>
                        ) : canEdit && !isMe(p.user_id) ? (
                          <select
                            value={role}
                            disabled={saving}
                            onChange={(e) => changeRole(p, e.target.value)}
                            className={`${inputCls} h-9 w-full max-w-[12rem] px-2 ${role !== 'user' ? 'font-semibold text-brand-dark' : ''}`}
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
                          canEdit={canEdit}
                          fixed={isMe}
                          saving={saving}
                          tone="blue"
                          onAdd={() => setPicking({ person: p, kind: 'claims' })}
                          onRemove={(aid) => changeApprover(aid, p.user_id, false)}
                        />
                      </td>
                      <td className="px-3 py-3">
                        {/* Top-up requests: for Procurement (they request the top-ups) */}
                        {(role === 'procurement' || topupApprovers.length > 0) && (
                        <ApproverChips
                          approvers={topupApprovers}
                          canEdit={canEdit}
                          fixed={isMe}
                          saving={saving}
                          tone="green"
                          onAdd={() => setPicking({ person: p, kind: 'topup' })}
                          onRemove={(aid) => changeTopupApprover(aid, p.user_id, false)}
                        />
                        )}
                      </td>
                      <td className="px-3 py-3">
                        {canEdit && !isMe(p.user_id) ? (
                          <input
                            type="number"
                            min="0"
                            step="1"
                            inputMode="decimal"
                            value={fuelLimit(p.user_id)}
                            disabled={saving}
                            onChange={(e) => changeLimit(p.user_id, e.target.value)}
                            placeholder="—"
                            aria-label={`Fuel limit of ${userLabel(p)} in litres`}
                            className={`${inputCls} h-9 w-full max-w-[7rem] px-2 text-right tabular-nums`}
                          />
                        ) : (
                          <span className="tabular-nums text-slate-700">{fuelLimit(p.user_id) !== '' ? `${fuelLimit(p.user_id)} L` : '—'}</span>
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
      {picking && (
        <ApproverPicker
          title={`Add ${picking.kind === 'claims' ? '' : 'top-up '}approver for ${userLabel(picking.person)}`}
          people={people.filter((a) => a.user_id !== picking.person.user_id && !isMe(a.user_id))}
          added={(picking.kind === 'claims' ? approversOf : topupApproversOf)(picking.person.user_id).map((a) => a.user_id)}
          onAdd={(aid) => (picking.kind === 'claims' ? changeApprover : changeTopupApprover)(aid, picking.person.user_id, true)}
          onClose={() => setPicking(null)}
          saving={saving}
          onUpdate={async () => {
            if (dirty) await update()
            setPicking(null)
          }}
        />
      )}
    </div>
  )
}

// Approvers of one person as chips (× to remove) and a small "+ Add approver" link.
function ApproverChips({ approvers, canEdit, saving, tone, onAdd, onRemove, fixed = () => false }) {
  const chip = 'bg-emerald-50 text-emerald-800' // names added: green; + Add approver: blue
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {approvers.length === 0 && !canEdit && <span className="text-sm text-slate-400">—</span>}
      {approvers.map((a) => (
        <span key={a.user_id} className={`inline-flex h-8 max-w-full items-center gap-1 rounded-full pl-3 pr-1.5 text-sm font-medium ${chip}`}>
          <span className="truncate">{userLabel(a)}</span>
          {canEdit && !fixed(a.user_id) && (
            <button type="button" disabled={saving} onClick={() => onRemove(a.user_id)} className="shrink-0 rounded-full p-0.5 hover:bg-white/60" aria-label={`Remove ${userLabel(a)}`}>
              <IconX width={14} height={14} />
            </button>
          )}
        </span>
      ))}
      {canEdit && (
        <button type="button" disabled={saving} onClick={onAdd} className="inline-flex h-8 items-center px-1 text-xs font-semibold text-brand hover:underline">
          + Add approver
        </button>
      )}
    </div>
  )
}

// Floating list of names: Add (then "Added"); Update saves (Close keeps the
// additions on the page until Update or Cancel there).
function ApproverPicker({ title, people, added, onAdd, onClose, onUpdate, saving }) {
  const [q, setQ] = useState('')
  const t = q.trim().toLowerCase()
  const list = people.filter((p) => !t || [p.full_name, p.email].some((v) => String(v || '').toLowerCase().includes(t)))
  return (
    <Modal open onClose={onClose} title={title}>
      <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name…" className={`${inputCls} mb-2 h-10`} />
      <div className="max-h-[50vh] divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
        {list.length === 0 && <p className="px-3 py-4 text-center text-sm text-slate-400">No match</p>}
        {list.map((p) => {
          const isAdded = added.includes(p.user_id)
          return (
            <div key={p.user_id} className="flex items-center gap-3 px-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-slate-800">{userLabel(p)}</span>
                <span className="block truncate text-xs text-slate-500">{p.email}</span>
              </span>
              {isAdded ? (
                <span className="text-xs font-semibold text-emerald-700">Added ✓</span>
              ) : (
                <Button size="sm" onClick={() => onAdd(p.user_id)}>
                  Add
                </Button>
              )}
            </div>
          )
        })}
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>
          Close
        </Button>
        <Button size="sm" onClick={onUpdate} disabled={saving}>
          {saving ? 'Updating…' : 'Update'}
        </Button>
      </div>
    </Modal>
  )
}
