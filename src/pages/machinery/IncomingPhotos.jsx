import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import PageHeader from '../../components/PageHeader.jsx'
import { Badge, Button, Card, EmptyState, Spinner } from '../../components/ui.jsx'
import { IconImage, IconRefresh } from '../../components/icons.jsx'
import { ackBadge, formatSender, formatTime, listMessages, signPaths, statusBadge } from '../../lib/whatsapp.js'

const FILTERS = [
  { key: 'todo', label: 'To review' },
  { key: 'reviewed', label: 'Reviewed' },
  { key: 'problems', label: 'Problems' },
  { key: 'all', label: 'All' }
]
const POLL_MS = 20000

export default function IncomingPhotos() {
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
      setError(e.message || 'Could not load photos.')
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => {
    setLoading(true)
    load()
    // Light polling so a test photo shows up without a manual refresh.
    const t = setInterval(() => document.visibilityState === 'visible' && load(), POLL_MS)
    return () => clearInterval(t)
  }, [load])

  return (
    <div className="space-y-3">
      <PageHeader
        title="Incoming Photos"
        subtitle="WhatsApp · newest first"
        right={
          <button
            onClick={() => load()}
            className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-600 active:bg-slate-100"
            aria-label="Refresh"
          >
            <IconRefresh width={20} height={20} />
          </button>
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
          subtitle="Photos sent to the WhatsApp test number appear here."
        />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {rows.map((r) => (
            <PhotoCard key={r.id} row={r} url={urls[r.storage_path]} />
          ))}
        </div>
      )}
    </div>
  )
}

function PhotoCard({ row, url }) {
  const st = statusBadge(row.status)
  const ack = ackBadge(row.ack_status)
  return (
    <Link to={`/machinery/photos/${row.id}`}>
      <Card className="overflow-hidden active:bg-slate-50">
        <div className="flex aspect-square items-center justify-center bg-slate-100 text-slate-500">
          {url ? (
            <img src={url} alt={row.caption || 'WhatsApp photo'} loading="lazy" className="h-full w-full object-cover" />
          ) : (
            <div className="flex flex-col items-center gap-1 text-xs">
              <IconImage width={28} height={28} />
              {row.message_type !== 'image' ? row.message_type : 'No image'}
            </div>
          )}
        </div>
        <div className="space-y-1 p-2.5">
          <p className="truncate text-sm font-semibold text-slate-800">{row.sender_name || formatSender(row.wa_from)}</p>
          <p className="text-xs text-slate-500">{formatTime(row.received_at)}</p>
          {row.caption && <p className="truncate text-xs text-slate-700">{row.caption}</p>}
          <div className="flex flex-wrap gap-1 pt-0.5">
            {row.reviewed_at ? <Badge color="green">Reviewed</Badge> : <Badge color={st.color}>{st.label}</Badge>}
            {ack?.color === 'red' && <Badge color="red">{ack.label}</Badge>}
          </div>
        </div>
      </Card>
    </Link>
  )
}
