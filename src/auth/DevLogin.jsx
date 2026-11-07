import { useState } from 'react'
import { useAuth } from './AuthContext.jsx'
import { supabaseEnabled } from '../lib/supabase.js'
import { Button, Card, Field, TextInput } from '../components/ui.jsx'

// DEVELOPMENT ONLY (`npm run dev`). The real portal has no login page: people
// sign in at MJM Intranet and open the portal from there. This form lets a
// developer sign in with a Supabase e-mail/password on localhost; it is not
// part of the production build (see App.jsx).
export default function DevLogin() {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      await login(email, password)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-full px-5 pt-safe">
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-app flex-col justify-center py-10">
        <div className="mb-8 text-center">
          <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="" className="mx-auto h-16 w-16 rounded-2xl" />
          <h1 className="mt-3 text-xl font-bold text-slate-800">MJM Portal</h1>
          <p className="text-sm text-slate-500">Development sign-in (not in production)</p>
        </div>
        <Card className="p-4">
          <form onSubmit={submit} className="space-y-4">
            <p className="text-sm font-semibold text-slate-700">Developer sign in</p>
            <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
              In production people arrive from MJM Intranet with a token; there is no login page.
            </p>
            {!supabaseEnabled && (
              <p className="rounded-xl bg-amber-100 p-3 text-sm text-amber-700">
                Supabase URL/key missing in this build. Copy .env.example to .env.
              </p>
            )}
            <Field label="Email">
              <TextInput
                type="email"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@example.com"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
            </Field>
            <Field label="Password" error={error}>
              <TextInput type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            <Button full type="submit" disabled={busy || !email.trim() || !password}>
              {busy ? 'Checking…' : 'Sign in'}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  )
}
