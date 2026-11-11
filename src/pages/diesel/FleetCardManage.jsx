import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useOutletContext } from 'react-router-dom'
import PageHeader from '../../components/PageHeader.jsx'
import { Badge, Button, Card } from '../../components/ui.jsx'
import { IconEye, IconPlus } from '../../components/icons.jsx'
import { Empty, ErrorBox, Loading } from '../../components/diesel/shared.jsx'
import { CARD_CHECKLIST, CARD_STATUS, checklistDone, listCardData, listVehicles, vehicleLabel } from '../../lib/diesel.js'
import { num, thisMonth } from '../../lib/format.js'

// Fleet Card Manage: the fleet card list. Each card shows its number, fuel
// station, entitled vehicle, subsidy volume and the balance volume left this
// month. "New fleet card application" starts the check list for a new card.
export default function FleetCardManage() {
  const { company, access } = useOutletContext()
  const navigate = useNavigate()
  const [data, setData] = useState({ cards: [], usage: [] })
  const [vehicles, setVehicles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const [d, v] = await Promise.all([listCardData(company.id, thisMonth() + '-01'), listVehicles(company.id)])
      setData(d)
      setVehicles(v)
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

  const vById = new Map(vehicles.map((v) => [v.id, v]))
  const month = thisMonth()
  const usedLitres = (cid) => data.usage.filter((u) => u.card_id === cid && u.fill_date.startsWith(month)).reduce((s, u) => s + Number(u.litres || 0), 0)
  const cards = [...data.cards].sort((a, b) => (a.status === 'cancelled') - (b.status === 'cancelled') || String(a.card_no || 'zz').localeCompare(String(b.card_no || 'zz')))

  return (
    <div className="space-y-5">
      <PageHeader
        right={
          access.can('cards', 'add') && (
            <Button onClick={() => navigate('/diesel/cards/new')}>
              <IconPlus width={18} height={18} /> New fleet card application
            </Button>
          )
        }
      />
      <ErrorBox>{error}</ErrorBox>

      <Card className="overflow-hidden">
        <h3 className="border-b border-slate-200 px-5 py-3 font-semibold text-slate-800">Fleet card list</h3>
        {loading ? (
          <Loading />
        ) : cards.length === 0 ? (
          <Empty>No fleet cards yet.{access.can('cards', 'add') ? ' Start with New fleet card application.' : ''}</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-5 py-2.5">Fleet card number</th>
                  <th className="px-3 py-2.5">Fuel station</th>
                  <th className="px-3 py-2.5">Entitled vehicle</th>
                  <th className="px-3 py-2.5 text-right">Subsidy volume</th>
                  <th className="px-3 py-2.5 text-right">This month balance volume</th>
                  <th className="w-28 px-3 py-2.5">Status</th>
                  <th className="w-24 px-3 py-2.5 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {cards.map((c) => {
                  const st = CARD_STATUS[c.status] || CARD_STATUS.active
                  const used = usedLitres(c.id)
                  const quota = c.subsidy_litres != null ? Number(c.subsidy_litres) : null
                  const left = quota != null ? quota - used : null
                  const done = checklistDone(c)
                  return (
                    <tr key={c.id} className="hover:bg-slate-50/60">
                      <td className="px-5 py-3">
                        <Link to={`/diesel/cards/${c.id}`} className="font-semibold tracking-wide text-slate-800 hover:text-brand">
                          {c.card_no || <span className="font-normal italic text-slate-400">Not awarded yet</span>}
                        </Link>
                        {c.status === 'application' && (
                          <span className="block text-xs text-slate-500">
                            Check list {done} / {CARD_CHECKLIST.length}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-slate-700">{c.provider || '—'}</td>
                      <td className="px-3 py-3 text-slate-700">{c.vehicle_id ? vehicleLabel(vById.get(c.vehicle_id)) : '—'}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-slate-700">{quota != null ? `${num(quota, 2)} L` : '—'}</td>
                      <td className={`px-3 py-3 text-right font-semibold tabular-nums ${left != null && left < 0 ? 'text-red-600' : 'text-slate-900'}`}>
                        {left != null ? `${num(left, 2)} L` : '—'}
                        {used > 0 && <span className="block text-xs font-normal text-slate-400">used {num(used, 2)} L</span>}
                      </td>
                      <td className="px-3 py-3">
                        <Badge color={st.color}>{st.label}</Badge>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex justify-center">
                          <Link to={`/diesel/cards/${c.id}`} className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-brand hover:bg-brand-light" title="View">
                            <IconEye width={18} height={18} /> View
                          </Link>
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
    </div>
  )
}
