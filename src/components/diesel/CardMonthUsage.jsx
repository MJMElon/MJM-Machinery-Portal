import { useEffect, useState } from 'react'
import { Card } from '../ui.jsx'
import { DRIVER_COLORS, DriverShare } from './CardCharts.jsx'
import { Button } from '../ui.jsx'
import { IconEye } from '../icons.jsx'
import { CardUsageGrid, colKey, mismatch } from './CardUsageGrid.jsx'
import { Empty } from './shared.jsx'
import { cardMonthUsage } from '../../lib/diesel.js'
import { day, monthLabel, thisMonth } from '../../lib/format.js'

// Left: a fleet card's usage in one month (‹ › to change month), week by
// week (Week 1 = 1–7, 2 = 8–14, 3 = 15–21, 4 = 22–28, 5 = 29–end): each
// driver's litres and the week's total. View (top right) opens the date ×
// driver grid (CardUsageGrid.jsx), where fill-ups can also be added by hand.
// Right: the same month's total by driver, the subsidy volume = 100%.
export function CardMonthUsage({ company, cardId, card, title, drivers: cardDrivers = [], canAdd = false, canDelete = false, refresh, quota, driverNames = [] }) {
  const [viewing, setViewing] = useState(false)
  const [tick, setTick] = useState(0)
  const [month, setMonth] = useState(thisMonth())
  const [rows, setRows] = useState(undefined) // undefined loading · null not available
  useEffect(() => {
    let live = true
    setRows(undefined)
    cardMonthUsage(company.id, cardId, month).then((r) => live && setRows(r))
    return () => {
      live = false
    }
  }, [company.id, cardId, month, refresh, tick])

  const move = (d) => {
    const [y, m] = month.split('-').map(Number)
    const t = new Date(y, m - 1 + d, 1)
    const next = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`
    if (next <= thisMonth()) setMonth(next)
  }
  const list = rows || []
  const totL = list.reduce((s, r) => s + Number(r.litres || 0), 0)
  const totRM = list.reduce((s, r) => s + Number(r.amount || 0), 0)
  const notClaimed = list.filter((r) => r.source === 'card').length
  const n2 = (v) => Number(v || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  // total by driver: the card's drivers first (also with nothing used), then anyone else
  const byName = new Map()
  for (const r of list) {
    const k = r.driver || 'No driver recorded'
    const t = byName.get(k) || { litres: 0, rm: 0 }
    byName.set(k, { litres: t.litres + Number(r.litres || 0), rm: t.rm + Number(r.amount || 0) })
  }
  const names = [...driverNames, ...[...byName.keys()].filter((k) => !driverNames.includes(k))]
  const drivers = names.map((name, i) => ({
    id: name,
    name,
    litres: byName.get(name)?.litres || 0,
    rm: byName.get(name)?.rm || 0,
    color: DRIVER_COLORS[i % DRIVER_COLORS.length]
  }))

  // Week 1 = 1–7, 2 = 8–14, 3 = 15–21, 4 = 22–28, 5 = 29 to the end of the month
  const lastDay = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate()
  const mon = monthLabel(month).split(' ')[0]
  const weeks = [1, 2, 3, 4, 5]
    .map((n) => ({ n, from: (n - 1) * 7 + 1, to: n === 5 ? lastDay : n * 7 }))
    .filter((w) => w.from <= lastDay)
    .map((w) => {
      const rs = list.filter((r) => {
        const d = Number(String(r.date).slice(8, 10))
        return d >= w.from && d <= w.to
      })
      const byDriver = new Map()
      for (const r of rs) {
        const k = colKey(r)
        const t = byDriver.get(k) || { name: r.driver || 'No driver recorded', litres: 0, flag: false }
        byDriver.set(k, { ...t, litres: t.litres + Number(r.litres || 0), flag: t.flag || mismatch(r) })
      }
      return {
        n: w.n,
        range: `${w.from}–${w.to} ${mon}`,
        drivers: [...byDriver.values()].sort((a, b) => a.name.localeCompare(b.name)),
        total: rs.reduce((t, r) => t + Number(r.litres || 0), 0)
      }
    })

  const nav = (
    <div className="flex items-center gap-1">
      <button type="button" onClick={() => move(-1)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50" aria-label="Previous month">
        ‹
      </button>
      <span className="w-24 text-center text-sm font-semibold text-slate-800">{monthLabel(month)}</span>
      <button
        type="button"
        onClick={() => move(1)}
        disabled={month >= thisMonth()}
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-30"
        aria-label="Next month"
      >
        ›
      </button>
    </div>
  )

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-4 py-2.5">
          <h3 className="font-semibold text-slate-800">Usage</h3>
          {nav}
          <span className="flex-1" />
          {card && (
            <Button size="sm" variant="secondary" onClick={() => setViewing(true)} className="order-last">
              <IconEye width={15} height={15} /> View
            </Button>
          )}
          {rows && (
            <span className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
              <span>
                Subsidy <b className="tabular-nums text-slate-800">{quota != null ? `${n2(quota)} L` : '—'}</b>
              </span>
              <span>
                Used <b className="tabular-nums text-slate-800">{n2(totL)} L</b>
              </span>
              <span>
                Balance{' '}
                <b className={`tabular-nums ${quota != null && quota - totL < 0 ? 'text-red-600' : 'text-brand-dark'}`}>{quota != null ? `${n2(quota - totL)} L` : '—'}</b>
              </span>
            </span>
          )}
          {rows && notClaimed > 0 && (
            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">{notClaimed} not claimed yet</span>
          )}
        </div>
        {rows === undefined ? (
          <p className="py-8 text-center text-sm text-slate-400">Loading…</p>
        ) : rows === null ? (
          <Empty>Run the Fuel SQL migration 20261212 (fleet card statement) to see the usage here.</Empty>
        ) : list.length === 0 ? (
          <Empty>No usage on this card in {monthLabel(month)}.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="w-40 px-4 py-2">Week</th>
                  <th className="px-2 py-2">Driver</th>
                  <th className="w-32 px-4 py-2 text-right">Litres</th>
                </tr>
              </thead>
              {weeks.map((w) => (
                <tbody key={w.n} className="border-b border-slate-200">
                  {w.drivers.length === 0 ? (
                    <tr>
                      <td className="px-4 py-2 align-top font-semibold text-slate-700">
                        Week {w.n}
                        <span className="block text-xs font-normal text-slate-400">{w.range}</span>
                      </td>
                      <td className="px-2 py-2 text-slate-400">No usage</td>
                      <td className="px-4 py-2 text-right tabular-nums text-slate-400">—</td>
                    </tr>
                  ) : (
                    w.drivers.map((d, i) => (
                      <tr key={d.name}>
                        {i === 0 && (
                          <td rowSpan={w.drivers.length + 1} className="px-4 py-2 align-top font-semibold text-slate-700">
                            Week {w.n}
                            <span className="block text-xs font-normal text-slate-400">{w.range}</span>
                          </td>
                        )}
                        <td className="px-2 py-1.5 text-slate-800">
                          {d.name}
                          {d.flag && (
                            <span className="ml-1.5 rounded bg-amber-100 px-1 text-[10px] font-bold text-amber-800" title="A claim amount differs from the Fuel Station Portal">
                              !
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-1.5 text-right tabular-nums">{n2(d.litres)}</td>
                      </tr>
                    ))
                  )}
                  {w.drivers.length > 0 && (
                    <tr className="bg-slate-50/80 font-semibold">
                      <td className="px-2 py-1.5 text-xs uppercase tracking-wide text-slate-500">Week {w.n} total</td>
                      <td className="px-4 py-1.5 text-right tabular-nums text-slate-900">{n2(w.total)}</td>
                    </tr>
                  )}
                </tbody>
              ))}
              <tfoot>
                <tr className="border-t-2 border-slate-200 bg-slate-50 font-bold">
                  <td colSpan={2} className="px-4 py-2 text-right text-xs uppercase tracking-wide text-slate-500">
                    {monthLabel(month)} total
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{n2(totL)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>

      <Card className="p-4">
        <h3 className="mb-3 font-semibold text-slate-800">
          Usage by driver <span className="font-normal text-slate-500">· {monthLabel(month)}</span>
        </h3>
        {rows ? <DriverShare month={month} quota={quota} drivers={drivers} /> : <p className="py-6 text-center text-sm text-slate-400">{rows === undefined ? 'Loading…' : '—'}</p>}
      </Card>
      {viewing && card && (
        <CardUsageGrid
          company={company}
          card={card}
          title={title || card.card_no}
          drivers={cardDrivers}
          startMonth={month}
          canAdd={canAdd}
          canDelete={canDelete}
          onClose={() => setViewing(false)}
          onChanged={() => setTick((t) => t + 1)}
        />
      )}
    </div>
  )
}
