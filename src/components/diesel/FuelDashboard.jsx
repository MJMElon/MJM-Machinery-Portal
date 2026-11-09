import { useMemo, useState } from 'react'
import { Card, Select } from '../ui.jsx'
import { money, num } from '../../lib/format.js'

// Two monthly bar charts side by side for one year: litres (subsidised vs
// non-subsidised fuel) and money (cash claims vs fleet card). Stacked thin
// bars, a legend, hover tooltip and a table view. Colours: two validated
// categorical slots (blue, orange) — identity never by colour alone, the
// legend and table carry it too.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const C1 = '#2a78d6'
const C2 = '#eb6834'

export function FuelDashboard({ lines, title }) {
  const years = useMemo(() => {
    const ys = new Set(lines.map((l) => Number(l.fill_date.slice(0, 4))))
    ys.add(new Date().getFullYear())
    return [...ys].sort((a, b) => b - a)
  }, [lines])
  const [year, setYear] = useState(years[0])
  const [table, setTable] = useState(false)

  const data = useMemo(() => {
    const m = MONTHS.map(() => ({ subL: 0, nonL: 0, cashRM: 0, cardRM: 0, n: 0 }))
    for (const l of lines) {
      if (Number(l.fill_date.slice(0, 4)) !== year) continue
      const i = Number(l.fill_date.slice(5, 7)) - 1
      const L = Number(l.litres) || 0
      const A = Number(l.amount) || 0
      if (l.subsidised) m[i].subL += L
      else m[i].nonL += L
      if (l.payment === 'fleet_card') m[i].cardRM += A
      else m[i].cashRM += A
      m[i].n++
    }
    return m
  }, [lines, year])

  const sum = (k) => data.reduce((s, d) => s + d[k], 0)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm font-semibold text-slate-800">{title || 'Fuel history'}</p>
        <div className="w-28">
          <Select value={year} onChange={(e) => setYear(Number(e.target.value))} className="h-9" aria-label="Year">
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </Select>
        </div>
        <button onClick={() => setTable((v) => !v)} className="text-xs font-medium text-brand hover:underline">
          {table ? 'Show charts' : 'Show table'}
        </button>
        <span className="ml-auto text-xs text-slate-500">
          {num(sum('subL') + sum('nonL'))} L · {money(sum('cashRM') + sum('cardRM'))} in {year}
        </span>
      </div>
      {table ? (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                <th className="p-2.5">Month</th>
                <th className="p-2.5 text-right">Subsidised L</th>
                <th className="p-2.5 text-right">Non-subsidised L</th>
                <th className="p-2.5 text-right">Total L</th>
                <th className="p-2.5 text-right">Cash RM</th>
                <th className="p-2.5 text-right">Fleet card RM</th>
                <th className="p-2.5 text-right">Total RM</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.map((d, i) => (
                <tr key={i}>
                  <td className="p-2.5">{MONTHS[i]}</td>
                  <td className="p-2.5 text-right">{num(d.subL)}</td>
                  <td className="p-2.5 text-right">{num(d.nonL)}</td>
                  <td className="p-2.5 text-right font-medium">{num(d.subL + d.nonL)}</td>
                  <td className="p-2.5 text-right">{money(d.cashRM)}</td>
                  <td className="p-2.5 text-right">{money(d.cardRM)}</td>
                  <td className="p-2.5 text-right font-medium">{money(d.cashRM + d.cardRM)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Chart
            title="Litres per month"
            unit="L"
            fmt={(v) => `${num(v)} L`}
            series={[
              { key: 'subL', label: 'Subsidised fuel', color: C1 },
              { key: 'nonL', label: 'Non-subsidised fuel', color: C2 }
            ]}
            data={data}
          />
          <Chart
            title="Amount per month (RM)"
            unit="RM"
            fmt={money}
            series={[
              { key: 'cashRM', label: 'Cash (claimed)', color: C1 },
              { key: 'cardRM', label: 'Fleet card', color: C2 }
            ]}
            data={data}
          />
        </div>
      )}
    </div>
  )
}

function Chart({ title, series, data, fmt }) {
  const [hover, setHover] = useState(null)
  const W = 520
  const H = 150
  const padL = 40
  const padB = 22
  const padT = 8
  const innerW = W - padL - 10
  const innerH = H - padT - padB
  const totals = data.map((d) => series.reduce((s, x) => s + d[x.key], 0))
  const max = Math.max(1, ...totals)
  const step = niceStep(max)
  const top = Math.ceil(max / step) * step
  const y = (v) => padT + innerH - (v / top) * innerH
  const slot = innerW / 12
  const barW = Math.min(18, slot * 0.5)
  const ticks = []
  for (let v = 0; v <= top; v += step) ticks.push(v)

  return (
    <Card className="p-3">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold text-slate-700">{title}</p>
        <div className="flex gap-3 text-[11px] text-slate-600">
          {series.map((s) => (
            <span key={s.key} className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
      </div>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={title} onMouseLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={padL} x2={W - 10} y1={y(t)} y2={y(t)} stroke="#e2e8f0" strokeWidth="1" />
              <text x={padL - 6} y={y(t) + 3.5} textAnchor="end" fontSize="10" fill="#64748b">
                {t >= 1000 ? `${Math.round(t / 1000)}k` : t}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const x = padL + i * slot + (slot - barW) / 2
            let acc = 0
            const segs = series.map((s) => {
              const v = d[s.key]
              const y1 = y(acc + v)
              const h = y(acc) - y1
              acc += v
              return { s, v, y1, h }
            })
            return (
              <g key={i} onMouseEnter={() => setHover(i)} onTouchStart={() => setHover(i)}>
                <rect x={padL + i * slot} y={padT} width={slot} height={innerH} fill={hover === i ? '#f1f5f9' : 'transparent'} />
                {segs.map(({ s, v, y1, h }, k) =>
                  v > 0 ? (
                    <rect
                      key={s.key}
                      x={x}
                      y={y1 + (k === 0 ? 0 : 1)}
                      width={barW}
                      height={Math.max(0, h - (k === 0 ? 0 : 1))}
                      rx={k === segs.length - 1 || segs.slice(k + 1).every((z) => z.v === 0) ? 3 : 0}
                      fill={s.color}
                    />
                  ) : null
                )}
                <text x={padL + i * slot + slot / 2} y={H - 8} textAnchor="middle" fontSize="10" fill="#64748b">
                  {MONTHS[i]}
                </text>
              </g>
            )
          })}
          <line x1={padL} x2={W - 10} y1={y(0)} y2={y(0)} stroke="#cbd5e1" strokeWidth="1" />
        </svg>
        {hover != null && (
          <div
            className="pointer-events-none absolute top-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg"
            style={{ left: `${Math.min(80, ((padL + hover * slot) / W) * 100)}%` }}
          >
            <p className="font-semibold text-slate-800">{MONTHS[hover]}</p>
            {series.map((s) => (
              <p key={s.key} className="flex items-center gap-1.5 text-slate-600">
                <span className="inline-block h-2 w-2 rounded-sm" style={{ background: s.color }} /> {s.label}: {fmt(data[hover][s.key])}
              </p>
            ))}
            <p className="mt-0.5 font-medium text-slate-800">Total: {fmt(totals[hover])}</p>
          </div>
        )}
      </div>
    </Card>
  )
}

function niceStep(max) {
  const raw = max / 4
  const p = Math.pow(10, Math.floor(Math.log10(raw)))
  const n = raw / p
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p
}
