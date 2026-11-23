// Supabase Edge Function: daily fleet card statement import for the AI agent.
//
// The agent signs in to the station portal (Setel), takes the day's card
// transactions and sends them here. Each transaction is saved once (sending
// the same day again adds nothing twice), put on the fleet card it was made
// with (Fleet Card Manage) and paired with the driver's fuel claim receipt
// for the same fill when there is one.
//
//   POST https://<project>.supabase.co/functions/v1/fleet-card-import
//   Header:  x-api-key: <FLEET_IMPORT_KEY>
//   Body, either
//     JSON  { "source": "setel", "transactions": [ { "txn_id": "...", "card_no": "...",
//             "date": "2026-11-20", "time": "17:40", "litres": 40.12, "amount": 86.26,
//             "station": "...", "vehicle": "JQX 88", "driver": "...", "receipt_no": "...",
//             "product": "Diesel" } ] }
//     CSV   the statement file as exported (Content-Type: text/csv)
//   Answer  { added, duplicates, paired_with_claims, skipped, not_saved, problems: [...] }
//
//   GET with the same header: { ok: true, last_import } (a connection test)
//
// Secrets (Supabase → Edge Functions → Secrets):
//   FLEET_IMPORT_KEY   a long random key (at least 32 characters) given only to the agent
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { importPayload, normalizeRows, parseCsv } from '../_shared/statement.js'

const env = (k: string) => (Deno.env.get(k) ?? '').trim()
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })

const MAX_BYTES = 3_000_000

// constant-time compare of the key
async function sameKey(a: string, b: string) {
  const enc = new TextEncoder()
  const [x, y] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(a)), crypto.subtle.digest('SHA-256', enc.encode(b))])
  const u = new Uint8Array(x)
  const v = new Uint8Array(y)
  let diff = 0
  for (let i = 0; i < u.length; i++) diff |= u[i] ^ v[i]
  return diff === 0
}

Deno.serve(async (req) => {
  const key = env('FLEET_IMPORT_KEY')
  if (key.length < 32) return reply({ error: 'Not set up yet: add the FLEET_IMPORT_KEY secret (32+ characters).' }, 503)
  const given = (req.headers.get('x-api-key') ?? req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? '').trim()
  if (!given || !(await sameKey(given, key))) {
    await new Promise((r) => setTimeout(r, 400)) // slow down guessing
    return reply({ error: 'Wrong or missing x-api-key' }, 401)
  }

  const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } })

  if (req.method === 'GET') {
    const { data } = await db.from('machinery_card_imports').select('created_at, received, added, duplicates, paired').order('created_at', { ascending: false }).limit(1)
    return reply({ ok: true, last_import: data?.[0] ?? null })
  }
  if (req.method !== 'POST') return reply({ error: 'POST or GET only' }, 405)

  const text = await req.text()
  if (text.length > MAX_BYTES) return reply({ error: 'Too big: send at most 3 MB (about a month of transactions) per call.' }, 413)

  let source = 'setel'
  let company = ''
  let raw: unknown[] = []
  const type = (req.headers.get('Content-Type') ?? '').toLowerCase()
  if (type.includes('json') || /^\s*[[{]/.test(text)) {
    let body: unknown
    try {
      body = JSON.parse(text)
    } catch {
      return reply({ error: 'The body is not valid JSON.' }, 400)
    }
    if (Array.isArray(body)) raw = body
    else if (body && typeof body === 'object') {
      const b = body as Record<string, unknown>
      raw = Array.isArray(b.transactions) ? b.transactions : Array.isArray(b.rows) ? b.rows : []
      if (typeof b.csv === 'string') raw = parseCsv(b.csv)
      if (typeof b.source === 'string') source = b.source
      if (typeof b.company === 'string') company = b.company
    }
  } else {
    raw = parseCsv(text)
    source = new URL(req.url).searchParams.get('source') || source
    company = new URL(req.url).searchParams.get('company') || ''
  }
  if (!['setel', 'statement'].includes(source)) source = 'statement'
  if (!raw.length) return reply({ error: 'No transactions found. Send JSON { "transactions": [...] } or the CSV with a header row (card number, date, litres, amount).' }, 400)
  if (raw.length > 3000) return reply({ error: 'At most 3000 transactions per call.' }, 413)

  const rows = normalizeRows(raw, { company })
  const skipped = rows.filter((r) => r._skip).length
  const early = rows.filter((r) => r._problem).map((r) => ({ row: r._row, txn_id: r.txn_id || null, card_no: r.card_no || null, date: r.date || null, reason: r._problem }))
  const payload = importPayload(rows)

  let result: Record<string, unknown> = { received: 0, added: 0, duplicates: 0, paired_with_claims: 0, problems: [] }
  if (payload.length) {
    const { data, error } = await db.rpc('machinery_import_card_transactions', { p_rows: payload, p_source: source, p_company: null })
    if (error) return reply({ error: `Database: ${error.message}` }, 500)
    result = data as Record<string, unknown>
  }
  // the database numbers its rows among those it received: give the file's row numbers back
  const sent = rows.filter((r) => !r._skip && !r._problem)
  const dbProblems = ((result.problems as { row: number }[]) ?? []).map((p) => ({ ...p, row: sent[p.row - 1]?._row ?? p.row }))
  const problems = [...early, ...dbProblems].sort((a, b) => a.row - b.row)
  return reply({
    received: rows.length,
    added: result.added ?? 0,
    duplicates: result.duplicates ?? 0,
    paired_with_claims: result.paired_with_claims ?? 0,
    skipped_not_fuel: skipped,
    not_saved: problems.length,
    problems
  })
})
