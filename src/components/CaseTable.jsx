import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { IconCheckCircle, IconImage, IconPencil, IconPushpin, IconTrash, IconUndo } from './icons.jsx'
import { casePhotos, caseNo } from '../lib/cases.js'
import { formatSender, formatTime } from '../lib/whatsapp.js'

export const caseLink = (id) => `/cmms/work/case/${id}`

// Laptop: one row per case in columns. Smaller screens: the same row stacks.
const COLS =
  'lg:grid lg:grid-cols-[52px_minmax(76px,110px)_minmax(130px,1fr)_88px_minmax(104px,150px)_minmax(96px,140px)_84px_116px] lg:items-center'

export function CaseTableHeader({ solved = false }) {
  return (
    <div
      className={`hidden gap-2.5 border-b border-slate-200 bg-slate-50/80 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500 ${COLS}`}
    >
      <span>Case</span>
      <span>Machine</span>
      <span>Problem</span>
      <span>Photo</span>
      <span>Sent by</span>
      <span>Supplier</span>
      <span>Sent out</span>
      <span className="text-center">Action</span>
    </div>
  )
}

const fmtDate = (d) =>
  d
    ? new Date(d + (d.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      })
    : null

/**
 * One case. `access` = { can_solve, can_edit, can_delete } for this company;
 * buttons the user may not use are shown disabled.
 */
export function CaseTableRow({ c, urls, supplierName, access = {}, busy, onSolve, onEdit, onDelete, onPin }) {
  const navigate = useNavigate()
  const held = useRef(false) // a long press just happened: don't open the case
  const photos = casePhotos(c)
  const updates = (c.messages || []).length
  const solved = c.status === 'solved'
  const stop = (fn) => (e) => {
    e.stopPropagation()
    fn()
  }
  const label = (text) => <span className="mr-1 text-xs font-medium text-slate-400 lg:hidden">{text}:</span>
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
      className={`block cursor-pointer gap-2.5 px-4 py-4 hover:bg-brand-light/40 ${COLS} ${c.pinned_at ? 'bg-amber-50/70' : ''}`}
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
        <span className="truncate font-semibold text-slate-800 lg:hidden">{c.machine_name || ''}</span>
      </span>
      <span className="hidden truncate font-semibold text-slate-800 lg:block">
        {c.machine_name || <span className="font-normal text-slate-400">—</span>}
      </span>
      <span className="mt-1 block min-w-0 lg:mt-0">
        <span className="line-clamp-2 text-sm text-slate-700">
          {c.problem || <span className="italic text-slate-400">No description</span>}
        </span>
        {updates > 1 && <span className="mt-0.5 block text-xs text-slate-400">{updates} messages</span>}
      </span>
      <span className="mt-2 flex items-center gap-1.5 lg:mt-0">
        {photos.length === 0 ? (
          <span className="hidden text-sm text-slate-400 lg:inline">—</span>
        ) : (
          <>
            {photos.slice(0, 2).map((m) => (
              <Thumb key={m.id} url={urls[m.storage_path]} size="h-9 w-9" />
            ))}
            {photos.length > 2 && <span className="text-xs font-medium text-slate-500">+{photos.length - 2}</span>}
          </>
        )}
      </span>
      <span className="mt-2 block min-w-0 text-sm lg:mt-0">
        <span className="block truncate font-medium text-slate-800">{c.sender_name || formatSender(c.wa_from)}</span>
        <span className="block truncate text-xs text-slate-500">{formatTime(c.opened_at)}</span>
      </span>
      <span className="mt-1 block min-w-0 truncate text-sm lg:mt-0">
        {label('Supplier')}
        {supplierName ? (
          <span className="font-medium text-slate-800">{supplierName}</span>
        ) : (
          <span className="text-slate-400">—</span>
        )}
      </span>
      <span className="mt-1 block text-sm lg:mt-0">
        {label('Sent out')}
        {fmtDate(c.sent_at) || <span className="text-slate-400">—</span>}
      </span>
      {/* Action: solve / reopen, edit, delete — disabled without access */}
      <span className="mt-2 flex justify-end gap-0.5 lg:mt-0 lg:justify-center">
        <IconButton
          title={access.can_solve ? (solved ? 'Reopen case' : 'Mark solved') : 'No solve access'}
          disabled={!access.can_solve || busy}
          onClick={stop(onSolve)}
          tone="green"
        >
          {solved ? <IconUndo width={17} height={17} /> : <IconCheckCircle width={18} height={18} />}
        </IconButton>
        <IconButton
          title={access.can_edit ? 'Edit case' : 'No edit access'}
          disabled={!access.can_edit || busy}
          onClick={stop(onEdit)}
        >
          <IconPencil width={17} height={17} />
        </IconButton>
        <IconButton
          title={access.can_delete ? 'Delete case' : 'No delete access'}
          disabled={!access.can_delete || busy}
          onClick={stop(onDelete)}
          tone="red"
        >
          <IconTrash width={17} height={17} />
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
      className={`flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition disabled:cursor-not-allowed disabled:opacity-30 ${TONES[tone]}`}
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
