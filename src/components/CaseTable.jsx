import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { IconImage, IconPencil, IconPushpin, IconTrash, IconUndo } from './icons.jsx'
import { Badge } from './ui.jsx'
import { CASE_TYPES, caseNo, casePhotos, caseStage, caseSummary, caseType, fromApp, isStopped, serviceGap } from '../lib/cases.js'
import { formatSender, formatTime } from '../lib/whatsapp.js'

export const caseLink = (id) => `/cmms/work/case/${id}`

// Laptop: one row per case in columns. Smaller screens: the same row stacks.
const COLS =
  'lg:grid lg:grid-cols-[52px_92px_minmax(96px,150px)_minmax(150px,1fr)_minmax(96px,130px)_minmax(96px,130px)_78px_minmax(96px,120px)_minmax(150px,176px)] lg:items-center'

export function CaseTableHeader() {
  return (
    <div
      className={`hidden gap-2.5 border-b border-slate-200 bg-slate-50/80 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500 ${COLS}`}
    >
      <span>Case</span>
      <span>Type</span>
      <span>Machine</span>
      <span>Problem / Job</span>
      <span>Sent by</span>
      <span>Supplier</span>
      <span>Sent out</span>
      <span>Status</span>
      <span className="text-center">Action</span>
    </div>
  )
}

