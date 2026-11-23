import { useEffect, useState } from 'react'
import { cardPassword } from '../../lib/diesel.js'

// A fleet card's web login password: always shown as dots. Only the
// Procurement role gets the eye button; the database checks the role again
// before it gives the password (nobody else can read it, even directly).
export function PasswordField({ cardId, has, canSee }) {
  const [shown, setShown] = useState(null) // the password while shown
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // hide again when leaving the card, and after 30 seconds
  useEffect(() => setShown(null), [cardId])
  useEffect(() => {
    if (shown == null) return
    const t = setTimeout(() => setShown(null), 30000)
    return () => clearTimeout(t)
  }, [shown])

  if (!has) return <span className="text-slate-400">—</span>

  async function toggle() {
    if (shown != null) return setShown(null)
    setBusy(true)
    setError('')
    try {
      setShown(await cardPassword(cardId))
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span className={shown != null ? 'select-all font-mono' : 'tracking-widest text-slate-500'}>{shown != null ? shown || '—' : '••••••••'}</span>
      {canSee ? (
        <button
          type="button"
          onClick={toggle}
          disabled={busy}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50"
          aria-label={shown != null ? 'Hide password' : 'Show password'}
          title={shown != null ? 'Hide password' : 'Show password (Procurement)'}
        >
          {shown != null ? <EyeOff /> : <Eye />}
        </button>
      ) : (
        <span className="text-[11px] text-slate-400">Procurement only</span>
      )}
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  )
}

const Eye = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
)
const EyeOff = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 19c-6.5 0-10-7-10-7a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c6.5 0 10 7 10 7a18.5 18.5 0 0 1-2.16 3.19M14.12 14.12a3 3 0 1 1-4.24-4.24" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
)
