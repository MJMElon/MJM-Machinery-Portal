import { useCallback, useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import PageHeader from '../../components/PageHeader.jsx'
import { Badge, Card } from '../../components/ui.jsx'
import { Empty, ErrorBox, Loading } from '../../components/diesel/shared.jsx'
import { listPeople, personLabel, removeMember, setMember } from '../../lib/diesel.js'
import { useAuth } from '../../auth/AuthContext.jsx'

// User Access (Diesel admins): who may open Diesel Manage for this company and
// which pages they get. Access = on the list; Cash Claim / Report per person;
// module Admin (everything) can only be given by a super admin.
const COLS = [
  { key: 'has_access', label: 'Access', hint: 'May open Diesel Manage (vehicle list)' },
  { key: 'can_claim', label: 'Cash Claim', hint: 'Submit own fuel claims' },
  { key: 'can_report', label: 'Report', hint: 'All vehicles, drivers and cards; export' },
  { key: 'is_admin', label: 'Admin', hint: 'Vehicles, review claims, fleet cards, user access (super admins set this)' }
]

export default function DieselUsers() {
  const { company } = useOutletContext()
  const { user, isSuperAdmin } = useAuth()
  const [people, setPeople] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      setPeople(await listPeople(company.id))
      setError('')
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [company.id])

  useEffect(() => {
    setLoading(true)
    load()
  }, [load])

  async function toggle(p, key) {
    setBusy(true)
    setError('')
    try {
      if (key === 'has_access') {
        if (p.has_access) await removeMember(company.id, p.user_id)
        else await setMember(company.id, p.user_id, { is_admin: false, can_claim: false, can_report: false })
      } else {
        const next = { is_admin: p.is_admin, can_claim: p.can_claim, can_report: p.can_report, [key]: !p[key] }
        await setMember(company.id, p.user_id, next)
      }
      await load()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader title="User Access" subtitle={`${company.name} · who can do what in Diesel Manage`} />
      <ErrorBox>{error}</ErrorBox>
      <Card className="overflow-hidden">
        {loading ? (
          <Loading />
        ) : people.length === 0 ? (
          <Empty>No portal users yet. Add them under CMMS 2 → CMMS User Setting.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-5 py-2.5">User</th>
                  {COLS.map((c) => (
                    <th key={c.key} className="px-3 py-2.5 text-center" title={c.hint}>
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {people.map((p) => {
                  const self = p.user_id === user.id && !isSuperAdmin
                  return (
                    <tr key={p.user_id}>
                      <td className="px-5 py-3">
                        <span className="font-medium text-slate-800">{personLabel(p)}</span>
                        {p.full_name && <span className="ml-2 text-xs text-slate-500">{p.email}</span>}
                        {p.is_super_admin && (
                          <Badge color="blue" className="ml-2">
                            Super admin
                          </Badge>
                        )}
                      </td>
                      {COLS.map((c) => (
                        <td key={c.key} className="px-3 py-3 text-center">
                          {p.is_super_admin ? (
                            <span className="text-xs font-medium text-slate-400">All</span>
                          ) : (
                            <input
                              type="checkbox"
                              className="h-5 w-5 cursor-pointer accent-[#2563eb] disabled:cursor-not-allowed disabled:opacity-40"
                              checked={Boolean(p[c.key])}
                              disabled={
                                busy ||
                                self ||
                                (c.key !== 'has_access' && !p.has_access) ||
                                (c.key === 'is_admin' && !isSuperAdmin) ||
                                (c.key !== 'has_access' && c.key !== 'is_admin' && p.is_admin)
                              }
                              onChange={() => toggle(p, c.key)}
                              aria-label={`${c.label} for ${p.email}`}
                              title={
                                c.key === 'is_admin' && !isSuperAdmin
                                  ? 'Only a super admin can set a module admin'
                                  : p.is_admin && c.key !== 'has_access' && c.key !== 'is_admin'
                                    ? 'Module admins have every page'
                                    : c.hint
                              }
                            />
                          )}
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <p className="text-xs text-slate-500">
        Access is per company: switch company (top left) to set it for another company. People with Access but no page
        only see the vehicle list. New portal users are added under CMMS 2 → CMMS User Setting.
      </p>
    </div>
  )
}
