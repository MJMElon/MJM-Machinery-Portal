// Supabase Edge Function: "Sync from MJM Intranet" button (super admins).
// Pulls businesses / companies from the Intranet and applies them here.
// Called by the portal with the signed-in user's token; the same sync also
// runs automatically on every sign-in from the Intranet (gw-login).
import { createClient } from 'npm:@supabase/supabase-js@2'
import { syncMasterData } from '../_shared/intranet.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-application-name, x-region, x-supabase-api-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json' } })
const env = (k: string) => (Deno.env.get(k) ?? '').trim()

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  const auth = req.headers.get('authorization') ?? ''
  if (!auth.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401)
  const apiKey = env('GW_API_KEY')
  if (!apiKey) return json({ error: 'not_configured', detail: 'Set the GW_API_KEY secret.' }, 500)

  const url = env('SUPABASE_URL')
  const asUser = createClient(url, env('SUPABASE_ANON_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: auth } },
  })
  const { data: isSuper, error: superError } = await asUser.rpc('is_machinery_super_admin')
  if (superError) return json({ error: 'unauthorized', detail: superError.message }, 401)
  if (isSuper !== true) return json({ error: 'forbidden', detail: 'Super admins only.' }, 403)

  const db = createClient(url, env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } })
  try {
    return json({ ok: true, ...(await syncMasterData(db, apiKey)) })
  } catch (e) {
    return json({ error: 'sync_failed', detail: String((e as Error)?.message ?? e) }, 502)
  }
})
