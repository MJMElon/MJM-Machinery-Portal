import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { supabase, supabaseEnabled, ADMIN_TABLE, INTRANET_URL } from '../lib/supabase.js'

// The portal has no login page: people sign in at MJM Intranet
// and open the portal from there. MJM Intranet appends a 60-second token
// (?gw_token=…) to the portal URL; the gw-login Edge Function redeems it at
// MJM Intranet, makes sure the person has a login + portal user row in this
// project, and the browser turns the answer into a normal Supabase session.
// Anyone who arrives without a token or a session is sent to MJM Intranet.
const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [access, setAccess] = useState('unknown') // unknown | granted | denied | error
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [fullName, setFullName] = useState('')
  const [ready, setReady] = useState(false)
  // Token hand-off from MJM Intranet: none | pending | failed
  const [handoff, setHandoff] = useState(() => (peekGwToken() ? 'pending' : 'none'))
  const [handoffError, setHandoffError] = useState('')

  useEffect(() => {
    if (!supabaseEnabled) {
      setReady(true)
      return
    }
    let active = true
    ;(async () => {
      // The token is single-use, so the hand-off runs once per page load and
      // its result is shared (React StrictMode mounts effects twice in dev).
      const result = await handoffOnce()
      if (active && result) {
        if (result.ok) setHandoff('none')
        else {
          setHandoffError(result.error)
          setHandoff('failed')
        }
      }
      const { data } = await supabase.auth.getSession()
      if (active) {
        setSession(data?.session || null)
        setReady(true)
      }
    })()
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s || null))
    return () => {
      active = false
      sub?.subscription?.unsubscribe?.()
    }
  }, [])

  const uid = session?.user?.id
  useEffect(() => {
    if (!uid) {
      setAccess('unknown')
      return
    }
    let active = true
    setAccess('unknown')
    supabase
      .from(ADMIN_TABLE)
      .select('*') // '*' so this still works before newer columns exist
      .eq('user_id', uid)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active) return
        setIsSuperAdmin(Boolean(data?.is_super_admin))
        setFullName(data?.full_name || '')
        if (error) setAccess('error')
        else setAccess(data ? 'granted' : 'denied')
      })
    return () => {
      active = false
    }
  }, [uid])

  // Development only (`npm run dev`): sign in with a Supabase e-mail/password
  // so the portal can be worked on without going through MJM Intranet.
  const login = useCallback(async (email, password) => {
    if (!supabaseEnabled) throw new Error('Supabase is not configured for this build.')
    const { error } = await supabase.auth.signInWithPassword({
      email: (email || '').trim().toLowerCase(),
      password
    })
    if (error) throw new Error(/invalid/i.test(error.message || '') ? 'Wrong email or password.' : error.message)
  }, [])

  // Log out of the portal and go back to MJM Intranet.
  const logout = useCallback(async () => {
    await supabase?.auth.signOut()
    window.location.replace(INTRANET_URL)
  }, [])

  const user = session?.user ? { id: session.user.id, email: session.user.email || '', fullName } : null

  return (
    <AuthContext.Provider value={{ ready, user, access, isSuperAdmin, handoff, handoffError, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)

// ---- MJM Intranet token hand-off --------------------------------------------------

// MJM Intranet redirects to  <portal url>?gw_token=<jwt>  (before the #/ route).
// Accept it from the query string or, just in case, from the hash part.
function gwTokenLocation() {
  const search = new URLSearchParams(window.location.search)
  if (search.get('gw_token')) return { where: 'search', token: search.get('gw_token') }
  const hash = window.location.hash
  const i = hash.indexOf('?')
  if (i >= 0) {
    const params = new URLSearchParams(hash.slice(i + 1))
    if (params.get('gw_token')) return { where: 'hash', token: params.get('gw_token') }
  }
  return null
}

function peekGwToken() {
  return gwTokenLocation()?.token || null
}

/** Reads the token and removes it from the address bar (it is single-use). */
function takeGwToken() {
  const found = gwTokenLocation()
  if (!found) return null
  try {
    const url = new URL(window.location.href)
    if (found.where === 'search') {
      url.searchParams.delete('gw_token')
    } else {
      const i = url.hash.indexOf('?')
      const params = new URLSearchParams(url.hash.slice(i + 1))
      params.delete('gw_token')
      const rest = params.toString()
      url.hash = url.hash.slice(0, i) + (rest ? '?' + rest : '')
    }
    window.history.replaceState(null, '', url.toString())
  } catch {
    // keep going; the token is still redeemed below
  }
  return found.token
}

let handoffPromise = null
/** Redeems the gw_token (if any) once; resolves to null, { ok: true } or { ok: false, error }. */
function handoffOnce() {
  if (!handoffPromise) {
    const token = takeGwToken()
    handoffPromise = !token
      ? Promise.resolve(null)
      : signInWithGatewayToken(token)
          .then(() => ({ ok: true }))
          .catch((e) => ({ ok: false, error: e.message || 'Could not sign in from MJM Intranet.' }))
  }
  return handoffPromise
}

async function signInWithGatewayToken(token) {
  const { data, error } = await supabase.functions.invoke('gw-login', { body: { token } })
  if (error) throw new Error(await describeFunctionError(error))
  if (!data?.token_hash) throw new Error('MJM Intranet did not return a sign-in token.')
  const { error: verifyError } = await supabase.auth.verifyOtp({ token_hash: data.token_hash, type: 'magiclink' })
  if (verifyError) throw new Error(verifyError.message)
}

const REASONS = {
  invalid_token: 'The link from MJM Intranet has expired (it lasts 60 seconds). Open the portal again from MJM Intranet.',
  token_already_used: 'This link from MJM Intranet was already used. Open the portal again from MJM Intranet.',
  not_allowed: 'Your MJM Intranet account no longer has access to this portal.',
  not_configured: 'The portal is not linked to MJM Intranet yet (GW_API_KEY secret missing).',
  gateway_unreachable: 'Could not reach MJM Intranet to check the link. Please try again.'
}

async function describeFunctionError(error) {
  let body = null
  try {
    body = await error.context?.json?.()
  } catch {
    // not JSON
  }
  if (body?.error) return REASONS[body.error] || `${body.error}${body.detail ? `: ${body.detail}` : ''}`
  if (/Failed to send a request|FunctionsFetchError|Function not found|404/i.test(error.message || '')) {
    return 'The gw-login function is not deployed yet (GitHub → Actions → Deploy WhatsApp webhook).'
  }
  return error.message || 'Could not sign in from MJM Intranet.'
}
