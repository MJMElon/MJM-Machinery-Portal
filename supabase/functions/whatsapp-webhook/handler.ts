// Core logic for the WhatsApp Cloud API webhook. No Supabase/Deno globals in
// here: storage and network are injected so the logic can be unit-tested.

export interface Config {
  verifyToken: string
  appSecret: string
  accessToken: string
  phoneNumberId: string
  allowedNumbers: Set<string> // digits only, e.g. "60123456789"
  graphVersion: string // e.g. "v23.0"
  ackText: string // reply to a saved photo
  ackTextMessage: string // reply to a saved text message
  maxBytes: number
}

export type Status = 'received' | 'processing' | 'saved' | 'failed' | 'ignored'
export type AckStatus = 'pending' | 'sent' | 'failed' | 'skipped'

export interface MessageRow {
  wa_message_id: string
  wa_from: string
  sender_name: string | null
  phone_number_id: string | null
  message_type: string
  received_at: string
  caption: string | null
  media_id: string | null
  mime_type: string | null
  status: Status
  error_details: string | null
  ack_status: AckStatus
  raw: unknown
  attempts?: number
}

export interface Store {
  /** Insert unless wa_message_id exists. Resolves true if a new row was written. Throws on DB error. */
  insertIfNew(row: MessageRow): Promise<boolean>
  /** Atomically move a received/failed row to "processing". Resolves the row, or null if someone else has it / it's done. */
  claim(waMessageId: string): Promise<MessageRow | null>
  update(waMessageId: string, patch: Record<string, unknown>): Promise<void>
  upload(path: string, bytes: Uint8Array, contentType: string): Promise<void>
}

export interface Deps {
  config: Config
  store: Store
  fetch: typeof fetch
  /** Keep work running after the HTTP response (EdgeRuntime.waitUntil). */
  waitUntil: (p: Promise<unknown>) => void
  log?: (msg: string, extra?: Record<string, unknown>) => void
}

export const MAX_ATTEMPTS = 5

export const digitsOnly = (s: string | null | undefined) => String(s ?? '').replace(/\D/g, '')

export function parseAllowlist(raw: string | undefined): Set<string> {
  return new Set(
    String(raw ?? '')
      .split(/[,;\n]+/)
      .map(digitsOnly)
      .filter(Boolean),
  )
}

// ---------------------------------------------------------------------------
// Signature: X-Hub-Signature-256 = "sha256=" + hex(HMAC_SHA256(appSecret, rawBody))
// ---------------------------------------------------------------------------
export async function hmacHex(secret: string, body: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, body as BufferSource))
  return Array.from(sig, (b) => b.toString(16).padStart(2, '0')).join('')
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export async function verifySignature(appSecret: string, header: string | null, body: Uint8Array): Promise<boolean> {
  if (!appSecret || !header) return false
  const m = /^sha256=([0-9a-fA-F]{64})$/.exec(header.trim())
  if (!m) return false
  return timingSafeEqual(m[1].toLowerCase(), await hmacHex(appSecret, body))
}

// ---------------------------------------------------------------------------
// HTTP entry
// ---------------------------------------------------------------------------
export async function handle(req: Request, deps: Deps): Promise<Response> {
  const log = deps.log ?? (() => {})
  const url = new URL(req.url)

  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode')
    const token = url.searchParams.get('hub.verify_token')
    const challenge = url.searchParams.get('hub.challenge') ?? ''
    if (mode === 'subscribe' && deps.config.verifyToken && token === deps.config.verifyToken) {
      log('webhook verified')
      return new Response(challenge, { status: 200, headers: { 'content-type': 'text/plain' } })
    }
    log('webhook verification rejected', { mode })
    return new Response('Forbidden', { status: 403 })
  }

  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })

  const body = new Uint8Array(await req.arrayBuffer())
  if (!(await verifySignature(deps.config.appSecret, req.headers.get('x-hub-signature-256'), body))) {
    log('rejected POST: bad or missing X-Hub-Signature-256')
    return new Response('Invalid signature', { status: 401 })
  }

  let payload: any
  try {
    payload = JSON.parse(new TextDecoder().decode(body))
  } catch {
    log('signed POST with invalid JSON; acknowledged and dropped')
    return new Response('OK', { status: 200 })
  }

  if (payload?.object !== 'whatsapp_business_account') {
    log('ignored non-WhatsApp webhook object', { object: payload?.object })
    return new Response('OK', { status: 200 })
  }

  const rows = extractMessages(payload, deps.config, log)

  // Record every message BEFORE answering 200. If the DB is down we return
  // 500 so Meta retries later; the unique wa_message_id makes retries safe.
  const toProcess: string[] = []
  try {
    for (const row of rows) {
      const inserted = await deps.store.insertIfNew(row)
      if (!inserted) log('duplicate delivery', { wa_message_id: row.wa_message_id })
      // Rows are (re)tried on duplicates too: claim() only picks up rows that
      // are still "received" or "failed", so a saved message is never redone.
      if (row.status === 'received') toProcess.push(row.wa_message_id)
    }
  } catch (e) {
    log('database insert failed; asking Meta to retry', { error: errText(e) })
    return new Response('Temporary failure', { status: 500 })
  }

  if (toProcess.length) {
    deps.waitUntil(
      (async () => {
        for (const id of toProcess) await processMessage(id, deps)
      })(),
    )
  }
  return new Response('EVENT_RECEIVED', { status: 200 })
}

