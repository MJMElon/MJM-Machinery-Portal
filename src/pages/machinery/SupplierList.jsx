import { useCallback, useEffect, useState } from 'react'
import PageHeader from '../../components/PageHeader.jsx'
import { Button, Card, EmptyState, Field, Modal, Spinner, TextArea, TextInput } from '../../components/ui.jsx'
import { IconPencil, IconPlus, IconTrash } from '../../components/icons.jsx'
import { deleteSupplier, listMachines, listSuppliers, saveSupplier, useCmmsAccess } from '../../lib/cmms.js'
import { useCompany } from '../../lib/CompanyContext.jsx'

// Suppliers / workshops and the machines each one handles. The machine list is
// what lets a case propose the right supplier.
export default function SupplierList() {
  const { current } = useCompany()
  const access = useCmmsAccess(current?.id)
  const [suppliers, setSuppliers] = useState([])
  const [machines, setMachines] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(null) // supplier, or {} for new

  const load = useCallback(async () => {
    if (!current) return
    try {
      const [s, m] = await Promise.all([listSuppliers(current.id), listMachines(current.id)])
      setSuppliers(s)
      setMachines(m)
      setError('')
    } catch (e) {
      setError(e.message || 'Could not load suppliers.')
    } finally {
      setLoading(false)
    }
  }, [current])

  useEffect(() => {
    setLoading(true)
    load()
  }, [load])

  const machineName = (id) => machines.find((m) => m.id === id)?.name

  return (
    <div className="space-y-4">
      <PageHeader
        backTo="/cmms"
        backLabel="Back to CMMS 2"
        title={current?.name}
        subtitle={`${suppliers.length} supplier${suppliers.length === 1 ? '' : 's'} / workshop${suppliers.length === 1 ? '' : 's'}${access.loaded && !access.can_manage ? ' · view only' : ''}`}
        right={
          access.can_manage && (
            <Button onClick={() => setEditing({})}>
              <IconPlus width={18} height={18} /> Add supplier
            </Button>
          )
        }
      />
      {error && <p className="rounded-xl bg-red-100 p-3 text-sm text-red-700">{error}</p>}

      {loading ? (
        <div className="flex justify-center py-12 text-brand">
          <Spinner className="h-7 w-7" />
        </div>
      ) : suppliers.length === 0 ? (
        <EmptyState
          title="No suppliers yet"
          subtitle="Add the workshops and suppliers you send repairs to, and the machines each one handles."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {suppliers.map((s) => (
            <Card key={s.id} className="flex flex-col p-5">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-lg font-bold tracking-tight text-slate-900">{s.name}</p>
                  {s.services && <p className="text-sm text-slate-500">{s.services}</p>}
                </div>
                {access.can_manage && (
                  <div className="flex gap-1">
                    <button
                      onClick={() => setEditing(s)}
                      className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-brand"
                      aria-label={`Edit ${s.name}`}
                    >
                      <IconPencil width={17} height={17} />
                    </button>
                    <button
                      onClick={async () => {
                        if (!window.confirm(`Delete supplier "${s.name}"?`)) return
                        try {
                          await deleteSupplier(s.id)
                          await load()
                        } catch (e) {
                          setError(e.message || 'Could not delete.')
                        }
                      }}
                      className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"
                      aria-label={`Delete ${s.name}`}
                    >
                      <IconTrash width={17} height={17} />
                    </button>
                  </div>
                )}
              </div>
              <dl className="mt-3 space-y-1.5 text-sm">
                {s.contact_person && <Line label="Contact" value={s.contact_person} />}
                {s.phone && (
                  <Line
                    label="Phone"
                    value={
                      <a
                        href={`https://wa.me/${s.phone.replace(/\D/g, '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-brand hover:underline"
                      >
                        {s.phone}
                      </a>
                    }
                  />
                )}
                {s.notes && <Line label="Notes" value={s.notes} />}
              </dl>
              <div className="mt-auto pt-4">
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Machines handled</p>
                {(s.machine_ids || []).length === 0 ? (
                  <p className="text-sm text-slate-400">None selected</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {s.machine_ids.map((id) => (
                      <span
                        key={id}
                        className="rounded-full bg-brand-light px-2.5 py-0.5 text-xs font-semibold text-brand-dark"
                      >
                        {machineName(id) || 'Removed machine'}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {editing && (
        <SupplierForm
          supplier={editing}
          machines={machines}
          onClose={() => setEditing(null)}
          onSave={async (values) => {
            await saveSupplier(current.id, values)
            await load()
          }}
        />
      )}
    </div>
  )
}

function Line({ label, value }) {
  return (
    <div className="grid grid-cols-[72px_1fr] gap-2">
      <dt className="text-slate-400">{label}</dt>
      <dd className="break-words text-slate-800">{value}</dd>
    </div>
  )
}

function SupplierForm({ supplier, machines, onClose, onSave }) {
  const [v, setV] = useState({
    name: supplier.name || '',
    contact_person: supplier.contact_person || '',
    phone: supplier.phone || '',
    services: supplier.services || '',
    notes: supplier.notes || '',
    machine_ids: supplier.machine_ids || []
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (k) => (e) => setV((x) => ({ ...x, [k]: e.target.value }))
  const toggle = (id) =>
    setV((x) => ({
      ...x,
      machine_ids: x.machine_ids.includes(id) ? x.machine_ids.filter((m) => m !== id) : [...x.machine_ids, id]
    }))

  async function save() {
    setBusy(true)
    setError('')
    try {
      const t = (s) => s.trim() || null
      await onSave({
        ...(supplier.id ? { id: supplier.id } : {}),
        name: v.name.trim(),
        contact_person: t(v.contact_person),
        phone: t(v.phone),
        services: t(v.services),
        notes: t(v.notes),
        machine_ids: v.machine_ids
      })
      onClose()
    } catch (e) {
      setError(e.message || 'Could not save.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open wide onClose={onClose} title={supplier.id ? `Edit ${supplier.name}` : 'Add supplier / workshop'}>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name" required>
            <TextInput value={v.name} onChange={set('name')} placeholder="e.g. Ah Seng Hydraulic Workshop" />
          </Field>
          <Field label="Services">
            <TextInput value={v.services} onChange={set('services')} placeholder="Hydraulics, engine, tyres…" />
          </Field>
          <Field label="Contact person">
            <TextInput value={v.contact_person} onChange={set('contact_person')} />
          </Field>
          <Field label="Phone / WhatsApp">
            <TextInput value={v.phone} onChange={set('phone')} placeholder="60123456789" />
          </Field>
        </div>
        <Field label="Notes">
          <TextArea rows={2} value={v.notes} onChange={set('notes')} />
        </Field>
        <div>
          <p className="mb-1.5 text-sm font-medium text-slate-700">Machines handled</p>
          {machines.length === 0 ? (
            <p className="text-sm text-slate-400">Add machines in Machinery Profile first.</p>
          ) : (
            <div className="grid max-h-48 gap-1.5 overflow-y-auto rounded-xl border border-slate-200 p-2 sm:grid-cols-2">
              {machines.map((m) => (
                <label
                  key={m.id}
                  className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-[#2563eb]"
                    checked={v.machine_ids.includes(m.id)}
                    onChange={() => toggle(m.id)}
                  />
                  <span className="text-sm font-medium text-slate-800">{m.name}</span>
                  {m.machine_type && <span className="text-xs text-slate-400">{m.machine_type}</span>}
                </label>
              ))}
            </div>
          )}
        </div>
        {error && <p className="rounded-lg bg-red-100 p-2.5 text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" disabled={busy || !v.name.trim()} onClick={save}>
            {busy ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
