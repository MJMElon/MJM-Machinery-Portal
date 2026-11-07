import { useCallback, useEffect, useState } from 'react'
import PageHeader from '../../components/PageHeader.jsx'
import { Badge, Button, Card, EmptyState, Field, Spinner, TextArea, TextInput } from '../../components/ui.jsx'
import { IconBuilding, IconPencil, IconPlus, IconTrash } from '../../components/icons.jsx'
import {
  createBusiness,
  createCompany,
  deleteBusiness,
  deleteCompany,
  groupByBusiness,
  isValidCode,
  listBusinesses,
  listCompanies,
  normalizeCode,
  parseNumbers,
  setCompanyBusinesses,
  updateBusiness,
  updateCompany
} from '../../lib/companies.js'
import { useAuth } from '../../auth/AuthContext.jsx'
import { useCompany } from '../../lib/CompanyContext.jsx'

// Super admin: businesses and companies (same master data as MJM Intranet:
// Business → Company, with the company code / short name / registration no.),
// module access per company (CMMS 2, Diesel Manage) and the WhatsApp numbers
// whose messages belong to each company.
export default function ManageCompanies() {
  const { isSuperAdmin } = useAuth()
  const { reload: reloadSwitcher } = useCompany()
  const [companies, setCompanies] = useState([])
  const [businesses, setBusinesses] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setError('')
    try {
      const [cos, biz] = await Promise.all([listCompanies(), listBusinesses()])
      setCompanies(cos)
      setBusinesses(biz)
      reloadSwitcher()
    } catch (e) {
      setError(e.message || 'Could not load companies.')
    } finally {
      setLoading(false)
    }
  }, [reloadSwitcher])

  useEffect(() => {
    load()
  }, [load])

  if (!isSuperAdmin) {
    return (
      <div>
        <PageHeader backTo="/" backLabel="Back to main page" />
        <EmptyState
          title="Super admins only"
          subtitle="Ask a super admin to add companies or change their access. (If you set up this portal, run the latest SQL migration in Supabase.)"
        />
      </div>
    )
  }

  // Each company card once: under its first business (other businesses show as tags).
  const seen = new Set()
  const groups = groupByBusiness(businesses, companies)
    .map((g) => ({ ...g, companies: g.companies.filter((c) => !seen.has(c.id) && seen.add(c.id)) }))
    .filter((g) => g.companies.length)

  return (
    <div className="space-y-5">
      <PageHeader
        backTo="/"
        backLabel="Back to main page"
        title="Businesses & Companies"
        subtitle="Same structure as MJM Intranet: each business has its companies. Turn on module access and link WhatsApp numbers per company."
      />

      {error && <p className="rounded-xl bg-red-100 p-3 text-sm text-red-700">{error}</p>}

      <div className="grid gap-5 lg:grid-cols-[340px_minmax(0,1fr)]">
        <div className="space-y-5">
          <BusinessesCard businesses={businesses} onChanged={load} onError={setError} />
          <AddCompanyCard businesses={businesses} onAdded={load} onError={setError} />
        </div>

        <div className="space-y-6">
          {loading ? (
            <div className="flex justify-center py-12 text-brand">
              <Spinner className="h-7 w-7" />
            </div>
          ) : companies.length === 0 ? (
            <EmptyState
              title="No companies yet"
              subtitle="Add a business (left), then the companies under it, with the same names and codes as in MJM Intranet."
            />
          ) : (
            groups.map((g) => (
              <section key={g.id}>
                <h3 className="mb-3 flex items-center gap-2 font-display text-sm font-bold uppercase tracking-[0.18em] text-slate-500">
                  {g.name}
                  <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-semibold tracking-normal text-slate-600">
                    {g.companies.length}
                  </span>
                </h3>
                <div className="grid gap-4 xl:grid-cols-2">
                  {g.companies.map((c) => (
                    <CompanyCard key={c.id} company={c} businesses={businesses} onChanged={load} />
                  ))}
                </div>
              </section>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

// ---- businesses ----------------------------------------------------------------

function BusinessesCard({ businesses, onChanged, onError }) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(null) // { id, name, description }

  async function run(fn) {
    setBusy(true)
    onError('')
    try {
      await fn()
      await onChanged()
      return true
    } catch (e) {
      onError(e.message || 'Could not save.')
      return false
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-slate-200 px-5 py-4">
        <p className="font-semibold text-slate-800">Businesses</p>
        <p className="text-sm text-slate-500">As in MJM Intranet → Master Manage → Business.</p>
      </div>
      <form
        onSubmit={async (e) => {
          e.preventDefault()
          if (name.trim() && (await run(() => createBusiness({ name })))) setName('')
        }}
        className="flex items-end gap-2 bg-brand-light/30 px-5 py-4"
      >
        <div className="flex-1">
          <Field label="New business">
            <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Plantation" />
          </Field>
        </div>
        <Button type="submit" disabled={busy || !name.trim()} aria-label="Add business" className="w-12 px-0">
          <IconPlus width={18} height={18} />
        </Button>
      </form>
      {businesses.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-slate-400">No businesses yet.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {businesses.map((b) =>
            editing?.id === b.id ? (
              <li key={b.id} className="space-y-2 px-5 py-3">
                <TextInput
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  aria-label="Business name"
                />
                <TextInput
                  value={editing.description}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                  placeholder="Description (optional)"
                  aria-label="Business description"
                />
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setEditing(null)}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    disabled={busy || !editing.name.trim()}
                    onClick={async () => {
                      if (
                        await run(() =>
                          updateBusiness(b.id, {
                            name: editing.name.trim(),
                            description: editing.description.trim() || null
                          })
                        )
                      )
                        setEditing(null)
                    }}
                  >
                    Save
                  </Button>
                </div>
              </li>
            ) : (
              <li key={b.id} className="flex items-center gap-2 px-5 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-slate-800">{b.name}</span>
                  {b.description && <span className="block truncate text-xs text-slate-500">{b.description}</span>}
                </span>
                <button
                  onClick={() => setEditing({ id: b.id, name: b.name, description: b.description || '' })}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  aria-label={`Edit ${b.name}`}
                >
                  <IconPencil width={16} height={16} />
                </button>
                <button
                  disabled={busy}
                  onClick={() =>
                    window.confirm(`Delete business "${b.name}"? Its companies stay, but are no longer under it.`) &&
                    run(() => deleteBusiness(b.id))
                  }
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"
                  aria-label={`Delete ${b.name}`}
                >
                  <IconTrash width={16} height={16} />
                </button>
              </li>
            )
          )}
        </ul>
      )}
    </Card>
  )
}

// ---- add company -----------------------------------------------------------------

function AddCompanyCard({ businesses, onAdded, onError }) {
  const [form, setForm] = useState({ name: '', code: '', short_name: '', business_id: '' })
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const code = normalizeCode(form.code)
  const ok = form.name.trim() && isValidCode(code)

  async function add(e) {
    e.preventDefault()
    if (!ok) return
    setBusy(true)
    onError('')
    try {
      await createCompany({
        name: form.name,
        code,
        short_name: form.short_name,
        business_ids: form.business_id ? [form.business_id] : []
      })
      setForm((f) => ({ ...f, name: '', code: '', short_name: '' }))
      await onAdded()
    } catch (err) {
      onError(err.message || 'Could not add company.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="p-4 sm:p-5">
      <p className="font-semibold text-slate-800">New company</p>
      <p className="mb-3 text-sm text-slate-500">Use the same name and code as in MJM Intranet.</p>
      <form onSubmit={add} className="space-y-3">
        <Field label="Company name" required>
          <TextInput value={form.name} onChange={set('name')} placeholder="e.g. MJM Plantation Sdn Bhd" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Code" hint="e.g. MJMP" error={isValidCode(code) ? '' : 'A-Z, 0-9, - or _'}>
            <TextInput value={form.code} onChange={set('code')} placeholder="MJMP" className="uppercase" />
          </Field>
          <Field label="Short name">
            <TextInput value={form.short_name} onChange={set('short_name')} placeholder="MJM Plantation" />
          </Field>
        </div>
        <Field label="Business">
          <select
            value={form.business_id}
            onChange={set('business_id')}
            className="h-12 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-slate-900 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
          >
            <option value="">— none yet —</option>
            {businesses.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </Field>
        <Button type="submit" full disabled={busy || !ok}>
          <IconPlus width={18} height={18} /> {busy ? 'Adding…' : 'Add company'}
        </Button>
      </form>
    </Card>
  )
}

// ---- one company -----------------------------------------------------------------

const MODULES = [
  { key: 'cmms_enabled', label: 'CMMS 2', hint: 'Maintenance cases, machinery profile, suppliers' },
  { key: 'diesel_enabled', label: 'Diesel Manage', hint: 'Vehicles, cash fuel claims, fleet cards, reports' }
]

function CompanyCard({ company, businesses, onChanged }) {
  const [form, setForm] = useState(() => formOf(company))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const initial = formOf(company)
  const dirty = JSON.stringify(normalize(form)) !== JSON.stringify(normalize(initial))
  const code = normalizeCode(form.code)

  async function save(patch, businessIds) {
    setBusy(true)
    setError('')
    setSaved(false)
    try {
      if (patch) await updateCompany(company.id, patch)
      if (businessIds) await setCompanyBusinesses(company.id, businessIds)
      await onChanged()
      setSaved(true)
    } catch (e) {
      setError(e.message || 'Could not save.')
    } finally {
      setBusy(false)
    }
  }

  // Keep the form in step with the row when it is reloaded from the server.
  useEffect(() => {
    setForm(formOf(company))
  }, [company]) // eslint-disable-line react-hooks/exhaustive-deps

  async function remove() {
    if (
      !window.confirm(
        `Delete "${company.name}"? Its CMMS and Diesel data (machines, suppliers, vehicles, claims, cards) will be deleted too and its WhatsApp cases will show as unassigned.`
      )
    )
      return
    setBusy(true)
    try {
      await deleteCompany(company.id)
      await onChanged()
    } catch (e) {
      setError(e.message || 'Could not delete.')
      setBusy(false)
    }
  }

  const inactive = company.is_active === false

  return (
    <Card className={`space-y-4 p-4 sm:p-5 ${inactive ? 'opacity-75' : ''}`}>
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-light text-brand">
          <IconBuilding width={22} height={22} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-semibold text-slate-800">{company.name}</p>
          <p className="truncate text-xs text-slate-500">
            {[company.code, company.short_name, company.registration_no].filter(Boolean).join(' · ') || 'No code yet'}
          </p>
        </div>
        {inactive && <Badge>Inactive</Badge>}
        <button
          onClick={remove}
          disabled={busy}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"
          aria-label={`Delete ${company.name}`}
        >
          <IconTrash width={18} height={18} />
        </button>
      </div>

      {/* Module access */}
      <div className="grid gap-2 sm:grid-cols-2">
        {MODULES.map((m) => (
          <div key={m.key} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3">
            <div className="min-w-0">
              <p className="font-medium text-slate-800">{m.label}</p>
              <p className="truncate text-xs text-slate-500">{m.hint}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Badge color={company[m.key] ? 'green' : 'slate'}>{company[m.key] ? 'On' : 'Off'}</Badge>
              <Toggle
                checked={Boolean(company[m.key])}
                disabled={busy}
                onChange={(v) => save({ [m.key]: v })}
                label={`${m.label} access for ${company.name}`}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Field label="Company name">
            <TextInput value={form.name} onChange={set('name')} />
          </Field>
        </div>
        <Field label="Code" error={isValidCode(code) ? '' : 'A-Z, 0-9, - or _'}>
          <TextInput value={form.code} onChange={set('code')} placeholder="MJMP" className="uppercase" />
        </Field>
        <Field label="Short name">
          <TextInput value={form.short_name} onChange={set('short_name')} placeholder="MJM Plantation" />
        </Field>
        <Field label="Registration no.">
          <TextInput value={form.registration_no} onChange={set('registration_no')} placeholder="202001012345 (1234567-X)" />
        </Field>
        <Field label="Status">
          <select
            value={form.is_active}
            onChange={set('is_active')}
            className="h-12 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-slate-900 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
          >
            <option value="true">Active</option>
            <option value="false">Inactive (hidden from the company switcher)</option>
          </select>
        </Field>
      </div>

      <Field label="Businesses" hint="A company can belong to more than one business, as in MJM Intranet.">
        {businesses.length === 0 ? (
          <p className="text-sm text-slate-400">Add a business first (left).</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {businesses.map((b) => {
              const on = form.business_ids.includes(b.id)
              return (
                <label
                  key={b.id}
                  className={`inline-flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm ${
                    on ? 'border-brand bg-brand-light text-brand-dark' : 'border-slate-200 bg-white text-slate-700'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-[#2563eb]"
                    checked={on}
                    onChange={() =>
                      setForm((f) => ({
                        ...f,
                        business_ids: on ? f.business_ids.filter((x) => x !== b.id) : [...f.business_ids, b.id]
                      }))
                    }
                  />
                  {b.name}
                </label>
              )
            })}
          </div>
        )}
      </Field>

      <Field
        label="WhatsApp numbers"
        hint="Staff numbers that send maintenance messages, one per line, with country code (e.g. 60123456789)."
      >
        <TextArea rows={3} value={form.numbers} onChange={set('numbers')} placeholder="60123456789" />
      </Field>

      {error && <p className="rounded-lg bg-red-100 p-2.5 text-sm text-red-700">{error}</p>}

      <div className="flex items-center justify-end gap-3">
        {saved && !dirty && <span className="text-sm text-green-700">Saved</span>}
        <Button
          size="sm"
          disabled={busy || !dirty || !form.name.trim() || !isValidCode(code)}
          onClick={() =>
            save(
              {
                name: form.name.trim(),
                code: code || null,
                short_name: form.short_name.trim() || null,
                registration_no: form.registration_no.trim() || null,
                is_active: form.is_active === 'true',
                whatsapp_numbers: parseNumbers(form.numbers)
              },
              sameSet(form.business_ids, company.business_ids || []) ? null : form.business_ids
            )
          }
        >
          {busy ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </Card>
  )
}

function formOf(c) {
  return {
    name: c.name || '',
    code: c.code || '',
    short_name: c.short_name || '',
    registration_no: c.registration_no || '',
    is_active: String(c.is_active !== false),
    business_ids: [...(c.business_ids || [])],
    numbers: (c.whatsapp_numbers || []).join('\n')
  }
}

function normalize(f) {
  return {
    ...f,
    name: f.name.trim(),
    code: normalizeCode(f.code),
    short_name: f.short_name.trim(),
    registration_no: f.registration_no.trim(),
    business_ids: [...f.business_ids].sort(),
    numbers: parseNumbers(f.numbers).join(',')
  }
}

const sameSet = (a, b) => a.length === b.length && [...a].sort().join() === [...b].sort().join()

function Toggle({ checked, onChange, disabled, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-50 ${checked ? 'bg-brand' : 'bg-slate-300'}`}
    >
      <span
        className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${checked ? 'left-[22px]' : 'left-0.5'}`}
      />
    </button>
  )
}
