import { useCallback, useEffect, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import PageHeader from '../../components/PageHeader.jsx'
import { Button, Card, Modal } from '../../components/ui.jsx'
import { IconPencil, IconPrint, IconSearch, IconTrash } from '../../components/icons.jsx'
import { Empty, ErrorBox, Loading, inputCls } from '../../components/diesel/shared.jsx'
import { MultiPick } from '../../components/diesel/MultiPick.jsx'
import { printUsageTable } from '../../components/diesel/UsagePrint.js'
import { FUEL_COLORS, MiniBars } from '../../components/diesel/FuelDashboard.jsx'
import {
  deleteDieselPrice,
  dieselPriceOn,
  listCardData,
  listClaimLines,
  listClaims,
  listDieselPrices,
  listFuelRecords,
  listPeople,
  listVehicles,
  personLabel,
  saveDieselPrice,
  vehicleLabel
} from '../../lib/diesel.js'
import { listLocations } from '../../lib/companies.js'
import { day, money, num, today } from '../../lib/format.js'

// Fuel Usage Report: one row per vehicle with two small month charts (litres
// and RM, fleet card vs cash). Tabs on top: HQ vehicle / Estate machine; each
// tab has its own filters (tick as many as needed; none ticked = all):
//   HQ vehicle:     fleet card (or cash), driver, vehicle, date from – to
//   Estate machine: machine type, machine, date from – to
// The report follows the filters straight away; Search loads the latest data
// again (for when something looks out of date). Date defaults to the 1st of
// this month – today. Print = tables (Jan – Dec litres and RM per person or
// machine, average price per litre), see UsagePrint.js.
// With a driver or fleet card filter every vehicle with matching receipts is
// listed (HQ or not), plus "No vehicle recorded" for receipts without one.
// HQ vehicle data = receipts: cash and fleet-card receipts on fuel claims (not
// rejected) plus fill-ups typed on a card.
// Estate machine data = Operational Diesel Records: diesel
// issued to each machine from the company tank. A record has litres only; its
// RM is litres x the diesel price in force on its date (the "Diesel price"
// button keeps the price list). A location filter shows when the company has
// locations.
// Print prints the charts with the filters in the heading.
const ISSUED_COLOR = '#0d9488'
/** 'RM 2.95 / L' (up to 3 decimals) */
const perL = (v) => `RM ${Number(v).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 3 })} / L`
export default function DieselUsage() {
  const { company, access } = useOutletContext()
  const [fills, setFills] = useState([])
  const [issued, setIssued] = useState([]) // fuel usage records, shaped like fills (estate tab)
  const [locations, setLocations] = useState([])
  const [prices, setPrices] = useState([]) // diesel price per litre by date, newest first
  const [pricing, setPricing] = useState(false)
  const [vehicles, setVehicles] = useState([])
  const [cards, setCards] = useState([])
  const [people, setPeople] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState('hq') // hq = HQ vehicles; estate = the other machines
  // HQ filters ('cash' in cardF = cash receipts; 'none' in driverF = no driver recorded)
  const [cardF, setCardF] = useState([])
  const [driverF, setDriverF] = useState([])
  const [vehicleF, setVehicleF] = useState([])
  // Estate filters
  const [typeF, setTypeF] = useState([])
  const [machineF, setMachineF] = useState([])
  const [locF, setLocF] = useState([])
  const [from, setFrom] = useState(`${today().slice(0, 7)}-01`)
  const [to, setTo] = useState(today())
  // The report follows the filters straight away; Search reloads the data.
  const draft = { cardF, driverF, vehicleF, typeF, machineF, locF, from, to }
  const [printing, setPrinting] = useState(false)
  const report = useRef(null)

  const load = useCallback(async () => {
    try {
      const [v, claims, lines, cardData, p, records, locs, priceList] = await Promise.all([
        listVehicles(company.id),
        listClaims(company.id),
        listClaimLines(company.id).catch(() => []),
        listCardData(company.id),
        listPeople(company.id),
        listFuelRecords(company.id).catch(() => []),
        listLocations(company.id).catch(() => []),
        listDieselPrices(company.id).catch(() => [])
      ])
      setPrices(priceList)
      // RM of a record = litres x the diesel price on its date (0 while no price covers that date).
      setIssued(
        records.map((r) => ({ id: r.id, vehicle_id: r.machine_id, fill_date: r.record_date, litres: r.litres, amount: Number(r.litres) * (dieselPriceOn(priceList, r.record_date) || 0) }))
      )
      setLocations(locs)
      setVehicles(v)
      setCards(cardData.cards)
      setPeople(p)
      const claimById = new Map(claims.map((c) => [c.id, c]))
      setFills([
        ...lines
          .filter((l) => l.line_kind !== 'reload' && claimById.get(l.claim_id)?.status !== 'rejected')
          .map((l) => ({ ...l, source: l.payment === 'fleet_card' ? 'card' : 'cash', driver: claimById.get(l.claim_id)?.claimant_id, fromClaim: true })),
        ...cardData.usage.map((u) => ({ ...u, source: 'card', driver: u.driver_id }))
      ])
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

  const [searching, setSearching] = useState(false)
  async function search() {
    setSearching(true)
    await load()
    setSearching(false)
  }

  const vById = new Map(vehicles.map((v) => [v.id, v]))
  const person = new Map(people.map((p) => [p.user_id, p]))
  const cardById = new Map(cards.map((c) => [c.id, c]))
  const who = (id) => (person.get(id) ? personLabel(person.get(id)) : 'Unknown user')
  const regOf = (v) => (v ? v.reg_no || v.name : '')

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
  const cardOfDriver = new Map()
  for (const c of cards) {
    if (c.vehicle_id) cardOfVehicle.set(c.vehicle_id, cardOfVehicle.has(c.vehicle_id) ? better(cardOfVehicle.get(c.vehicle_id), c) : c)
    for (const d of c.driver_ids?.length ? c.driver_ids : c.driver_id ? [c.driver_id] : [])
      cardOfDriver.set(d, cardOfDriver.has(d) ? better(cardOfDriver.get(d), c) : c)
  }
  // The card written on the receipt when it was saved wins (so removing a
  // driver from a card later does not move their old receipts); receipts
  // saved before that existed fall back to today's vehicle / drivers.
  const cardOf = (f) => {
    if (f.source !== 'card') return null
    if (f.card_id) return cardById.get(f.card_id) || null
    return cardOfVehicle.get(f.vehicle_id) || cardOfDriver.get(f.driver) || null
  }

  // HQ vehicles = ticked "HQ vehicle" in Machinery Profile (before anyone is
  // ticked: road vehicles by Type); Estate machines = everything else.
  const isRoad = (v) => /light|lorry|pickup|pick-up|van|bus|truck/i.test(v.machine_type || '')
  const anyHq = vehicles.some((v) => v.hq_vehicle)
  const isHq = (v) => (anyHq ? Boolean(v.hq_vehicle) : isRoad(v))
  const byReg = (a, b) => regOf(a).localeCompare(regOf(b))
  const hqVehicles = vehicles.filter((v) => isHq(v) && v.is_active !== false).sort(byReg)
  const estateMachines = vehicles.filter((v) => !isHq(v) && v.is_active !== false).sort(byReg)

  // ---- Filter options
  const cardOpts = [
    ...cards
      .filter((c) => c.card_no)
      .sort((a, b) => (a.status === 'active' ? 0 : 1) - (b.status === 'active' ? 0 : 1) || a.card_no.localeCompare(b.card_no))
      .map((c) => ({
        value: c.id,
        label: `${c.card_no}${c.vehicle_id && vById.get(c.vehicle_id) ? ` (${regOf(vById.get(c.vehicle_id))})` : ''}${c.status !== 'active' ? ` · ${c.status === 'application' ? 'applying' : c.status}` : ''}`,
        group: 'Fleet cards'
      })),
    { value: 'cash', label: 'Cash claims (no fleet card)', group: 'Cash' }
  ]
  // Drivers to choose from: anyone with a receipt, fleet card drivers and the drivers of HQ vehicles.
  const driverIds = [
    ...new Set([
      ...fills.map((f) => f.driver),
      ...cards.flatMap((c) => (c.driver_ids?.length ? c.driver_ids : [c.driver_id])),
      ...hqVehicles.flatMap((v) => (v.driver_ids?.length ? v.driver_ids : [v.driver_id]))
    ].filter(Boolean))
  ]
  const driverOpts = [
    ...driverIds.map((id) => ({ value: id, label: who(id) })).sort((a, b) => a.label.localeCompare(b.label)),
    { value: 'none', label: 'No driver recorded' }
  ]
  const vehicleOpts = hqVehicles.map((v) => ({ value: v.id, label: vehicleLabel(v) }))
  const typeOpts = [...new Set(estateMachines.map((v) => v.machine_type || 'No type'))].sort().map((t) => ({ value: t, label: t }))
  const locOpts = [...locations.map((l) => ({ value: l.id, label: l.name })), { value: 'none', label: 'No location' }]
  const locKey = (v) => (locations.some((l) => l.id === v.location_id) ? v.location_id : 'none')
  const machineOpts = estateMachines
    .filter((v) => (!typeF.length || typeF.includes(v.machine_type || 'No type')) && (!locF.length || locF.includes(locKey(v))))
    .map((v) => ({ value: v.id, label: vehicleLabel(v) }))

  // ---- Receipts that pass the filters of the tab
  const A = draft
  const inRange = (d) => (!A.from || d >= A.from) && (!A.to || d <= A.to)
  const passHq = (f) =>
    (!A.vehicleF.length || A.vehicleF.includes(f.vehicle_id)) &&
    (!A.driverF.length || A.driverF.includes(f.driver || 'none')) &&
    (!A.cardF.length || (f.source === 'cash' ? A.cardF.includes('cash') : A.cardF.includes(cardOf(f)?.id)))
  // HQ: receipts. Estate: fuel usage records.
  const rows = tab === 'hq' ? fills.filter((f) => inRange(f.fill_date) && passHq(f)) : issued.filter((f) => inRange(f.fill_date) && (!A.machineF.length || A.machineF.includes(f.vehicle_id)))
  const hasVehicle = new Set(rows.map((r) => r.vehicle_id))

  // Vehicles listed: HQ with a card / driver filter → the vehicles with
  // receipts in it (and the chosen cards' own vehicles); a vehicle filter →
  // those vehicles. Estate: by type and machine.
  const hqFiltered = A.cardF.length > 0 || A.driverF.length > 0
  const chosenCardVehicles = new Set(A.cardF.map((id) => cardById.get(id)?.vehicle_id).filter(Boolean))
  const NO_VEHICLE = { id: '', name: 'No vehicle recorded', machine_type: '' }
  const listed =
    tab === 'hq'
      ? hqFiltered
        ? // every vehicle with matching receipts (HQ or not), the chosen cards' own vehicles, then receipts without a vehicle
          [
            ...vehicles
              .filter((v) => (hasVehicle.has(v.id) || chosenCardVehicles.has(v.id)) && (!A.vehicleF.length || A.vehicleF.includes(v.id)))
              .sort(byReg),
            ...(rows.some((r) => !r.vehicle_id) && !A.vehicleF.length ? [NO_VEHICLE] : [])
          ]
        : hqVehicles.filter((v) => !A.vehicleF.length || A.vehicleF.includes(v.id))
      : estateMachines.filter(
          (v) =>
            (!A.typeF.length || A.typeF.includes(v.machine_type || 'No type')) &&
            (!A.locF.length || A.locF.includes(locKey(v))) &&
            (!A.machineF.length || A.machineF.includes(v.id))
        )
  const linesOf = (vid) => rows.filter((f) => (f.vehicle_id || '') === vid).map((f) => ({ ...f, payment: f.source === 'card' ? 'fleet_card' : 'cash' }))
  // Driver column: the vehicle's driver; with a driver filter, or when the
  // vehicle has none, the people whose receipts are on it.
  const driverOf = (v) => {
    const claimants = [...new Set(rows.filter((f) => (f.vehicle_id || '') === v.id).map((f) => f.driver).filter(Boolean))]
    const id = v.driver_ids?.[0] || v.driver_id
    if (claimants.length && (A.driverF.length || !id)) return claimants.map(who).join(', ')
    return id ? who(id) : '—'
  }
  // Charts show the 12 months of the year the date range ends in.
  const year = Number((A.to || today()).slice(0, 4))

  const names = (vals, opts, all) => (vals.length ? vals.map((v) => opts.find((o) => o.value === v)?.label).filter(Boolean).join(', ') : all)
  const filterLines =
    tab === 'hq'
      ? [
          `Fleet card: ${names(A.cardF, cardOpts, 'all (fleet card and cash)')}`,
          `Driver: ${names(A.driverF, driverOpts, 'all')} · Vehicle: ${names(A.vehicleF, vehicleOpts, 'all')}`
        ]
      : [
          `Machine type: ${names(A.typeF, typeOpts, 'all')} · Machine: ${names(A.machineF, machineOpts, 'all')}${locations.length ? ` · Location: ${names(A.locF, locOpts, 'all')}` : ''}`,
          `Diesel issued, from Operational Diesel Records · RM = litres x diesel price${prices[0] ? ` (now ${perL(prices[0].price)})` : ' (no price set)'}`
        ]

  // Print: a table, one row per person (HQ: who claimed / drove) or per
  // machine (estate), Jan – Dec litres and RM of the year, and the average
  // fuel price per litre.
  async function print() {
    setPrinting(true)
    try {
      // The whole year (Jan – Dec of the year the date range ends in), with the other filters.
      const yearRows =
        tab === 'hq' ? fills.filter(passHq) : issued.filter((f) => !A.machineF.length || A.machineF.includes(f.vehicle_id))
      const byKey = new Map()
      for (const f of yearRows) {
        if (!f.fill_date.startsWith(String(year))) continue
        if (tab === 'estate' && !listed.some((v) => v.id === f.vehicle_id)) continue
        const k = tab === 'hq' ? f.driver || 'none' : f.vehicle_id || 'none'
        const r = byKey.get(k) || {
          name: tab === 'hq' ? (k === 'none' ? 'No driver recorded' : who(k)) : k === 'none' ? 'No machine recorded' : vehicleLabel(vById.get(k)),
          litres: Array(12).fill(0),
          amount: Array(12).fill(0)
        }
        const m = Number(f.fill_date.slice(5, 7)) - 1
        r.litres[m] += Number(f.litres || 0)
        r.amount[m] += Number(f.amount || 0)
        byKey.set(k, r)
      }
      await printUsageTable({
        title: 'Fuel Usage Reports',
        nameHeader: tab === 'hq' ? 'User' : 'Machine',
        year,
        rows: [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name)),
        lines: [
          `${company.name} · ${tab === 'hq' ? 'HQ Vehicle' : 'Estate Machinery'}`,
          `Year ${year}, January – December`,
          ...filterLines,
          `Printed ${day(today())}`
        ]
      })
    } catch (e) {
      setError(e.message)
    } finally {
      setPrinting(false)
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

      {loading ? (
        <Loading />
      ) : (
        <Card>
          <div ref={report}>
            {/* Tabs on top; each tab has its own filters below */}
            <div className="flex border-b border-slate-200">
              {[
                ['hq', 'HQ Vehicle'],
                ['estate', 'Estate Machinery']
              ].map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setTab(k)}
                  data-noprint={tab === k ? undefined : ''}
                  className={`relative px-6 py-3 text-sm font-bold first:rounded-tl-2xl ${tab === k ? 'bg-white text-brand' : 'bg-slate-50/60 text-slate-600 hover:bg-white/60'}`}
                >
                  {label}
                  {tab === k && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-brand" />}
                </button>
              ))}
              <span className="flex-1 rounded-tr-2xl bg-slate-50/60" />
            </div>

            <div className="border-b border-slate-200 p-3" data-noprint>
              <div
                className={`grid gap-3 sm:grid-cols-2 ${
                  tab === 'hq'
                    ? 'lg:grid-cols-[minmax(0,1.7fr)_minmax(0,0.9fr)_minmax(0,1.1fr)_minmax(0,1.5fr)_auto]' // fleet card widest, driver narrower
                    : 'lg:grid-cols-[repeat(3,minmax(0,1fr))_minmax(0,1.4fr)_auto]'
                }`}
              >
                {tab === 'hq' ? (
                  <>
                    <div>
                      <MultiPick label="Fleet card" allLabel="All (fleet card and cash)" options={cardOpts} value={cardF} onChange={setCardF} />
                      {!cardOpts.some((o) => o.value !== 'cash') && (
                        <p className="mt-1 text-[11px] text-amber-700">No fleet card with a card number in {company.name}.</p>
                      )}
                    </div>
                    <MultiPick label="Driver" allLabel="All drivers" options={driverOpts} value={driverF} onChange={setDriverF} />
                    <MultiPick label="Vehicle" allLabel="All HQ vehicles" options={vehicleOpts} value={vehicleF} onChange={setVehicleF} />
                  </>
                ) : (
                  <>
                    <MultiPick
                      label="Machine type"
                      allLabel="All types"
                      options={typeOpts}
                      value={typeF}
                      onChange={(v) => {
                        setTypeF(v)
                        setMachineF((m) => m.filter((id) => !v.length || v.includes(vById.get(id)?.machine_type || 'No type')))
                      }}
                    />
                    <MultiPick label="Machine" allLabel="All machines" options={machineOpts} value={machineF} onChange={setMachineF} />
                    {locations.length > 0 ? (
                      <MultiPick
                        label="Location"
                        allLabel="All locations"
                        options={locOpts}
                        value={locF}
                        onChange={(v) => {
                          setLocF(v)
                          setMachineF((m) => m.filter((id) => !v.length || (vById.get(id) && v.includes(locKey(vById.get(id))))))
                        }}
                      />
                    ) : (
                      <span className="hidden lg:block" />
                    )}
                  </>
                )}
                <div>
                  <span className="mb-1 block text-xs font-semibold text-slate-600">Date</span>
                  <div className="flex items-center gap-2">
                    <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className={`${inputCls} h-12 min-w-0 flex-1 rounded-xl px-2 text-sm`} aria-label="From date" />
                    <span className="text-sm text-slate-400">to</span>
                    <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className={`${inputCls} h-12 min-w-0 flex-1 rounded-xl px-2 text-sm`} aria-label="To date" />
                  </div>
                </div>
                <div className="flex items-end">
                  <Button onClick={search} disabled={searching} className="h-12 w-full lg:w-auto" title="Load the latest data again">
                    <IconSearch width={18} height={18} /> {searching ? 'Loading…' : 'Search'}
                  </Button>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-3 px-4 py-2 text-[11px] text-slate-600">
              {tab === 'hq' ? (
                <>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: FUEL_COLORS.card }} /> Fleet card (KPDN)
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: FUEL_COLORS.cash }} /> Cash
                  </span>
                </>
              ) : (
                <>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: ISSUED_COLOR }} /> Diesel issued (from Operational Diesel Records)
                  </span>
                  <button
                    type="button"
                    data-noprint
                    onClick={() => setPricing(true)}
                    className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 font-semibold ${prices.length ? 'border-slate-200 text-slate-700 hover:border-brand hover:text-brand' : 'border-amber-300 bg-amber-50 text-amber-800'}`}
                    title="RM = litres x the diesel price on the record's date"
                  >
                    <IconPencil width={12} height={12} /> {prices.length ? `Diesel price: ${perL(prices[0].price)}` : 'Set the diesel price (RM chart is empty)'}
                  </button>
                </>
              )}
              <span className="font-semibold text-slate-700">{year}</span>
            </div>

            {listed.length === 0 ? (
              <Empty>
                {hqFiltered || A.vehicleF.length || A.typeF.length || A.machineF.length || A.locF.length
                  ? 'No vehicle for this filter.'
                  : tab === 'hq'
                    ? 'No HQ vehicles yet. Tick "HQ vehicle" in Machinery Profile.'
                    : 'No estate machines in Machinery Profile yet.'}
              </Empty>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] text-sm">
                  <thead>
                    <tr className="border-y border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <th className="w-44 px-4 py-2">{tab === 'hq' ? 'Vehicle reg no.' : 'Machine'}</th>
                      <th className="w-40 px-3 py-2">{tab === 'hq' ? 'Driver' : 'Type'}</th>
                      <th className="px-3 py-2">Monthly Fuel Usage (Litre)</th>
                      <th className="px-3 py-2">Monthly Fuel Expenses (RM)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {listed.map((v) => (
                      <VehicleRow
                        key={v.id || 'none'}
                        v={v}
                        rows={linesOf(v.id)}
                        second={tab === 'hq' ? driverOf(v) : [v.machine_type || '—', locations.find((l) => l.id === v.location_id)?.name].filter(Boolean).join(' · ')}
                        year={year}
                        issued={tab !== 'hq'}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Card>
      )}
      {pricing && <PriceModal company={company} prices={prices} canEdit={access.can('fuel_record', 'edit')} onClose={() => setPricing(false)} onChanged={load} />}
    </div>
  )
}

// One vehicle: reg no. (and name), driver (or type), and the two small month
// charts. An estate machine (`issued`) has one colour: diesel issued.
function VehicleRow({ v, rows, second, year, issued }) {
  const plain = issued ? ISSUED_COLOR : undefined
  return (
    <tr className="border-b border-slate-100 align-middle last:border-b-0">
      <td className="px-4 py-2 font-semibold text-slate-800">
        {v.reg_no || v.name}
        {v.reg_no && v.reg_no !== v.name && <span className="block text-xs font-normal text-slate-400">{v.name}</span>}
      </td>
      <td className="px-3 py-2 text-slate-700">{second}</td>
      <td className="px-3 py-1.5">
        <MiniBars rows={rows} year={year} metric="litres" fmt={(x) => `${num(x, 1)} L`} plain={plain} />
      </td>
      <td className="px-3 py-1.5">
        <MiniBars rows={rows} year={year} metric="amount" fmt={money} plain={plain} />
      </td>
    </tr>
  )
}

// Diesel price per litre, by date. A record's RM uses the newest price dated
// on or before the record, so an old price keeps applying to old months.
function PriceModal({ company, prices, canEdit, onClose, onChanged }) {
  const [date, setDate] = useState(today())
  const [price, setPrice] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function run(fn) {
    setBusy(true)
    setError('')
    try {
      await fn()
      await onChanged()
    } catch (e) {
      setError(e.message || 'Could not save.')
    } finally {
      setBusy(false)
    }
  }
  function add(e) {
    e.preventDefault()
    if (!(Number(price) > 0)) return setError('Enter the price per litre.')
    run(async () => {
      await saveDieselPrice(company.id, { effective_from: date, price: Number(price) })
      setPrice('')
    })
  }
  return (
    <Modal open onClose={onClose} title="Diesel price (RM per litre)">
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          The RM chart of estate machines is litres × this price. A price applies from its date until the next one, so add a new line when the
          price changes; earlier months keep the earlier price.
        </p>
        <ErrorBox>{error}</ErrorBox>
        {canEdit && (
          <form onSubmit={add} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
            <label className="block text-xs font-medium text-slate-600">
              From date
              <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} className={`${inputCls} mt-1`} />
            </label>
            <label className="block text-xs font-medium text-slate-600">
              RM per litre
              <input type="number" inputMode="decimal" min="0.001" step="0.001" required value={price} onChange={(e) => setPrice(e.target.value)} className={`${inputCls} mt-1`} placeholder="e.g. 2.95" />
            </label>
            <Button type="submit" disabled={busy}>
              Add
            </Button>
          </form>
        )}
        {prices.length === 0 ? (
          <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">No price yet, so the RM chart is empty.{canEdit ? ' Add the first one above.' : ' Ask someone who may edit fuel usage records to add it.'}</p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {prices.map((p, i) => (
              <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="text-slate-700">
                  From {day(p.effective_from)}
                  {i === 0 && p.effective_from <= today() && <span className="ml-2 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">current</span>}
                </span>
                <span className="flex items-center gap-2">
                  <span className="font-semibold tabular-nums text-slate-900">{perL(p.price)}</span>
                  {canEdit && (
                    <button disabled={busy} onClick={() => window.confirm(`Remove the price from ${day(p.effective_from)}?`) && run(() => deleteDieselPrice(p.id))} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="Remove price">
                      <IconTrash width={16} height={16} />
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="flex justify-end">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  )
}
