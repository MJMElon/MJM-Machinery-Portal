import { useEffect, useState } from 'react'
import { Card } from '../ui.jsx'
import { myFleetCards } from '../../lib/diesel.js'
import { day, monthLabel, num } from '../../lib/format.js'

// Fuel Manage main page → My fleet card: for each fleet card the signed-in
// person is a driver on, a meter of this month's subsidy quota (Fleet Card
// Manage) against the litres used on the card so far, and the card's latest
// purchases — so the driver knows whether to fill up with the card.
export function MyFleetCards({ company }) {
  const [cards, setCards] = useState(null)
  useEffect(() => {
    let live = true
    setCards(null)
    myFleetCards(company.id).then((c) => live && setCards(c))
    return () => {
      live = false
    }
  }, [company.id])

  if (!cards) return null // loading, or the database function is not there yet
  if (!cards.length)
    return <p className="mx-auto mb-4 max-w-3xl text-center text-xs text-slate-400">You are not a driver on any fleet card in {company.name}.</p>

  return (
    <div className="mx-auto mb-5 max-w-3xl space-y-3">
      {cards.map((c) => (
        <Card key={c.id} className="overflow-hidden">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-slate-100 px-4 py-2.5">
            <h3 className="font-semibold text-slate-800">My fleet card</h3>
            <span className="font-bold tracking-wide text-brand-dark">{c.card_no}</span>
            {c.vehicle && <span className="text-sm text-slate-500">({c.vehicle})</span>}
            {c.provider && <span className="text-sm text-slate-500">· {c.provider}</span>}
            {c.status !== 'active' && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold capitalize text-amber-800">{c.status}</span>
            )}
          </div>
          <div className="grid gap-4 p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
            <Meter quota={c.quota_litres == null ? null : Number(c.quota_litres)} used={Number(c.used_litres || 0)} month={c.month} />
            <Recent rows={c.recent || []} />
          </div>
        </Card>
      ))}
    </div>
  )
}

// A car-style meter: 0 – 100 % of the month's quota, with a needle.
function Meter({ quota, used, month }) {
  const pct = quota ? (used / quota) * 100 : null
  const shown = Math.max(0, Math.min(pct ?? 0, 100))
  const color = pct == null ? '#64748b' : pct >= 90 ? '#dc2626' : pct >= 70 ? '#d97706' : '#16a34a'
  // Half circle from the left (0 %) to the right (100 %)
  const R = 80
  const C = { x: 100, y: 100 }
  const point = (p, r = R) => {
    const a = Math.PI * (1 - p / 100)
    return [C.x + r * Math.cos(a), C.y - r * Math.sin(a)]
  }
  const arc = (from, to) => {
    const [x1, y1] = point(from)
    const [x2, y2] = point(to)
    return `M ${x1} ${y1} A ${R} ${R} 0 0 1 ${x2} ${y2}` // never more than half a circle
  }
  const [nx, ny] = point(shown, R - 18)
  const left = quota != null ? quota - used : null

  return (
    <div className="flex flex-col items-center">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{monthLabel(month)} quota</p>
      <svg viewBox="0 0 200 140" className="w-full max-w-[240px]" role="img" aria-label={pct == null ? `${num(used, 2)} litres used` : `${Math.round(pct)}% of the quota used`}>
        <path d={arc(0, 100)} fill="none" stroke="#e2e8f0" strokeWidth="16" strokeLinecap="round" />
        {/* zones: green to 70 %, amber to 90 %, red after */}
        <path d={arc(70, 90)} fill="none" stroke="#fde68a" strokeWidth="4" opacity="0.9" />
        <path d={arc(90, 100)} fill="none" stroke="#fecaca" strokeWidth="4" opacity="0.9" />
        {shown > 0 && <path d={arc(0, Math.max(shown, 0.5))} fill="none" stroke={color} strokeWidth="16" strokeLinecap="round" />}
        {[0, 25, 50, 75, 100].map((t) => {
          const [x1, y1] = point(t, R + 11)
          const [x2, y2] = point(t, R + 5)
          return <line key={t} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#94a3b8" strokeWidth="1.5" />
        })}
        <line x1={C.x} y1={C.y} x2={nx} y2={ny} stroke="#0f172a" strokeWidth="3" strokeLinecap="round" />
        <circle cx={C.x} cy={C.y} r="6" fill="#0f172a" />
        <text x={C.x} y={C.y + 34} textAnchor="middle" fontSize="22" fontWeight="700" fill={color}>
          {pct == null ? `${num(used, 0)} L` : `${Math.round(pct)}%`}
        </text>
        <text x="20" y="114" textAnchor="middle" fontSize="9" fill="#94a3b8">0</text>
        <text x="180" y="114" textAnchor="middle" fontSize="9" fill="#94a3b8">{quota != null ? `${num(quota, 0)} L` : ''}</text>
      </svg>
      <p className="mt-1 text-sm text-slate-700">
        Used <b className="tabular-nums">{num(used, 2)} L</b>
        {quota != null && (
          <>
            {' '}of <b className="tabular-nums">{num(quota, 2)} L</b>
          </>
        )}
      </p>
      {quota == null ? (
        <p className="text-xs text-slate-400">No subsidy quota set for this card</p>
      ) : left >= 0 ? (
        <p className="text-xs font-semibold text-emerald-700">{num(left, 2)} L left this month</p>
      ) : (
        <p className="text-xs font-semibold text-red-600">{num(-left, 2)} L over the quota</p>
      )}
    </div>
  )
}

function Recent({ rows }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Last purchases on this card</p>
      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-400">No purchase yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
              <th className="py-1.5 pr-2 font-medium">Date</th>
              <th className="py-1.5 pr-2 font-medium">Driver</th>
              <th className="py-1.5 pr-2 font-medium">Vehicle</th>
              <th className="py-1.5 text-right font-medium">Litres</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="whitespace-nowrap py-1.5 pr-2 text-slate-600">{day(r.fill_date)}</td>
                <td className="py-1.5 pr-2 text-slate-800">{r.driver || '—'}</td>
                <td className="py-1.5 pr-2 text-slate-600">{r.vehicle || '—'}</td>
                <td className="py-1.5 text-right font-semibold tabular-nums">{num(r.litres, 2)} L</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
