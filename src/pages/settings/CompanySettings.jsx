import { useCallback, useEffect, useState } from 'react'
import PageHeader from '../../components/PageHeader.jsx'
import { Badge, Button, Card, EmptyState, Field, SectionTitle, Spinner, TextArea, TextInput } from '../../components/ui.jsx'
import { IconPlus, IconRefresh, IconTrash } from '../../components/icons.jsx'
import { createBlock, deleteBlock, listBlocks, parseNumbers, syncFromIntranet, updateBlock, updateCompany } from '../../lib/companies.js'
import { useAuth } from '../../auth/AuthContext.jsx'
import { useCompany } from '../../lib/CompanyContext.jsx'

const fmtHa = (n) =>
  n == null || n === '' ? '—' : `${Number(n).toLocaleString('en-MY', { maximumFractionDigits: 2 })} ha`
const toNum = (v) => (String(v).trim() === '' ? null : Number(v))

// Settings of the selected company: total area and its blocks.
export default function CompanySettings() {
  const { current, reload: reloadCompanies, loaded, businessesOf } = useCompany()
  const { isSuperAdmin } = useAuth()
  const [blocks, setBlocks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!current) return
    setError('')
    try {
      setBlocks(await listBlocks(current.id))
    } catch (e) {
      setError(e.message || 'Could not load blocks.')
    } finally {
      setLoading(false)
    }
  }, [current])

  useEffect(() => {
    setLoading(true)
    load()
  }, [load])

  if (!loaded) return <Loading />
  if (!current)
    return (
      <div>
        <PageHeader backTo="/" backLabel="Back to main page" />
        <EmptyState
          title="No company yet"
          subtitle="Companies come from MJM Intranet. A super admin presses “Sync from MJM Intranet” below."
          action={isSuperAdmin && <SyncButton onDone={reloadCompanies} />}
        />
      </div>
    )

  const blockTotal = blocks.reduce((n, b) => n + (Number(b.area_ha) || 0), 0)

  return (
    <div className="space-y-5">
      <PageHeader
        backTo="/"
        backLabel="Back to CMMS main page"
        title={current.name}
        subtitle={[current.code, businessesOf(current).map((b) => b.name).join(', ')].filter(Boolean).join(' · ') || 'Company profile and blocks'}
        right={isSuperAdmin && <SyncButton onDone={reloadCompanies} />}
      />

      {error && <p className="rounded-xl bg-red-100 p-3 text-sm text-red-700">{error}</p>}

      <div className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
        <div className="space-y-5">
          <ProfileCard
            key={current.id}
            company={current}
            blockTotal={blockTotal}
            blockCount={blocks.length}
            onSaved={reloadCompanies}
          />
          <ModulesCard company={current} />
          {isSuperAdmin && <WhatsAppCard key={`wa-${current.id}`} company={current} onSaved={reloadCompanies} />}
        </div>

        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <div>
              <p className="font-semibold text-slate-800">Blocks</p>
              <p className="text-sm text-slate-500">
                {blocks.length} block{blocks.length === 1 ? '' : 's'} · {fmtHa(blockTotal)}
              </p>
            </div>
          </div>
          <AddBlock companyId={current.id} onAdded={load} onError={setError} />
          {loading ? (
            <Loading />
          ) : blocks.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-slate-400">No blocks yet. Add the first one above.</p>
          ) : (
            <div>
              <div className="hidden grid-cols-[minmax(0,1fr)_140px_minmax(0,1.4fr)_96px] gap-3 border-y border-slate-200 bg-slate-50/80 px-5 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500 md:grid">
                <span>Block</span>
                <span>Area (ha)</span>
                <span>Notes</span>
                <span />
              </div>
              <div className="divide-y divide-slate-100">
                {blocks.map((b) => (
                  <BlockRow key={b.id} block={b} onChanged={load} onError={setError} />
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}

function ProfileCard({ company, blockTotal, blockCount, onSaved }) {
  const [area, setArea] = useState(company.area_ha ?? '')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const dirty = String(area ?? '') !== String(company.area_ha ?? '')

  async function save() {
    setBusy(true)
    setMsg('')
    try {
      await updateCompany(company.id, { area_ha: toNum(area) })
      await onSaved()
      setMsg('Saved')
    } catch (e) {
      setMsg(e.message || 'Could not save.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="space-y-4 self-start p-5">
      <SectionTitle>Company profile</SectionTitle>
      <Field label="Company name" hint="From MJM Intranet (Master Manage → Company).">
        <TextInput value={company.name} disabled />
      </Field>
      <Field label="Total area (ha)">
        <TextInput
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          value={area}
          onChange={(e) => setArea(e.target.value)}
        />
      </Field>
      <dl className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 text-sm">
        <div>
          <dt className="text-slate-500">Blocks</dt>
          <dd className="font-semibold text-slate-800">{blockCount}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Sum of blocks</dt>
          <dd className="font-semibold text-slate-800">{fmtHa(blockTotal)}</dd>
        </div>
      </dl>
      <div className="flex items-center justify-end gap-3">
        {msg && <span className={`text-sm ${msg === 'Saved' ? 'text-green-700' : 'text-red-700'}`}>{msg}</span>}
        <Button size="sm" disabled={busy || !dirty} onClick={save}>
          {busy ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </Card>
  )
}

// Which modules this company has: decided in MJM Intranet by tagging the
// CMMS 2 / Fuel Manage Icons with the business or company.
function ModulesCard({ company }) {
  const rows = [
    ['Machinery Manage', company.cmms_enabled],
    ['Fuel Manage', company.diesel_enabled]
  ]
  return (
    <Card className="space-y-3 p-5">
      <SectionTitle>Modules</SectionTitle>
      <ul className="space-y-2">
        {rows.map(([label, on]) => (
          <li key={label} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm">
            <span className="font-medium text-slate-800">{label}</span>
            <Badge color={on ? 'green' : 'slate'}>{on ? 'On' : 'Off'}</Badge>
          </li>
        ))}
      </ul>
      <p className="text-xs text-slate-500">
        Set in MJM Intranet: Master Manage → Module → tag the “CMMS 2” / “Fuel Manage” icon with this company or its
        business. Refreshed on every sign-in and with “Sync from MJM Intranet”.
      </p>
    </Card>
  )
}

// Staff WhatsApp numbers: a maintenance message belongs to the company whose
// numbers include the sender (super admins only; portal setting, not Intranet).
function WhatsAppCard({ company, onSaved }) {
  const [numbers, setNumbers] = useState((company.whatsapp_numbers || []).join('\n'))
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const dirty = parseNumbers(numbers).join(',') !== (company.whatsapp_numbers || []).join(',')
  async function save() {
    setBusy(true)
    setMsg('')
    try {
      await updateCompany(company.id, { whatsapp_numbers: parseNumbers(numbers) })
      await onSaved()
      setMsg('Saved')
    } catch (e) {
      setMsg(e.message || 'Could not save.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Card className="space-y-3 p-5">
      <SectionTitle>WhatsApp numbers</SectionTitle>
      <Field hint="Staff numbers that send maintenance messages, one per line, with country code (e.g. 60123456789). Messages from these numbers become this company’s cases.">
        <TextArea rows={4} value={numbers} onChange={(e) => setNumbers(e.target.value)} placeholder="60123456789" />
      </Field>
      <div className="flex items-center justify-end gap-3">
        {msg && <span className={`text-sm ${msg === 'Saved' ? 'text-green-700' : 'text-red-700'}`}>{msg}</span>}
        <Button size="sm" disabled={busy || !dirty} onClick={save}>
          {busy ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </Card>
  )
}

function SyncButton({ onDone }) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  async function sync() {
    setBusy(true)
    setMsg('')
    try {
      const r = await syncFromIntranet()
      setMsg(`Synced: ${r.businesses} businesses, ${r.companies} companies.`)
      await onDone()
    } catch (e) {
      setMsg(e.message || 'Sync failed.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="secondary" onClick={sync} disabled={busy}>
        <IconRefresh width={18} height={18} className={busy ? 'animate-spin' : ''} /> {busy ? 'Syncing…' : 'Sync from MJM Intranet'}
      </Button>
      {msg && <span className={`text-xs ${/failed|not|error/i.test(msg) ? 'text-red-700' : 'text-green-700'}`}>{msg}</span>}
    </div>
  )
}

function AddBlock({ companyId, onAdded, onError }) {
  const [name, setName] = useState('')
  const [area, setArea] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)

  async function add(e) {
    e.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    onError('')
    try {
      await createBlock(companyId, { name: name.trim(), area_ha: toNum(area), notes: notes.trim() || null })
      setName('')
      setArea('')
      setNotes('')
      await onAdded()
    } catch (err) {
      onError(err.message || 'Could not add block.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      onSubmit={add}
      className="grid gap-3 bg-brand-light/30 px-5 py-4 md:grid-cols-[minmax(0,1fr)_140px_minmax(0,1.4fr)_96px] md:items-end"
    >
      <Field label="Block name">
        <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Block A1" />
      </Field>
      <Field label="Area (ha)">
        <TextInput
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          value={area}
          onChange={(e) => setArea(e.target.value)}
        />
      </Field>
      <Field label="Notes">
        <TextInput value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
      </Field>
      <Button type="submit" disabled={busy || !name.trim()}>
        <IconPlus width={18} height={18} /> Add
      </Button>
    </form>
  )
}

function BlockRow({ block, onChanged, onError }) {
  const [name, setName] = useState(block.name)
  const [area, setArea] = useState(block.area_ha ?? '')
  const [notes, setNotes] = useState(block.notes ?? '')
  const [busy, setBusy] = useState(false)
  const dirty =
    name.trim() !== block.name ||
    String(area ?? '') !== String(block.area_ha ?? '') ||
    (notes || '') !== (block.notes || '')

  async function run(fn) {
    setBusy(true)
    onError('')
    try {
      await fn()
      await onChanged()
    } catch (e) {
      onError(e.message || 'Could not save block.')
    } finally {
      setBusy(false)
    }
  }

  const cell = 'h-10 rounded-lg border-transparent bg-transparent px-2 hover:border-slate-200 focus:bg-white'
  return (
    <div className="grid gap-2 px-5 py-2.5 md:grid-cols-[minmax(0,1fr)_140px_minmax(0,1.4fr)_96px] md:items-center md:gap-3">
      <TextInput
        className={`${cell} font-semibold`}
        value={name}
        onChange={(e) => setName(e.target.value)}
        aria-label="Block name"
      />
      <TextInput
        className={cell}
        type="number"
        inputMode="decimal"
        min="0"
        step="0.01"
        value={area}
        onChange={(e) => setArea(e.target.value)}
        aria-label="Area (ha)"
      />
      <TextInput
        className={cell}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="—"
        aria-label="Notes"
      />
      <div className="flex items-center justify-end gap-1">
        {dirty && (
          <Button
            size="sm"
            disabled={busy || !name.trim()}
            onClick={() =>
              run(() => updateBlock(block.id, { name: name.trim(), area_ha: toNum(area), notes: notes.trim() || null }))
            }
          >
            Save
          </Button>
        )}
        <button
          disabled={busy}
          onClick={() => window.confirm(`Delete block "${block.name}"?`) && run(() => deleteBlock(block.id))}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"
          aria-label={`Delete ${block.name}`}
        >
          <IconTrash width={18} height={18} />
        </button>
      </div>
    </div>
  )
}

function Loading() {
  return (
    <div className="flex justify-center py-12 text-brand">
      <Spinner className="h-7 w-7" />
    </div>
  )
}
