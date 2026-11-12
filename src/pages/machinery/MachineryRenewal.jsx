import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import PageHeader from '../../components/PageHeader.jsx'
import { Badge, Button, Card, Modal, Spinner, TextInput } from '../../components/ui.jsx'
import { IconImage, IconPencil, IconTrash } from '../../components/icons.jsx'
import {
  RENEWAL_KINDS,
  daysLeft,
  deleteRenewal,
  expiryOf,
  isPdf,
  listMachines,
  listRenewals,
  machineNo,
  machineStatus,
  openMachineFile,
  removeMachineFile,
  saveRenewal,
  uploadMachineFile,
  useCmmsAccess
} from '../../lib/cmms.js'
import { useCompany } from '../../lib/CompanyContext.jsx'
import { day, money, today } from '../../lib/format.js'

// Machinery Renewal: every machine with its insurance, road tax and Puspakom
// cover — last renewal, expiry, days left — and a dialog to record a renewal
// (reference no., routine months, amounts, document). Renewals are kept as
// history; the newest one is what the Machinery Profile shows.
export default function MachineryRenewal() {
  const { current } = useCompany()
  const access = useCmmsAccess(current?.id)
  const [machines, setMachines] = useState([])
  const [renewals, setRenewals] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [sortKey, setSortKey] = useState('insurance')
  const [dialog, setDialog] = useState(null) // { machine, kind }

  const load = useCallback(async () => {
    if (!current) return
    try {
      const [m, r] = await Promise.all([listMachines(current.id), listRenewals(current.id)])
      setMachines(m)
      setRenewals(r)
      setError('')
    } catch (e) {
      setError(e.message || 'Could not load.')
    } finally {
      setLoading(false)
    }
  }, [current])

  useEffect(() => {
    setLoading(true)
    load()
  }, [load])

  const canEdit = access.can('machines', 'edit') || access.can('machines', 'add')
  const cover = (m, kind) => ({ from: m[`${kind}_from`], to: m[`${kind}_to`], ref: m[`${kind}_no`], days: daysLeft(m[`${kind}_to`]) })

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase()
    // Active and insurance-only machines are tracked; inactive ones are not.
    const list = machines.filter((m) => machineStatus(m) !== 'inactive' && (!t || [m.name, m.reg_no, machineNo(m), m.brand, m.model].some((v) => String(v || '').toLowerCase().includes(t))))
    // soonest expiry of the chosen kind first; no cover at the end
    const key = (m) => cover(m, sortKey).days ?? 1e9
    return list.sort((a, b) => key(a) - key(b))
  }, [machines, q, sortKey])

  return (
    <div className="space-y-4">
      <PageHeader title="Machinery Renewal" />
      {error && <p className="rounded-xl bg-red-100 p-3 text-sm text-red-700">{error}</p>}

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
          <h3 className="font-semibold text-slate-800">Tracking</h3>
          <div className="flex flex-wrap items-center gap-2">
            <select value={sortKey} onChange={(e) => setSortKey(e.target.value)} className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm" aria-label="Sort by">
              {RENEWAL_KINDS.map((k) => (
                <option key={k.key} value={k.key}>
                  Sort by {k.label.toLowerCase()} expiry
                </option>
              ))}
            </select>
            <TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search reg no. / code…" className="h-10 sm:w-64" />
          </div>
        </div>
        {loading ? (
          <div className="flex justify-center py-12 text-brand">
            <Spinner className="h-7 w-7" />
          </div>
        ) : rows.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-slate-500">{machines.length ? 'Nothing matches the search.' : 'No machines yet. Add them under Machinery Profile.'}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1180px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-2.5">#</th>
                  <th className="px-3 py-2.5">Reg no.</th>
                  {RENEWAL_KINDS.map((k) => (
                    <th key={k.key} colSpan={3} className="border-l border-slate-200 px-3 py-2.5 text-center">
                      {k.label}
                    </th>
                  ))}
                  <th className="w-12 px-3 py-2.5" />
                </tr>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-left text-[11px] font-medium uppercase tracking-wide text-slate-400">
                  <th />
                  <th />
                  {RENEWAL_KINDS.map((k) => (
                    <HeadCells key={k.key} />
                  ))}
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((m, i) => (
                  <tr key={m.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-2 text-slate-500">{i + 1}</td>
                    <td className="px-3 py-2">
                      <Link to={`/cmms/machines/${m.id}`} className="font-semibold text-slate-800 hover:text-brand">
                        {m.reg_no || m.name}
                      </Link>
                      <span className="block text-xs text-slate-400">
                        {machineNo(m)}
                        {m.reg_no && m.reg_no !== m.name ? ` · ${m.name}` : ''}
                      </span>
                    </td>
                    {RENEWAL_KINDS.map((k) => {
                      const c = cover(m, k.key)
                      return (
                        <CoverCells
                          key={k.key}
                          c={c}
                          onEdit={canEdit ? () => setDialog({ machine: m, kind: k.key }) : null}
                        />
                      )
                    })}
                    <td className="px-3 py-2" />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {dialog && (
        <RenewalDialog
          company={current}
          machine={dialog.machine}
          kind={dialog.kind}
          history={renewals.filter((r) => r.machine_id === dialog.machine.id && r.kind === dialog.kind)}
          canEdit={canEdit}
          canDelete={access.can('machines', 'delete')}
          onClose={() => setDialog(null)}
          onSaved={load}
        />
      )}
    </div>
  )
}

const cls = 'h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30 disabled:bg-slate-100'
function Field({ label, children }) {
  return (
    <label className="grid grid-cols-[170px_minmax(0,1fr)] items-center gap-3 py-1.5">
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      {children}
    </label>
  )
}

function HeadCells() {
  return (
    <>
      <th className="border-l border-slate-200 px-3 py-1.5">Last renewal</th>
      <th className="px-3 py-1.5">Expiry</th>
      <th className="px-3 py-1.5 text-center">Days left</th>
    </>
  )
}

// Days-left chip: green (> 90 days), amber (≤ 90), red (expired), grey (no record).
function CoverCells({ c, onEdit }) {
  const chip =
    c.days == null ? (
      <Badge>N/A</Badge>
    ) : c.days < 0 ? (
      <Badge color="red">Expired</Badge>
    ) : (
      <span className={`inline-flex min-w-12 justify-center rounded-md px-2 py-0.5 text-xs font-bold ${c.days <= 90 ? 'bg-amber-400 text-amber-950' : 'bg-green-500 text-white'}`}>{c.days}</span>
    )
  return (
    <>
      <td className="border-l border-slate-200 px-3 py-2">
        {onEdit ? (
          <button type="button" onClick={onEdit} className="inline-flex items-center gap-1.5 font-medium text-brand hover:underline">
            {c.from ? day(c.from) : 'N/A'} <IconPencil width={13} height={13} className="text-slate-400" />
          </button>
        ) : (
          <span>{c.from ? day(c.from) : 'N/A'}</span>
        )}
        {c.ref && <span className="block text-xs text-slate-400">{c.ref}</span>}
      </td>
      <td className="px-3 py-2 text-slate-700">{c.to ? day(c.to) : '—'}</td>
      <td className="px-3 py-2 text-center">{chip}</td>
    </>
  )
}

// Record a renewal (like the old CMMS "Edit Renewal …" dialog), with history.
function RenewalDialog({ company, machine, kind, history, canEdit, canDelete, onClose, onSaved }) {
  const def = RENEWAL_KINDS.find((k) => k.key === kind)
  const latest = history[0]
  const [f, setF] = useState({
    ref_no: machine[`${kind}_no`] || latest?.ref_no || '',
    months: machine[`${kind}_months`] || latest?.months || (kind === 'puspakom' ? 6 : 12),
    insured_amount: latest?.insured_amount ?? machine.insurance_amount ?? '',
    premium: latest?.premium ?? machine.insurance_premium ?? '',
    last_date: today(),
    doc_path: '',
    notes: ''
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))
  const expiry = expiryOf(f.last_date, f.months)

  async function pickDoc(file) {
    if (!file) return
    setBusy(true)
    try {
      if (f.doc_path) removeMachineFile(f.doc_path)
      const path = await uploadMachineFile(company.id, file)
      setF((x) => ({ ...x, doc_path: path }))
      setError('')
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }
  async function save(e) {
    e.preventDefault()
    if (!f.last_date) return setError('Enter the last renewal date.')
    setBusy(true)
    setError('')
    try {
      await saveRenewal(company.id, {
        machine_id: machine.id,
        kind,
        ref_no: f.ref_no.trim() || null,
        months: Number(f.months) || 12,
        insured_amount: kind === 'insurance' && f.insured_amount !== '' ? Number(f.insured_amount) : null,
        premium: kind === 'insurance' && f.premium !== '' ? Number(f.premium) : null,
        last_date: f.last_date,
        expiry_date: expiry,
        doc_path: f.doc_path || null,
        notes: f.notes.trim() || null
      })
      await onSaved()
      onClose()
    } catch (e2) {
      setError(e2.message)
      setBusy(false)
    }
  }
  async function remove(r) {
    if (!window.confirm('Delete this renewal record?')) return
    try {
      await deleteRenewal(r.id)
      removeMachineFile(r.doc_path)
      await onSaved()
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <Modal open onClose={onClose} title={`Renewal — ${def.label}`} wide>
      <form onSubmit={save} className="space-y-2">
        {error && <p className="rounded-lg bg-red-100 p-2.5 text-sm text-red-700">{error}</p>}
        <Field label="Reg no.">
          <input value={machine.reg_no || machine.name} disabled className={cls} />
        </Field>
        <Field label="Brand (model)">
          <input value={[machine.brand, machine.model].filter(Boolean).join(' ')} disabled className={cls} />
        </Field>
        <Field label="Year made">
          <input value={machine.year_made || ''} disabled className={cls} />
        </Field>
        <Field label={def.refLabel}>
          <input value={f.ref_no} onChange={set('ref_no')} maxLength={80} className={cls} disabled={!canEdit} />
        </Field>
        <Field label="Routine (months)">
          <input type="number" min="1" max="60" step="1" value={f.months} onChange={set('months')} className={cls} disabled={!canEdit} />
        </Field>
        {kind === 'insurance' && (
          <>
            <Field label="Actual insured amount">
              <input type="number" min="0" step="0.01" value={f.insured_amount} onChange={set('insured_amount')} className={cls} disabled={!canEdit} />
            </Field>
            <Field label="Annual premium cost">
              <input type="number" min="0" step="0.01" value={f.premium} onChange={set('premium')} className={cls} disabled={!canEdit} />
            </Field>
          </>
        )}
        <Field label="Last renewal">
          <input type="date" value={f.last_date} onChange={set('last_date')} className={cls} disabled={!canEdit} required />
        </Field>
        <Field label="Expiry date">
          <input value={expiry ? day(expiry) : ''} disabled className={cls} />
        </Field>
        <Field label="Upload">
          <div className="flex flex-wrap items-center gap-2">
            {f.doc_path && (
              <button type="button" onClick={() => openMachineFile(f.doc_path).catch((e) => window.alert(e.message))} className="inline-flex h-8 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-sm text-brand hover:border-brand">
                <IconImage width={16} height={16} /> {isPdf(f.doc_path) ? 'View PDF' : 'View photo'}
              </button>
            )}
            {canEdit && (
              <label className="inline-flex h-8 cursor-pointer items-center rounded-lg border border-dashed border-slate-300 px-2.5 text-sm text-slate-600 hover:border-brand hover:text-brand">
                {busy ? 'Uploading…' : f.doc_path ? 'Replace file' : 'Select PDF or photo'}
                <input type="file" accept="image/*,application/pdf" className="hidden" disabled={busy} onChange={(e) => pickDoc(e.target.files?.[0])} />
              </label>
            )}
          </div>
        </Field>
        <Field label="Notes">
          <input value={f.notes} onChange={set('notes')} maxLength={500} className={cls} disabled={!canEdit} />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Close
          </Button>
          {canEdit && (
            <Button type="submit" disabled={busy}>
              {busy ? 'Saving…' : `Update ${def.label.toLowerCase()}`}
            </Button>
          )}
        </div>

        {history.length > 0 && (
          <div className="mt-4 border-t border-slate-200 pt-3">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">History</p>
            <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 text-sm">
              {history.map((r) => (
                <div key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                  <span className="font-medium text-slate-800">{day(r.last_date)}</span>
                  <span className="text-slate-500">to {day(r.expiry_date)}</span>
                  {r.ref_no && <span className="text-slate-500">{r.ref_no}</span>}
                  {r.premium != null && <span className="text-slate-500">premium {money(r.premium)}</span>}
                  <span className="flex-1" />
                  {r.doc_path && (
                    <button type="button" onClick={() => openMachineFile(r.doc_path).catch((e) => window.alert(e.message))} className="text-xs font-medium text-brand hover:underline">
                      File
                    </button>
                  )}
                  {canDelete && (
                    <button type="button" onClick={() => remove(r)} className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="Delete">
                      <IconTrash width={14} height={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </form>
    </Modal>
  )
}
