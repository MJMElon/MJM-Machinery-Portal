import { useCallback, useEffect, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import PageHeader from '../../components/PageHeader.jsx'
import { Card, Select } from '../../components/ui.jsx'
import { Empty, ErrorBox, Loading, StatusBadge } from '../../components/diesel/shared.jsx'
import { CLAIM_STATUS, listClaims, listPeople, personLabel } from '../../lib/diesel.js'
import { day, money, num } from '../../lib/format.js'
import { useAuth } from '../../auth/AuthContext.jsx'
import { claimNo } from './DieselClaims.jsx'

// Review claims: other people's fuel claims, for those with the approve / pay /
// see-all rights. Opens the claim page to approve, reject or mark paid.
export default function ClaimReview() {
  const { company, access } = useOutletContext()
  const { user } = useAuth()
  const [claims, setClaims] = useState([])
  const [people, setPeople] = useState([])
  const [status, setStatus] = useState('pending')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const allowed = access.admin || access.pay || access.viewAll

  const load = useCallback(async () => {
    if (!allowed) return setLoading(false)
    try {
      const [c, p] = await Promise.all([listClaims(company.id), listPeople(company.id)])
      setClaims(c.filter((x) => x.claimant_id !== user.id))
      setPeople(p)
      setError('')
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [company.id, user.id, allowed])

  useEffect(() => {
    setLoading(true)
    load()
  }, [load])

  const person = new Map(people.map((p) => [p.user_id, p]))
  const rows = claims
    .filter((c) => !status || c.status === status)
    .sort((a, b) => ((a.submitted_on || a.fill_date) < (b.submitted_on || b.fill_date) ? 1 : -1))

  return (
    <div className="space-y-4">
      <PageHeader backTo="/diesel/claims" backLabel="Back to my claims" title="Review claims" subtitle={`${company.name} · other people's claims`} />
      <ErrorBox>{error}</ErrorBox>
      {!allowed ? (
        <Card>
          <Empty>You do not have the right to review claims.</Empty>
        </Card>
      ) : (
        <>
          <div className="sm:w-48">
            <Select value={status} onChange={(e) => setStatus(e.target.value)} className="h-10" aria-label="Status">
              <option value="">All statuses</option>
              {Object.entries(CLAIM_STATUS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </Select>
          </div>
          <Card className="overflow-hidden">
            {loading ? (
              <Loading />
            ) : rows.length === 0 ? (
              <Empty>No claims {status ? `with status "${CLAIM_STATUS[status]?.label}"` : ''} from other people.</Empty>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/80 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <th className="w-20 px-5 py-2.5">No.</th>
                      <th className="px-3 py-2.5">Claimant</th>
                      <th className="px-3 py-2.5">Submitted</th>
                      <th className="px-3 py-2.5 text-right">Litres</th>
                      <th className="px-3 py-2.5 text-right">Payable</th>
                      <th className="px-3 py-2.5">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((c, i) => (
                      <tr key={c.id} className="hover:bg-slate-50/60">
                        <td className="px-5 py-3 font-semibold tabular-nums">
                          <Link to={`/diesel/claims/${c.id}`} className="hover:text-brand">
                            {claimNo(c, i)}
                          </Link>
                        </td>
                        <td className="px-3 py-3">{personLabel(person.get(c.claimant_id))}</td>
                        <td className="px-3 py-3 text-slate-600">{day(c.submitted_on || c.fill_date)}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{num(c.total_litres ?? c.litres ?? 0, 2)} L</td>
                        <td className="px-3 py-3 text-right font-semibold tabular-nums">{money(c.payable_amount ?? c.amount)}</td>
                        <td className="px-3 py-3">
                          <StatusBadge status={c.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  )
}
