import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import PageHeader from '../../components/PageHeader.jsx'
import { Badge, Button, Card, Spinner } from '../../components/ui.jsx'
import { listPortalUsers, userLabel } from '../../lib/cmms.js'
import { ACTION_LABELS, MODULES, getUserPerms, savePerms } from '../../lib/perms.js'
import { useAuth } from '../../auth/AuthContext.jsx'
import { useCompany } from '../../lib/CompanyContext.jsx'

// One user's access to the selected company. Big title per module, then each
// section with its actions (view / add / edit / delete) and, where a section
// has important actions, those as well (solve, send to supplier, approve, pay…).
// "View only" ticks just View; "All" ticks everything in a section.
export default function UserAccessEdit() {
  const { userId } = useParams()
  const { current } = useCompany()
  const { user: me, isSuperAdmin } = useAuth()
  const navigate = useNavigate()
  const [person, setPerson] = useState(null)
  const [perms, setPerms] = useState(null)
  const [saved, setSaved] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const readOnly = !isSuperAdmin || person?.is_super_admin

  const load = useCallback(async () => {
    if (!current) return
    try {
      const [users, p] = await Promise.all([isSuperAdmin ? listPortalUsers() : [], getUserPerms(current.id, userId)])
      const u = users.find((x) => x.user_id === userId) || (userId === me.id ? { user_id: me.id, email: me.email, full_name: me.fullName } : null)
      if (!u) throw new Error('User not found.')
      setPerson(u)
      setPerms(p)
      setSaved(JSON.stringify(p))
      setError('')
    } catch (e) {
      setError(e.message)
    }
  }, [current, userId, isSuperAdmin, me])

  useEffect(() => {
    load()
  }, [load])

  const has = (s, a) => Array.isArray(perms?.[s]) && perms[s].includes(a)
  const setAction = (s, a, on) =>
    setPerms((p) => {
      const list = new Set(p?.[s] || [])
      if (on) {
        list.add(a)
        if (a !== 'view') list.add('view') // anything in a section implies seeing it
      } else {
        list.delete(a)
        if (a === 'view') list.clear() // no view = nothing in this section
      }
      return { ...p, [s]: [...list] }
    })
  const setSection = (section, on) =>
    setPerms((p) => ({ ...p, [section.key]: on ? [...section.actions, ...section.special] : [] }))
  const viewOnly = (section) => setPerms((p) => ({ ...p, [section.key]: ['view'] }))

  const dirty = perms && JSON.stringify(perms) !== saved

  async function save() {
    setBusy(true)
    setError('')
    try {
      await savePerms(current.id, userId, perms)
      setSaved(JSON.stringify(perms))
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  if (!current || !perms)
    return (
      <div className="flex justify-center py-12 text-brand">
        <Spinner className="h-7 w-7" />
      </div>
    )

  return (
    <div className="space-y-5">
      <PageHeader
        backTo="/cmms/users"
        backLabel="Back to user list"
        title={person ? userLabel(person) : 'User access'}
        subtitle={`${person?.email || ''} · access in ${current.name}${readOnly ? ' · view only' : ''}`}
        right={
          !readOnly && (
            <div className="flex items-center gap-3">
              {!dirty && saved && <span className="text-sm text-green-700">Saved</span>}
              <Button variant="secondary" onClick={() => navigate('/cmms/users')}>
                Cancel
              </Button>
              <Button disabled={busy || !dirty} onClick={save}>
                {busy ? 'Saving…' : 'Save access'}
              </Button>
            </div>
          )
        }
      />
      {error && <p className="rounded-xl bg-red-100 p-3 text-sm text-red-700">{error}</p>}
      {person?.is_super_admin && (
        <p className="rounded-xl bg-brand-light/60 p-3 text-sm text-brand-dark">Super admins have every right in every company.</p>
      )}

      {MODULES.map((m) => (
        <section key={m.key} className="space-y-3">
          <h3 className="font-display text-xl font-extrabold tracking-tight text-slate-900">{m.label}</h3>
          <div className="grid gap-3 lg:grid-cols-2">
            {m.sections.map((s) => {
              const on = (perms[s.key] || []).length > 0
              const all = [...s.actions, ...s.special].every((a) => has(s.key, a))
              return (
                <Card key={s.key} className={`p-4 ${on ? '' : 'opacity-80'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-800">{s.label}</p>
                      {s.hint && <p className="text-xs text-slate-500">{s.hint}</p>}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {person?.is_super_admin ? (
                        <Badge color="blue">All</Badge>
                      ) : (
                        <>
                          <Badge color={on ? (all ? 'green' : 'amber') : 'slate'}>{on ? (all ? 'All' : has(s.key, 'view') && (perms[s.key] || []).length === 1 ? 'View only' : 'Partial') : 'No access'}</Badge>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
                    {s.actions.map((a) => (
                      <Tick key={a} label={ACTION_LABELS[a]} checked={person?.is_super_admin || has(s.key, a)} disabled={readOnly} onChange={(v) => setAction(s.key, a, v)} />
                    ))}
                  </div>
                  {s.special.length > 0 && (
                    <div className="mt-3 rounded-xl bg-slate-50 p-3">
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Important actions</p>
                      <div className="flex flex-wrap gap-x-5 gap-y-2">
                        {s.special.map((a) => (
                          <Tick key={a} label={ACTION_LABELS[a]} checked={person?.is_super_admin || has(s.key, a)} disabled={readOnly} onChange={(v) => setAction(s.key, a, v)} accent />
                        ))}
                      </div>
                    </div>
                  )}
                  {!readOnly && (
                    <div className="mt-3 flex gap-2">
                      <button onClick={() => viewOnly(s)} className="text-xs font-medium text-brand hover:underline">
                        View only
                      </button>
                      <button onClick={() => setSection(s, true)} className="text-xs font-medium text-brand hover:underline">
                        All
                      </button>
                      <button onClick={() => setSection(s, false)} className="text-xs font-medium text-slate-500 hover:underline">
                        None
                      </button>
                    </div>
                  )}
                </Card>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}

function Tick({ label, checked, disabled, onChange, accent }) {
  return (
    <label className={`inline-flex items-center gap-2 text-sm ${disabled ? 'text-slate-500' : 'cursor-pointer text-slate-700'}`}>
      <input
        type="checkbox"
        className={`h-5 w-5 ${accent ? 'accent-[#d97706]' : 'accent-[#2563eb]'} disabled:cursor-not-allowed`}
        checked={Boolean(checked)}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  )
}
