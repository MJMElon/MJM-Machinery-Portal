import { Link, useNavigate } from 'react-router-dom'
import { IconImage, IconPencil, IconTrash } from './icons.jsx'
import { casePhotos, caseNo } from '../lib/cases.js'
import { formatSender, formatTime } from '../lib/whatsapp.js'

export const caseLink = (id) => `/cmms/work/case/${id}`

// Laptop: one row per case in columns. Smaller screens: the same row stacks.
const COLS =
  'lg:grid lg:grid-cols-[52px_minmax(76px,110px)_minmax(130px,1fr)_88px_minmax(104px,150px)_minmax(96px,140px)_84px_78px_76px] lg:items-center'

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
      <span className="text-center">{solved ? 'Reopen' : 'Solve'}</span>
      <span className="text-center">Edit</span>
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
export function CaseTableRow({ c, urls, supplierName, access = {}, busy, onSolve, onEdit, onDelete }) {
  const navigate = useNavigate()
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
      onClick={() => navigate(caseLink(c.id))}
      onKeyDown={(e) => e.key === 'Enter' && navigate(caseLink(c.id))}
      className={`block cursor-pointer gap-2.5 px-4 py-4 hover:bg-brand-light/40 ${COLS}`}
    >
      <span className="flex items-center gap-2 lg:block">
        <span className="font-bold tabular-nums text-brand">{caseNo(c)}</span>
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
      <span className="mt-3 flex lg:mt-0 lg:justify-center">
        <button
          onClick={stop(onSolve)}
          disabled={!access.can_solve || busy}
          title={access.can_solve ? (solved ? 'Reopen case' : 'Mark solved') : 'No solve access'}
          className={`h-9 rounded-lg px-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
            solved
              ? 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              : 'bg-emerald-600 text-white hover:bg-emerald-700'
          }`}
        >
          {solved ? 'Reopen' : 'Solve'}
        </button>
      </span>
      <span className="-mt-9 flex justify-end gap-1 lg:mt-0 lg:justify-center">
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
          danger
        >
          <IconTrash width={17} height={17} />
        </IconButton>
      </span>
    </div>
  )
}

function IconButton({ children, danger, ...props }) {
  return (
    <button
      {...props}
      className={`flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition disabled:cursor-not-allowed disabled:opacity-30 ${
        danger ? 'hover:bg-red-50 hover:text-red-600' : 'hover:bg-slate-100 hover:text-brand'
      }`}
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
