import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { supabase, supabaseEnabled, ADMIN_TABLE } from '../lib/supabase.js'

// Portal sign-in = the same Supabase Auth email/password account as MachTrek's
// HQ admin. Being signed in is not enough: the account must also be listed in
// `machinery_portal_admins` (the same check the database enforces with RLS).
const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [access, setAccess] = useState('unknown') // unknown | granted | denied | error
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!supabaseEnabled) {
      setReady(true)
      return
    }
    let active = true
    supabase.auth
      .getSession()
      .then(({ data }) => active && setSession(data?.session || null))
      .finally(() => active && setReady(true))
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
      .select('*') // '*' so this still works before the super-admin column exists
      .eq('user_id', uid)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active) return
        setIsSuperAdmin(Boolean(data?.is_super_admin))
        if (error) setAccess('error')
        else setAccess(data ? 'granted' : 'denied')
      })
    return () => {
      active = false
    }
  }, [uid])

  const login = useCallback(async (email, password) => {
    if (!supabaseEnabled) throw new Error('Supabase is not configured for this build.')
    const { error } = await supabase.auth.signInWithPassword({
      email: (email || '').trim().toLowerCase(),
      password
    })
    if (error) throw new Error(/invalid/i.test(error.message || '') ? 'Wrong email or password.' : error.message)
  }, [])

  const logout = useCallback(async () => {
    await supabase?.auth.signOut()
  }, [])

  const user = session?.user ? { id: session.user.id, email: session.user.email || '' } : null

  return (
    <AuthContext.Provider value={{ ready, user, access, isSuperAdmin, login, logout }}>{children}</AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
