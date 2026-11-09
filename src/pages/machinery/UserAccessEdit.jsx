import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import PageHeader from '../../components/PageHeader.jsx'
import { Badge, Button, Card, Spinner } from '../../components/ui.jsx'
import { listPortalPeople, userLabel } from '../../lib/cmms.js'
import { ROLE_MODEL, approveFor, getUserPerms, savePerms } from '../../lib/perms.js'
import { useAuth } from '../../auth/AuthContext.jsx'
import { useCompany } from '../../lib/CompanyContext.jsx'

// Role setup for one user in the selected company:
//   module (Machinery Manage / Fuel Manage) → its pages → what the person may
//   do on each page. Fuel Claims has the special options: own claims, all
//   claims in the company, approve claims (with the names of the people whose
//   claims this user approves) and payment.
export default function UserAccessEdit() {
  const { userId } = useParams()
  const { current } = useCompany()
  const { user: me, isSuperAdmin } = useAuth()
  const navigate = useNavigate()
  const [people, setPeople] = useState([])
  const [perms, setPerms] = useState(null)
  const [saved, setSaved] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const person = people.find((p) => p.user_id === userId) || (userId === me.id ? { user_id: me.id, email: me.email, full_name: me.fullName } : null)
  const readOnly = !isSuperAdmin || person?.is_super_admin

  const load = useCallback(async () => {
    if (!current) return
    try {
      const [ppl, p] = await Promise.all([listPortalPeople(), getUserPerms(current.id, userId)])
      setPeople(ppl)
      setPerms(p)
      setSaved(JSON.stringify(p))
      setError('')
    } catch (e) {
      setError(e.message)
    }
  }, [current, userId])

  useEffect(() => {
    load()
  }, [load])

  const acts = (section) => (Array.isArray(perms?.[section]) ? perms[section] : [])
  const optOn = (section, opt) => opt.actions.every((a) => acts(section).includes(a))
  const setOpt = (section, opt, on) =>
    setPerms((p) => {
      const list = new Set(acts(section))
      opt.actions.forEach((a) => (on ? list.add(a) : list.delete(a)))
      // a page is reachable only with "view"; anything ticked implies it
      if (on && section !== 'claims') list.add('view')
      if (!on && opt.key === 'view') list.clear()
      const next = { ...p, [section]: [...list] }
      if (section === 'claims' && !list.has('approve')) delete next.approve_for
      return next
    })
  const setModule = (m, on) =>
    setPerms((p) => {
      const next = { ...p }
      for (const page of m.pages) next[page.section] = on ? [...new Set(page.options.flatMap((o) => o.actions))] : []
      if (!on) delete next.approve_for
      return next
    })
  const moduleOn = (m) => m.sections.some((s) => acts(s).length > 0)
  const toggleApprover = (id) =>
    setPerms((p) => {
      const list = new Set(approveFor(p))
      list.has(id) ? list.delete(id) : list.add(id)
      return { ...p, approve_for: [...list] }
    })

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

  const others = people.filter((p) => p.user_id !== userId)

  return (
    <div className="space-y-5">
      <PageHeader
        backTo="/settings/users"
        backLabel="Back to Role setup"
        title={person ? userLabel(person) : 'Role setup'}
        subtitle={[person?.email, `role in ${current.name}`, readOnly ? 'view only' : null].filter(Boolean).join(' · ')}
        right={
          !readOnly && (
            <div className="flex items-center gap-3">
              {!dirty && saved && <span className="text-sm text-green-700">Saved</span>}
              <Button variant="secondary" onClick={() => navigate('/settings/users')}>
                Cancel
              </Button>
              <Button disabled={busy || !dirty} onClick={save}>
                {busy ? 'Saving…' : 'Save role'}
              </Button>
            </div>
          )
        }
      />
      {error && <p className="rounded-xl bg-red-100 p-3 text-sm text-red-700">{error}</p>}
      {person && (person.intranet_cmms || person.intranet_fuel) && (
        <p className="text-xs text-slate-500">
          Access from MJM Intranet: {[person.intranet_cmms && 'CMMS 2', person.intranet_fuel && 'Fuel Manage'].filter(Boolean).join(', ')}
        </p>
      )}
      {person?.is_super_admin && (
        <p className="rounded-xl bg-brand-light/60 p-3 text-sm text-brand-dark">Super admins have every right in every company.</p>
      )}

      {ROLE_MODEL.map((m) => {
        const on = person?.is_super_admin || moduleOn(m)
        return (
          <section key={m.key} className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <h3 className="font-display text-xl font-extrabold tracking-tight text-slate-900">{m.label}</h3>
              <Badge color={on ? 'green' : 'slate'}>{on ? 'Access' : 'No access'}</Badge>
              {!readOnly && (
                <span className="flex gap-2 text-xs">
                  <button onClick={() => setModule(m, true)} className="font-medium text-brand hover:underline">
                    Full access
                  </button>
                  <button onClick={() => setModule(m, false)} className="font-medium text-slate-500 hover:underline">
                    No access
                  </button>
                </span>
              )}
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              {m.pages.map((page) => {
                const pageOn = person?.is_super_admin || acts(page.section).length > 0
                return (
                  <Card key={page.section} className={`p-4 ${pageOn ? '' : 'opacity-80'}`}>
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold text-slate-800">{page.label}</p>
                      <Badge color={pageOn ? 'green' : 'slate'}>{pageOn ? 'Can see' : 'Hidden'}</Badge>
                    </div>
                    <div className="mt-3 space-y-2">
                      {page.options.map((opt) => {
                        const checked = person?.is_super_admin || optOn(page.section, opt)
                        return (
                          <div key={opt.key}>
                            <label className={`flex items-center gap-2 text-sm ${readOnly ? 'text-slate-500' : 'cursor-pointer text-slate-700'}`}>
                              <input
                                type="checkbox"
                                className="h-5 w-5 accent-[#2563eb] disabled:cursor-not-allowed"
                                checked={checked}
                                disabled={readOnly}
                                onChange={(e) => setOpt(page.section, opt, e.target.checked)}
                              />
                              {opt.label}
                            </label>
                            {opt.approvers && checked && !person?.is_super_admin && (
                              <div className="ml-7 mt-2 rounded-xl bg-slate-50 p-3">
                                <p className="mb-2 text-xs text-slate-600">
                                  Approves the claims of: {approveFor(perms).length === 0 && <span className="font-medium">everyone in {current.name}</span>}
                                </p>
                                <div className="flex flex-wrap gap-1.5">
                                  {others.map((p) => {
                                    const sel = approveFor(perms).includes(p.user_id)
                                    return (
                                      <button
                                        key={p.user_id}
                                        type="button"
                                        disabled={readOnly}
                                        onClick={() => toggleApprover(p.user_id)}
                                        className={`rounded-full border px-2.5 py-1 text-xs ${
                                          sel ? 'border-brand bg-brand-light text-brand-dark' : 'border-slate-200 bg-white text-slate-600 hover:border-brand/50'
                                        }`}
                                      >
                                        {sel ? '✓ ' : ''}
                                        {userLabel(p)}
                                      </button>
                                    )
                                  })}
                                </div>
                                <p className="mt-2 text-[11px] text-slate-500">Tick names to limit this approver to those people; no names = anyone.</p>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </Card>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}
