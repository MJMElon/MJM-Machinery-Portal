import { Link } from 'react-router-dom'
import { IconImage } from './icons.jsx'
import { casePhotos, caseNo } from '../lib/cases.js'
import { formatSender, formatTime } from '../lib/whatsapp.js'

export const caseLink = (id) => `/cmms/work/case/${id}`

// Laptop: one row per case in five columns. Phone: the same row stacks.
const COLS = 'md:grid md:grid-cols-[96px_minmax(120px,180px)_minmax(0,1fr)_168px_minmax(180px,250px)] md:items-center'

export function CaseTableHeader() {
  return (
    <div
      className={`hidden gap-4 border-b border-slate-200 bg-slate-50/80 px-5 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500 ${COLS}`}
    >
      <span>Case No.</span>
      <span>Machine</span>
      <span>Problem</span>
      <span>Photo</span>
      <span>Sent by</span>
    </div>
  )
}

export function CaseTableRow({ c, urls }) {
  const photos = casePhotos(c)
  const updates = (c.messages || []).length
  return (
    <Link to={caseLink(c.id)} className={`block gap-4 px-5 py-4 hover:bg-brand-light/40 ${COLS}`}>
      <span className="flex items-center gap-2 md:block">
        <span className="font-bold tabular-nums text-brand">{caseNo(c)}</span>
        <span className="truncate font-semibold text-slate-800 md:hidden">{c.machine_name || ''}</span>
      </span>
      <span className="hidden truncate font-semibold text-slate-800 md:block">
        {c.machine_name || <span className="font-normal text-slate-400">—</span>}
      </span>
      <span className="mt-1 block min-w-0 md:mt-0">
        <span className="line-clamp-2 text-sm text-slate-700">
          {c.problem || <span className="italic text-slate-400">No description</span>}
        </span>
        {updates > 1 && <span className="mt-0.5 block text-xs text-slate-400">{updates} messages</span>}
      </span>
      <span className="mt-2 flex items-center gap-1.5 md:mt-0">
        {photos.length === 0 ? (
          <span className="text-sm text-slate-400">—</span>
        ) : (
          <>
            {photos.slice(0, 3).map((m) => (
              <Thumb key={m.id} url={urls[m.storage_path]} />
            ))}
            {photos.length > 3 && <span className="text-xs font-medium text-slate-500">+{photos.length - 3}</span>}
          </>
        )}
      </span>
      <span className="mt-2 block min-w-0 text-sm md:mt-0">
        <span className="block truncate font-medium text-slate-800">{c.sender_name || formatSender(c.wa_from)}</span>
        <span className="block truncate text-xs text-slate-500">
          {c.sender_name ? `${formatSender(c.wa_from)} · ` : ''}
          {formatTime(c.opened_at)}
        </span>
      </span>
    </Link>
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
