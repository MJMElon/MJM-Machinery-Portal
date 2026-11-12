import { useEffect, useRef, useState } from "react";
import { money, monthLabel, num } from "../../lib/format.js";

// Charts on one fleet card's page.
//
// BalanceChart: the year month by month: RM reloaded onto the card (green)
// against RM used on the card (blue), with the card balance at each month end
// as a line. Hover / tap a month for the numbers.
//
// DriverShare: one month, the card's subsidy volume = 100%: how much of it
// each driver used (fleet-card litres only), and what is left.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const RELOAD = "#1f9d55";
const USED = "#2a78d6";
const LINE = "#334155";
// Driver colours (categorical, in order); "left" is grey.
export const DRIVER_COLORS = ["#2a78d6", "#eb6834", "#1f9d55", "#8a5cd6", "#d6a12a", "#d6467a", "#2fa6b8"];

function niceStep(span) {
  const raw = span / 4 || 1;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}
const short = (v) => {
  const a = Math.abs(v);
  return a >= 1000 ? `${(v / 1000).toFixed(a >= 10000 ? 0 : 1)}k` : Math.round(v).toString();
};

/** rows: 12 × { month 'YYYY-MM', inRM, outRM, outL, balance, future, quotaPct } */
export function BalanceChart({ rows, quota }) {
  const [hover, setHover] = useState(null);
  // Drawn at the box's real width, so text stays readable on a phone and the
  // chart stays low on a wide screen.
  const box = useRef(null);
  const [W, setW] = useState(720);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = W < 500 ? 170 : 200;
  const padL = 38;
  const padR = 10;
  const padT = 14;
  const padB = 22;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  // The balance line starts at the first month with any activity.
  const first = rows.findIndex((r) => r.inRM || r.outRM || r.balance);
  const past = first < 0 ? [] : rows.filter((r, i) => !r.future && i >= first);
  const hi = Math.max(1, ...rows.map((r) => Math.max(r.inRM, r.outRM)), ...past.map((r) => r.balance));
  const lo = Math.min(0, ...past.map((r) => r.balance));
  const step = niceStep(hi - lo);
  const top = Math.ceil(hi / step) * step;
  const bottom = Math.floor(lo / step) * step;
  const y = (v) => padT + ((top - v) / (top - bottom || 1)) * innerH;
  const slot = innerW / 12;
  const barW = Math.max(3, Math.min(14, slot * 0.28));
  const cx = (i) => padL + i * slot + slot / 2;
  const ticks = [];
  for (let v = bottom; v <= top + 1e-9; v += step) ticks.push(v);
  const line = past.map((r) => `${cx(rows.indexOf(r))},${y(r.balance)}`).join(" ");
  const h = hover != null ? rows[hover] : null;

  return (
    <div>
      <div className="mb-1 flex flex-wrap gap-3 text-[11px] text-slate-600">
        <Key color={RELOAD}>Reloaded (RM)</Key>
        <Key color={USED}>Used on card (RM)</Key>
        <span className="inline-flex items-center gap-1.5">
          <svg width="16" height="8" aria-hidden="true">
            <line x1="0" y1="4" x2="16" y2="4" stroke={LINE} strokeWidth="2" />
            <circle cx="8" cy="4" r="2.5" fill="#fff" stroke={LINE} strokeWidth="1.5" />
          </svg>
          Balance (RM)
        </span>
      </div>
      <div className="relative" ref={box}>
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block max-w-full" role="img" aria-label="Reloads, usage and balance by month" onMouseLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke={t === 0 ? "#cbd5e1" : "#eef2f6"} strokeWidth="1" />
              <text x={padL - 6} y={y(t) + 3.5} textAnchor="end" fontSize="10" fill="#64748b">
                {short(t)}
              </text>
            </g>
          ))}
          {rows.map((r, i) => (
            <g key={r.month} onMouseEnter={() => setHover(i)} onTouchStart={() => setHover(i)}>
              <rect x={padL + i * slot} y={padT} width={slot} height={innerH} fill={hover === i ? "#f1f5f9" : "transparent"} />
              {r.inRM > 0 && <rect x={cx(i) - barW - 1} y={y(r.inRM)} width={barW} height={y(0) - y(r.inRM)} rx="2" fill={RELOAD} />}
              {r.outRM > 0 && <rect x={cx(i) + 1} y={y(r.outRM)} width={barW} height={y(0) - y(r.outRM)} rx="2" fill={USED} />}
              <text x={cx(i)} y={H - 7} textAnchor="middle" fontSize="10" fill={r.future ? "#cbd5e1" : "#64748b"}>
                {W < 420 ? MONTHS[i][0] : MONTHS[i]}
              </text>
            </g>
          ))}
          {past.length > 1 && <polyline points={line} fill="none" stroke={LINE} strokeWidth="1.75" pointerEvents="none" />}
          {past.map((r) => {
            const i = rows.indexOf(r);
            return <circle key={r.month} cx={cx(i)} cy={y(r.balance)} r="3" fill="#fff" stroke={r.balance < 0 ? "#dc2626" : LINE} strokeWidth="1.5" pointerEvents="none" />;
          })}
        </svg>
        {h && (
          <div
            className="pointer-events-none absolute top-1 z-10 min-w-40 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg"
            style={{ left: `${Math.min(72, Math.max(0, ((cx(hover) - 60) / W) * 100))}%` }}
          >
            <p className="font-semibold text-slate-800">{monthLabel(h.month)}</p>
            <Line color={RELOAD} label="Reloaded" value={money(h.inRM)} />
            <Line color={USED} label="Used" value={`${money(h.outRM)} · ${num(h.outL, 2)} L`} />
            {quota ? <Line label="Subsidy quota used" value={h.future ? "—" : `${Math.round(h.quotaPct)}%`} bad={h.quotaPct > 100} /> : null}
            <Line color={LINE} label="Balance" value={h.future ? "—" : money(h.balance)} bad={!h.future && h.balance < 0} strong />
          </div>
        )}
      </div>
    </div>
  );
}

