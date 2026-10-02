import { supabase, WA_TABLE, WA_BUCKET } from './supabase.js'

// Signed image URLs are short-lived; pages re-sign on every load/refresh.
export const SIGNED_URL_SECONDS = 600

const LIST_COLUMNS =
  'id, wa_message_id, wa_from, sender_name, message_type, received_at, caption, storage_path, status, error_details, ack_status, reviewed_at'

// Message types the inbox shows and the webhook saves. `caption` holds the
// photo caption or the text message body.
export const INBOX_TYPES = ['image', 'text']

/**
 * filter: pending | solved | problems | all
 * A case is a saved text/photo; "solved" = marked reviewed (reviewed_at set).
 */
export async function listMessages({ filter = 'pending', limit = 200 } = {}) {
  let q = supabase.from(WA_TABLE).select(LIST_COLUMNS).order('received_at', { ascending: false }).limit(limit)
  if (filter === 'pending') q = q.in('message_type', INBOX_TYPES).eq('status', 'saved').is('reviewed_at', null)
  if (filter === 'solved') q = q.not('reviewed_at', 'is', null)
  if (filter === 'problems') q = q.or('status.eq.failed,status.eq.received,status.eq.processing,ack_status.eq.failed')
  const { data, error } = await q
  if (error) throw error
  return data || []
}

export async function countToReview() {
  const { count, error } = await supabase
    .from(WA_TABLE)
    .select('id', { count: 'exact', head: true })
    .in('message_type', INBOX_TYPES)
    .eq('status', 'saved')
    .is('reviewed_at', null)
  if (error) throw error
  return count || 0
}

export async function getMessage(id) {
  const { data, error } = await supabase.from(WA_TABLE).select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data
}

/** Map of storage_path → short-lived signed URL (private bucket). */
export async function signPaths(paths) {
  const unique = [...new Set(paths.filter(Boolean))]
  if (!unique.length) return {}
  const { data, error } = await supabase.storage.from(WA_BUCKET).createSignedUrls(unique, SIGNED_URL_SECONDS)
  if (error) throw error
  const map = {}
  for (const row of data || []) if (row.signedUrl) map[row.path] = row.signedUrl
  return map
}

/** Reviewed flag goes through an RPC so reviewed_by is always the real caller. */
export async function setReviewed(id, reviewed) {
  const { data, error } = await supabase.rpc('machinery_set_whatsapp_reviewed', { p_id: id, p_reviewed: reviewed })
  if (error) throw error
  return data
}

// ---- display helpers -------------------------------------------------------

export function formatSender(waFrom) {
  return waFrom ? `+${String(waFrom).replace(/^\+/, '')}` : '—'
}

export function formatTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

const STATUS = {
  received: { color: 'amber', label: 'Queued' },
  processing: { color: 'amber', label: 'Saving…' },
  saved: { color: 'green', label: 'Saved' },
  failed: { color: 'red', label: 'Save failed' },
  ignored: { color: 'slate', label: 'Logged only' }
}
export const statusBadge = (s) => STATUS[s] || { color: 'slate', label: s || 'Unknown' }

const ACK = {
  pending: { color: 'slate', label: 'Reply pending' },
  sent: { color: 'blue', label: 'Reply sent' },
  failed: { color: 'red', label: 'Reply failed' },
  skipped: { color: 'slate', label: 'No reply' }
}
export const ackBadge = (s) => ACK[s] || null
