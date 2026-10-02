// Supabase Edge Function: WhatsApp Cloud API webhook (Meta → photo + text inbox).
//
// Public URL: https://<project-ref>.supabase.co/functions/v1/whatsapp-webhook
// Deploy with JWT verification OFF (Meta cannot send a Supabase JWT); every
// POST is authenticated with Meta's X-Hub-Signature-256 instead.
//
// Secrets (supabase secrets set …) — never in the frontend or the repo:
//   WHATSAPP_VERIFY_TOKEN     your own random string, also typed into Meta
//   WHATSAPP_APP_SECRET       Meta App → App settings → Basic → App secret
//   WHATSAPP_ACCESS_TOKEN     Meta temporary (24h) or system-user token
//   WHATSAPP_PHONE_NUMBER_ID  Meta → WhatsApp → API Setup → Phone number ID
//   WHATSAPP_ALLOWED_NUMBERS  comma list, e.g. "60123456789,60198765432"
//   WHATSAPP_GRAPH_VERSION    optional, default v23.0
//   WHATSAPP_ACK_TEXT         optional, default "Photo received"
//   WHATSAPP_ACK_TEXT_MESSAGE optional, default "Message received"
// SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are injected by Supabase itself.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { handle, MAX_ATTEMPTS, parseAllowlist, type Config, type MessageRow, type Store } from './handler.ts'

const TABLE = 'machinery_whatsapp_messages'
const BUCKET = 'machinery_whatsapp_photos'

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined

function readConfig(): Config {
  const env = (k: string) => (Deno.env.get(k) ?? '').trim()
  return {
    verifyToken: env('WHATSAPP_VERIFY_TOKEN'),
    appSecret: env('WHATSAPP_APP_SECRET'),
    accessToken: env('WHATSAPP_ACCESS_TOKEN'),
    phoneNumberId: env('WHATSAPP_PHONE_NUMBER_ID'),
    allowedNumbers: parseAllowlist(env('WHATSAPP_ALLOWED_NUMBERS')),
    graphVersion: env('WHATSAPP_GRAPH_VERSION') || 'v23.0',
    ackText: env('WHATSAPP_ACK_TEXT') || 'Photo received',
    ackTextMessage: env('WHATSAPP_ACK_TEXT_MESSAGE') || 'Message received',
    maxBytes: 16 * 1024 * 1024,
  }
}

function makeStore(): Store {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not available')
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

  return {
    async insertIfNew(row: MessageRow) {
      const { data, error } = await db
        .from(TABLE)
        .upsert(row, { onConflict: 'wa_message_id', ignoreDuplicates: true })
        .select('id')
      if (error) throw new Error(`insert: ${error.message}`)
      return (data?.length ?? 0) > 0
    },
    async claim(waMessageId: string) {
      // Single UPDATE … WHERE status IN (…): only one concurrent delivery wins.
      const { data, error } = await db
        .from(TABLE)
        .update({ status: 'processing' })
        .eq('wa_message_id', waMessageId)
        .in('status', ['received', 'failed'])
        .lt('attempts', MAX_ATTEMPTS)
        .select('*')
        .maybeSingle()
      if (error) throw new Error(`claim: ${error.message}`)
      return (data as MessageRow) ?? null
    },
    async update(waMessageId: string, patch: Record<string, unknown>) {
      const { error } = await db.from(TABLE).update(patch).eq('wa_message_id', waMessageId)
      if (error) throw new Error(`update: ${error.message}`)
    },
    async upload(path: string, bytes: Uint8Array, contentType: string) {
      const { error } = await db.storage.from(BUCKET).upload(path, bytes, { contentType, upsert: true })
      if (error) throw new Error(`storage upload: ${error.message}`)
    },
  }
}

const log = (msg: string, extra?: Record<string, unknown>) =>
  console.log(JSON.stringify({ fn: 'whatsapp-webhook', msg, ...(extra ?? {}) }))

Deno.serve(async (req) => {
  const config = readConfig()
  const missing = [
    !config.verifyToken && 'WHATSAPP_VERIFY_TOKEN',
    req.method === 'POST' && !config.appSecret && 'WHATSAPP_APP_SECRET',
    req.method === 'POST' && !config.accessToken && 'WHATSAPP_ACCESS_TOKEN',
    req.method === 'POST' && !config.phoneNumberId && 'WHATSAPP_PHONE_NUMBER_ID',
  ].filter(Boolean)
  if (missing.length) {
    log('missing secrets', { missing })
    return new Response('Server not configured', { status: 500 })
  }
  if (req.method === 'POST' && config.allowedNumbers.size === 0) {
    log('WHATSAPP_ALLOWED_NUMBERS is empty: every sender will be logged but not processed')
  }

  let store: Store
  try {
    store = makeStore()
  } catch (e) {
    log('store init failed', { error: String(e) })
    return new Response('Server not configured', { status: 500 })
  }

  return handle(req, {
    config,
    store,
    fetch,
    waitUntil: (p) => {
      const guarded = p.catch((e) => log('background task crashed', { error: String(e) }))
      if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(guarded)
    },
    log,
  })
})