function Key({ color, children }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: color }} />
      {children}
    </span>
  );
}
function Line({ color, label, value, bad, strong }) {
  return (
    <p className="flex items-center gap-1.5 tabular-nums text-slate-600">
      {color ? <span className="inline-block h-2 w-2 rounded-sm" style={{ background: color }} /> : <span className="inline-block w-2" />}
      <span className="flex-1">{label}</span>
      <span className={`${strong ? "font-semibold" : ""} ${bad ? "text-red-600" : "text-slate-800"}`}>{value}</span>
    </p>
  );
}

/**
 * month 'YYYY-MM'; drivers: [{ id, name, litres }] (fleet-card litres that month);
 * quota: subsidy litres a month (null = not set). onMonth(delta) moves the month;
 * canNext = false on the current month.
 */
export function DriverShare({ month, onMonth, canNext, quota, drivers }) {
  const used = drivers.reduce((t, d) => t + d.litres, 0);
  const base = quota ? Math.max(quota, used) : used || 1; // 100% of the bar
  const left = quota ? Math.max(0, quota - used) : 0;
  const over = quota ? used - quota : 0;
  const pct = (l) => (quota ? (l / quota) * 100 : used ? (l / used) * 100 : 0);
  const shown = drivers.filter((d) => d.litres > 0);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <button type="button" onClick={() => onMonth(-1)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50" aria-label="Previous month">
          ‹
        </button>
        <span className="text-sm font-semibold text-slate-800">{monthLabel(month)}</span>
        <button
          type="button"
          onClick={() => onMonth(1)}
          disabled={!canNext}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-30"
          aria-label="Next month"
        >
          ›
        </button>
      </div>

      <div className="flex h-5 w-full overflow-hidden rounded-full bg-slate-100" role="img" aria-label="Subsidy volume used by each driver">
        {shown.map((d) => (
          <span key={d.id} title={`${d.name}: ${num(d.litres, 2)} L`} style={{ width: `${(d.litres / base) * 100}%`, background: d.color }} className="h-full border-r border-white last:border-r-0" />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-slate-400">
        <span>0%</span>
        <span>{quota ? `100% = ${num(quota, 2)} L subsidy` : "No subsidy volume set"}</span>
      </div>

      <ul className="mt-3 space-y-1.5 text-sm">
        {drivers.map((d) => (
          <li key={d.id} className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: d.color }} />
            <span className="flex-1 truncate text-slate-800">{d.name}</span>
            <span className="tabular-nums text-slate-500">{num(d.litres, 2)} L</span>
            <span className="w-12 text-right font-semibold tabular-nums text-slate-900">{Math.round(pct(d.litres))}%</span>
          </li>
        ))}
        {quota ? (
          <li className={`flex items-center gap-2 border-t border-slate-100 pt-1.5 ${over > 0 ? "text-red-600" : "text-slate-500"}`}>
            <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-sm ${over > 0 ? "bg-red-500" : "bg-slate-200"}`} />
            <span className="flex-1">{over > 0 ? "Over the subsidy volume" : "Left this month"}</span>
            <span className="tabular-nums">{num(over > 0 ? over : left, 2)} L</span>
            <span className="w-12 text-right font-semibold tabular-nums">{Math.round(((over > 0 ? over : left) / quota) * 100)}%</span>
          </li>
        ) : null}
      </ul>
    </div>
  );
}
