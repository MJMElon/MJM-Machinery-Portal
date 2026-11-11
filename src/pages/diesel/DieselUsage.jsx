import { useCallback, useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import PageHeader from '../../components/PageHeader.jsx'
import { Badge, Button, Card, Select } from '../../components/ui.jsx'
import { IconDownload, IconFuel, IconTrash } from '../../components/icons.jsx'
import { Empty, ErrorBox, Loading, MonthSelect, Stats, StatusBadge, monthsOf } from '../../components/diesel/shared.jsx'
import { UsageModal } from '../../components/diesel/CardModals.jsx'
import { FuelDashboard } from '../../components/diesel/FuelDashboard.jsx'
import { deleteCardRecord, listCardData, listClaimLines, listClaims, listPeople, listVehicles, personLabel, vehicleLabel } from '../../lib/diesel.js'
import { day, downloadCsv, money, num, sum, thisMonth } from '../../lib/format.js'

// Diesel Usage: every fill-up of the company in one log — cash claims (not
// rejected) and fleet card fill-ups — by month, vehicle and driver. Diesel
// admins record fleet card fill-ups here.
export default function DieselUsage() {
  const { company, access } = useOutletContext()
  const [fills, setFills] = useState([])
  const [vehicles, setVehicles] = useState([])
  const [cards, setCards] = useState([])
  const [people, setPeople] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [month, setMonth] = useState(thisMonth())
  const [vehicle, setVehicle] = useState('')
  const [modal, setModal] = useState(false)

  const load = useCallback(async () => {
    try {
      const [v, claims, lines, cardData, p] = await Promise.all([
        listVehicles(company.id),
        listClaims(company.id),
        listClaimLines(company.id).catch(() => []),
        listCardData(company.id),
        listPeople(company.id)
      ])
      setVehicles(v)
      setCards(cardData.cards)
      setPeople(p)
      const claimById = new Map(claims.map((c) => [c.id, c]))
      setFills(
        [
          ...lines
            .filter((l) => claimById.get(l.claim_id)?.status !== 'rejected')
            .map((l) => ({
              ...l,
              source: l.payment === 'fleet_card' ? 'card' : 'cash',
              driver: claimById.get(l.claim_id)?.claimant_id,
              status: claimById.get(l.claim_id)?.status,
              fromClaim: true
            })),
          ...cardData.usage.map((u) => ({ ...u, source: 'card', driver: u.driver_id }))
        ].sort((a, b) => (a.fill_date < b.fill_date ? 1 : a.fill_date > b.fill_date ? -1 : 0))
      )
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
  const person = new Map(people.map((p) => [p.user_id, p]))
  const cardById = new Map(cards.map((c) => [c.id, c]))
  const months = monthsOf(
    fills.map((f) => f.fill_date),
    thisMonth()
  )
  const rows = fills.filter((f) => (!month || f.fill_date.startsWith(month)) && (!vehicle || f.vehicle_id === vehicle))
  const cash = rows.filter((r) => r.source === 'cash')
  const card = rows.filter((r) => r.source === 'card')
  // One dashboard per vehicle that has fuel recorded (claims or card fill-ups):
  // litres and RM per month, subsidised (fleet card) vs cash.
  const perVehicle = vehicles
    .map((v) => ({ v, lines: fills.filter((f) => f.vehicle_id === v.id).map((f) => ({ ...f, payment: f.source === 'card' ? 'fleet_card' : 'cash' })) }))
    .filter((x) => x.lines.length > 0)

  async function removeUsage(id) {
    if (!window.confirm('Delete this card fill-up? This cannot be undone.')) return
    try {
      await deleteCardRecord('usage', id)
      await load()
    } catch (e) {
      setError(e.message)
    }
  }

  const exportCsv = () =>
    downloadCsv(
      `diesel-usage-${company.code || company.name}-${month || 'all'}.csv`,
      [
        { header: 'Date', value: (r) => r.fill_date },
        { header: 'Type', value: (r) => (r.source === 'cash' ? 'Cash Claim' : 'Fleet Card') },
        { header: 'Vehicle', value: (r) => vById.get(r.vehicle_id)?.name },
        { header: 'Reg. no.', value: (r) => vById.get(r.vehicle_id)?.reg_no },
        { header: 'Driver', value: (r) => (r.driver ? personLabel(person.get(r.driver)) : '') },
        { header: 'Card', value: (r) => cardById.get(r.card_id)?.card_no },
        { header: 'Odometer (km)', value: (r) => r.odometer_km },
        { header: 'Litres', value: (r) => Number(r.litres) },
        { header: 'Amount (RM)', value: (r) => Number(r.amount) },
        { header: 'Station', value: (r) => r.station },
        { header: 'Subsidised', value: (r) => (r.subsidised ? 'yes' : '') },
        { header: 'Status', value: (r) => (r.fromClaim ? r.status : '') }
      ],
      [...rows].reverse()
    )

  return (
    <div className="space-y-4">
      <PageHeader
        right={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={exportCsv} disabled={!rows.length}>
              <IconDownload width={18} height={18} /> Export CSV
            </Button>
            {access.can('usage', 'add') && (
              <Button disabled={!cards.length} onClick={() => setModal(true)} title={cards.length ? '' : 'Add a fleet card first'}>
                <IconFuel width={18} height={18} /> Record card fill-up
              </Button>
            )}
          </div>
        }
      />
      <ErrorBox>{error}</ErrorBox>

      {!loading && perVehicle.length > 0 && (
        <div className="space-y-5">
          {perVehicle.map(({ v, lines }) => (
            <FuelDashboard key={v.id} lines={lines} title={vehicleLabel(v)} />
          ))}
        </div>
      )}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <MonthSelect months={months} value={month} onChange={setMonth} allLabel="All months" />
        <div className="sm:w-60">
          <Select value={vehicle} onChange={(e) => setVehicle(e.target.value)} className="h-10" aria-label="Vehicle">
            <option value="">All vehicles</option>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {vehicleLabel(v)}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <Stats
        items={[
          ['Fill-ups', rows.length],
          ['Total litres', num(sum(rows, 'litres')) + ' L'],
          ['Cash Claim', `${num(sum(cash, 'litres'))} L · ${money(sum(cash))}`],
          ['Fleet Card', `${num(sum(card, 'litres'))} L · ${money(sum(card))}`]
        ]}
      />
      <Card className="overflow-hidden">
        {loading ? (
          <Loading />
        ) : rows.length === 0 ? (
          <Empty>No fill-ups for this selection.</Empty>
        ) : (
          <div className="divide-y divide-slate-100">
            {rows.map((r) => (
              <div key={`${r.source}-${r.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
                <Badge color={r.source === 'cash' ? 'amber' : 'blue'}>{r.source === 'cash' ? 'Cash' : 'Card'}</Badge>
                <span className="w-24 text-slate-500">{day(r.fill_date)}</span>
                <span className="font-medium text-slate-800">{vehicleLabel(vById.get(r.vehicle_id))}</span>
                <span className="text-slate-500">
                  {[
                    r.driver && personLabel(person.get(r.driver)),
                    r.source === 'card' && cardById.get(r.card_id)?.card_no,
                    r.odometer_km != null && `${num(r.odometer_km, 0)} km`,
                    r.station
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
                {r.fromClaim && r.status && <StatusBadge status={r.status} />}
                <span className="flex-1" />
                <span className="w-20 text-right">{num(r.litres, 2)} L</span>
                <span className="w-28 whitespace-nowrap text-right font-medium">{money(r.amount)}</span>
                {r.source === 'card' && !r.fromClaim && access.can('usage', 'delete') ? (
                  <button
                    onClick={() => removeUsage(r.id)}
                    aria-label="Delete fill-up"
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"
                  >
                    <IconTrash width={16} height={16} />
                  </button>
                ) : (
                  <span className="w-8" />
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
      {modal && (
        <UsageModal company={company} cards={cards} vehicles={vehicles} people={people} onClose={() => setModal(false)} onSaved={load} />
      )}
    </div>
  )
}
