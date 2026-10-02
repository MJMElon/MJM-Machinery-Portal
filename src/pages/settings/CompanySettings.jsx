import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PageHeader from '../../components/PageHeader.jsx'
import { Badge, Button, Card, EmptyState, Field, Spinner, TextArea, TextInput } from '../../components/ui.jsx'
import { IconBuilding, IconPlus, IconTrash } from '../../components/icons.jsx'
import { createCompany, deleteCompany, listCompanies, parseNumbers, updateCompany } from '../../lib/companies.js'

// Create companies, give them CMMS 2 access, and list the WhatsApp numbers
// whose messages belong to each company.
export default function CompanySettings() {
  const navigate = useNavigate()
  const [companies, setCompanies] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [newName, setNewName] = useState('')
  const [adding, setAdding] = useState(false)

  const load = useCallback(async () => {
    setError('')
    try {
      setCompanies(await listCompanies())
    } catch (e) {
      setError(e.message || 'Could not load companies.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function add(e) {
    e.preventDefault()
    if (!newName.trim()) return
    setAdding(true)
    setError('')
    try {
      const c = await createCompany(newName)
      setCompanies((list) => [...list, c].sort((a, b) => a.name.localeCompare(b.name)))
      setNewName('')
    } catch (err) {
      setError(err.message || 'Could not add company.')
    } finally {
      setAdding(false)
    }
  }

  const replace = (c) => setCompanies((list) => list.map((x) => (x.id === c.id ? c : x)))
  const remove = (id) => setCompanies((list) => list.filter((x) => x.id !== id))

  return (
    <div className="space-y-4">
      <PageHeader title="Company Settings" subtitle="Companies and their module access" onBack={() => navigate('/')} />

      <Card className="p-4 sm:p-5">
        <form onSubmit={add} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Field label="New company name">
              <TextInput
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. MJM Plantation Sdn Bhd"
              />
            </Field>
          </div>
          <Button type="submit" disabled={adding || !newName.trim()}>
            <IconPlus width={18} height={18} /> {adding ? 'Adding…' : 'Add company'}
          </Button>
        </form>
      </Card>

      {error && <p className="rounded-xl bg-red-100 p-3 text-sm text-red-700">{error}</p>}

      {loading ? (
        <div className="flex justify-center py-12 text-brand">
          <Spinner className="h-7 w-7" />
        </div>
      ) : companies.length === 0 ? (
        <EmptyState title="No companies yet" subtitle="Add your first company above, then turn on CMMS 2 access." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {companies.map((c) => (
            <CompanyCard key={c.id} company={c} onSaved={replace} onDeleted={remove} />
          ))}
        </div>
      )}
    </div>
  )
}

function CompanyCard({ company, onSaved, onDeleted }) {
  const [name, setName] = useState(company.name)
  const [numbers, setNumbers] = useState((company.whatsapp_numbers || []).join('\n'))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const dirty =
    name.trim() !== company.name || parseNumbers(numbers).join(',') !== (company.whatsapp_numbers || []).join(',')

  async function save(patch) {
    setBusy(true)
    setError('')
    setSaved(false)
    try {
      const c = await updateCompany(company.id, patch)
      onSaved(c)
      setName(c.name)
      setNumbers((c.whatsapp_numbers || []).join('\n'))
      setSaved(true)
    } catch (e) {
      setError(e.message || 'Could not save.')
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!window.confirm(`Delete "${company.name}"? Its WhatsApp cases will show as unassigned.`)) return
    setBusy(true)
    try {
      await deleteCompany(company.id)
      onDeleted(company.id)
    } catch (e) {
      setError(e.message || 'Could not delete.')
      setBusy(false)
    }
  }

  return (
    <Card className="space-y-4 p-4 sm:p-5">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-light text-brand">
          <IconBuilding width={22} height={22} />
        </span>
        <p className="min-w-0 flex-1 truncate text-lg font-semibold text-slate-800">{company.name}</p>
        <button
          onClick={remove}
          disabled={busy}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"
          aria-label={`Delete ${company.name}`}
        >
          <IconTrash width={18} height={18} />
        </button>
      </div>

      <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3">
        <div>
          <p className="font-medium text-slate-800">CMMS 2 access</p>
          <p className="text-xs text-slate-500">Company shows in Maintenance Work Manage</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge color={company.cmms_enabled ? 'green' : 'slate'}>{company.cmms_enabled ? 'On' : 'Off'}</Badge>
          <Toggle
            checked={company.cmms_enabled}
            disabled={busy}
            onChange={(v) => save({ cmms_enabled: v })}
            label={`CMMS 2 access for ${company.name}`}
          />
        </div>
      </div>

      <Field label="Company name">
        <TextInput value={name} onChange={(e) => setName(e.target.value)} />
      </Field>

      <Field
        label="WhatsApp numbers"
        hint="Staff numbers that send maintenance messages, one per line, with country code (e.g. 60123456789)."
      >
        <TextArea rows={3} value={numbers} onChange={(e) => setNumbers(e.target.value)} placeholder="60123456789" />
      </Field>

      {error && <p className="rounded-lg bg-red-100 p-2.5 text-sm text-red-700">{error}</p>}

      <div className="flex items-center justify-end gap-3">
        {saved && !dirty && <span className="text-sm text-green-700">Saved</span>}
        <Button
          size="sm"
          disabled={busy || !dirty || !name.trim()}
          onClick={() => save({ name: name.trim(), whatsapp_numbers: parseNumbers(numbers) })}
        >
          {busy ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </Card>
  )
}

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
