import { Link } from 'react-router-dom'
import { CARD_STATUS } from '../../lib/diesel.js'
import { money, num } from '../../lib/format.js'

// A fleet card drawn as a card: fuel station colours, chip, card number,
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

export function FleetCardTile({ card, vehicle, usedL, balance, checklist }) {
  const st = CARD_STATUS[card.status] || CARD_STATUS.active
  const off = ['cancelled', 'inactive'].includes(card.status)
  const quota = card.subsidy_litres != null ? Number(card.subsidy_litres) : null
  const pct = quota ? Math.min(100, (usedL / quota) * 100) : null
  const bar = pct == null ? '' : pct >= 90 ? 'bg-red-400' : pct >= 70 ? 'bg-amber-300' : 'bg-emerald-300'
  return (
    <Link to={`/diesel/cards/${card.id}`} className={`group block ${off ? 'opacity-60 grayscale' : ''}`} title="Open this fleet card">
      <div
        className={`relative aspect-[1.586] overflow-hidden rounded-2xl bg-gradient-to-br ${theme(card.provider)} p-4 text-white shadow-md transition group-hover:-translate-y-0.5 group-hover:shadow-xl`}
      >
        {/* soft shine */}
        <div className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full bg-white/10" />
        <div className="pointer-events-none absolute -bottom-24 -left-10 h-48 w-48 rounded-full bg-black/10" />
        <div className="relative flex h-full flex-col">
          <div className="flex items-start justify-between gap-2">
            <span className="text-sm font-bold tracking-wide">{card.provider || 'Fleet card'}</span>
            <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide backdrop-blur">{st.label}</span>
          </div>
          {/* chip */}
          <div className="mt-3 h-7 w-10 rounded-md bg-gradient-to-br from-yellow-200 to-amber-400 shadow-inner" />
          <div className="mt-auto">
            <p className="font-mono text-lg font-semibold tracking-[0.12em] drop-shadow sm:text-xl">
              {card.card_no ? spaced(card.card_no) : <span className="text-sm font-sans tracking-normal opacity-80">Not awarded yet</span>}
            </p>
            <div className="mt-1 flex items-end justify-between gap-2 text-xs">
              <span className="truncate font-semibold uppercase tracking-wide opacity-90">{vehicle || 'No vehicle'}</span>
              {card.status === 'application' && checklist && <span className="shrink-0 opacity-90">Check list {checklist}</span>}
            </div>
          </div>
        </div>
      </div>
      {card.status !== 'application' && (
        <div className="mt-2 space-y-1 px-1 text-xs text-slate-600">
          <div className="flex justify-between gap-2">
            <span>This month</span>
            <span className="tabular-nums">
              <b className="text-slate-800">{num(usedL, 2)} L</b>
              {quota != null && ` / ${num(quota, 0)} L`}
            </span>
          </div>
          {pct != null && (
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
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
