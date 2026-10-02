import { useMemo, useState } from 'react'
import { Button, Field, Modal, Select, TextArea, TextInput } from './ui.jsx'
import { caseNo } from '../lib/cases.js'
import { updateCaseDetails } from '../lib/cmms.js'

const today = () => new Date().toISOString().slice(0, 10)

// Edit a case: machine (from the machinery profile, or typed), problem, the
// supplier/workshop it is sent to, and the date it was sent out. Suppliers that
// handle the chosen machine are listed first.
export function CaseEditModal({ c, machines, suppliers, onClose, onSaved }) {
  const [machineId, setMachineId] = useState(c.machine_id || '')
  const [machineName, setMachineName] = useState(c.machine_name || '')
  const [problem, setProblem] = useState(c.problem || '')
  const [supplierId, setSupplierId] = useState(c.supplier_id || '')
  const [sentAt, setSentAt] = useState(c.sent_at || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const sortedSuppliers = useMemo(() => {
    const handles = (s) => machineId && (s.machine_ids || []).includes(machineId)
    return [...suppliers].sort((a, b) => Number(handles(b)) - Number(handles(a)) || a.name.localeCompare(b.name))
  }, [suppliers, machineId])
  const handles = (s) => machineId && (s.machine_ids || []).includes(machineId)

  function pickMachine(id) {
    setMachineId(id)
    const m = machines.find((x) => x.id === id)
    if (m) setMachineName(m.name)
  }

  async function save() {
    setBusy(true)
    setError('')
    try {
      await updateCaseDetails(c.id, {
        machine_id: machineId || null,
        machine_name: machineName.trim(),
        problem: problem.trim(),
        supplier_id: supplierId || null,
        sent_at: supplierId ? sentAt || null : sentAt || null
      })
      await onSaved()
      onClose()
    } catch (e) {
      setError(e.message || 'Could not save.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open wide onClose={onClose} title={`Edit case ${caseNo(c)}`}>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Machine (profile)">
            <Select value={machineId} onChange={(e) => pickMachine(e.target.value)}>
              <option value="">— Not in profile —</option>
              {machines.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                  {m.machine_type ? ` · ${m.machine_type}` : ''}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Machine name">
            <TextInput value={machineName} onChange={(e) => setMachineName(e.target.value)} placeholder="e.g. EX-03" />
          </Field>
        </div>
        <Field label="Problem">
          <TextArea rows={3} value={problem} onChange={(e) => setProblem(e.target.value)} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Supplier / workshop"
            hint={machineId && sortedSuppliers.some(handles) ? '★ = handles this machine' : undefined}
          >
            <Select
              value={supplierId}
              onChange={(e) => {
                setSupplierId(e.target.value)
                if (e.target.value && !sentAt) setSentAt(today())
              }}
            >
              <option value="">— Not sent yet —</option>
              {sortedSuppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {handles(s) ? '★ ' : ''}
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Sent out on">
            <TextInput type="date" value={sentAt} onChange={(e) => setSentAt(e.target.value)} />
          </Field>
        </div>
        {error && <p className="rounded-lg bg-red-100 p-2.5 text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" disabled={busy} onClick={save}>
            {busy ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
