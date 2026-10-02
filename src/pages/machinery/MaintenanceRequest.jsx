import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import PageHeader from '../../components/PageHeader.jsx'
import { Badge, Button, Card, EmptyState, Spinner } from '../../components/ui.jsx'
import { IconChat, IconImage, IconRefresh } from '../../components/icons.jsx'
import { ackBadge, formatSender, formatTime, listMessages, signPaths, statusBadge } from '../../lib/whatsapp.js'

const FILTERS = [
  { key: 'todo', label: 'To review' },
  { key: 'reviewed', label: 'Reviewed' },
  { key: 'problems', label: 'Problems' },
  { key: 'all', label: 'All' }
]
const POLL_MS = 15000

// WhatsApp inbox: text messages and photos sent to the business number,
// newest first. Later these get grouped into maintenance requests.
export default function MaintenanceRequest() {
  const [filter, setFilter] = useState('todo')
  const [rows, setRows] = useState([])
  const [urls, setUrls] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setError('')
    try {
      const data = await listMessages({ filter })
      setRows(data)
      setUrls(await signPaths(data.map((r) => r.storage_path)))
    } catch (e) {
      setError(e.message || 'Could not load messages.')
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => {
    setLoading(true)
    load()
    // Light polling so a test message shows up without a manual refresh.
    const t = setInterval(() => document.visibilityState === 'visible' && load(), POLL_MS)
    return () => clearInterval(t)
  }, [load])

  return (
    <div className="space-y-4">
      <PageHeader
        title="Maintenance Request"
        subtitle="WhatsApp messages and photos · newest first"
        right={
          <Button size="sm" variant="secondary" onClick={() => load()}>
            <IconRefresh width={18} height={18} /> <span className="hidden sm:inline">Refresh</span>
          </Button>
        }
      />

      <div className="flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <Button
            key={f.key}
            size="sm"
            variant={filter === f.key ? 'primary' : 'secondary'}
            onClick={() => setFilter(f.key)}
            className="shrink-0"
          >
            {f.label}
          </Button>
        ))}
      </div>

      {error && <p className="rounded-xl bg-red-100 p-3 text-sm text-red-700">{error}</p>}

      {loading ? (
        <div className="flex justify-center py-12 text-brand">
          <Spinner className="h-7 w-7" />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          title={filter === 'todo' ? 'Nothing to review' : 'No messages'}
          subtitle="Texts and photos sent to the WhatsApp number appear here."
        />
      ) : (
        <Card className="divide-y divide-slate-100 overflow-hidden">
          {rows.map((r) => (
            <MessageRow key={r.id} row={r} url={urls[r.storage_path]} />
          ))}
        </Card>
      )}
    </div>
  )
}

function MessageRow({ row, url }) {
  const st = statusBadge(row.status)
  const ack = ackBadge(row.ack_status)
  const isText = row.message_type === 'text'
  return (
    <Link
      to={`/machinery/maintenance/${row.id}`}
      className="flex items-center gap-4 p-3 hover:bg-slate-50 active:bg-slate-100 sm:p-4"
    >
      <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100 text-slate-400">
        {url ? (
          <img src={url} alt={row.caption || 'WhatsApp photo'} loading="lazy" className="h-full w-full object-cover" />
        ) : isText ? (
          <IconChat width={28} height={28} className="text-brand" />
        ) : (
          <IconImage width={28} height={28} />
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline gap-x-3">
          <span className="truncate font-semibold text-slate-800">{row.sender_name || formatSender(row.wa_from)}</span>
          {row.sender_name && <span className="text-xs text-slate-500">{formatSender(row.wa_from)}</span>}
        </span>
        <span className="mt-0.5 line-clamp-2 block text-sm text-slate-700">
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
        <span className="mt-1 block text-xs text-slate-500 sm:hidden">{formatTime(row.received_at)}</span>
      </span>

      <span className="hidden shrink-0 flex-col items-end gap-1.5 sm:flex">
        <span className="text-xs text-slate-500">{formatTime(row.received_at)}</span>
        <span className="flex gap-1">
          {row.reviewed_at ? <Badge color="green">Reviewed</Badge> : <Badge color={st.color}>{st.label}</Badge>}
          {ack?.color === 'red' && <Badge color="red">{ack.label}</Badge>}
        </span>
      </span>
    </Link>
  )
}
