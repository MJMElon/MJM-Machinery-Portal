import { useCallback, useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import PageHeader from '../../components/PageHeader.jsx'
import { Badge, Button, Card } from '../../components/ui.jsx'
import { IconCard, IconFuel, IconPencil, IconPlus, IconTrash } from '../../components/icons.jsx'
import { Empty, ErrorBox, Loading, MonthSelect, monthsOf } from '../../components/diesel/shared.jsx'
import { CardModal, ReloadModal, UsageModal } from '../../components/diesel/CardModals.jsx'
import { CARD_STATUS, deleteCardRecord, listCardData, listPeople, listVehicles, personLabel, vehicleLabel } from '../../lib/diesel.js'
import { day, money, num, sum, thisMonth } from '../../lib/format.js'

// Fleet Card (Diesel admins): the company's fuel cards, their reloads and
// every card fill-up. Balance = reloads − fill-ups; over the monthly limit
// shows red.
export default function FleetCard() {
  const { company } = useOutletContext()
  const [data, setData] = useState({ cards: [], usage: [], reloads: [] })
  const [vehicles, setVehicles] = useState([])
  const [people, setPeople] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [month, setMonth] = useState(thisMonth())
  const [modal, setModal] = useState(null) // { kind: 'card'|'reload'|'usage', card? }

  const load = useCallback(async () => {
    try {
      const [d, v, p] = await Promise.all([listCardData(company.id), listVehicles(company.id), listPeople(company.id)])
      setData(d)
      setVehicles(v)
      setPeople(p)
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

  const { cards, usage, reloads } = data
  const vById = new Map(vehicles.map((v) => [v.id, v]))
  const person = new Map(people.map((p) => [p.user_id, p]))
  const cardById = new Map(cards.map((c) => [c.id, c]))
  const balance = (cid) => sum(reloads.filter((r) => r.card_id === cid)) - sum(usage.filter((u) => u.card_id === cid))
  const mUsage = usage.filter((u) => u.fill_date.startsWith(month))
  const mReloads = reloads.filter((r) => r.reload_date.startsWith(month))
  const months = monthsOf([...usage.map((u) => u.fill_date), ...reloads.map((r) => r.reload_date)], thisMonth())

  const byDriver = new Map()
  for (const u of mUsage) {
    const k = u.driver_id || ''
    const r = byDriver.get(k) || { litres: 0, amount: 0, count: 0 }
    r.litres += Number(u.litres)
    r.amount += Number(u.amount)
    r.count++
    byDriver.set(k, r)
  }
  const records = [
    ...mUsage.map((u) => ({ kind: 'usage', date: u.fill_date, row: u })),
    ...mReloads.map((r) => ({ kind: 'reload', date: r.reload_date, row: r }))
  ].sort((a, b) => (a.date < b.date ? 1 : -1))

  async function removeRecord(kind, id) {
    if (!window.confirm('Delete this record? This cannot be undone.')) return
    try {
      await deleteCardRecord(kind, id)
      await load()
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Fleet Card"
        subtitle={`${company.name} · fuel cards, reloads and card fill-ups`}
        right={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setModal({ kind: 'card' })}>
              <IconCard width={18} height={18} /> Add card
            </Button>
            <Button variant="secondary" disabled={!cards.length} onClick={() => setModal({ kind: 'reload' })}>
              <IconPlus width={18} height={18} /> Record reload
            </Button>
            <Button disabled={!cards.length} onClick={() => setModal({ kind: 'usage' })}>
              <IconFuel width={18} height={18} /> Record fill-up
            </Button>
          </div>
        }
      />
      <ErrorBox>{error}</ErrorBox>
      <MonthSelect months={months} value={month} onChange={setMonth} />

      {loading ? (
        <Loading />
      ) : (
        <>
          <section className="space-y-2">
            <h3 className="font-semibold text-slate-800">Fleet cards</h3>
            {cards.length === 0 ? (
              <Card>
                <Empty>No fleet cards yet. Add the first card.</Empty>
              </Card>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {cards.map((c) => {
                  const used = sum(mUsage.filter((u) => u.card_id === c.id))
                  const limit = Number(c.monthly_limit)
                  const over = c.monthly_limit != null && used > limit
                  const pct = c.monthly_limit ? Math.min(100, Math.round((used / limit) * 100)) : 0
                  const st = CARD_STATUS[c.status]
                  return (
                    <Card key={c.id} className="p-4">
                      <div className="flex items-start gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                          <IconCard width={20} height={20} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold tracking-wide text-slate-900">{c.card_no}</span>
                            <Badge color={st.color}>{st.label}</Badge>
                          </div>
                          <p className="text-sm text-slate-500">
                            {[c.provider, c.vehicle_id ? vehicleLabel(vById.get(c.vehicle_id)) : 'No vehicle linked'].filter(Boolean).join(' · ')}
                          </p>
                        </div>
                        <button
                          onClick={() => setModal({ kind: 'card', card: c })}
                          aria-label={`Edit ${c.card_no}`}
                          className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                        >
                          <IconPencil width={17} height={17} />
                        </button>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-2 text-center">
                        <div>
                          <p className="text-[11px] text-slate-500">Balance</p>
                          <p className={`text-sm font-semibold ${balance(c.id) < 0 ? 'text-red-600' : ''}`}>{money(balance(c.id))}</p>
                        </div>
                        <div>
                          <p className="text-[11px] text-slate-500">Used this month</p>
                          <p className={`text-sm font-semibold ${over ? 'text-red-600' : ''}`}>
                            {money(used)}
                            {c.monthly_limit != null && ` / ${money(limit)}`}
                          </p>
                        </div>
                      </div>
                      {c.monthly_limit != null && (
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
                          <div className={`h-full ${over ? 'bg-red-500' : pct > 80 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${pct}%` }} />
                        </div>
                      )}
                    </Card>
                  )
                })}
              </div>
            )}
          </section>

          <section className="space-y-2">
            <h3 className="font-semibold text-slate-800">Card use by driver this month</h3>
            <Card className="overflow-hidden">
              {byDriver.size === 0 ? (
                <Empty>No card fill-ups in this month.</Empty>
              ) : (
                <div className="divide-y divide-slate-100">
                  {[...byDriver.entries()]
                    .sort((a, b) => b[1].amount - a[1].amount)
                    .map(([k, r]) => (
                      <div key={k || 'none'} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                        <span className="min-w-0 flex-1 truncate font-medium text-slate-800">
                          {k ? personLabel(person.get(k)) : 'Driver not recorded'}
                        </span>
                        <span className="text-slate-500">{r.count} fill-ups</span>
                        <span className="w-20 text-right">{num(r.litres)} L</span>
                        <span className="w-28 text-right font-medium">{money(r.amount)}</span>
                      </div>
                    ))}
                </div>
              )}
            </Card>
          </section>

          <section className="space-y-2">
            <h3 className="font-semibold text-slate-800">Card records this month</h3>
            <Card className="overflow-hidden">
              {records.length === 0 ? (
                <Empty>No card records in this month.</Empty>
              ) : (
                <div className="divide-y divide-slate-100">
                  {records.map(({ kind, row }) => {
                    const c = cardById.get(row.card_id) || {}
                    return (
                      <div key={row.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
                        <Badge color={kind === 'usage' ? 'blue' : 'green'}>{kind === 'usage' ? 'Fill-up' : 'Reload'}</Badge>
                        <span className="text-slate-500">{day(kind === 'usage' ? row.fill_date : row.reload_date)}</span>
                        {kind === 'usage' ? (
                          <>
                            <span className="font-medium text-slate-800">{vehicleLabel(vById.get(row.vehicle_id))}</span>
                            <span className="text-slate-500">
                              {[c.card_no, row.driver_id && personLabel(person.get(row.driver_id)), row.odometer_km != null && `${num(row.odometer_km, 0)} km`, row.station]
                                .filter(Boolean)
                                .join(' · ')}
                            </span>
                            <span className="flex-1" />
                            <span>{num(row.litres, 2)} L</span>
                            <span className="w-28 whitespace-nowrap text-right font-medium">{money(row.amount)}</span>
                          </>
                        ) : (
                          <>
                            <span className="font-medium text-slate-800">{c.card_no}</span>
                            <span className="text-slate-500">{row.reference}</span>
                            <span className="flex-1" />
                            <span className="w-28 whitespace-nowrap text-right font-medium text-emerald-600">+ {money(row.amount)}</span>
                          </>
                        )}
                        <button
                          onClick={() => removeRecord(kind, row.id)}
                          aria-label="Delete record"
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"
                        >
                          <IconTrash width={16} height={16} />
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </Card>
          </section>
        </>
      )}

      {modal?.kind === 'card' && (
        <CardModal company={company} card={modal.card} vehicles={vehicles} onClose={() => setModal(null)} onSaved={load} />
      )}
      {modal?.kind === 'reload' && <ReloadModal company={company} cards={cards} onClose={() => setModal(null)} onSaved={load} />}
      {modal?.kind === 'usage' && (
        <UsageModal company={company} cards={cards} vehicles={vehicles} people={people} onClose={() => setModal(null)} onSaved={load} />
      )}
    </div>
  )
}
