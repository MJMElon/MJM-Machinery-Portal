import { useCallback, useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import PageHeader from '../../components/PageHeader.jsx'
import { Badge, Button, Card, TextInput } from '../../components/ui.jsx'
import { IconPencil, IconPlus, IconTruck } from '../../components/icons.jsx'
import { Empty, ErrorBox, Loading } from '../../components/diesel/shared.jsx'
import { VehicleModal } from '../../components/diesel/VehicleModal.jsx'
import { FUEL_TYPES, VEHICLE_TYPES, listCardData, listClaims, listPeople, listVehicles, personLabel } from '../../lib/diesel.js'
import { money, num, sum, thisMonth } from '../../lib/format.js'

const typeLabel = (k) => VEHICLE_TYPES.find(([t]) => t === k)?.[1] || k
const fuelLabel = (k) => FUEL_TYPES.find(([t]) => t === k)?.[1] || k

// Vehicles of the company. Everyone with access sees the list; admins add and
// edit; people with Report also see this month's fuel (cash + fleet card).
export default function Vehicles() {
  const { company, access } = useOutletContext()
  const [vehicles, setVehicles] = useState([])
  const [claims, setClaims] = useState([])
  const [usage, setUsage] = useState([])
  const [people, setPeople] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [modal, setModal] = useState(null) // 'new' | vehicle

  const load = useCallback(async () => {
    const from = thisMonth() + '-01'
    try {
      const [v, c, cards, p] = await Promise.all([
        listVehicles(company.id),
        access.report ? listClaims(company.id, { from }) : [],
        access.report ? listCardData(company.id, from) : { usage: [] },
        access.report ? listPeople(company.id) : []
      ])
      setVehicles(v)
      setClaims(c)
      setUsage(cards.usage)
      setPeople(p)
      setError('')
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [company.id, access.report])

  useEffect(() => {
    setLoading(true)
    load()
  }, [load])

  const person = new Map(people.map((p) => [p.user_id, p]))
  const q = query.trim().toLowerCase()
  const list = vehicles.filter((v) => !q || `${v.plate_no} ${v.name || ''}`.toLowerCase().includes(q))

  return (
    <div className="space-y-4">
      <PageHeader
        title="Vehicles"
        subtitle={`${company.name} · ${vehicles.length} vehicle${vehicles.length === 1 ? '' : 's'}${access.admin ? '' : ' · view only'}`}
        right={
          access.admin && (
            <Button onClick={() => setModal('new')}>
              <IconPlus width={18} height={18} /> Add vehicle
            </Button>
          )
        }
      />
      <ErrorBox>{error}</ErrorBox>
      <TextInput
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search plate or name…"
        className="sm:max-w-xs"
      />
      {loading ? (
        <Loading />
      ) : list.length === 0 ? (
        <Card>
          <Empty>{vehicles.length ? 'No matching vehicles.' : 'No vehicles yet.'}</Empty>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((v) => {
            // This month's fuel = cash claims (not rejected) + fleet card fill-ups
            const fills = [
              ...claims.filter((c) => c.vehicle_id === v.id && c.status !== 'rejected'),
              ...usage.filter((u) => u.vehicle_id === v.id)
            ]
            const drv = person.get(v.driver_id)
            return (
              <Card key={v.id} className={`p-4 ${v.status === 'inactive' ? 'opacity-60' : ''}`}>
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-light text-brand">
                    <IconTruck width={20} height={20} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold tracking-wide text-slate-900">{v.plate_no}</span>
                      {v.status === 'inactive' && <Badge>Inactive</Badge>}
                    </div>
                    <p className="text-sm text-slate-500">
                      {[v.name, typeLabel(v.vehicle_type), fuelLabel(v.fuel_type), v.tank_capacity_l && `${num(v.tank_capacity_l)} L tank`]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                    {(drv || v.notes) && (
                      <p className="mt-1 text-xs text-slate-500">
                        {[drv && `Driver: ${personLabel(drv)}`, v.notes].filter(Boolean).join(' · ')}
                      </p>
                    )}
                  </div>
                  {access.admin && (
                    <button
                      onClick={() => setModal(v)}
                      aria-label={`Edit ${v.plate_no}`}
                      className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                    >
                      <IconPencil width={17} height={17} />
                    </button>
                  )}
                </div>
                {access.report && (
                  <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-2 text-center">
                    <div>
                      <p className="text-[11px] text-slate-500">This month</p>
                      <p className="text-sm font-semibold">{num(sum(fills, 'litres'))} L</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-slate-500">Amount</p>
                      <p className="text-sm font-semibold">{money(sum(fills))}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-slate-500">Fill-ups</p>
                      <p className="text-sm font-semibold">{fills.length}</p>
                    </div>
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}

      {modal && (
        <VehicleModal
          company={company}
          vehicle={modal === 'new' ? null : modal}
          people={people}
          onClose={() => setModal(null)}
          onSaved={load}
        />
      )}
    </div>
  )
}
