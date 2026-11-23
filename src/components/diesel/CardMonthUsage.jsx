import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card } from '../ui.jsx'
import { Empty } from './shared.jsx'
import { cardMonthUsage } from '../../lib/diesel.js'
import { day, monthLabel, num, thisMonth } from '../../lib/format.js'

// A fleet card's usage in one month (‹ › to change month): date, driver,
// vehicle, litres, amount, and whether the driver has claimed it — a
// fleet-card receipt on a fuel claim (with the receipt photo or not, and
// "Setel ✓" when the station statement has the same fill), or a purchase on
// the station statement (daily import) that no claim covers yet.
export function CardMonthUsage({ company, cardId, refresh }) {
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

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-5 py-3">
        <h3 className="font-semibold text-slate-800">Usage</h3>
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
        <span className="flex-1" />
        {rows && notClaimed > 0 && (
          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
            {notClaimed} not claimed yet
          </span>
        )}
      </div>
      {rows === undefined ? (
        <p className="py-8 text-center text-sm text-slate-400">Loading…</p>
      ) : rows === null ? (
        <Empty>Run the Fuel SQL migration 20261211 (card month usage) to see the usage here.</Empty>
      ) : list.length === 0 ? (
        <Empty>No usage on this card in {monthLabel(month)}.</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="w-32 px-5 py-2.5">Date</th>
                <th className="px-3 py-2.5">Driver</th>
                <th className="px-3 py-2.5">Vehicle</th>
                <th className="w-24 px-3 py-2.5 text-right">Litres</th>
                <th className="w-32 px-3 py-2.5 text-right">Amount (RM)</th>
                <th className="w-56 px-3 py-2.5">Claimed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {list.map((r, i) => (
                <tr key={i} className={r.source === 'card' ? 'bg-amber-50/40' : ''}>
                  <td className="whitespace-nowrap px-5 py-2.5 text-slate-600">
                    {day(r.date)}
                    {r.time && <span className="ml-1.5 text-xs text-slate-400">{r.time}</span>}
                  </td>
                  <td className="px-3 py-2.5 text-slate-800">{r.driver || '—'}</td>
                  <td className="px-3 py-2.5 text-slate-600">{r.vehicle || '—'}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{n2(r.litres)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{n2(r.amount)}</td>
                  <td className="px-3 py-2.5">
                    {r.source === 'claim' ? (
                      <span className="inline-flex flex-wrap items-center gap-1.5">
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">Claimed</span>
                        <Link to={`/diesel/claims/${r.claim_id}`} className="text-xs font-medium text-brand hover:underline">
                          Claim {String(r.claim_no ?? '').padStart(3, '0')}
                        </Link>
                        <span className={`text-xs ${r.has_receipt ? 'text-slate-500' : 'text-red-600'}`}>{r.has_receipt ? '· receipt ✓' : '· no receipt photo'}</span>
                        {r.on_statement && (
                          <span className="text-xs text-emerald-700" title="The fuel station statement has the same fill">
                            · Setel ✓{Math.abs(Number(r.statement_amount) - Number(r.amount)) >= 0.01 ? ` (RM ${n2(r.statement_amount)})` : ''}
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="inline-flex flex-wrap items-center gap-1.5">
                        {r.claim_status === 'draft' ? (
                          <>
                            <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-700">Draft claim</span>
                            <Link to={`/diesel/claims/${r.claim_id}`} className="text-xs font-medium text-brand hover:underline">
                              Claim {String(r.claim_no ?? '').padStart(3, '0')}
                            </Link>
                          </>
                        ) : (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">Not claimed yet</span>
                        )}
                        {r.on_statement && <span className="text-xs text-slate-500">· from Setel</span>}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold">
                <td colSpan={3} className="px-5 py-2.5 text-right text-xs uppercase tracking-wide text-slate-500">
                  Total · {list.length} {list.length === 1 ? 'purchase' : 'purchases'}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">{n2(totL)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{n2(totRM)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </Card>
  )
}
