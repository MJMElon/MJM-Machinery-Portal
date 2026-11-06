// Core logic for the gw-login Edge Function: turn a 60-second MJM Connect
// (Intranet) token into a portal session.
//
// Flow: the Intranet opens the portal as  <portal url>?gw_token=<JWT>.
// The browser posts that token here; we redeem it at the Intranet's
// gw-check-access (server to server, with this module's API key), make sure
// the person has a login + a portal user row in THIS project, and hand back a
// one-time magic-link token hash that the browser exchanges for a session.
// No Supabase/Deno globals here: everything is injected so it can be tested.

export interface GatewayUser {
  id: string
  email: string
  full_name: string | null
}

export interface Deps {
  /** Redeem the token at MJM Connect. Returns the user when allowed, null otherwise. */
  checkAccess(token: string): Promise<{ allowed: boolean; user?: GatewayUser | null; error?: string }>
  /** Make sure a login exists for this e-mail (no e-mail is sent) and return a one-time token hash. */
  issueSession(email: string, fullName: string | null): Promise<{ userId: string; tokenHash: string }>
  /** Keep the portal user list in step with MJM Connect (adds the row, updates name/e-mail). */
  enrol(userId: string, email: string, fullName: string | null): Promise<void>
}

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json' } })

export async function handle(req: Request, deps: Deps): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const body = await req.json().catch(() => ({}))
  const token = typeof body?.token === 'string' ? body.token.trim() : ''
  if (!token) return json({ error: 'token_required' }, 400)

  let check
  try {
    check = await deps.checkAccess(token)
  } catch (e) {
    return json({ error: 'gateway_unreachable', detail: String((e as Error)?.message ?? e) }, 502)
  }
  if (!check.allowed || !check.user?.email) {
    // invalid_token / token_already_used / no access any more
    return json({ error: check.error || 'not_allowed' }, 403)
  }

  const email = check.user.email.trim().toLowerCase()
  const fullName = check.user.full_name?.trim() || null
  try {
    const { userId, tokenHash } = await deps.issueSession(email, fullName)
    await deps.enrol(userId, email, fullName)
    return json({ token_hash: tokenHash, email, full_name: fullName })
  } catch (e) {
    return json({ error: 'session_failed', detail: String((e as Error)?.message ?? e) }, 500)
  }
}
