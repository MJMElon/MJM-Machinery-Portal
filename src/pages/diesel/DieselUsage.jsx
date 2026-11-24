import { useCallback, useEffect, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import PageHeader from '../../components/PageHeader.jsx'
import { Button, Card, Modal } from '../../components/ui.jsx'
import { IconChart, IconList, IconPencil, IconPrint, IconSearch, IconTrash } from '../../components/icons.jsx'
import { Empty, ErrorBox, Loading, inputCls } from '../../components/diesel/shared.jsx'
import { MultiPick } from '../../components/diesel/MultiPick.jsx'
import { printUsageDetail, printUsageTable } from '../../components/diesel/UsagePrint.js'
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
  receiptUrls,
  saveDieselPrice,
  vehicleLabel
} from '../../lib/diesel.js'
import { listLocations } from '../../lib/companies.js'
import { useCompany } from '../../lib/CompanyContext.jsx'
import { day, money, num, today } from '../../lib/format.js'

// Fuel Usage Report: one row per vehicle with two small month charts (litres
// and RM, fleet card vs cash). Tabs on top: HQ vehicle / Estate machine; each
// tab has its own filters (tick as many as needed; none ticked = all), on the
// column titles of the table (click a title to filter):
//   HQ vehicle:     Type (fleet card or cash), driver, vehicle
//   Estate machine: machine type, machine, location
// The date range sits at the top left of the table with a search icon next to
// it. The report follows the filters straight away; the search icon loads the
// latest data again (for when something looks out of date). Date defaults to the 1st of
// this month – today. Print = tables (Jan – Dec litres and RM per person or
// machine, average price per litre), see UsagePrint.js.
// HQ Vehicle tab: only vehicles ticked "HQ vehicle" in Machinery Profile (and
// their receipts); with a driver or fleet card filter, the HQ vehicles with
// matching receipts.
// HQ vehicle data = receipts: cash and fleet-card receipts on fuel claims (not
// rejected) plus fill-ups typed on a card.
// Estate machine data = Estate Fuel Record: diesel
// issued to each machine from the company tank. A record has litres only; its
// RM is litres x the diesel price in force on its date (the "Diesel price"
// button keeps the price list). A location filter shows when the company has
// locations.
// Print prints the charts with the filters in the heading.
const ISSUED_COLOR = '#0d9488'
// a date box only as wide as dd/mm/yyyy
const dateCls = 'h-9 w-auto rounded-lg border border-slate-300 bg-white px-2 text-sm font-normal text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-300'
/** 'RM 2.95 / L' (up to 3 decimals) */
const perL = (v) => `RM ${Number(v).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 3 })} / L`
export default function DieselUsage() {
  const { company, access } = useOutletContext()
  const { companies } = useCompany()
  const billName = (id) => (companies || []).find((c) => c.id === id)?.name || 'Another company'
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
  // Chart view (monthly bars per vehicle) or Table view (every receipt, grouped by fleet card); remembered in this browser
  const [view, setViewState] = useState(() => {
    try {
      return localStorage.getItem('fuel.usage.view') === 'table' ? 'table' : 'chart'
    } catch {
      return 'chart'
    }
  })
  const setView = (v) => {
    setViewState(v)
    try {
      localStorage.setItem('fuel.usage.view', v)
    } catch {
      /* ignore */
    }
  }
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
        records.map((r) => ({ id: r.id, vehicle_id: r.machine_id, fill_date: r.record_date, litres: r.litres, remark: r.remark, amount: Number(r.litres) * (dieselPriceOn(priceList, r.record_date) || 0) }))
      )
      setLocations(locs)
      setVehicles(v)
      setCards(cardData.cards)
      setPeople(p)
      const claimById = new Map(claims.map((c) => [c.id, c]))
      const counted = lines.filter((l) => l.line_kind !== 'reload' && !['rejected', 'draft'].includes(claimById.get(l.claim_id)?.status))
      const countedIds = new Set(counted.map((l) => l.id))
      setFills([
        ...counted.map((l) => {
          const c = claimById.get(l.claim_id)
          return {
            ...l,
            source: l.payment === 'fleet_card' ? 'card' : 'cash',
            driver: c?.claimant_id,
            fromClaim: true,
            claimedOn: c?.submitted_on || c?.created_at?.slice(0, 10) || '',
            claimNo: c?.claim_no != null ? String(c.claim_no).padStart(3, '0') : ''
          }
        }),
        // fuel station statement rows already matched to one of those receipts are that receipt (count once)
        ...cardData.usage
          .filter((u) => !u.claim_line_id || !countedIds.has(u.claim_line_id))
          .map((u) => ({ ...u, source: 'card', driver: u.driver_id, remark: u.remark ?? (u.source && u.source !== 'manual' ? `Setel statement, not claimed yet${u.driver_name ? ` (${u.driver_name})` : ''}` : u.notes) }))
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
  // Drivers of a ticked fleet card are listed first.
  const driversOfCard = (c) => (c?.driver_ids?.length ? c.driver_ids : c?.driver_id ? [c.driver_id] : [])
  const onChosenCards = new Set(cardF.flatMap((id) => driversOfCard(cardById.get(id))))
  const byLabel = (a, b) => a.label.localeCompare(b.label)
  const driverOpts = [
    ...driverIds.filter((id) => onChosenCards.has(id)).map((id) => ({ value: id, label: who(id), group: 'On the chosen fleet card' })).sort(byLabel),
    ...driverIds
      .filter((id) => !onChosenCards.has(id))
      .map((id) => ({ value: id, label: who(id), group: onChosenCards.size ? 'Other drivers' : '' }))
      .sort(byLabel),
    { value: 'none', label: 'No driver recorded', group: onChosenCards.size ? 'Other drivers' : '' }
  ]
  // A driver's own cars come ONLY from Machinery Profile: the vehicles that
  // have this person as a driver. A fleet card is shared by several drivers,
  // so the card's vehicle is not anybody's own car. General cars are never "own".
  const isGeneral = (v) => Boolean(v?.general_use)
  const ownCarIds = (uid) =>
    vehicles.filter((v) => !isGeneral(v) && (v.driver_ids?.length ? v.driver_ids : [v.driver_id]).includes(uid)).map((v) => v.id)
  // Vehicle list: general cars first (easy to find), then the other HQ vehicles.
  const generalCars = vehicles.filter((v) => isGeneral(v) && v.is_active !== false).sort(byReg)
  // Vehicle list: general cars, then the own cars of the ticked drivers (even
  // when not an HQ vehicle), then the other HQ vehicles, then anything else
  // that is ticked — every ticked vehicle is in the list, so it can be unticked.
  const driverCarIds = [...new Set(driverF.filter((d) => d !== 'none').flatMap(ownCarIds))]
  const shownIds = new Set()
  const opt = (v, group) => {
    shownIds.add(v.id)
    return { value: v.id, label: vehicleLabel(v), group }
  }
  const vehicleOpts = [
    // HQ vehicles only (general cars and drivers' own cars that are ticked HQ)
    ...generalCars.filter(isHq).map((v) => opt(v, 'General cars')),
    ...driverCarIds
      .map((id) => vById.get(id))
      .filter((v) => v && isHq(v) && !shownIds.has(v.id))
      .sort(byReg)
      .map((v) => opt(v, "Ticked drivers' own cars")),
    ...hqVehicles.filter((v) => !isGeneral(v) && !shownIds.has(v.id)).map((v) => opt(v, 'HQ vehicles')),
    ...vehicleF
      .map((id) => vById.get(id))
      .filter((v) => v && !shownIds.has(v.id))
      .map((v) => opt(v, 'Other vehicles'))
  ]
  // Ticking a driver ticks their own cars under Vehicle (tick a general car
  // there too to see the driver's receipts on it); unticking takes them off.
  const pickDrivers = (next) => {
    const added = next.filter((d) => !driverF.includes(d))
    const removed = driverF.filter((d) => !next.includes(d))
    setDriverF(next)
    setVehicleF((vs) => {
      const keep = new Set(next.flatMap(ownCarIds))
      const out = vs.filter((id) => keep.has(id) || !removed.some((d) => ownCarIds(d).includes(id)))
      for (const d of added) for (const id of ownCarIds(d)) if (!out.includes(id)) out.push(id)
      return out
    })
  }
  // Ticking a fleet card ticks its drivers (and so their cars); unticking takes them off.
  const pickCards = (next) => {
    const added = next.filter((c) => !cardF.includes(c))
    const removed = cardF.filter((c) => !next.includes(c))
    setCardF(next)
    const stay = new Set(next.flatMap((id) => driversOfCard(cardById.get(id))))
    let drivers = driverF.filter((d) => stay.has(d) || !removed.some((id) => driversOfCard(cardById.get(id)).includes(d)))
    for (const id of added) for (const d of driversOfCard(cardById.get(id))) if (!drivers.includes(d)) drivers.push(d)
    pickDrivers(drivers)
  }
  const typeOpts = [...new Set(estateMachines.map((v) => v.machine_type || 'No type'))].sort().map((t) => ({ value: t, label: t }))
  const locOpts = [...locations.map((l) => ({ value: l.id, label: l.name })), { value: 'none', label: 'No location' }]
  const locKey = (v) => (locations.some((l) => l.id === v.location_id) ? v.location_id : 'none')
  const machineOpts = estateMachines
    .filter((v) => (!typeF.length || typeF.includes(v.machine_type || 'No type')) && (!locF.length || locF.includes(locKey(v))))
    .map((v) => ({ value: v.id, label: vehicleLabel(v) }))

  // ---- Filters sit on the column titles (click a title to filter)
  const pickType = (v) => {
    setTypeF(v)
    setMachineF((m) => m.filter((id) => !v.length || v.includes(vById.get(id)?.machine_type || 'No type')))
  }
  const pickLoc = (v) => {
    setLocF(v)
    setMachineF((m) => m.filter((id) => !v.length || (vById.get(id) && v.includes(locKey(vById.get(id))))))
  }
  const F = {
    card: (label = 'Type') => <MultiPick head label={label} allLabel="All (fleet card and cash)" options={cardOpts} value={cardF} onChange={pickCards} />,
    driver: (label = 'Driver') => <MultiPick head searchable searchPlaceholder="Search driver name…" label={label} allLabel="All drivers" options={driverOpts} value={driverF} onChange={pickDrivers} />,
    vehicle: (label = 'Vehicle') => <MultiPick head searchable searchPlaceholder="Search vehicle…" label={label} allLabel="All HQ vehicles" options={vehicleOpts} value={vehicleF} onChange={setVehicleF} />,
    type: (label = 'Type') => <MultiPick head label={label} allLabel="All types" options={typeOpts} value={typeF} onChange={pickType} />,
    machine: (label = 'Machine') => <MultiPick head label={label} allLabel="All machines" options={machineOpts} value={machineF} onChange={setMachineF} />,
    loc: (label = 'Location') => (locations.length ? <MultiPick head label={label} allLabel="All locations" options={locOpts} value={locF} onChange={pickLoc} /> : label)
  }

  // ---- Receipts that pass the filters of the tab
  const A = draft
  const inRange = (d) => (!A.from || d >= A.from) && (!A.to || d <= A.to)
  // HQ Vehicle tab: only receipts of vehicles ticked "HQ vehicle" in Machinery Profile
  const hqIds = new Set(vehicles.filter(isHq).map((v) => v.id))
  const passHq = (f) =>
    hqIds.has(f.vehicle_id) &&
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
  const listed =
    tab === 'hq'
      ? hqFiltered
        ? // every vehicle with matching receipts (HQ or not), the chosen cards' own vehicles, then receipts without a vehicle
          [
            ...vehicles
              .filter((v) => hqIds.has(v.id) && (hasVehicle.has(v.id) || chosenCardVehicles.has(v.id)) && (!A.vehicleF.length || A.vehicleF.includes(v.id)))
              .sort(byReg)
          ]
        : hqVehicles.filter((v) => !A.vehicleF.length || A.vehicleF.includes(v.id))
      : estateMachines.filter(
          (v) =>
            (!A.typeF.length || A.typeF.includes(v.machine_type || 'No type')) &&
            (!A.locF.length || A.locF.includes(locKey(v))) &&
            (!A.machineF.length || A.machineF.includes(v.id))
        )
  // With drivers ticked (HQ): one row per driver, every car they fuelled in
  // one bar: own car / general car / other car.
  const byDriver = tab === 'hq' && A.driverF.length > 0
  const CAR_PARTS = [
    { key: 'own', color: '#2a78d6', label: 'Own car' },
    { key: 'general', color: '#8a5cd6', label: 'General car' },
    { key: 'other', color: '#94a3b8', label: 'Other / no car' }
  ]
  const driverRows = byDriver
    ? A.driverF
        .map((d) => {
          const mine = rows.filter((f) => (f.driver || 'none') === d)
          const own = new Set(d === 'none' ? [] : ownCarIds(d))
          const kind = (f) => (own.has(f.vehicle_id) ? 'own' : isGeneral(vById.get(f.vehicle_id)) ? 'general' : 'other')
          const used = [...new Set(mine.map((f) => f.vehicle_id || ''))]
          const cars = [
            ...[...own].map((id) => ({ id, kind: 'own' })),
            ...used.filter((id) => !own.has(id)).map((id) => ({ id, kind: id ? kind({ vehicle_id: id }) : 'other' }))
          ]
          return {
            id: d,
            name: d === 'none' ? 'No driver recorded' : who(d),
            cars,
            rows: mine,
            series: CAR_PARTS.map((p) => ({ ...p, test: (f) => kind(f) === p.key }))
          }
        })
        .sort((a, b) => a.name.localeCompare(b.name))
    : []

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
          `Diesel issued, from Estate Fuel Record · RM = litres x diesel price${prices[0] ? ` (now ${perL(prices[0].price)})` : ' (no price set)'}`
        ]

  // Table view. HQ: by vehicle (reg no. once as the title), each vehicle with
  // a Fleet card section, then a Cash claim section: receipt date, receipt
  // no., litre, RM/L, total amount and the remark (the receipt's own remark,
  // e.g. the other company to charge, then company · claim no. · claimant).
  // Estate: every diesel record, grouped by machine type.
  const coShort = company.short_name || company.code || company.name
  const detailGroups = (() => {
    const groups = new Map()
    const add = (key, title, order, row) => {
      if (!groups.has(key)) groups.set(key, { key, title, order, rows: [] })
      groups.get(key).rows.push(row)
    }
    for (const f of rows) {
      if (tab === 'hq') {
        const c = f.source === 'card' ? cardOf(f) : null
        const v = vById.get(f.vehicle_id)
        const row = {
          id: `${f.source}-${f.id}`,
          date: f.fill_date,
          who: f.driver ? who(f.driver) : 'No driver recorded',
          vehicle: v ? regOf(v) : 'No vehicle',
          general: Boolean(v?.general_use),
          type: f.source === 'cash' ? 'Cash' : 'Fleet card',
          receipt: f.receipt_no || '',
          litres: Number(f.litres || 0),
          amount: Number(f.amount || 0),
          remark: f.remark || f.notes || '',
          // for the receipt pages of the printout (receipts on fuel claims only)
          claimed: Boolean(f.fromClaim),
          photo: f.fromClaim ? f.receipt_path || '' : '',
          claimedOn: f.claimedOn || '',
          claimNo: f.claimNo || '',
          card: f.source === 'cash' ? 'Cash' : c ? `Fleet card ${c.card_no}` : 'Fleet card'
        }
        row.cardNo = c?.card_no || ''
        // Bill to company chosen on the claim receipt (migration 20261229)
        row.billTo = f.bill_to_company_id ? billName(f.bill_to_company_id) : ''
        row.from = f.fromClaim ? [coShort, f.claimNo ? `Claim ${f.claimNo}` : '', row.who].filter(Boolean).join(' · ') : f.driver ? row.who : ''
        // one group per vehicle and kind: fleet card first, then cash
        const vk = f.vehicle_id || ''
        const vOrder = v ? `a${regOf(v)}` : 'zz'
        add(`${vk}|${f.source}`, f.source === 'cash' ? 'Cash claim' : 'Fleet card', `${vOrder}|${f.source === 'card' ? 'a' : 'b'}`, row)
        groups.get(`${vk}|${f.source}`).vehicle = { key: vk, title: v ? regOf(v) : 'No vehicle recorded', name: v && v.reg_no && v.reg_no !== v.name ? v.name : '', general: Boolean(v?.general_use) }
        groups.get(`${vk}|${f.source}`).kind = f.source
      } else {
        const v = vById.get(f.vehicle_id)
        if (v && !listed.some((x) => x.id === v.id)) continue
        const type = v?.machine_type || 'No type'
        add(type, type, type, {
          id: f.id,
          type,
          date: f.fill_date,
          who: v ? vehicleLabel(v) : 'No machine recorded',
          vehicle: locations.find((l) => l.id === v?.location_id)?.name || '',
          litres: Number(f.litres || 0),
          amount: Number(f.amount || 0),
          remark: f.remark || ''
        })
      }
    }
    const out = [...groups.values()]
      .sort((a, b) => a.order.localeCompare(b.order))
      .map((g) => ({ ...g, rows: g.rows.sort((a, b) => a.date.localeCompare(b.date) || a.who.localeCompare(b.who)) }))
    // HQ: the vehicle title only above its first section; the fleet card section names the card(s)
    if (tab === 'hq')
      out.forEach((g, i) => {
        g.first = i === 0 || out[i - 1].vehicle?.key !== g.vehicle?.key
        const nos = [...new Set(g.rows.map((r) => r.cardNo).filter(Boolean))]
        if (g.kind === 'card' && nos.length) g.title = `Fleet card ${nos.join(', ')}`
      })
    return out
  })()
  const detailTotal = detailGroups.reduce((t, g) => ({ litres: t.litres + g.rows.reduce((s, r) => s + r.litres, 0), amount: t.amount + g.rows.reduce((s, r) => s + r.amount, 0), n: t.n + g.rows.length }), { litres: 0, amount: 0, n: 0 })

  // Print. Chart view: a table, one row per person (HQ: who claimed / drove)
  // or per machine (estate), Jan – Dec litres and RM of the year, and the
  // average fuel price per litre. Table view: the receipts table, then (HQ)
  // every claimed receipt by date, one per page, "Claimed by … on …".
  async function print() {
    setPrinting(true)
    try {
      if (view === 'table') {
        // The summary table, then every claimed receipt by date, one per page.
        const claimed =
          tab === 'hq'
            ? detailGroups
                .flatMap((g) => g.rows)
                .filter((r) => r.claimed)
                .sort((a, b) => a.date.localeCompare(b.date) || (a.claimedOn || '').localeCompare(b.claimedOn || '') || a.who.localeCompare(b.who))
            : []
        const urls = await receiptUrls(claimed.map((r) => r.photo)).catch(() => ({}))
        await printUsageDetail({
          title: 'Reports',
          hq: tab === 'hq',
          groups: detailGroups,
          // a receipt with nothing attached gets no page (no "No receipt" sheet in the printout)
          receipts: claimed.filter((r) => r.photo).map((r) => ({ ...r, url: urls[r.photo] || '', pdf: /\.pdf$/i.test(r.photo) })).filter((r) => r.url || r.pdf),
          lines: [
            `${company.name} · ${tab === 'hq' ? 'HQ Vehicle' : 'Estate Machinery'}`,
            `${A.from ? day(A.from) : 'Start'} – ${A.to ? day(A.to) : 'today'}`,
            ...filterLines,
            `Printed ${day(today())}`
          ]
        })
        return
      }
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
        title: 'Reports',
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
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm" role="tablist" aria-label="Report view">
              {[
                ['chart', 'Chart view', IconChart],
                ['table', 'Table view', IconList]
              ].map(([k, label, Icon]) => (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={view === k}
                  onClick={() => setView(k)}
                  className={`inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold ${view === k ? 'bg-brand text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                >
                  <Icon width={16} height={16} /> {label}
                </button>
              ))}
            </div>
            <Button variant="secondary" onClick={print} disabled={loading || printing}>
              <IconPrint width={18} height={18} /> {printing ? 'Preparing…' : 'Print'}
            </Button>
          </div>
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
                  className={`relative px-6 py-3 text-sm font-bold first:rounded-tl-2xl ${tab === k ? 'fx-tab-on bg-white text-brand' : 'bg-slate-50/60 text-slate-600 hover:bg-white/60'}`}
                >
                  {label}
                  {tab === k && <span className="fx-line absolute inset-x-0 bottom-0 h-0.5 bg-brand" />}
                </button>
              ))}
              <span className="flex-1 rounded-tr-2xl bg-slate-50/60" />
            </div>

            {/* Date range at the top left of the table, the search (reload) icon next to it; the
                other filters are on the column titles. Chart view has no column for the fleet card
                (HQ) or the location (estate), so those sit here too. */}
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-4 py-2.5" data-noprint>
              {/* date boxes only as wide as the date; the button in the intranet's dark frame colour */}
              <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                From
                <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className={dateCls} />
              </label>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                To
                <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className={dateCls} />
              </label>
              <button
                type="button"
                onClick={search}
                disabled={searching}
                title="Search (load the latest data again)"
                aria-label="Search"
                className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand text-white shadow-sm disabled:opacity-60"
              >
                <IconSearch width={17} height={17} className={searching ? 'animate-pulse' : ''} />
              </button>
              {view !== 'table' && tab === 'hq' && <span className="ml-2">{F.card('Fleet card')}</span>}
              {/* HQ table view is by vehicle: its filters sit here */}
              {view === 'table' && tab === 'hq' && (
                <span className="ml-2 flex flex-wrap items-center gap-3">
                  {F.card()}
                  {F.driver()}
                  {F.vehicle()}
                </span>
              )}
              {view !== 'table' && tab !== 'hq' && locations.length > 0 && <span className="ml-2">{F.loc()}</span>}
              {tab === 'hq' && !cardOpts.some((o) => o.value !== 'cash') && <span className="text-[11px] text-amber-700">No fleet card with a card number in {company.name}.</span>}
            </div>

            {view === 'table' ? (
              tab === 'hq' ? <VehicleTable groups={detailGroups} total={detailTotal} /> : <DetailTable groups={detailGroups} total={detailTotal} hq={false} F={F} />
            ) : (
            <>
            <div className="flex flex-wrap items-center justify-end gap-3 px-4 py-2 text-[11px] text-slate-600">
              {byDriver ? (
                CAR_PARTS.map((p) => (
                  <span key={p.key} className="inline-flex items-center gap-1.5">
                    <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: p.color }} /> {p.label}
                  </span>
                ))
              ) : tab === 'hq' ? (
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
                    <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: ISSUED_COLOR }} /> Diesel issued (from Estate Fuel Record)
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

            {byDriver ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] text-sm">
                  <thead>
                    <tr className="border-y border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <th className="w-44 px-4 py-2">{F.vehicle('Vehicle reg no.')}</th>
                      <th className="w-40 px-3 py-2">{F.driver()}</th>
                      <th className="px-3 py-2">Monthly Fuel Usage (Litre)</th>
                      <th className="px-3 py-2">Monthly Fuel Expenses (RM)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {driverRows.map((d) => (
                      <tr key={d.id} className="border-b border-slate-100 align-middle last:border-b-0">
                        <td className="px-4 py-2">
                          {d.cars.length === 0 ? (
                            <span className="text-slate-400">—</span>
                          ) : (
                            d.cars.map((c) => {
                              const part = CAR_PARTS.find((p) => p.key === c.kind)
                              return (
                                <span key={c.id || 'none'} className="flex items-center gap-1.5 py-0.5">
                                  <span className="inline-block h-2 w-2 shrink-0 rounded-sm" style={{ background: part.color }} />
                                  <span className="font-semibold text-slate-800">{c.id ? regOf(vById.get(c.id)) : 'No vehicle'}</span>
                                  <span className="text-[11px] text-slate-400">{c.kind === 'own' ? 'own' : c.kind === 'general' ? 'general' : ''}</span>
                                </span>
                              )
                            })
                          )}
                        </td>
                        <td className="px-3 py-2 text-slate-700">{d.name}</td>
                        <td className="px-3 py-1.5">
                          <MiniBars rows={d.rows} year={year} metric="litres" fmt={(x) => `${num(x, 1)} L`} series={d.series} />
                        </td>
                        <td className="px-3 py-1.5">
                          <MiniBars rows={d.rows} year={year} metric="amount" fmt={money} series={d.series} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] text-sm">
                  <thead>
                    <tr className="border-y border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <th className="w-44 px-4 py-2">{tab === 'hq' ? F.vehicle('Vehicle reg no.') : F.machine()}</th>
                      <th className="w-40 px-3 py-2">{tab === 'hq' ? F.driver() : F.type()}</th>
                      <th className="px-3 py-2">Monthly Fuel Usage (Litre)</th>
                      <th className="px-3 py-2">Monthly Fuel Expenses (RM)</th>
                    </tr>
                  </thead>
                  {listed.length === 0 && (
                    <tbody>
                      <tr>
                        <td colSpan={4}>
                          <Empty>
                            {hqFiltered || A.vehicleF.length || A.typeF.length || A.machineF.length || A.locF.length
                              ? 'No vehicle for this filter.'
                              : tab === 'hq'
                                ? 'No HQ vehicles yet. Tick "HQ vehicle" in Machinery Profile.'
                                : 'No estate machines in Machinery Profile yet.'}
                          </Empty>
                        </td>
                      </tr>
                    </tbody>
                  )}
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
            </>
            )}
          </div>
        </Card>
      )}
      {pricing && <PriceModal company={company} prices={prices} canEdit={access.can('fuel_record', 'edit')} onClose={() => setPricing(false)} onChanged={load} />}
    </div>
  )
}

// Table view: groups (fleet card / cash, or machine type) with their receipts,
// a subtotal per group and the total.
function DetailTable({ groups, total, hq, F }) {
  // Type (fleet card / cash, or machine type) first and narrow; every other column the same width.
  const cols = hq ? 8 : 7
  const n2 = (v) => Number(v || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const even = `${(90 / (cols - 1)).toFixed(3)}%`
  const span = hq ? 5 : 4
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[960px] table-fixed text-sm">
        <colgroup>
          <col style={{ width: '10%' }} />
          {Array.from({ length: cols - 1 }, (_, i) => (
            <col key={i} style={{ width: even }} />
          ))}
        </colgroup>
        <thead>
          <tr className="border-y border-slate-200 bg-slate-50/80 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <th className="px-4 py-2">{hq ? F.card() : F.type()}</th>
            <th className="px-3 py-2">Date</th>
            <th className="px-3 py-2">{hq ? F.driver() : F.machine()}</th>
            <th className="px-3 py-2">{hq ? F.vehicle() : F.loc()}</th>
            {hq && <th className="px-3 py-2">Claim no.</th>}
            <th className="px-3 py-2 text-right">Litres</th>
            <th className="px-3 py-2 text-right">Amount (RM)</th>
            <th className="px-3 py-2">Remark</th>
          </tr>
        </thead>
        {groups.length === 0 && (
          <tbody>
            <tr>
              <td colSpan={cols}>
                <Empty>No fuel usage for this filter.</Empty>
              </td>
            </tr>
          </tbody>
        )}
        {groups.map((g) => {
          const l = g.rows.reduce((s, r) => s + r.litres, 0)
          const a = g.rows.reduce((s, r) => s + r.amount, 0)
          return (
            <tbody key={g.key} className="border-b border-slate-200">
              <tr className="bg-emerald-50/70">
                <td colSpan={cols} className="px-4 py-2 text-sm font-bold text-emerald-900">
                  {g.title}
                  <span className="ml-2 text-xs font-medium text-emerald-700">
                    {g.rows.length} {g.rows.length === 1 ? 'receipt' : 'receipts'}
                  </span>
                </td>
              </tr>
              {g.rows.map((r) => (
                <tr key={r.id} className="border-t border-slate-100 align-top">
                  <td className="px-4 py-2">
                    {hq ? (
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${r.type === 'Cash' ? 'bg-amber-50 text-amber-800' : 'bg-sky-50 text-sky-800'}`}>{r.type}</span>
                    ) : (
                      <span className="text-slate-600">{r.type}</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-600">{day(r.date)}</td>
                  <td className="break-words px-3 py-2 text-slate-800">{r.who}</td>
                  <td className="break-words px-3 py-2 text-slate-700">
                    {r.vehicle}
                    {r.general && <span className="ml-1.5 rounded-full bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700">general</span>}
                  </td>
                  {hq && <td className="px-3 py-2 text-slate-500">{r.claimNo || '—'}</td>}
                  <td className="px-3 py-2 text-right tabular-nums">{n2(r.litres)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{n2(r.amount)}</td>
                  <td className="break-words px-3 py-2 text-slate-600">{r.remark || ''}</td>
                </tr>
              ))}
              <tr className="border-t border-slate-200 font-semibold">
                <td colSpan={span} className="px-4 py-2 text-right text-xs uppercase tracking-wide text-slate-500">
                  Subtotal
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{n2(l)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{n2(a)}</td>
                <td />
              </tr>
            </tbody>
          )
        })}
        {groups.length > 0 && (
          <tfoot>
            <tr className="bg-slate-100 font-bold">
              <td colSpan={span} className="px-4 py-2.5 text-right text-xs uppercase tracking-wide text-slate-600">
                Total · {total.n} {total.n === 1 ? 'receipt' : 'receipts'}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums">{n2(total.litres)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{n2(total.amount)}</td>
              <td />
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  )
}

// HQ table view: per vehicle (title once), a Fleet card section then a Cash
// claim section, each with its receipts and a subtotal; the total at the end.
// Columns: Receipt date, Receipt no., Litre, RM/L, Total amount, Remark.
function VehicleTable({ groups, total }) {
  const n2 = (v) => Number(v || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const perL = (r) => (r.litres > 0 ? (r.amount / r.litres).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 3 }) : '—')
  const sum = (rows, k) => rows.reduce((s, r) => s + r[k], 0)
  const head = (
    <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
      <th className="px-4 py-1.5">Receipt date</th>
      <th className="px-3 py-1.5">Receipt no.</th>
      <th className="px-3 py-1.5 text-right">Litre</th>
      <th className="px-3 py-1.5 text-right">RM/L</th>
      <th className="px-3 py-1.5 text-right">Total amount (RM)</th>
      <th className="px-3 py-1.5">Remark</th>
    </tr>
  )
  const cols = (
    <colgroup>
      {[13, 13, 11, 10, 14].map((w, i) => (
        <col key={i} style={{ width: `${w}%` }} />
      ))}
      <col />
    </colgroup>
  )
  if (!groups.length) return <Empty>No fuel usage for this filter.</Empty>
  return (
    <div className="space-y-4 p-4">
      {groups.map((g) => (
        <div key={g.key}>
          {g.first && (
            <h3 className="mb-2 mt-2 flex items-baseline gap-2 border-b-2 border-slate-800 pb-1 first:mt-0">
              <span className="font-display text-lg font-bold tracking-wide text-slate-900">{g.vehicle.title}</span>
              {g.vehicle.name && <span className="text-sm text-slate-500">{g.vehicle.name}</span>}
              {g.vehicle.general && <span className="rounded-full bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700">general</span>}
            </h3>
          )}
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[820px] table-fixed text-sm">
              {cols}
              <thead>
                <tr className={g.kind === 'cash' ? 'bg-amber-50' : 'bg-sky-50'}>
                  <th colSpan={6} className={`px-4 py-2 text-left text-sm font-bold ${g.kind === 'cash' ? 'text-amber-900' : 'text-sky-900'}`}>
                    {g.title}
                    <span className="ml-2 text-xs font-medium opacity-70">
                      {g.rows.length} {g.rows.length === 1 ? 'receipt' : 'receipts'}
                    </span>
                  </th>
                </tr>
                {head}
              </thead>
              <tbody>
                {g.rows.map((r) => (
                  <tr key={r.id} className="border-t border-slate-100 align-top">
                    <td className="whitespace-nowrap px-4 py-2 text-slate-700">{day(r.date)}</td>
                    <td className="break-words px-3 py-2 text-slate-600">{r.receipt || '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{n2(r.litres)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-600">{perL(r)}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">{n2(r.amount)}</td>
                    <td className="break-words px-3 py-2">
                      {r.billTo && (
                        <span className="mb-0.5 inline-block rounded-md bg-slate-800 px-1.5 py-0.5 text-[11px] font-semibold text-white">Bill to {r.billTo}</span>
                      )}
                      {r.remark && <span className="block text-slate-800">{r.remark}</span>}
                      {r.from && <span className="block text-xs text-slate-500">{r.from}</span>}
                    </td>
                  </tr>
                ))}
                <tr className="border-t border-slate-200 bg-slate-50/70 font-semibold">
                  <td colSpan={2} className="px-4 py-2 text-right text-xs uppercase tracking-wide text-slate-500">
                    Subtotal
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{n2(sum(g.rows, 'litres'))}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-500">{sum(g.rows, 'litres') > 0 ? perL({ litres: sum(g.rows, 'litres'), amount: sum(g.rows, 'amount') }) : '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{n2(sum(g.rows, 'amount'))}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      ))}
      <div className="flex flex-wrap items-center justify-end gap-x-6 gap-y-1 rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-bold">
        <span className="text-xs uppercase tracking-wide text-slate-600">
          Total · {total.n} {total.n === 1 ? 'receipt' : 'receipts'}
        </span>
        <span className="tabular-nums">{n2(total.litres)} L</span>
        <span className="tabular-nums">RM {n2(total.amount)}</span>
      </div>
      <BillToSummary rows={groups.flatMap((g) => g.rows)} />
    </div>
  )
}

/** Totals per Bill to company and month (the receipts charged to another
 * company), for the month-end billing: [{ name, months: [{ month, n, litres, amount }], n, litres, amount }] */
function billToTotals(rows) {
  const m = new Map()
  for (const r of rows) {
    if (!r.billTo) continue
    const co = m.get(r.billTo) || { name: r.billTo, byMonth: new Map(), n: 0, litres: 0, amount: 0 }
    const ym = r.date.slice(0, 7)
    const mo = co.byMonth.get(ym) || { month: ym, n: 0, litres: 0, amount: 0 }
    for (const t of [co, mo]) {
      t.n += 1
      t.litres += r.litres
      t.amount += r.amount
    }
    co.byMonth.set(ym, mo)
    m.set(r.billTo, co)
  }
  return [...m.values()]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => ({ ...c, months: [...c.byMonth.values()].sort((a, b) => a.month.localeCompare(b.month)) }))
}
const monthName = (ym) => new Date(`${ym}-01T00:00:00`).toLocaleDateString('en-MY', { month: 'long', year: 'numeric' })
function BillToSummary({ rows }) {
  const list = billToTotals(rows)
  if (!list.length) return null
  const n2 = (v) => Number(v || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const grand = list.reduce((t, c) => ({ n: t.n + c.n, litres: t.litres + c.litres, amount: t.amount + c.amount }), { n: 0, litres: 0, amount: 0 })
  return (
    <div className="overflow-hidden rounded-xl border border-slate-300">
      <p className="bg-slate-800 px-4 py-2 text-sm font-bold text-white">Bill to other companies · by month</p>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            <th className="px-4 py-1.5">Company</th>
            <th className="px-3 py-1.5">Month</th>
            <th className="px-3 py-1.5 text-right">Receipts</th>
            <th className="px-3 py-1.5 text-right">Litre</th>
            <th className="px-4 py-1.5 text-right">Total amount (RM)</th>
          </tr>
        </thead>
        {list.map((c) => (
          <tbody key={c.name} className="border-t border-slate-200">
            {c.months.map((mo, i) => (
              <tr key={mo.month} className={i ? 'border-t border-slate-100' : ''}>
                <td className="px-4 py-2 font-semibold text-slate-800">{i === 0 ? c.name : ''}</td>
                <td className="px-3 py-2 text-slate-700">{monthName(mo.month)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{mo.n}</td>
                <td className="px-3 py-2 text-right tabular-nums">{n2(mo.litres)}</td>
                <td className="px-4 py-2 text-right font-semibold tabular-nums">{n2(mo.amount)}</td>
              </tr>
            ))}
            {c.months.length > 1 && (
              <tr className="border-t border-slate-200 bg-slate-50 font-bold">
                <td className="px-4 py-2 text-right text-xs uppercase tracking-wide text-slate-500" colSpan={2}>
                  {c.name} total
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{c.n}</td>
                <td className="px-3 py-2 text-right tabular-nums">{n2(c.litres)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{n2(c.amount)}</td>
              </tr>
            )}
          </tbody>
        ))}
        <tfoot>
          <tr className="border-t-2 border-slate-800 bg-slate-100 font-bold">
            <td className="px-4 py-2 text-right text-xs uppercase tracking-wide text-slate-600" colSpan={2}>
              All companies
            </td>
            <td className="px-3 py-2 text-right tabular-nums">{grand.n}</td>
            <td className="px-3 py-2 text-right tabular-nums">{n2(grand.litres)}</td>
            <td className="px-4 py-2 text-right tabular-nums">{n2(grand.amount)}</td>
          </tr>
        </tfoot>
      </table>
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
