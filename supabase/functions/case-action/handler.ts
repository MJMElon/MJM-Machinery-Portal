// Core logic for the case-action Edge Function: send an official WhatsApp
// message from the company number to a case's supplier and log it on the case.
// No Supabase/Deno globals here: everything is injected so it can be tested.

export interface CaseInfo {
  id: string
  case_no: number
  machine_name: string | null
  supplier_id: string | null
  sent_at: string | null
}

export interface Supplier {
  id: string
  name: string
  phone: string | null
}

export interface ActionRow {
  case_id: string
  kind: 'sent'
  body: string
  supplier_id: string
  supplier_name: string
  to_phone: string
  delivery: 'sent' | 'failed'
  wa_message_id: string | null
  error: string | null
  created_by: string
  created_by_email: string | null
}

export interface Deps {
  /** The signed-in user behind the request's Bearer token, or null. */
  getUser(token: string): Promise<{ id: string; email: string | null } | null>
  /** Whether that user may edit this case (checked in the database as the user). */
  canEdit(token: string, caseId: string): Promise<boolean>
  loadCase(id: string): Promise<CaseInfo | null>
  loadSupplier(id: string): Promise<Supplier | null>
  insertAction(row: ActionRow): Promise<unknown>
  updateCase(id: string, patch: Record<string, unknown>): Promise<void>
  /** Sends the WhatsApp message; resolves the WhatsApp message id; throws a readable error. */
  send(to: string, text: string, c: CaseInfo): Promise<string | null>
  today(): string // YYYY-MM-DD (Malaysia time)
}

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

export const digitsOnly = (s: string | null | undefined) => String(s ?? '').replace(/\D/g, '')

export async function handle(req: Request, deps: Deps): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  const user = token ? await deps.getUser(token) : null
  if (!user) return json({ error: 'Please sign in again.' }, 401)

  let body: any
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid request.' }, 400)
  }
  const caseId = String(body?.case_id ?? '')
  const supplierId = String(body?.supplier_id ?? '')
  const message = String(body?.message ?? '').trim()
  if (!caseId || !supplierId || !message) return json({ error: 'Choose a supplier and write a message.' }, 400)
  if (message.length > 3500) return json({ error: 'Message is too long (max 3500 characters).' }, 400)

  if (!(await deps.canEdit(token, caseId))) return json({ error: 'You do not have edit access for this case.' }, 403)
  const c = await deps.loadCase(caseId)
  if (!c) return json({ error: 'Case not found.' }, 404)
  const s = await deps.loadSupplier(supplierId)
  if (!s) return json({ error: 'Supplier not found.' }, 404)
  const to = digitsOnly(s.phone)
  if (to.length < 8) return json({ error: `${s.name} has no WhatsApp number. Add it in Supplier Workshop List.` }, 400)

  let waId: string | null = null
  let error: string | null = null
  try {
    waId = await deps.send(to, message, c)
  } catch (e) {
    error = (e instanceof Error ? e.message : String(e)).slice(0, 1000)
  }

  await deps.insertAction({
    case_id: c.id,
    kind: 'sent',
    body: message,
    supplier_id: s.id,
    supplier_name: s.name,
    to_phone: to,
    delivery: error ? 'failed' : 'sent',
    wa_message_id: waId,
    error,
    created_by: user.id,
    created_by_email: user.email,
  })
  if (!error) {
    // First send-out sets the case's supplier and "sent out" date.
    const patch: Record<string, unknown> = {}
    if (c.supplier_id !== s.id) patch.supplier_id = s.id
    if (!c.sent_at) patch.sent_at = deps.today()
    if (Object.keys(patch).length) await deps.updateCase(c.id, patch)
  }
  return json(error ? { ok: false, error } : { ok: true, wa_message_id: waId }, error ? 502 : 200)
}

/** Message text with the case reference, as the supplier sees it. */
export function officialText(text: string, c: CaseInfo, company: string | null): string {
  const head = `[${company ? company + ' · ' : ''}Case #${c.case_no}${c.machine_name ? ' · ' + c.machine_name : ''}]`
  return `${head}\n${text}`
}