// ---------------------------------------------------------------------------
// Payload → rows
// ---------------------------------------------------------------------------
export function extractMessages(payload: any, config: Config, log: NonNullable<Deps['log']>): MessageRow[] {
  const out: MessageRow[] = []
  for (const entry of payload?.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      if (change?.field !== 'messages') {
        log('ignored webhook field', { field: change?.field })
        continue
      }
      const value = change.value ?? {}
      const pnid = value?.metadata?.phone_number_id ?? null
      if (Array.isArray(value.statuses) && value.statuses.length) {
        log('delivery status update(s) ignored', { count: value.statuses.length })
      }
      if (config.phoneNumberId && pnid && pnid !== config.phoneNumberId) {
        log('message for a different phone number id ignored', { phone_number_id: pnid })
        continue
      }
      const names = new Map<string, string>()
      for (const c of value.contacts ?? []) if (c?.wa_id) names.set(String(c.wa_id), c?.profile?.name ?? '')

      for (const m of value.messages ?? []) {
        if (!m?.id || !m?.from) continue
        const from = digitsOnly(m.from)
        const type = String(m.type ?? 'unknown')
        const ts = Number(m.timestamp)
        // `caption` holds the photo caption, or the body of a text message.
        const text = type === 'image' ? (m.image?.caption ?? null) : type === 'text' ? (m.text?.body ?? null) : null
        const row: MessageRow = {
          wa_message_id: String(m.id),
          wa_from: from,
          sender_name: names.get(String(m.from)) || null,
          phone_number_id: pnid,
          message_type: type,
          received_at: new Date(Number.isFinite(ts) && ts > 0 ? ts * 1000 : Date.now()).toISOString(),
          caption: text,
          media_id: type === 'image' ? (m.image?.id ?? null) : null,
          mime_type: type === 'image' ? (m.image?.mime_type ?? null) : null,
          status: 'received',
          error_details: null,
          ack_status: 'pending',
          raw: m,
        }
        if (!config.allowedNumbers.has(from)) {
          row.status = 'ignored'
          row.ack_status = 'skipped'
          row.error_details = 'Sender is not in WHATSAPP_ALLOWED_NUMBERS (trial allowlist). Logged only.'
        } else if (type !== 'image' && type !== 'text') {
          row.status = 'ignored'
          row.ack_status = 'skipped'
          row.error_details = `Message type "${type}" is not handled yet. Logged only.`
        } else if (type === 'image' && !row.media_id) {
          row.status = 'failed'
          row.ack_status = 'skipped'
          row.error_details = 'Image message has no media id.'
        }
        out.push(row)
      }
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Save (photo: download from Meta → Storage) → acknowledge
// ---------------------------------------------------------------------------
export async function processMessage(waMessageId: string, deps: Deps): Promise<void> {
  const { store, config } = deps
  const log = deps.log ?? (() => {})
  let row: MessageRow | null
  try {
    row = await store.claim(waMessageId)
  } catch (e) {
    log('claim failed', { wa_message_id: waMessageId, error: errText(e) })
    return
  }
  if (!row) return // already saved, being processed, or out of attempts
  const attempts = (row.attempts ?? 0) + 1

  const isText = row.message_type === 'text'
  try {
    if (isText) {
      await store.update(waMessageId, { status: 'saved', error_details: null, attempts })
      log('text saved', { wa_message_id: waMessageId })
    } else {
      const { bytes, mimeType } = await downloadMedia(row.media_id!, deps)
      const storagePath = buildStoragePath(row.wa_message_id, row.received_at, mimeType)
      await store.upload(storagePath, bytes, mimeType)
      await store.update(waMessageId, {
        status: 'saved',
        storage_path: storagePath,
        mime_type: mimeType,
        file_size: bytes.byteLength,
        error_details: null,
        attempts,
      })
      log('photo saved', { wa_message_id: waMessageId, storage_path: storagePath })
    }
  } catch (e) {
    const msg = errText(e)
    log('save failed', { wa_message_id: waMessageId, error: msg })
    await safeUpdate(store, waMessageId, { status: 'failed', error_details: msg, attempts }, log)
    return // no acknowledgement for a message we could not keep
  }

  if (row.ack_status === 'sent') return
  try {
    const ackId = await sendText(row.wa_from, isText ? config.ackTextMessage : config.ackText, deps)
    await safeUpdate(
      store,
      waMessageId,
      { ack_status: 'sent', ack_message_id: ackId, ack_error: null, ack_sent_at: new Date().toISOString() },
      log,
    )
  } catch (e) {
    const msg = errText(e)
    log('acknowledgement failed (message is still saved)', { wa_message_id: waMessageId, error: msg })
    await safeUpdate(store, waMessageId, { ack_status: 'failed', ack_error: msg }, log)
  }
}

async function safeUpdate(store: Store, id: string, patch: Record<string, unknown>, log: NonNullable<Deps['log']>) {
  try {
    await store.update(id, patch)
  } catch (e) {
    log('status update failed', { wa_message_id: id, error: errText(e) })
  }
}

const graph = (config: Config, path: string) => `https://graph.facebook.com/${config.graphVersion}/${path}`

export async function downloadMedia(mediaId: string, deps: Deps): Promise<{ bytes: Uint8Array; mimeType: string }> {
  const { config } = deps
  const auth = { Authorization: `Bearer ${config.accessToken}` }
  const metaRes = await deps.fetch(
    graph(config, `${encodeURIComponent(mediaId)}?phone_number_id=${encodeURIComponent(config.phoneNumberId)}`),
    { headers: auth, signal: AbortSignal.timeout(20_000) },
  )
  const meta = await readJson(metaRes)
  if (!metaRes.ok || !meta?.url) throw new GraphError('Media lookup', metaRes.status, meta)
  if (meta.file_size && Number(meta.file_size) > config.maxBytes) {
    throw new Error(`Image is ${meta.file_size} bytes, over the ${config.maxBytes} byte limit.`)
  }

  const fileRes = await deps.fetch(meta.url, { headers: auth, signal: AbortSignal.timeout(60_000) })
  if (!fileRes.ok) throw new GraphError('Media download', fileRes.status, await readJson(fileRes))
  const bytes = new Uint8Array(await fileRes.arrayBuffer())
  if (bytes.byteLength === 0) throw new Error('Media download returned an empty file.')
  if (bytes.byteLength > config.maxBytes) throw new Error(`Image is over the ${config.maxBytes} byte limit.`)
  const mimeType = String(meta.mime_type || fileRes.headers.get('content-type') || 'image/jpeg').split(';')[0].trim()
  return { bytes, mimeType }
}

export async function sendText(to: string, text: string, deps: Deps): Promise<string | null> {
  const { config } = deps
  const res = await deps.fetch(graph(config, `${encodeURIComponent(config.phoneNumberId)}/messages`), {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { body: text },
    }),
    signal: AbortSignal.timeout(20_000),
  })
  const json = await readJson(res)
  if (!res.ok) throw new GraphError('Send reply', res.status, json)
  return json?.messages?.[0]?.id ?? null
}

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
}

