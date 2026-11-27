// Supabase Edge Function: sign a person into the portal with an MJM Intranet
// token — the portal has no login page of its own.
//
// Called by the portal with { token } (the gw_token from the URL). Secrets:
//   GW_API_KEY            API key of the portal's main Icon in MJM Intranet
//                         (code MACHINERY-PORTAL). Used for any Icon that has
//                         no key of its own below.
//   GW_API_KEY_<CODE>     Key of another Intranet Icon that opens this portal,
//                         e.g. GW_API_KEY_DIESEL for the "Diesel Manage" Icon
//                         (code DIESEL). "-" in the code becomes "_".
//   GW_CHECK_ACCESS_URL   optional; default is the MJM Intranet project's
//                         gw-check-access function.
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { CORS, handle, type GatewayUser } from './handler.ts'
import { syncMasterData } from '../_shared/intranet.ts'

const env = (k: string) => (Deno.env.get(k) ?? '').trim()
declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined
// Master data sync runs after the sign-in reply, so opening the portal does not wait for it.
// One sync per minute per warm instance is plenty (sync-intranet does a full one on demand).
const SYNC_EVERY_MS = 60_000
let lastSync = 0
const DEFAULT_CHECK_URL = 'https://briqzyxfxsvulyizzbiu.supabase.co/functions/v1/gw-check-access'

/** The Icon code inside the (unverified) token; MJM Intranet verifies it properly. */
function moduleCodeOf(token: string): string | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    return typeof payload?.mod === 'string' ? payload.mod : typeof payload?.aud === 'string' ? payload.aud : null
  } catch {
    return null
  }
}

/** Keys to try for a token: the Icon's own key first, then the general one. */
function keysFor(code: string | null): string[] {
  const keys: string[] = []
  if (code) {
    const own = env('GW_API_KEY_' + code.toUpperCase().replace(/[^A-Z0-9]/g, '_'))
    if (own) keys.push(own)
  }
  const general = env('GW_API_KEY')
  if (general && !keys.includes(general)) keys.push(general)
  return keys
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (!env('GW_API_KEY')) {
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
      const url = env('GW_CHECK_ACCESS_URL') || DEFAULT_CHECK_URL
      let last: { allowed: boolean; user?: GatewayUser | null; error?: string } = { allowed: false, error: 'not_allowed' }
      for (const apiKey of keysFor(moduleCodeOf(token))) {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-gw-api-key': apiKey },
          body: JSON.stringify({ token }),
        })
        const body = (await res.json().catch(() => ({}))) as { allowed?: boolean; user?: GatewayUser | null; error?: string }
        last = { allowed: body.allowed === true, user: body.user ?? null, error: body.error }
        // A key for another Icon fails the audience check as invalid_token; try the next one.
        if (last.allowed || (last.error !== 'invalid_token' && last.error !== 'invalid_api_key')) break
      }
      return last
    },

    async issueSession(email, fullName) {
      // One-time magic-link token hash; the browser turns it into a session with verifyOtp.
      // Most visits: the login already exists, one call. First visit: create it (no e-mail sent).
      let { data, error } = await db.auth.admin.generateLink({ type: 'magiclink', email })
      if (error && /not found|does not exist|no user/i.test(error.message)) {
        const created = await db.auth.admin.createUser({
          email,
          email_confirm: true,
          user_metadata: { full_name: fullName, source: 'mjm-intranet' },
        })
        if (created.error && !/already|exists|registered/i.test(created.error.message)) throw created.error
        ;({ data, error } = await db.auth.admin.generateLink({ type: 'magiclink', email }))
      }
      if (error) throw error
      const tokenHash = data?.properties?.hashed_token
      const userId = data?.user?.id
      if (!tokenHash || !userId) throw new Error('no magic link token')
      return { userId, tokenHash }
    },

    async checkLink(email, intranetId) {
      const { data, error } = await db.rpc('machinery_check_intranet_login', { p_email: email, p_intranet_id: intranetId })
      // No check = no sign-in (it needs migration 20261213); never let someone in unchecked.
      if (error) throw error
      return data === 'mismatch' || data === 'moved' ? data : 'ok'
    },

    // MJM Intranet Super Admin = super admin in this portal (migration 20261214100000).
    // Only a super admin right that came from the Intranet is ever taken back.
    async setIntranetSuper(userId, isSuper) {
      const { data: row, error } = await db.from('machinery_portal_admins').select('is_super_admin, intranet_super').eq('user_id', userId).maybeSingle()
      if (error || !row) {
        if (error) console.error('intranet super admin: run migration 20261214100000', error.message)
        return
      }
      if (isSuper && !row.is_super_admin) {
        await db.from('machinery_portal_admins').update({ is_super_admin: true, intranet_super: true }).eq('user_id', userId)
      } else if (!isSuper && row.intranet_super) {
        await db.from('machinery_portal_admins').update({ is_super_admin: false, intranet_super: false }).eq('user_id', userId)
      }
    },

    async enrol(userId, email, fullName, intranetId) {
      // full_name exists after the businesses migration; fall back without it.
      let { error } = await db
        .from('machinery_portal_admins')
        .upsert({ user_id: userId, email, full_name: fullName }, { onConflict: 'user_id' })
      // Tie the login to the Intranet account the first time (migration 20261213)
      if (!error)
        await db.from('machinery_portal_admins').update({ intranet_user_id: intranetId }).eq('user_id', userId).is('intranet_user_id', null)
      if (error && /full_name/.test(error.message)) {
        ;({ error } = await db.from('machinery_portal_admins').upsert({ user_id: userId, email }, { onConflict: 'user_id' }))
      }
      if (error) throw new Error(`enrol: ${error.message}`)
      // Keep businesses / companies in step with the Intranet. Best effort and in the
      // background: a slow or failing sync must never hold up the sign-in.
      if (Date.now() - lastSync > SYNC_EVERY_MS) {
        lastSync = Date.now()
        const job = syncMasterData(db, env('GW_API_KEY')).catch((e) => {
          lastSync = 0
          console.error('intranet master data sync failed', e)
        })
        if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(job)
      }
    },
  })
})
