import { useCallback, useEffect, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import PageHeader from '../../components/PageHeader.jsx'
import { Badge, Button, Card } from '../../components/ui.jsx'
import { IconCard, IconPencil, IconPlus, IconTrash, IconTruck } from '../../components/icons.jsx'
import { Empty, ErrorBox, Loading, MonthSelect, monthsOf } from '../../components/diesel/shared.jsx'
import { CardModal, ReloadModal } from '../../components/diesel/CardModals.jsx'
import { CARD_STATUS, deleteCardRecord, listCardData, listPeople, listVehicles, personLabel, vehicleLabel } from '../../lib/diesel.js'
import { day, money, sum, thisMonth } from '../../lib/format.js'

// Fleet Card Manage: the company's fuel cards (balance = reloads − fill-ups,
// monthly limit), reloads, and the vehicles that apply for the KPDN
// subsidised-diesel fleet card (ticked in Machinery Manage → Machinery Profile).
// Fill-ups themselves are recorded under Diesel Usage.
export default function FleetCardManage() {
  const { company, access } = useOutletContext()
  const [data, setData] = useState({ cards: [], usage: [], reloads: [] })
  const [vehicles, setVehicles] = useState([])
  const [people, setPeople] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [month, setMonth] = useState(thisMonth())
  const [modal, setModal] = useState(null) // { kind: 'card'|'reload', card? }

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
  const cardOfVehicle = new Map(cards.filter((c) => c.vehicle_id).map((c) => [c.vehicle_id, c]))
  const balance = (cid) => sum(reloads.filter((r) => r.card_id === cid)) - sum(usage.filter((u) => u.card_id === cid))
  const mUsage = usage.filter((u) => u.fill_date.startsWith(month))
  const mReloads = reloads.filter((r) => r.reload_date.startsWith(month)).sort((a, b) => (a.reload_date < b.reload_date ? 1 : -1))
  const months = monthsOf([...usage.map((u) => u.fill_date), ...reloads.map((r) => r.reload_date)], thisMonth())
  const kpdn = vehicles.filter((v) => v.kpdn_subsidy)

  async function removeReload(id) {
    if (!window.confirm('Delete this reload? This cannot be undone.')) return
    try {
      await deleteCardRecord('reload', id)
      await load()
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        right={
          (access.can('cards', 'add') || access.can('cards', 'edit')) && (
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => setModal({ kind: 'card' })}>
                <IconCard width={18} height={18} /> Add card
              </Button>
              <Button disabled={!cards.length} onClick={() => setModal({ kind: 'reload' })}>
                <IconPlus width={18} height={18} /> Record reload
              </Button>
            </div>
          )
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
                <Empty>No fleet cards yet.{access.can('cards', 'add') ? ' Add the first card.' : ''}</Empty>
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
                        {access.can('cards', 'edit') && (
                          <button
                            onClick={() => setModal({ kind: 'card', card: c })}
                            aria-label={`Edit ${c.card_no}`}
                            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                          >
                            <IconPencil width={17} height={17} />
                          </button>
                        )}
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
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h3 className="font-semibold text-slate-800">KPDN diesel subsidy vehicles</h3>
                <p className="text-xs text-slate-500">
                  Vehicles ticked “KPDN diesel subsidy” in{' '}
                  <Link to="/cmms/machines" className="font-medium text-brand underline">
                    Machinery Manage → Machinery Profile
                  </Link>
                  . These apply for a subsidised-diesel fleet card.
                </p>
              </div>
              <Badge color={kpdn.length ? 'green' : 'slate'}>
                {kpdn.length} vehicle{kpdn.length === 1 ? '' : 's'} · {kpdn.filter((v) => cardOfVehicle.has(v.id)).length} with a card
              </Badge>
            </div>
            <Card className="overflow-hidden">
              {kpdn.length === 0 ? (
                <Empty>No vehicle is ticked for KPDN diesel subsidy yet.</Empty>
              ) : (
                <div className="divide-y divide-slate-100">
                  {kpdn.map((v) => {
                    const c = cardOfVehicle.get(v.id)
                    const drv = person.get(v.driver_id)
                    return (
                      <div key={v.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-light text-brand">
                          <IconTruck width={16} height={16} />
                        </span>
                        <span className="font-medium text-slate-800">{vehicleLabel(v)}</span>
                        <span className="text-slate-500">
                          {[v.machine_type, v.brand, v.model, drv && `Driver: ${personLabel(drv)}`, v.tank_capacity_l && `${v.tank_capacity_l} L tank`]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                        <span className="flex-1" />
                        {!v.is_active && <Badge>Inactive</Badge>}
                        {c ? (
                          <Badge color="green">Card {c.card_no}</Badge>
                        ) : (
                          <Badge color="amber">Applying — no card yet</Badge>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </Card>
          </section>

          <section className="space-y-2">
            <h3 className="font-semibold text-slate-800">Reloads this month</h3>
            <Card className="overflow-hidden">
              {mReloads.length === 0 ? (
                <Empty>No reloads in this month.</Empty>
              ) : (
                <div className="divide-y divide-slate-100">
                  {mReloads.map((r) => {
                    const c = cards.find((x) => x.id === r.card_id) || {}
                    return (
                      <div key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
                        <Badge color="green">Reload</Badge>
                        <span className="text-slate-500">{day(r.reload_date)}</span>
                        <span className="font-medium text-slate-800">{c.card_no}</span>
                        <span className="text-slate-500">{r.reference}</span>
                        <span className="flex-1" />
                        <span className="w-28 whitespace-nowrap text-right font-medium text-emerald-600">+ {money(r.amount)}</span>
                        {access.can('cards', 'delete') ? (
                          <button
                            onClick={() => removeReload(r.id)}
                            aria-label="Delete reload"
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"
                          >
                            <IconTrash width={16} height={16} />
                          </button>
                        ) : (
                          <span className="w-8" />
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </Card>
            <p className="text-xs text-slate-500">
              Card fill-ups are recorded and listed under{' '}
              <Link to="/diesel/usage" className="font-medium text-brand underline">
                Diesel Usage
              </Link>
              .
            </p>
          </section>
        </>
      )}

      {modal?.kind === 'card' && (
        <CardModal company={company} card={modal.card} vehicles={vehicles} onClose={() => setModal(null)} onSaved={load} />
      )}
      {modal?.kind === 'reload' && <ReloadModal company={company} cards={cards} onClose={() => setModal(null)} onSaved={load} />}
    </div>
  )
}
