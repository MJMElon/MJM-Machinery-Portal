import { useCallback, useEffect, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import PageHeader from '../../components/PageHeader.jsx'
import { Badge, Button, Card, Select } from '../../components/ui.jsx'
import { IconPrint, IconTrash } from '../../components/icons.jsx'
import { Empty, ErrorBox, Loading, Stats, StatusBadge, inputCls } from '../../components/diesel/shared.jsx'
import { printElement } from '../../lib/printFrame.js'
import { FUEL_COLORS, MiniBars } from '../../components/diesel/FuelDashboard.jsx'
import { deleteCardRecord, listCardData, listClaimLines, listClaims, listPeople, listVehicles, personLabel, vehicleLabel } from '../../lib/diesel.js'
import { day, money, num, sum, today } from '../../lib/format.js'

// Fuel Usage Report: a dashboard per vehicle (HQ vehicles; estate machines
// later), then totals by vehicle (with km/L and over-tank checks) and by
// driver, and the fill-up log — cash and fleet-card receipts on fuel claims
// (not rejected). One filter bar drives all of it: fleet card (or all fleet
// cards / cash only), driver, vehicle and a date range (from – to).
// Print prints the dashboard (not the log), with the filters in its heading.
export default function DieselUsage() {
  const { company, access } = useOutletContext()
  const [fills, setFills] = useState([])
  const [vehicles, setVehicles] = useState([])
  const [cards, setCards] = useState([])
  const [people, setPeople] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  // Filters. cardF: '' all receipts · 'card' all fleet cards · 'cash' cash only · <card id>
  const [cardF, setCardF] = useState('')
  const [driverF, setDriverF] = useState('')
  const [vehicle, setVehicle] = useState('')
  const [from, setFrom] = useState(`${today().slice(0, 4)}-01-01`)
  const [to, setTo] = useState(today())
  const [tab, setTab] = useState('hq') // hq = HQ vehicles; estate = the other machines
  const [printing, setPrinting] = useState(false)
  const report = useRef(null)

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
            .filter((l) => l.line_kind !== 'reload' && claimById.get(l.claim_id)?.status !== 'rejected')
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

  // Which fleet card a fleet-card receipt belongs to (same rule as the card
  // balance): a fill-up typed on a card is that card; a receipt on a fuel claim
  // goes to the card of its vehicle, else to a card the claimant drives on.
  // Active cards first, then the newest.
  const rank = (c) => [c.status === 'active' ? 0 : 1, ['cancelled', 'application'].includes(c.status) ? 1 : 0, -Date.parse(c.created_at || 0) || 0]
  const better = (a, b) => {
    const x = rank(a)
    const y = rank(b)
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] < y[i] ? a : b
    return a
  }
  const cardOfVehicle = new Map()
  const cardsOfDriver = new Map()
  for (const c of cards) {
    if (c.vehicle_id) cardOfVehicle.set(c.vehicle_id, cardOfVehicle.has(c.vehicle_id) ? better(cardOfVehicle.get(c.vehicle_id), c) : c)
    for (const d of c.driver_ids?.length ? c.driver_ids : c.driver_id ? [c.driver_id] : [])
      cardsOfDriver.set(d, cardsOfDriver.has(d) ? better(cardsOfDriver.get(d), c) : c)
  }
  const cardOf = (f) => {
    if (f.source !== 'card') return null
    if (!f.fromClaim && f.card_id) return cardById.get(f.card_id) || null
    return cardOfVehicle.get(f.vehicle_id) || cardsOfDriver.get(f.driver) || null
  }

  // ---- Filtered receipts: everything below follows the filter bar
  const inRange = (d) => (!from || d >= from) && (!to || d <= to)
  const pass = (f) =>
    inRange(f.fill_date) &&
    (!vehicle || f.vehicle_id === vehicle) &&
    (!driverF || (driverF === 'none' ? !f.driver : f.driver === driverF)) &&
    (!cardF || (cardF === 'cash' ? f.source === 'cash' : cardF === 'card' ? f.source === 'card' : cardOf(f)?.id === cardF))
  const rows = fills.filter(pass)
  const cash = rows.filter((r) => r.source === 'cash')
  const card = rows.filter((r) => r.source === 'card')
  const filtered = Boolean(cardF || driverF || vehicle)
  // Charts show the 12 months of the year the range ends in.
  const year = Number((to || today()).slice(0, 4))

  // Fuel economy: fill-ups of one vehicle sorted by odometer; km between two
  // fill-ups ÷ litres of the later one (cash and card alike), later one in range.
  function efficiency(vid) {
    const list = fills.filter((f) => f.vehicle_id === vid && f.odometer_km != null).sort((a, b) => a.odometer_km - b.odometer_km)
    let km = 0
    let litres = 0
    for (let i = 1; i < list.length; i++) {
      if (!pass(list[i])) continue
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
      const list = rows.filter((f) => f.vehicle_id === v.id)
      const c = list.filter((r) => r.source === 'cash')
      const k = list.filter((r) => r.source === 'card')
      const overTank = v.tank_capacity_l ? list.filter((r) => Number(r.litres) > Number(v.tank_capacity_l)).length : 0
      return { v, count: list.length, cashL: sum(c, 'litres'), cashRM: sum(c), cardL: sum(k, 'litres'), cardRM: sum(k), litres: sum(list, 'litres'), amount: sum(list), ...efficiency(v.id), overTank }
    })
    .filter((r) => r.count > 0)
    .sort((a, b) => b.amount - a.amount)
  const byDriver = new Map()
  for (const r of rows) {
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
  // One row per vehicle (reg no. + driver) with two small month charts.
  // HQ vehicles = ticked "HQ vehicle" in Machinery Profile (before anyone is
  // ticked: road vehicles by Type); Estate machines = everything else.
  const isRoad = (v) => /light|lorry|pickup|pick-up|van|bus|truck/i.test(v.machine_type || '')
  const anyHq = vehicles.some((v) => v.hq_vehicle)
  const isHq = (v) => (anyHq ? Boolean(v.hq_vehicle) : isRoad(v))
  const linesOf = (vid) => rows.filter((f) => f.vehicle_id === vid).map((f) => ({ ...f, payment: f.source === 'card' ? 'fleet_card' : 'cash' }))
  const driverOf = (v) => {
    const id = v.driver_ids?.[0] || v.driver_id
    return id ? personLabel(person.get(id)) : '—'
  }
  // With a card / driver / vehicle filter, only the vehicles that have
  // receipts in it (and the chosen card's own vehicle) are listed.
  const shown = new Set(rows.map((r) => r.vehicle_id))
  const chosenCard = cardById.get(cardF)
  const tabVehicles = vehicles
    .filter((v) => (tab === 'hq' ? isHq(v) : !isHq(v)) && v.is_active !== false)
    .filter((v) => !filtered || shown.has(v.id) || v.id === vehicle || v.id === chosenCard?.vehicle_id)
    .sort((a, b) => String(a.reg_no || a.name).localeCompare(String(b.reg_no || b.name)))

  // Drivers to choose from: everyone with a receipt, plus fleet card drivers.
  const driverIds = [...new Set([...fills.map((f) => f.driver).filter(Boolean), ...cards.flatMap((c) => c.driver_ids || [])])]
  const driverOpts = driverIds
    .map((id) => ({ id, label: person.get(id) ? personLabel(person.get(id)) : 'Unknown user' }))
    .sort((a, b) => a.label.localeCompare(b.label))
  const cardOpts = cards
    .filter((c) => c.card_no)
    .sort((a, b) => (a.status === 'active' ? 0 : 1) - (b.status === 'active' ? 0 : 1) || a.card_no.localeCompare(b.card_no))
  const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const now = new Date()
  const presets = [
    ['This month', ymd(new Date(now.getFullYear(), now.getMonth(), 1)), today()],
    ['Last month', ymd(new Date(now.getFullYear(), now.getMonth() - 1, 1)), ymd(new Date(now.getFullYear(), now.getMonth(), 0))],
    ['This year', `${now.getFullYear()}-01-01`, today()],
    ['Last year', `${now.getFullYear() - 1}-01-01`, `${now.getFullYear() - 1}-12-31`]
  ]
  const cardFLabel =
    cardF === 'card' ? 'All fleet cards' : cardF === 'cash' ? 'Cash only' : chosenCard ? `Fleet card ${chosenCard.card_no}` : 'Fleet card and cash'
  const filterLine = [
    `${from ? day(from) : 'Start'} – ${to ? day(to) : 'today'}`,
    cardFLabel,
    driverF ? (driverF === 'none' ? 'No driver recorded' : `Driver: ${person.get(driverF) ? personLabel(person.get(driverF)) : 'Unknown user'}`) : 'All drivers',
    vehicle ? `Vehicle: ${vehicleLabel(vById.get(vehicle))}` : 'All vehicles'
  ].join(' · ')
  const resetFilters = () => {
    setCardF('')
    setDriverF('')
    setVehicle('')
    setFrom(presets[2][1])
    setTo(presets[2][2])
  }

  async function print() {
    if (!report.current) return
    setPrinting(true)
    try {
      await printElement(report.current, {
        title: 'Fuel Usage Report',
        lines: [
          company.name,
          `${tab === 'hq' ? 'HQ vehicles' : 'Estate machines'} · charts ${year}`,
          filterLine,
          `Printed ${day(new Date().toISOString().slice(0, 10))}`
        ]
      })
    } catch (e) {
      setError(e.message)
    } finally {
      setPrinting(false)
    }
  }

  async function removeUsage(id) {
    if (!window.confirm('Delete this card fill-up? This cannot be undone.')) return
    try {
      await deleteCardRecord('usage', id)
      await load()
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        right={
          <Button variant="secondary" onClick={print} disabled={loading || printing}>
            <IconPrint width={18} height={18} /> {printing ? 'Preparing…' : 'Print'}
          </Button>
        }
      />
      <ErrorBox>{error}</ErrorBox>

      {/* Filter bar: drives the charts, totals, tables, log and printout */}
      <Card className="p-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[repeat(3,minmax(0,1fr))_minmax(0,1.4fr)]">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-600">Fleet card</span>
            <Select value={cardF} onChange={(e) => setCardF(e.target.value)} className="h-10">
              <option value="">Fleet card and cash</option>
              <option value="card">All fleet cards</option>
              <option value="cash">Cash only</option>
              {cardOpts.length > 0 && (
                <optgroup label="One fleet card">
                  {cardOpts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.card_no}
                      {c.vehicle_id && vById.get(c.vehicle_id) ? ` · ${vById.get(c.vehicle_id).reg_no || vById.get(c.vehicle_id).name}` : ''}
                      {c.status !== 'active' ? ` (${c.status === 'application' ? 'applying' : c.status})` : ''}
                    </option>
                  ))}
                </optgroup>
              )}
            </Select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-600">Driver</span>
            <Select value={driverF} onChange={(e) => setDriverF(e.target.value)} className="h-10">
              <option value="">All drivers</option>
              {driverOpts.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
              <option value="none">No driver recorded</option>
            </Select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-600">Vehicle</span>
            <Select value={vehicle} onChange={(e) => setVehicle(e.target.value)} className="h-10">
              <option value="">All vehicles</option>
              {[...vehicles]
                .sort((a, b) => vehicleLabel(a).localeCompare(vehicleLabel(b)))
                .map((v) => (
                  <option key={v.id} value={v.id}>
                    {vehicleLabel(v)}
                  </option>
                ))}
            </Select>
          </label>
          <div>
            <span className="mb-1 block text-xs font-semibold text-slate-600">Date</span>
            <div className="flex items-center gap-2">
              <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className={`${inputCls} h-12 min-w-0 flex-1 rounded-xl px-2 text-sm`} aria-label="From date" />
              <span className="text-sm text-slate-400">to</span>
              <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className={`${inputCls} h-12 min-w-0 flex-1 rounded-xl px-2 text-sm`} aria-label="To date" />
            </div>
          </div>
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {presets.map(([label, f, t]) => (
            <button
              key={label}
              type="button"
              onClick={() => {
                setFrom(f)
                setTo(t)
              }}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${from === f && to === t ? 'border-brand bg-brand text-white' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
            >
              {label}
            </button>
          ))}
          <span className="flex-1" />
          <button type="button" onClick={resetFilters} className="text-xs font-medium text-slate-500 hover:text-slate-800 hover:underline">
            Reset filters
          </button>
        </div>
      </Card>

      <div ref={report} className="space-y-4">
      {!loading && (
        <Card className="overflow-hidden">
          {/* HQ vehicle / Estate machine tabs */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/60 pr-4">
            <div className="flex">
              {[
                ['hq', 'HQ vehicle'],
                ['estate', 'Estate machine']
              ].map(([k, label]) => (
                <button key={k} type="button" onClick={() => setTab(k)} data-noprint={tab === k ? undefined : ''} className={`relative px-6 py-3 text-sm font-bold ${tab === k ? 'bg-white text-brand' : 'text-slate-600 hover:bg-white/60'}`}>
                  {label}
                  {tab === k && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-brand" />}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3 text-[11px] text-slate-600">
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: FUEL_COLORS.card }} /> Fleet card (KPDN)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: FUEL_COLORS.cash }} /> Cash
              </span>
              <span className="font-semibold text-slate-700">{year}</span>
            </div>
          </div>
          {tabVehicles.length === 0 ? (
            <Empty>
              {filtered
                ? 'No vehicle has receipts for this filter.'
                : tab === 'hq'
                  ? 'No HQ vehicles yet. Tick "HQ vehicle" in Machinery Profile.'
                  : 'No estate machines in Machinery Profile yet.'}
            </Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="w-44 px-4 py-2">Vehicle reg no.</th>
                    <th className="w-40 px-3 py-2">Driver</th>
                    <th className="px-3 py-2">Monthly Fuel Usage (Litre)</th>
                    <th className="px-3 py-2">Monthly Fuel Expenses (RM)</th>
                  </tr>
                </thead>
                <tbody>
                  {tabVehicles.map((v) => (
                    <VehicleRow key={v.id} v={v} rows={linesOf(v.id)} driver={driverOf(v)} year={year} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
      <Stats
        items={[
          ['Receipts', rows.length],
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
              <Empty>No receipts for this filter.</Empty>
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
              <Empty>No receipts for this filter.</Empty>
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

      </div>

      <Card className="overflow-hidden">
        <h3 className="border-b border-slate-200 px-4 py-3 font-semibold text-slate-800">Fill-up log</h3>
        {loading ? (
          <Loading />
        ) : rows.length === 0 ? (
          <Empty>No receipts for this filter.</Empty>
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
                    r.source === 'card' && cardOf(r)?.card_no,
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
    </div>
  )
}

// One vehicle: reg no. (and name), driver, and the two small month charts.
function VehicleRow({ v, rows, driver, year }) {
  return (
    <tr className="border-b border-slate-100 align-middle">
      <td className="px-4 py-2 font-semibold text-slate-800">
        {v.reg_no || v.name}
        {v.reg_no && v.reg_no !== v.name && <span className="block text-xs font-normal text-slate-400">{v.name}</span>}
      </td>
      <td className="px-3 py-2 text-slate-700">{driver}</td>
      <td className="px-3 py-1.5">
        <MiniBars rows={rows} year={year} metric="litres" fmt={(x) => `${num(x, 1)} L`} />
      </td>
      <td className="px-3 py-1.5">
        <MiniBars rows={rows} year={year} metric="amount" fmt={money} />
      </td>
    </tr>
  )
}
