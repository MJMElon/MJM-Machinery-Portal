import { Badge, Button, Card, Select, Spinner } from '../ui.jsx'
import { IconPencil, IconReceipt, IconTrash } from '../icons.jsx'
import { CLAIM_STATUS, openReceipt, vehicleLabel } from '../../lib/diesel.js'
import { day, money, monthLabel, num } from '../../lib/format.js'

// Small pieces shared by the Diesel Manage pages.

export function Loading() {
  return (
    <div className="flex justify-center py-12 text-brand">
      <Spinner className="h-7 w-7" />
    </div>
  )
}

export function ErrorBox({ children }) {
  return children ? <p className="rounded-xl bg-red-100 p-3 text-sm text-red-700">{children}</p> : null
}

export function Empty({ children }) {
  return <p className="px-5 py-10 text-center text-sm text-slate-400">{children}</p>
}

/** Row of KPI tiles: [[label, value], …] */
export function Stats({ items }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map(([k, v]) => (
        <Card key={k} className="p-3">
          <p className="text-xs text-slate-500">{k}</p>
          <p className="mt-1 text-lg font-semibold text-slate-900">{v}</p>
        </Card>
      ))}
    </div>
  )
}

export function StatusBadge({ status }) {
  const s = CLAIM_STATUS[status] || { label: status, color: 'slate' }
  return <Badge color={s.color}>{s.label}</Badge>
}

/** Month drop-down: the months that have data plus the current one. */
export function MonthSelect({ months, value, onChange, allLabel }) {
  return (
    <div className="sm:w-44">
      <Select value={value} onChange={(e) => onChange(e.target.value)} className="h-10" aria-label="Month">
        {allLabel && <option value="">{allLabel}</option>}
        {months.map((m) => (
          <option key={m} value={m}>
            {monthLabel(m)}
          </option>
        ))}
      </Select>
    </div>
  )
}

export const monthsOf = (dates, includeNow) =>
  [...new Set([...(includeNow ? [includeNow] : []), ...dates.map((d) => String(d).slice(0, 7))])].sort().reverse()

/** Opens a receipt; shows the error as an alert (no page state needed). */
export function ReceiptButton({ path }) {
  if (!path) return <span className="self-center text-xs text-red-500">No receipt</span>
  return (
    <Button size="sm" variant="ghost" onClick={() => openReceipt(path).catch((e) => window.alert(e.message))}>
      <IconReceipt width={16} height={16} /> Receipt
    </Button>
  )
}

/**
 * One claim line: vehicle + status, then date · litres · amount · km · station,
 * an optional `meta` line (claimant, reviewer) and the `actions` on the right.
 */
export function ClaimRow({ claim: c, vehicle, meta, actions }) {
  return (
    <div className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-slate-800">{vehicleLabel(vehicle)}</span>
          <StatusBadge status={c.status} />
        </div>
        <div className="mt-0.5 text-sm text-slate-500">
          {day(c.fill_date)} · {num(c.litres, 2)} L · <span className="font-medium text-slate-700">{money(c.amount)}</span>
          {c.odometer_km != null && ` · ${num(c.odometer_km, 0)} km`}
          {c.station && ` · ${c.station}`}
        </div>
        {meta && <div className="mt-0.5 text-xs text-slate-500">{meta}</div>}
        {c.review_note && <div className="mt-1 text-xs text-slate-500">Note: {c.review_note}</div>}
        {c.notes && <div className="mt-0.5 text-xs text-slate-400">{c.notes}</div>}
      </div>
      <div className="flex flex-wrap gap-1.5">{actions}</div>
    </div>
  )
}

/** Edit + delete buttons for a pending claim of your own. */
export function OwnClaimActions({ claim, onEdit, onDelete, busy }) {
  if (claim.status !== 'pending') return null
  return (
    <>
      <Button size="sm" variant="ghost" disabled={busy} onClick={onEdit}>
        <IconPencil width={16} height={16} /> Edit
      </Button>
      <Button size="sm" variant="ghost" disabled={busy} onClick={onDelete} className="text-red-600">
        <IconTrash width={16} height={16} />
      </Button>
    </>
  )
}

export const inputCls =
  'h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-[15px] text-slate-900 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30 disabled:bg-slate-100'

/** Compact labelled input used inside the Diesel dialogs. */
export function F({ label, hint, children, span }) {
  return (
    <label className={`block ${span ? 'col-span-2' : ''}`}>
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  )
}

export const toNum = (v) => (String(v ?? '').trim() === '' ? null : Number(v))
export const opt = (list, blank) => (
  <>
    {blank != null && <option value="">{blank}</option>}
    {list.map(([k, l]) => (
      <option key={k} value={k}>
        {l}
      </option>
    ))}
  </>
)
