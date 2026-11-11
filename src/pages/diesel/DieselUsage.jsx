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

// Fuel Usage Report: a dashboard per vehicle, then one month's totals by
// vehicle (with km/L and over-tank checks) and by driver, and the fill-up log
// — cash claims (not rejected) and fleet card fill-ups. Card fill-ups are
// recorded here.
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

  // ---- Report tables for the chosen month (all vehicles)
  const inMonth = fills.filter((f) => !month || f.fill_date.startsWith(month))
  // Fuel economy: fill-ups of one vehicle sorted by odometer; km between two
  // fill-ups ÷ litres of the later one (cash and card alike).
  function efficiency(vid) {
    const list = fills.filter((f) => f.vehicle_id === vid && f.odometer_km != null).sort((a, b) => a.odometer_km - b.odometer_km)
    let km = 0
    let litres = 0
    for (let i = 1; i < list.length; i++) {
      if (month && !list[i].fill_date.startsWith(month)) continue
      const d = list[i].odometer_km - list[i - 1].odometer_km
      if (d > 0) {
        km += d
        litres += Number(list[i].litres)
      }
    }
    return { km, kmPerL: litres > 0 ? km / litres : null }
  }
  const byVehicle = vehicles
    .map((v) => {
      const list = inMonth.filter((f) => f.vehicle_id === v.id)
      const c = list.filter((r) => r.source === 'cash')
      const k = list.filter((r) => r.source === 'card')
      const overTank = v.tank_capacity_l ? list.filter((r) => Number(r.litres) > Number(v.tank_capacity_l)).length : 0
      return { v, count: list.length, cashL: sum(c, 'litres'), cashRM: sum(c), cardL: sum(k, 'litres'), cardRM: sum(k), litres: sum(list, 'litres'), amount: sum(list), ...efficiency(v.id), overTank }
    })
    .filter((r) => r.count > 0)
    .sort((a, b) => b.amount - a.amount)
  const byDriver = new Map()
  for (const r of inMonth) {
    const key = r.driver || ''
    const d = byDriver.get(key) || { cashL: 0, cashRM: 0, cardL: 0, cardRM: 0 }
    if (r.source === 'cash') {
      d.cashL += Number(r.litres)
      d.cashRM += Number(r.amount)
    } else {
      d.cardL += Number(r.litres)
      d.cardRM += Number(r.amount)
    }
    byDriver.set(key, d)
  }
  const th = (label, right) => <th className={`p-3 font-medium ${right ? 'text-right' : 'text-left'}`}>{label}</th>
  const td = (v, right, cls = '') => <td className={`p-3 ${right ? 'text-right' : ''} ${cls}`}>{v}</td>
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
      {!loading && (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <Card className="overflow-x-auto">
            <h3 className="border-b border-slate-200 px-4 py-3 font-semibold text-slate-800">By vehicle</h3>
            {byVehicle.length === 0 ? (
              <Empty>No fill-ups in this month.</Empty>
            ) : (
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs text-slate-500">
                    {th('Vehicle')}
                    {th('Cash', 1)}
                    {th('Fleet card', 1)}
                    {th('Total litres', 1)}
                    {th('Total (RM)', 1)}
                    {th('Distance', 1)}
                    {th('km / L', 1)}
                    {th('Check')}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {byVehicle.map((r) => (
                    <tr key={r.v.id}>
                      {td(<span className="font-medium text-slate-800">{vehicleLabel(r.v)}</span>)}
                      {td(r.cashL ? `${num(r.cashL)} L · ${money(r.cashRM)}` : '—', 1)}
                      {td(r.cardL ? `${num(r.cardL)} L · ${money(r.cardRM)}` : '—', 1)}
                      {td(`${num(r.litres)} L`, 1)}
                      {td(money(r.amount), 1, 'font-medium')}
                      {td(r.km ? `${num(r.km, 0)} km` : '—', 1)}
                      {td(r.kmPerL ? num(r.kmPerL, 2) : '—', 1)}
                      {td(r.overTank ? <Badge color="red">{r.overTank} fill(s) larger than the tank</Badge> : '')}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
          <Card className="overflow-x-auto">
            <h3 className="border-b border-slate-200 px-4 py-3 font-semibold text-slate-800">By driver</h3>
            {byDriver.size === 0 ? (
              <Empty>No fill-ups in this month.</Empty>
            ) : (
              <table className="w-full min-w-[440px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs text-slate-500">
                    {th('Driver')}
                    {th('Cash', 1)}
                    {th('Fleet card', 1)}
                    {th('Total (RM)', 1)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {[...byDriver.entries()]
                    .sort((a, b) => b[1].cashRM + b[1].cardRM - (a[1].cashRM + a[1].cardRM))
                    .map(([k, d]) => (
                      <tr key={k || 'none'}>
                        {td(k ? personLabel(person.get(k)) : 'Driver not recorded')}
                        {td(d.cashL ? `${num(d.cashL)} L · ${money(d.cashRM)}` : '—', 1)}
                        {td(d.cardL ? `${num(d.cardL)} L · ${money(d.cardRM)}` : '—', 1)}
                        {td(money(d.cashRM + d.cardRM), 1, 'font-medium')}
                      </tr>
                    ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>
      )}

      <Card className="overflow-hidden">
        <h3 className="border-b border-slate-200 px-4 py-3 font-semibold text-slate-800">Fill-up log</h3>
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
