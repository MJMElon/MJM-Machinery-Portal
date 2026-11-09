import { useCallback, useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import PageHeader from '../../components/PageHeader.jsx'
import { Badge, Button, Card } from '../../components/ui.jsx'
import { IconDownload } from '../../components/icons.jsx'
import { Empty, ErrorBox, Loading, MonthSelect, Stats, monthsOf } from '../../components/diesel/shared.jsx'
import { CLAIM_STATUS, listCardData, listClaims, listPeople, listVehicles, personLabel } from '../../lib/diesel.js'
import { downloadCsv, money, num, sum, thisMonth } from '../../lib/format.js'

// Report (Report access / admins): one month, cash claims (not rejected) +
// fleet card fill-ups, by vehicle (with km/L and over-tank flags) and by driver.
export default function DieselReport() {
  const { company } = useOutletContext()
  const [vehicles, setVehicles] = useState([])
  const [fills, setFills] = useState([])
  const [people, setPeople] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [month, setMonth] = useState(thisMonth())

  const load = useCallback(async () => {
    try {
      const [v, claims, cards, p] = await Promise.all([
        listVehicles(company.id),
        listClaims(company.id),
        listCardData(company.id),
        listPeople(company.id)
      ])
      setVehicles(v)
      setPeople(p)
      // One list of fill-ups: source = cash (not rejected) / card
      setFills([
        ...claims.filter((c) => c.status !== 'rejected').map((c) => ({ ...c, source: 'cash', driver: c.claimant_id })),
        ...cards.usage.map((u) => ({ ...u, source: 'card', driver: u.driver_id }))
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

  const person = new Map(people.map((p) => [p.user_id, p]))
  const vById = new Map(vehicles.map((v) => [v.id, v]))
  const months = monthsOf(
    fills.map((f) => f.fill_date),
    thisMonth()
  )
  const inMonth = fills.filter((f) => f.fill_date.startsWith(month))

  // Fuel economy: fill-ups of one vehicle sorted by odometer; km between two
  // fill-ups ÷ litres of the later one (cash and card alike).
  function efficiency(vid) {
    const rows = fills.filter((f) => f.vehicle_id === vid && f.odometer_km != null).sort((a, b) => a.odometer_km - b.odometer_km)
    let km = 0
    let litres = 0
    for (let i = 1; i < rows.length; i++) {
      if (!rows[i].fill_date.startsWith(month)) continue
      const d = rows[i].odometer_km - rows[i - 1].odometer_km
      if (d > 0) {
        km += d
        litres += Number(rows[i].litres)
      }
    }
    return { km, kmPerL: litres > 0 ? km / litres : null }
  }

  const perVehicle = vehicles
    .map((v) => {
      const rows = inMonth.filter((f) => f.vehicle_id === v.id)
      const cash = rows.filter((r) => r.source === 'cash')
      const card = rows.filter((r) => r.source === 'card')
      const overTank = v.tank_capacity_l ? rows.filter((r) => Number(r.litres) > Number(v.tank_capacity_l)).length : 0
      return {
        v,
        count: rows.length,
        cashL: sum(cash, 'litres'),
        cashRM: sum(cash),
        cardL: sum(card, 'litres'),
        cardRM: sum(card),
        litres: sum(rows, 'litres'),
        amount: sum(rows),
        ...efficiency(v.id),
        overTank
      }
    })
    .filter((r) => r.count > 0)
    .sort((a, b) => b.amount - a.amount)

  const drivers = new Map()
  for (const r of inMonth) {
    const k = r.driver || ''
    const d = drivers.get(k) || { cashL: 0, cashRM: 0, cardL: 0, cardRM: 0 }
    if (r.source === 'cash') {
      d.cashL += Number(r.litres)
      d.cashRM += Number(r.amount)
    } else {
      d.cardL += Number(r.litres)
      d.cardRM += Number(r.amount)
    }
    drivers.set(k, d)
  }

  const exportCsv = () =>
    downloadCsv(
      `diesel-report-${company.code || company.name}-${month}.csv`,
      [
        { header: 'Date', value: (r) => r.fill_date },
        { header: 'Type', value: (r) => (r.source === 'cash' ? 'Cash Claim' : 'Fleet Card') },
        { header: 'Vehicle', value: (r) => vById.get(r.vehicle_id)?.name },
        { header: 'Reg. no.', value: (r) => vById.get(r.vehicle_id)?.reg_no },
        { header: 'Driver', value: (r) => (r.driver ? personLabel(person.get(r.driver)) : '') },
        { header: 'Odometer (km)', value: (r) => r.odometer_km },
        { header: 'Litres', value: (r) => Number(r.litres) },
        { header: 'Amount (RM)', value: (r) => Number(r.amount) },
        { header: 'Station', value: (r) => r.station },
        { header: 'Status', value: (r) => (r.source === 'cash' ? CLAIM_STATUS[r.status]?.label : '') }
      ],
      [...inMonth].sort((a, b) => (a.fill_date < b.fill_date ? -1 : 1))
    )

  const th = (label, right) => <th className={`p-3 font-medium ${right ? 'text-right' : 'text-left'}`}>{label}</th>
  const td = (v, right, cls = '') => <td className={`p-3 ${right ? 'text-right' : ''} ${cls}`}>{v}</td>

  return (
    <div className="space-y-5">
      <PageHeader
        right={
          <Button variant="secondary" onClick={exportCsv} disabled={!inMonth.length}>
            <IconDownload width={18} height={18} /> Export CSV
          </Button>
        }
      />
      <ErrorBox>{error}</ErrorBox>
      <MonthSelect months={months} value={month} onChange={setMonth} />
      {loading ? (
        <Loading />
      ) : (
        <>
          <Stats
            items={[
              ['Total litres', num(sum(inMonth, 'litres')) + ' L'],
              ['Total (RM)', money(sum(inMonth))],
              ['Cash Claim', money(sum(inMonth.filter((r) => r.source === 'cash')))],
              ['Fleet Card', money(sum(inMonth.filter((r) => r.source === 'card')))]
            ]}
          />

          <section className="space-y-2">
            <h3 className="font-semibold text-slate-800">By vehicle</h3>
            <Card className="overflow-x-auto">
              {perVehicle.length === 0 ? (
                <Empty>No fill-ups in this month.</Empty>
              ) : (
                <table className="w-full min-w-[820px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs text-slate-500">
                      {th('Vehicle')}
                      {th('Cash Claim', 1)}
                      {th('Fleet Card', 1)}
                      {th('Total litres', 1)}
                      {th('Total (RM)', 1)}
                      {th('Distance', 1)}
                      {th('km / L', 1)}
                      {th('Check')}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {perVehicle.map((r) => (
                      <tr key={r.v.id}>
                        {td(
                          <>
                            <span className="font-medium text-slate-800">{r.v.name}</span>
                            {r.v.reg_no && <span className="text-slate-500"> · {r.v.reg_no}</span>}
                          </>
                        )}
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
          </section>

          <section className="space-y-2">
            <h3 className="font-semibold text-slate-800">By driver</h3>
            <Card className="overflow-x-auto">
              {drivers.size === 0 ? (
                <Empty>No fill-ups in this month.</Empty>
              ) : (
                <table className="w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs text-slate-500">
                      {th('Driver')}
                      {th('Cash Claim', 1)}
                      {th('Fleet Card', 1)}
                      {th('Total (RM)', 1)}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {[...drivers.entries()]
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
          </section>
        </>
      )}
    </div>
  )
}
