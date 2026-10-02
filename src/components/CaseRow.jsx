import { Link } from 'react-router-dom'
import { Badge } from './ui.jsx'
import { IconChat, IconImage } from './icons.jsx'
import { ackBadge, formatSender, formatTime, statusBadge } from '../lib/whatsapp.js'

export const caseLink = (id) => `/cmms/work/case/${id}`

// One maintenance case (a WhatsApp text or photo) in a list.
// `compact` is the smaller row used in the all-companies overview.
export function CaseRow({ row, url, compact = false }) {
  const isText = row.message_type === 'text'
  const thumb = compact ? 'h-11 w-11' : 'h-16 w-16'
  return (
    <Link
      to={caseLink(row.id)}
      className={`flex items-center gap-3 hover:bg-slate-50 active:bg-slate-100 ${compact ? 'px-4 py-2.5' : 'p-3 sm:gap-4 sm:p-4'}`}
    >
      <span
        className={`flex ${thumb} shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100 text-slate-400`}
      >
        {url ? (
          <img src={url} alt={row.caption || 'WhatsApp photo'} loading="lazy" className="h-full w-full object-cover" />
        ) : isText ? (
          <IconChat width={compact ? 20 : 28} height={compact ? 20 : 28} className="text-brand" />
        ) : (
          <IconImage width={compact ? 20 : 28} height={compact ? 20 : 28} />
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline gap-x-3">
          <span className={`truncate font-semibold text-slate-800 ${compact ? 'text-sm' : ''}`}>
            {row.sender_name || formatSender(row.wa_from)}
          </span>
          {row.sender_name && !compact && <span className="text-xs text-slate-500">{formatSender(row.wa_from)}</span>}
        </span>
        <span className={`mt-0.5 block text-sm text-slate-700 ${compact ? 'truncate' : 'line-clamp-2'}`}>
          {row.caption || (
            <span className="italic text-slate-400">
              {isText
                ? '(empty message)'
                : row.message_type === 'image'
                  ? 'Photo, no caption'
                  : `${row.message_type} message`}
            </span>
          )}
        </span>
        <span className={`mt-1 block text-xs text-slate-500 ${compact ? '' : 'sm:hidden'}`}>
          {formatTime(row.received_at)}
        </span>
      </span>

      {!compact && (
        <span className="hidden shrink-0 flex-col items-end gap-1.5 sm:flex">
          <span className="text-xs text-slate-500">{formatTime(row.received_at)}</span>
          <CaseBadges row={row} />
        </span>
      )}
    </Link>
  )
}

export function CaseBadges({ row }) {
  const ack = ackBadge(row.ack_status)
  let main
  if (row.reviewed_at) main = <Badge color="green">Solved</Badge>
  else if (row.status === 'saved') main = <Badge color="amber">Pending</Badge>
  else {
    const st = statusBadge(row.status)
    main = <Badge color={st.color}>{st.label}</Badge>
  }
  return (
    <span className="flex gap-1">
      {main}
      {ack?.color === 'red' && <Badge color="red">{ack.label}</Badge>}
    </span>
  )
}