export function buildStoragePath(waMessageId: string, receivedAtIso: string, mimeType: string): string {
  const d = new Date(receivedAtIso)
  const yyyy = d.getUTCFullYear()
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  const safe = waMessageId.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 180)
  return `${yyyy}/${mm}/${safe}.${EXT[mimeType] ?? 'jpg'}`
}

// ---------------------------------------------------------------------------
// Errors (never include tokens; Meta error bodies do not echo them)
// ---------------------------------------------------------------------------
export class GraphError extends Error {
  constructor(step: string, status: number, body: any) {
    const e = body?.error ?? {}
    const code = e.code
    let hint = ''
    if (code === 190 || status === 401) {
      hint = ' → The Meta access token is invalid or expired. Replace the WHATSAPP_ACCESS_TOKEN secret.'
    } else if (code === 131030) {
      hint = ' → This number is not in the test number\'s recipient list (Meta → WhatsApp → API Setup → "To").'
    } else if (code === 131047) {
      hint = " → More than 24 hours since the sender's last message; a template would be required."
    }
    const detail = [e.message, e.error_data?.details].filter(Boolean).join(' — ') || `HTTP ${status}`
    super(`${step} failed (HTTP ${status}${code ? `, code ${code}` : ''}): ${detail}${hint}`.slice(0, 1000))
    this.name = 'GraphError'
  }
}

async function readJson(res: Response): Promise<any> {
  try {
    return await res.clone().json()
  } catch {
    return null
  }
}

export function errText(e: unknown): string {
  return (e instanceof Error ? e.message : String(e)).slice(0, 1000)
}
