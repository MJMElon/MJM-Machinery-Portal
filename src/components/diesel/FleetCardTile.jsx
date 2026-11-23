import { Link } from 'react-router-dom'
import { CARD_STATUS } from '../../lib/diesel.js'
import { money, num } from '../../lib/format.js'

// A small fleet card picture: colours of the fuel station keyed in the card
// details (Fuel station), card number,
// vehicle and status; this month's litres against the subsidy quota and the
// RM balance underneath. Clicking it opens the card.
const STATION_THEMES = [
  [/petronas|setel/i, 'from-teal-600 via-emerald-700 to-emerald-900'],
  [/shell/i, 'from-amber-400 via-orange-500 to-red-600'],
  [/petron/i, 'from-sky-600 via-blue-700 to-indigo-900'],
  [/caltex/i, 'from-rose-600 via-red-700 to-slate-900'],
  [/bhp/i, 'from-orange-500 via-amber-600 to-yellow-700']
]
const theme = (provider) => STATION_THEMES.find(([re]) => re.test(provider || ''))?.[1] || 'from-slate-600 via-slate-700 to-slate-900'
// 7012345600019876 → 7012 3456 0001 9876
const spaced = (no) => (/\s/.test(no) ? no : String(no).replace(/(.{4})(?=.)/g, '$1 '))

export function FleetCardTile({ card, vehicle, usedL, balance, checklist, to }) {
  const st = CARD_STATUS[card.status] || CARD_STATUS.active
  const off = ['cancelled', 'inactive'].includes(card.status)
  const quota = card.subsidy_litres != null ? Number(card.subsidy_litres) : null
  const pct = quota ? Math.min(100, (usedL / quota) * 100) : null
  const bar = pct == null ? '' : pct >= 90 ? 'bg-red-400' : pct >= 70 ? 'bg-amber-300' : 'bg-emerald-300'
  return (
    <Link to={to || `/diesel/cards/${card.id}`} className={`group block ${off ? 'opacity-60 grayscale' : ''}`} title="Open this fleet card">
      <div
        className={`relative aspect-[1.586] overflow-hidden rounded-xl bg-gradient-to-br ${theme(card.provider)} p-3 text-white shadow-sm transition group-hover:-translate-y-0.5 group-hover:shadow-xl`}
      >
        {/* soft shine */}
        <div className="pointer-events-none absolute -right-10 -top-12 h-28 w-28 rounded-full bg-white/10" />
        <div className="pointer-events-none absolute -bottom-14 -left-6 h-28 w-28 rounded-full bg-black/10" />
        <div className="relative flex h-full flex-col">
          <div className="flex items-start justify-between gap-2">
            <span className="truncate text-xs font-bold tracking-wide">{card.provider || 'Fleet card'}</span>
            <span className="shrink-0 rounded-full bg-white/20 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide backdrop-blur">{st.label}</span>
          </div>
          <div className="mt-auto">
            <p className="truncate font-mono text-[13px] font-semibold tracking-[0.08em] drop-shadow">
              {card.card_no ? spaced(card.card_no) : <span className="font-sans text-xs tracking-normal opacity-80">Not awarded yet</span>}
            </p>
            <div className="mt-0.5 flex items-end justify-between gap-2 text-[10px]">
              <span className="truncate font-semibold uppercase tracking-wide opacity-90">{vehicle || 'No vehicle'}</span>
              {card.status === 'application' && checklist && <span className="shrink-0 opacity-90">{checklist}</span>}
            </div>
          </div>
        </div>
      </div>
      {card.status !== 'application' && (
        <div className="mt-1.5 space-y-0.5 px-0.5 text-[11px] text-slate-600">
          <div className="flex justify-between gap-2">
            <span>This month</span>
            <span className="tabular-nums">
              <b className="text-slate-800">{num(usedL, 2)} L</b>
              {quota != null && ` / ${num(quota, 0)} L`}
            </span>
          </div>
          {pct != null && (
            <div className="h-1 overflow-hidden rounded-full bg-slate-200">
              <div className={`h-full rounded-full ${bar}`} style={{ width: `${pct}%` }} />
            </div>
          )}
          {balance != null && (
            <div className="flex justify-between gap-2">
              <span>Card balance</span>
              <b className={`tabular-nums ${balance < 0 ? 'text-red-600' : 'text-slate-800'}`}>{money(balance)}</b>
            </div>
          )}
        </div>
      )}
    </Link>
  )
}