const fmtDate = (d) =>
  d
    ? new Date(d + (d.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
    : null

const NEXT = {
  approve: { label: 'Approve & send', primary: true, need: 'can_send' },
  send: { label: 'Send out', need: 'can_edit' },
  solve: { label: 'Mark solved', need: 'can_solve' },
  cost: { label: 'Add cost & solve', need: 'can_solve' }
}

/**
 * One case. `access` = { can_solve, can_edit, can_send, can_delete } for this
 * company; buttons the user may not use are shown disabled. `onNext(action)`
 * runs the case's next step (approve / send / solve / cost); `onSupplier`
 * opens the supplier choice.
 */
export function CaseTableRow({ c, urls, machine, supplierName, access = {}, busy, onNext, onReopen, onEdit, onDelete, onPin, onSupplier }) {
  const navigate = useNavigate()
  const held = useRef(false) // a long press just happened: don't open the case
  const photos = casePhotos(c)
  const files = (c.attachments || []).length
  const solved = c.status === 'solved'
  const type = CASE_TYPES[caseType(c)]
  const stage = caseStage(c, machine)
  const gap = serviceGap(c, machine)
  const next = NEXT[stage.action]
  const stop = (fn) => (e) => {
    e.stopPropagation()
    fn?.()
  }
  const label = (text) => <span className="mr-1 text-xs font-medium text-slate-400 lg:hidden">{text}:</span>
  const n = (v) => Math.abs(Number(v)).toLocaleString('en-MY', { maximumFractionDigits: 1 })
  return (
    <div
      role="link"
      tabIndex={0}
      onClick={() => {
        if (held.current) {
          held.current = false
          return
        }
        navigate(caseLink(c.id))
      }}
      onKeyDown={(e) => e.key === 'Enter' && navigate(caseLink(c.id))}
      className={`block cursor-pointer gap-2.5 px-4 py-3.5 hover:bg-brand-light/40 ${COLS} ${c.pinned_at ? 'bg-amber-50/70' : ''}`}
    >
      <span className="flex items-center gap-2 lg:block">
        <HoldToPin
          pinned={Boolean(c.pinned_at)}
          disabled={!onPin || !access.can_edit || solved}
          onDone={() => {
            held.current = true
            onPin?.()
          }}
        >
          {caseNo(c)}
        </HoldToPin>
        <span className="lg:hidden">
          <Badge color={type.color}>{type.label}</Badge>
        </span>
      </span>
      <span className="hidden lg:block">
        <Badge color={type.color} className="whitespace-normal text-center leading-tight">
          {type.label}
        </Badge>
      </span>
      <span className="mt-1 block min-w-0 font-semibold text-slate-800 lg:mt-0">
        <span className="line-clamp-2">{c.machine_name || <span className="font-normal text-slate-400">—</span>}</span>
      </span>
      <span className="mt-1 block min-w-0 lg:mt-0">
        <span className="line-clamp-2 text-sm text-slate-700">
          {caseSummary(c, machine) || <span className="italic text-slate-400">No description</span>}
          {gap && gap.gap !== 0 && (
            <span className={gap.late ? 'font-semibold text-red-600' : ''}>
              {' · '}
              {n(gap.gap)} {gap.unit} {gap.gap < 0 ? 'early' : 'late'}
            </span>
          )}
          {isStopped(c) && <span className="font-bold text-slate-900"> · stopped</span>}
        </span>
        {(photos.length > 0 || files > 0) && (
          <span className="mt-1 flex items-center gap-1.5">
            {photos.slice(0, 2).map((m) => (
              <Thumb key={m.id} url={urls[m.storage_path]} size="h-7 w-7" />
            ))}
            {photos.length > 2 && <span className="text-xs font-medium text-slate-500">+{photos.length - 2}</span>}
            {files > 0 && (
              <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                <IconImage width={13} height={13} /> {files} file{files === 1 ? '' : 's'}
              </span>
            )}
          </span>
        )}
      </span>
      <span className="mt-2 block min-w-0 text-sm lg:mt-0">
        <span className="block truncate font-medium text-slate-800">
          {c.sender_name || formatSender(c.wa_from)} <span className="font-normal text-slate-500">· {fromApp(c) ? 'App' : 'WhatsApp'}</span>
        </span>
        <span className="block truncate text-xs text-slate-500">{formatTime(c.opened_at)}</span>
      </span>
      <span className="mt-1 block min-w-0 text-sm lg:mt-0">
        {label('Supplier')}
        {supplierName ? (
          <span className="line-clamp-2 font-medium text-slate-800">{supplierName}</span>
        ) : caseType(c) === 'repair_done' ? (
          <span className="text-slate-700">Own mechanic</span>
        ) : !solved && access.can_edit && onSupplier ? (
          <button onClick={stop(onSupplier)} className="rounded-lg border border-dashed border-brand/60 bg-brand-light/40 px-2.5 py-1 text-sm font-medium text-brand hover:bg-brand-light">
            Choose…
          </button>
        ) : (
          <span className="text-slate-400">—</span>
        )}
      </span>
      <span className="mt-1 block text-sm lg:mt-0">
        {label('Sent out')}
        {fmtDate(c.sent_at) || <span className="text-slate-400">—</span>}
      </span>
      <span className="mt-2 block lg:mt-0">
        <Badge color={stage.color} className="whitespace-normal leading-tight">
          {stage.label}
        </Badge>
        {solved && c.cost != null && <span className="mt-0.5 block text-xs text-slate-500">RM {Number(c.cost).toLocaleString('en-MY', { minimumFractionDigits: 2 })}</span>}
      </span>
      {/* Action: the next step as a button, then edit / delete */}
      <span className="mt-2 flex items-center justify-end gap-0.5 lg:mt-0">
        {solved ? (
          <IconButton title={access.can_solve ? 'Reopen case' : 'No solve access'} disabled={!access.can_solve || busy} onClick={stop(onReopen)} tone="green">
            <IconUndo width={17} height={17} />
          </IconButton>
        ) : (
          next && (
            <button
              disabled={!access[next.need] || busy}
              title={access[next.need] ? next.label : 'No access'}
              onClick={stop(() => onNext?.(stage.action))}
              className={`mr-1 min-h-9 flex-1 rounded-lg px-2 py-1 text-[13px] font-semibold leading-tight transition disabled:cursor-not-allowed disabled:opacity-40 ${
                next.primary ? 'bg-brand text-white hover:bg-brand-dark' : 'border border-slate-300 bg-white text-slate-800 hover:border-brand hover:text-brand'
              }`}
            >
              {next.label}
            </button>
          )
        )}
        <IconButton title={access.can_edit ? 'Edit case' : 'No edit access'} disabled={!access.can_edit || busy} onClick={stop(onEdit)}>
          <IconPencil width={16} height={16} />
        </IconButton>
        <IconButton title={access.can_delete ? 'Delete case' : 'No delete access'} disabled={!access.can_delete || busy} onClick={stop(onDelete)} tone="red">
          <IconTrash width={16} height={16} />
        </IconButton>
      </span>
    </div>
  )
}

const TONES = {
  red: 'hover:bg-red-50 hover:text-red-600',
  green: 'hover:bg-emerald-50 hover:text-emerald-600',
  blue: 'hover:bg-slate-100 hover:text-brand'
}

const HOLD_MS = 3000

// Case number: press and hold 3 seconds to pin (or unpin). A ring fills while
// holding; letting go early cancels.
function HoldToPin({ pinned, disabled, onDone, children }) {
  const [holding, setHolding] = useState(false)
  const timer = useRef(null)
  const cancel = () => {
    clearTimeout(timer.current)
    setHolding(false)
  }
  useEffect(() => cancel, [])
  return (
    <span
      title={disabled ? undefined : pinned ? 'Hold 3 seconds to unpin' : 'Hold 3 seconds to pin to the top'}
      onPointerDown={(e) => {
        if (disabled || e.button !== 0) return
        setHolding(true)
        timer.current = setTimeout(() => {
          setHolding(false)
          onDone()
        }, HOLD_MS)
      }}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onContextMenu={(e) => !disabled && e.preventDefault()}
      className="relative inline-flex select-none items-center gap-1 font-bold tabular-nums text-brand"
    >
      {pinned && <IconPushpin width={14} height={14} className="text-amber-500" />}
      {children}
      {holding && (
        <svg viewBox="0 0 36 36" className="pointer-events-none absolute -left-2 -top-2.5 h-11 w-11 -rotate-90">
          <circle cx="18" cy="18" r="15" fill="none" stroke="#e2e8f0" strokeWidth="3" />
          <circle
            cx="18"
            cy="18"
            r="15"
            fill="none"
            stroke={pinned ? '#64748b' : '#f59e0b'}
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray="94.25"
            className="animate-[pin-hold_3s_linear_forwards]"
          />
        </svg>
      )}
    </span>
  )
}

function IconButton({ children, tone = 'blue', ...props }) {
  return (
    <button
      {...props}
      aria-label={props.title}
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 transition disabled:cursor-not-allowed disabled:opacity-30 ${TONES[tone]}`}
    >
      {children}
    </button>
  )
}

function Thumb({ url, size = 'h-11 w-11' }) {
  return (
    <span
      className={`flex ${size} shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100 text-slate-400 ring-1 ring-slate-200`}
    >
      {url ? (
        <img src={url} alt="" loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <IconImage width={16} height={16} />
      )}
    </span>
  )
}

// Smaller row for the all-companies overview.
export function CaseCompactRow({ c, urls }) {
  const first = casePhotos(c)[0]
  return (
    <Link to={caseLink(c.id)} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50">
      {first ? (
        <Thumb url={urls[first.storage_path]} size="h-10 w-10" />
      ) : (
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-light text-xs font-bold text-brand">
          {caseNo(c)}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-slate-800">
          {caseNo(c)}
          {c.machine_name ? ` · ${c.machine_name}` : ''}
        </span>
        <span className="block truncate text-sm text-slate-600">{c.problem || 'No description'}</span>
        <span className="block text-xs text-slate-400">
          {c.sender_name || formatSender(c.wa_from)} · {formatTime(c.opened_at)}
        </span>
      </span>
    </Link>
  )
}
