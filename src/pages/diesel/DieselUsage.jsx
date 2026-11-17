import { useCallback, useEffect, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import PageHeader from '../../components/PageHeader.jsx'
import { Button, Card } from '../../components/ui.jsx'
import { IconPrint, IconSearch } from '../../components/icons.jsx'
import { Empty, ErrorBox, Loading, inputCls } from '../../components/diesel/shared.jsx'
import { MultiPick } from '../../components/diesel/MultiPick.jsx'
import { printElement } from '../../lib/printFrame.js'
import { FUEL_COLORS, MiniBars } from '../../components/diesel/FuelDashboard.jsx'
import { listCardData, listClaimLines, listClaims, listPeople, listVehicles, personLabel, vehicleLabel } from '../../lib/diesel.js'
import { day, money, num, today } from '../../lib/format.js'

// Fuel Usage Report: one row per vehicle with two small month charts (litres
// and RM, fleet card vs cash). Tabs on top: HQ vehicle / Estate machine; each
// tab has its own filters (tick as many as needed; none ticked = all):
//   HQ vehicle:     fleet card (or cash), driver, vehicle, date from – to
//   Estate machine: machine type, machine, date from – to
// The filters take effect when Search is pressed (Search also reloads the
// receipts from the database). Date defaults to the 1st of this month – today.
// With a driver or fleet card filter every vehicle with matching receipts is
// listed (HQ or not), plus "No vehicle recorded" for receipts without one.
// Receipts = cash and fleet-card receipts on fuel claims (not rejected) plus
// fill-ups typed on a card. Print prints the charts with the filters in the
// heading.
export default function DieselUsage() {
  const { company } = useOutletContext()
  const [fills, setFills] = useState([])
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
  const [from, setFrom] = useState(`${today().slice(0, 7)}-01`)
  const [to, setTo] = useState(today())
  // What the report shows: the filters as they were when Search was pressed.
  const [applied, setApplied] = useState({ cardF: [], driverF: [], vehicleF: [], typeF: [], machineF: [], from: `${today().slice(0, 7)}-01`, to: today() })
  const draft = { cardF, driverF, vehicleF, typeF, machineF, from, to }
  const pending = JSON.stringify(draft) !== JSON.stringify(applied)
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
    setApplied(draft)
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
  const cardOf = (f) => {
    if (f.source !== 'card') return null
    if (!f.fromClaim && f.card_id) return cardById.get(f.card_id) || null
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
  const driverIds = [...new Set([...fills.map((f) => f.driver).filter(Boolean), ...cards.flatMap((c) => c.driver_ids || [])])]
  const driverOpts = [
    ...driverIds.map((id) => ({ value: id, label: who(id) })).sort((a, b) => a.label.localeCompare(b.label)),
    { value: 'none', label: 'No driver recorded' }
  ]
  const vehicleOpts = hqVehicles.map((v) => ({ value: v.id, label: vehicleLabel(v) }))
  const typeOpts = [...new Set(estateMachines.map((v) => v.machine_type || 'No type'))].sort().map((t) => ({ value: t, label: t }))
  const machineOpts = estateMachines
    .filter((v) => !typeF.length || typeF.includes(v.machine_type || 'No type'))
    .map((v) => ({ value: v.id, label: vehicleLabel(v) }))

  // ---- Receipts that pass the filters of the tab (as applied by Search)
  const A = applied
  const inRange = (d) => (!A.from || d >= A.from) && (!A.to || d <= A.to)
  const passHq = (f) =>
    (!A.vehicleF.length || A.vehicleF.includes(f.vehicle_id)) &&
    (!A.driverF.length || A.driverF.includes(f.driver || 'none')) &&
    (!A.cardF.length || (f.source === 'cash' ? A.cardF.includes('cash') : A.cardF.includes(cardOf(f)?.id)))
  const rows = fills.filter((f) => inRange(f.fill_date) && (tab === 'hq' ? passHq(f) : !A.machineF.length || A.machineF.includes(f.vehicle_id)))
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
      : estateMachines.filter((v) => (!A.typeF.length || A.typeF.includes(v.machine_type || 'No type')) && (!A.machineF.length || A.machineF.includes(v.id)))
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
      : [`Machine type: ${names(A.typeF, typeOpts, 'all')} · Machine: ${names(A.machineF, machineOpts, 'all')}`]

  async function print() {
    if (!report.current) return
    setPrinting(true)
    try {
      await printElement(report.current, {
        title: 'Fuel Usage Report',
        lines: [
          `${company.name} · ${tab === 'hq' ? 'HQ vehicles' : 'Estate machines'}`,
          `${A.from ? day(A.from) : 'Start'} – ${A.to ? day(A.to) : 'today'} (charts: ${year})`,
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
                ['hq', 'HQ vehicle'],
                ['estate', 'Estate machine']
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
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[repeat(3,minmax(0,1fr))_minmax(0,1.4fr)_auto]">
                {tab === 'hq' ? (
                  <>
                    <MultiPick label="Fleet card" allLabel="All (fleet card and cash)" options={cardOpts} value={cardF} onChange={setCardF} />
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
                    <span className="hidden lg:block" />
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
                  <Button onClick={search} disabled={searching} className={`h-12 w-full lg:w-auto ${pending ? '' : 'opacity-90'}`}>
                    <IconSearch width={18} height={18} /> {searching ? 'Searching…' : 'Search'}
                  </Button>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-3 px-4 py-2 text-[11px] text-slate-600">
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: FUEL_COLORS.card }} /> Fleet card (KPDN)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: FUEL_COLORS.cash }} /> Cash
              </span>
              <span className="font-semibold text-slate-700">{year}</span>
            </div>

            {pending && (
              <p className="border-b border-amber-100 bg-amber-50 px-4 py-1.5 text-xs text-amber-800" data-noprint>
                Filters changed — press Search to update the report.
              </p>
            )}
            {listed.length === 0 ? (
              <Empty>
                {hqFiltered || A.vehicleF.length || A.typeF.length || A.machineF.length
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
                      <VehicleRow key={v.id || 'none'} v={v} rows={linesOf(v.id)} second={tab === 'hq' ? driverOf(v) : v.machine_type || '—'} year={year} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  )
}

// One vehicle: reg no. (and name), driver (or type), and the two small month charts.
function VehicleRow({ v, rows, second, year }) {
  return (
    <tr className="border-b border-slate-100 align-middle last:border-b-0">
      <td className="px-4 py-2 font-semibold text-slate-800">
        {v.reg_no || v.name}
        {v.reg_no && v.reg_no !== v.name && <span className="block text-xs font-normal text-slate-400">{v.name}</span>}
      </td>
      <td className="px-3 py-2 text-slate-700">{second}</td>
      <td className="px-3 py-1.5">
        <MiniBars rows={rows} year={year} metric="litres" fmt={(x) => `${num(x, 1)} L`} />
      </td>
      <td className="px-3 py-1.5">
        <MiniBars rows={rows} year={year} metric="amount" fmt={money} />
      </td>
    </tr>
  )
}
