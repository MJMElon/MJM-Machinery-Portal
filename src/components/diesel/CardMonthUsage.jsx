import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card } from '../ui.jsx'
import { DRIVER_COLORS, DriverShare } from './CardCharts.jsx'
import { Empty } from './shared.jsx'
import { cardMonthUsage } from '../../lib/diesel.js'
import { day, monthLabel, thisMonth } from '../../lib/format.js'

// Left: a fleet card's usage in one month (‹ › to change month): date, driver,
// vehicle, litres, amount, and whether the driver has claimed it — a
// fleet-card receipt on a fuel claim (with the receipt photo or not, and
// "Setel ✓" when the station statement has the same fill), or a purchase on
// the station statement (daily import) that no claim covers yet.
// Right: the same month's total by driver, the subsidy volume = 100%.
export function CardMonthUsage({ company, cardId, refresh, quota, driverNames = [] }) {
  const [month, setMonth] = useState(thisMonth())
  const [rows, setRows] = useState(undefined) // undefined loading · null not available
  useEffect(() => {
    let live = true
    setRows(undefined)
    cardMonthUsage(company.id, cardId, month).then((r) => live && setRows(r))
    return () => {
      live = false
    }
  }, [company.id, cardId, month, refresh])

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
            <table className="w-full min-w-[620px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-2">Date</th>
                  <th className="px-2 py-2">Driver</th>
                  <th className="px-2 py-2">Vehicle</th>
                  <th className="px-2 py-2 text-right">Litres</th>
                  <th className="px-2 py-2 text-right">RM</th>
                  <th className="px-3 py-2">Claimed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {list.map((r, i) => (
                  <tr key={i} className={r.source === 'card' ? 'bg-amber-50/40' : ''}>
                    <td className="whitespace-nowrap px-4 py-2 text-slate-600">
                      {day(r.date)}
                      {r.time && <span className="ml-1 text-xs text-slate-400">{r.time}</span>}
                    </td>
                    <td className="px-2 py-2 text-slate-800">{r.driver || '—'}</td>
                    <td className="whitespace-nowrap px-2 py-2 text-slate-600">{r.vehicle || '—'}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{n2(r.litres)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{n2(r.amount)}</td>
                    <td className="px-3 py-2 text-xs">
                      {r.source === 'claim' ? (
                        <span className="inline-flex flex-wrap items-center gap-1">
                          <Link to={`/diesel/claims/${r.claim_id}`} className="rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-800 hover:underline">
                            Claim {String(r.claim_no ?? '').padStart(3, '0')}
                          </Link>
                          <span className={r.has_receipt ? 'text-slate-500' : 'text-red-600'} title={r.has_receipt ? 'Receipt photo uploaded' : 'No receipt photo'}>
                            {r.has_receipt ? 'receipt ✓' : 'no photo'}
                          </span>
                          {r.on_statement && (
                            <span className="text-emerald-700" title="The fuel station statement has the same fill">
                              · Setel ✓{Math.abs(Number(r.statement_amount) - Number(r.amount)) >= 0.01 ? ` (RM ${n2(r.statement_amount)})` : ''}
                            </span>
                          )}
                        </span>
                      ) : r.claim_status === 'draft' ? (
                        <Link to={`/diesel/claims/${r.claim_id}`} className="rounded-full bg-slate-200 px-2 py-0.5 font-semibold text-slate-700 hover:underline">
                          Draft {String(r.claim_no ?? '').padStart(3, '0')}
                        </Link>
                      ) : (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-800" title={r.on_statement ? 'On the Setel statement, no claim yet' : ''}>
                          Not claimed
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold">
                  <td colSpan={3} className="px-4 py-2 text-right text-xs uppercase tracking-wide text-slate-500">
                    Total · {list.length} {list.length === 1 ? 'purchase' : 'purchases'}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">{n2(totL)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{n2(totRM)}</td>
                  <td />
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
    </div>
  )
}
