import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import PageHeader from '../../components/PageHeader.jsx'
import { Badge, Button, Card, EmptyState, SectionTitle, Spinner } from '../../components/ui.jsx'
import { IconExternal, IconImage } from '../../components/icons.jsx'
import { ackBadge, formatSender, formatTime, getMessage, setReviewed, signPaths, statusBadge } from '../../lib/whatsapp.js'

export default function PhotoDetail() {
  const { id } = useParams()
  const [row, setRow] = useState(null)
  const [url, setUrl] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setError('')
    try {
      const r = await getMessage(id)
      setRow(r)
      setUrl(r?.storage_path ? (await signPaths([r.storage_path]))[r.storage_path] || null : null)
    } catch (e) {
      setError(e.message || 'Could not load this record.')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  async function toggleReviewed() {
    setBusy(true)
    setError('')
    try {
      await setReviewed(row.id, !row.reviewed_at)
      await load()
    } catch (e) {
      setError(e.message || 'Could not update.')
    } finally {
      setBusy(false)
    }
  }

  if (loading)
    return (
      <div className="flex justify-center py-12 text-brand">
        <Spinner className="h-7 w-7" />
      </div>
    )
  if (!row)
    return (
      <div className="space-y-3">
        <PageHeader title="Photo" />
        <EmptyState title="Record not found" subtitle={error} />
      </div>
    )

  const st = statusBadge(row.status)
  const ack = ackBadge(row.ack_status)

  return (
    <div className="space-y-3 lg:grid lg:grid-cols-[1fr_360px] lg:gap-4 lg:space-y-0">
      <div className="space-y-3 lg:col-span-2">
        <PageHeader title={row.sender_name || formatSender(row.wa_from)} subtitle={formatTime(row.received_at)} />
      </div>

      <Card className="overflow-hidden">
        <div className="flex min-h-[240px] items-center justify-center bg-slate-100 text-slate-500">
          {url ? (
            <img src={url} alt={row.caption || 'WhatsApp photo'} className="max-h-[75dvh] w-full object-contain" />
          ) : (
            <div className="flex flex-col items-center gap-1 p-6 text-sm">
              <IconImage width={32} height={32} />
              {row.message_type !== 'image' ? `${row.message_type} message (not a photo)` : 'Image not stored'}
            </div>
          )}
        </div>
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-11 items-center justify-center gap-1.5 border-t border-slate-200 text-sm font-medium text-brand"
          >
            Open full size <IconExternal width={16} height={16} />
          </a>
        )}
      </Card>

      <div className="space-y-3">
        {error && <p className="rounded-xl bg-red-100 p-3 text-sm text-red-700">{error}</p>}

        <Card className="space-y-3 p-4">
          <div className="flex flex-wrap gap-1.5">
            <Badge color={st.color}>{st.label}</Badge>
            {ack && <Badge color={ack.color}>{ack.label}</Badge>}
            {row.reviewed_at && <Badge color="green">Reviewed</Badge>}
          </div>
          {row.message_type === 'image' && row.status === 'saved' && (
            <Button full variant={row.reviewed_at ? 'secondary' : 'primary'} disabled={busy} onClick={toggleReviewed}>
              {busy ? 'Saving…' : row.reviewed_at ? 'Mark as not reviewed' : 'Mark Reviewed'}
            </Button>
          )}
          {row.reviewed_at && (
            <p className="text-xs text-slate-500">
              Reviewed {formatTime(row.reviewed_at)}
              {row.reviewed_by_email ? ` by ${row.reviewed_by_email}` : ''}
            </p>
          )}
        </Card>

        <Card className="p-4">
          <SectionTitle>Details</SectionTitle>
          <dl className="space-y-2 text-sm">
            <Row label="Sender" value={formatSender(row.wa_from)} />
            {row.sender_name && <Row label="WhatsApp name" value={row.sender_name} />}
            <Row label="Received" value={formatTime(row.received_at)} />
            <Row label="Caption" value={row.caption || '—'} />
            <Row label="Type" value={row.message_type} />
            {row.error_details && <Row label="Error" value={row.error_details} tone="red" />}
            {row.ack_error && <Row label="Reply error" value={row.ack_error} tone="red" />}
            <Row label="Media ID" value={row.media_id || '—'} mono />
            <Row label="Message ID" value={row.wa_message_id} mono />
            <Row label="Stored at" value={row.storage_path || '—'} mono />
          </dl>
        </Card>
      </div>
    </div>
  )
}

function Row({ label, value, mono, tone }) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-2">
      <dt className="text-slate-500">{label}</dt>
      <dd className={[mono ? 'break-all font-mono text-xs' : 'break-words', tone === 'red' ? 'text-red-700' : 'text-slate-800'].join(' ')}>
        {value}
      </dd>
    </div>
  )
}
