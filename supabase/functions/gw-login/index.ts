// Supabase Edge Function: sign a person into the portal with an MJM Intranet
// token — the portal has no login page of its own.
//
// Called by the portal with { token } (the gw_token from the URL). Secrets:
//   GW_API_KEY            API key of this portal's Icon in MJM Intranet
//                         (Master Manage → Module → "2 · Token" → Generate API key)
//   GW_CHECK_ACCESS_URL   optional; default is the MJM Intranet project's
//                         gw-check-access function.
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { CORS, handle, type GatewayUser } from './handler.ts'

const env = (k: string) => (Deno.env.get(k) ?? '').trim()
const DEFAULT_CHECK_URL = 'https://briqzyxfxsvulyizzbiu.supabase.co/functions/v1/gw-check-access'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const apiKey = env('GW_API_KEY')
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'not_configured', detail: 'Set the GW_API_KEY secret (Supabase → Edge Functions → Secrets).' }), {
      status: 500,
      headers: { ...CORS, 'content-type': 'application/json' },
    })
  }
  const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  return handle(req, {
    async checkAccess(token) {
      const res = await fetch(env('GW_CHECK_ACCESS_URL') || DEFAULT_CHECK_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-gw-api-key': apiKey },
        body: JSON.stringify({ token }),
      })
      const body = (await res.json().catch(() => ({}))) as { allowed?: boolean; user?: GatewayUser | null; error?: string }
      return { allowed: body.allowed === true, user: body.user ?? null, error: body.error }
    },

    async issueSession(email, fullName) {
      // Create the login if it is new (no e-mail is sent); ignore "already registered".
      const created = await db.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { full_name: fullName, source: 'mjm-connect' },
      })
      if (created.error && !/already|exists|registered/i.test(created.error.message)) throw created.error
      // One-time magic-link token hash; the browser turns it into a session with verifyOtp.
      const { data, error } = await db.auth.admin.generateLink({ type: 'magiclink', email })
      if (error) throw error
      const tokenHash = data?.properties?.hashed_token
      const userId = data?.user?.id
      if (!tokenHash || !userId) throw new Error('no magic link token')
      return { userId, tokenHash }
    },

    async enrol(userId, email, fullName) {
      // full_name exists after the businesses migration; fall back without it.
      let { error } = await db
        .from('machinery_portal_admins')
        .upsert({ user_id: userId, email, full_name: fullName }, { onConflict: 'user_id' })
      if (error && /full_name/.test(error.message)) {
        ;({ error } = await db.from('machinery_portal_admins').upsert({ user_id: userId, email }, { onConflict: 'user_id' }))
      }
      if (error) throw new Error(`enrol: ${error.message}`)
    },
  })
})
