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
// SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are injected by Supabase itself.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { handle, MAX_ATTEMPTS, parseAllowlist, type CaseRef, type Config, type MessageRow, type Store } from './handler.ts'

const TABLE = 'machinery_whatsapp_messages'
const BUCKET = 'machinery_whatsapp_photos'
const CASES = 'machinery_cases'

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
    maxBytes: 16 * 1024 * 1024,
  }
}

function makeStore(): Store {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not available')
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

  async function caseById(id: string) {
    const { data, error } = await db.from(CASES).select('id, case_no').eq('id', id).maybeSingle()
    if (error) throw new Error(`find case: ${error.message}`)
    return (data as CaseRef) ?? null
  }

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
    async findCaseByNo(caseNo: number) {
      const { data, error } = await db.from(CASES).select('id, case_no').eq('case_no', caseNo).maybeSingle()
      if (error) throw new Error(`find case: ${error.message}`)
      return (data as CaseRef) ?? null
    },
    async findCaseByReply(waMessageId: string) {
      // Our "Case #n created" reply…
      const c = await db.from(CASES).select('id, case_no').eq('ack_message_id', waMessageId).maybeSingle()
      if (c.error) throw new Error(`find case: ${c.error.message}`)
      if (c.data) return c.data as CaseRef
      // …or any message already in a case (incoming, or our "added to case" reply).
      for (const col of ['wa_message_id', 'ack_message_id']) {
        const m = await db.from(TABLE).select('case_id').eq(col, waMessageId).not('case_id', 'is', null).limit(1)
        if (m.error) throw new Error(`find case: ${m.error.message}`)
        const caseId = m.data?.[0]?.case_id
        if (caseId) return await caseById(caseId)
      }
      return null
    },
    async recentCaseForSender(waFrom: string, sinceIso: string) {
      const { data, error } = await db
        .from(TABLE)
        .select('case_id, machinery_cases!inner(id, case_no, status)')
        .eq('wa_from', waFrom)
        .eq('machinery_cases.status', 'pending')
        .gte('received_at', sinceIso)
        .order('received_at', { ascending: false })
        .limit(1)
      if (error) throw new Error(`recent case: ${error.message}`)
      const c = (data?.[0] as any)?.machinery_cases
      return c ? { id: c.id, case_no: c.case_no } : null
    },
    async createCase(c) {
      const { data, error } = await db.from(CASES).insert(c).select('id, case_no').single()
      if (error) throw new Error(`create case: ${error.message}`)
      return data as CaseRef
    },
    async setCaseAck(caseId: string, ackMessageId: string | null) {
      const { error } = await db.from(CASES).update({ ack_message_id: ackMessageId }).eq('id', caseId)
      if (error) throw new Error(`case reply id: ${error.message}`)
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
