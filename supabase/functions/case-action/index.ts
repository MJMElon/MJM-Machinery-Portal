// Supabase Edge Function: send an official WhatsApp message to a case's
// supplier from the company WhatsApp number, and log it on the case.
//
// Called by the portal (supabase.functions.invoke('case-action')) with the
// signed-in user's token; the user's edit access is checked in the database.
//
// Uses the same secrets as whatsapp-webhook: WHATSAPP_ACCESS_TOKEN,
// WHATSAPP_PHONE_NUMBER_ID, optional WHATSAPP_GRAPH_VERSION. Optional:
//   WHATSAPP_SUPPLIER_TEMPLATE  name of an approved template with ONE body
//                               variable {{1}} (the message). Needed to reach
//                               suppliers who have not messaged the business
//                               number in the last 24 hours.
//   WHATSAPP_TEMPLATE_LANG      template language code, default "en".

import { createClient } from 'npm:@supabase/supabase-js@2'
import { CORS, handle, officialText, type CaseInfo } from './handler.ts'

const env = (k: string) => (Deno.env.get(k) ?? '').trim()

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const url = env('SUPABASE_URL')
  const service = env('SUPABASE_SERVICE_ROLE_KEY')
  const anon = env('SUPABASE_ANON_KEY')
  const db = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } })
  const asUser = (token: string) =>
    createClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    })

  return handle(req, {
    async getUser(token) {
      const { data } = await db.auth.getUser(token)
      return data?.user ? { id: data.user.id, email: data.user.email ?? null } : null
    },
    async canEdit(token, caseId) {
      const { data, error } = await asUser(token).rpc('machinery_case_can', { p_case: caseId, p_action: 'edit' })
      if (error) throw new Error(`access check: ${error.message}`)
      return data === true
    },
    async loadCase(id) {
      const { data } = await db
        .from('machinery_cases')
        .select('id, case_no, machine_name, supplier_id, sent_at, wa_from')
        .eq('id', id)
        .maybeSingle()
      return (data as CaseInfo) ?? null
    },
    async loadSupplier(id) {
      const { data } = await db.from('machinery_suppliers').select('id, name, phone').eq('id', id).maybeSingle()
      return data ?? null
    },
    async insertAction(row) {
      const { error } = await db.from('machinery_case_actions').insert(row)
      if (error) throw new Error(`log action: ${error.message}`)
    },
    async updateCase(id, patch) {
      await db.from('machinery_cases').update(patch).eq('id', id)
    },
    async send(to, text, c) {
      const { data: co } = await db.rpc('machinery_company_of_number', { p_wa_from: (c as any).wa_from })
      let company: string | null = null
      if (co) company = (await db.from('machinery_companies').select('name').eq('id', co).maybeSingle()).data?.name ?? null
      const full = officialText(text, c, company)
      const template = env('WHATSAPP_SUPPLIER_TEMPLATE')
      const payload = template
        ? {
            messaging_product: 'whatsapp',
            to,
            type: 'template',
            template: {
              name: template,
              language: { code: env('WHATSAPP_TEMPLATE_LANG') || 'en' },
              components: [{ type: 'body', parameters: [{ type: 'text', text: full.replace(/\n+/g, ' · ') }] }],
            },
          }
        : { messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'text', text: { body: full } }
      const res = await fetch(
        `https://graph.facebook.com/${env('WHATSAPP_GRAPH_VERSION') || 'v23.0'}/${env('WHATSAPP_PHONE_NUMBER_ID')}/messages`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${env('WHATSAPP_ACCESS_TOKEN')}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(20_000),
        },
      )
      const out = await res.json().catch(() => null)
      if (!res.ok) throw new Error(explain(res.status, out?.error))
      return out?.messages?.[0]?.id ?? null
    },
    today: () => new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10), // Malaysia (UTC+8)
  })
})

function explain(status: number, e: any): string {
  const code = e?.code
  const detail = [e?.message, e?.error_data?.details].filter(Boolean).join(' — ') || `HTTP ${status}`
  if (code === 131047 || code === 131026 || /24 hours|re-engagement/i.test(detail)) {
    return `WhatsApp only allows free text to suppliers who messaged your business number in the last 24 hours. Use "Open in my WhatsApp", or set up an approved message template (WHATSAPP_SUPPLIER_TEMPLATE). (${detail})`
  }
  if (code === 131030) return `This supplier number is not in the test number's allowed recipient list in Meta. (${detail})`
  if (code === 190 || status === 401) return `The WhatsApp access token is invalid or expired. (${detail})`
  return `WhatsApp send failed (HTTP ${status}${code ? `, code ${code}` : ''}): ${detail}`
}
