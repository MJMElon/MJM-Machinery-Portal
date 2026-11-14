import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import PageHeader from '../../components/PageHeader.jsx'
import { Button, Card, Field, Modal, Spinner, TextArea, TextInput } from '../../components/ui.jsx'
import { IconCamera, IconConsolidate, IconDownload, IconRefresh } from '../../components/icons.jsx'
import { CaseTableHeader, CaseTableRow } from '../../components/CaseTable.jsx'
import { UNASSIGNED, useCases } from '../../lib/useCases.js'
import { useAuth } from '../../auth/AuthContext.jsx'
import { useCompany } from '../../lib/CompanyContext.jsx'
import { CaseEditModal } from '../../components/CaseEditModal.jsx'
import { CASE_TYPES, caseNo, caseStage, caseSummary, caseType, fromApp, isStopped, serviceGap } from '../../lib/cases.js'
import { approveCase, closeCase, deleteCase, listMachines, listSuppliers, sendToSupplier, setCasePinned, solveCase, useCmmsAccess } from '../../lib/cmms.js'
import { CaseWorkflowModal } from '../../components/CaseWorkflowModal.jsx'
import { downloadCsv, money } from '../../lib/format.js'

const TABS = [
  { key: 'pending', label: 'Pending case' },
  { key: 'solved', label: 'Solved case' }
]
const TYPE_CHIPS = [['', 'All types'], ...Object.entries(CASE_TYPES).map(([k, v]) => [k, v.label])]

// Maintenance Work Manage: one company's cases from the worker app and
// WhatsApp — repair requests, repairs done and service requests — split into
// Pending / Solved, with the next step of each case as a button.
export default function WorkManage() {
  const { isSuperAdmin } = useAuth()
  const { current } = useCompany()
  const [tab, setTab] = useState('pending')
  const [type, setType] = useState('')
  const { pending, solved, urls, loading, error, reload, forCompany } = useCases()

  // The company chosen in the top bar; its cases only if it has CMMS 2.
  const key = current?.cmms_enabled ? current.id : null
  // Pinned cases (max 3) stay on top, newest pin first.
  const pendingRows = useMemo(
    () =>
      (key ? forCompany(pending, key) : []).sort(
        (a, b) => Number(Boolean(b.pinned_at)) - Number(Boolean(a.pinned_at)) || (b.pinned_at || '').localeCompare(a.pinned_at || '')
      ),
    [key, pending, forCompany]
  )
  const solvedRows = useMemo(() => (key ? forCompany(solved, key) : []), [key, solved, forCompany])
  const rows = (tab === 'pending' ? pendingRows : solvedRows).filter((c) => !type || caseType(c) === type)
  const unassigned = forCompany(pending, UNASSIGNED).length

  // Machinery + suppliers of this company (supplier names, edit dialog) and the user's access.
  const access = useCmmsAccess(key)
  const [machines, setMachines] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const loadLists = useCallback(() => {
    if (!key) return
    listMachines(key)
      .then(setMachines)
      .catch(() => setMachines([]))
    listSuppliers(key)
      .then(setSuppliers)
      .catch(() => setSuppliers([]))
  }, [key])
  useEffect(() => {
    loadLists()
  }, [loadLists])
  const machineById = useMemo(() => new Map(machines.map((m) => [m.id, m])), [machines])
  const supplierById = useMemo(() => new Map(suppliers.map((s) => [s.id, s])), [suppliers])

  const [editing, setEditing] = useState(null)
  const [working, setWorking] = useState(null) // case open in the workflow window (send out, notes)
  const [solving, setSolving] = useState(null) // case open in the cost & solve dialog
  const [busyId, setBusyId] = useState(null)
  const [actionError, setActionError] = useState('')
  async function act(c, fn) {
    setBusyId(c.id)
    setActionError('')
    try {
      await fn()
      await reload()
      return true
    } catch (e) {
      setActionError(e.message || 'Could not update the case.')
      await reload()
      return false
    } finally {
      setBusyId(null)
    }
  }

  // Approve a service request and send it to its workshop by WhatsApp. Without
  // a supplier (or a phone number) the office chooses one first.
  async function approveAndSend(c) {
    const s = supplierById.get(c.supplier_id)
    if (!s) {
      setActionError(`Choose the workshop for case ${caseNo(c)} first (Supplier column), then press Approve & send again.`)
      setEditing(c)
      return
    }
    const m = machineById.get(c.machine_id)
    const message = [
      `Service request: ${c.machine_name || 'machine'}`,
      caseSummary(c, m),
      c.preferred_date ? `Preferred date: ${new Date(c.preferred_date + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}` : null
    ]
      .filter(Boolean)
      .join('\n')
    if (!window.confirm(`Approve case ${caseNo(c)} and send it to ${s.name} by WhatsApp?\n\n${message}`)) return
    const approved = await act(c, () => approveCase(c.id))
    if (!approved) return
    const sent = await act(c, () => sendToSupplier({ caseId: c.id, supplierId: s.id, message }))
    // Approved but not delivered (e.g. WhatsApp's 24-hour rule): the case window offers "Open in my WhatsApp".
    if (!sent) setWorking(c)
  }

  function next(c, action) {
    if (action === 'approve') return approveAndSend(c)
    if (action === 'send') return setWorking(c)
    return setSolving(c) // solve / cost
  }

  // ---- the four figures on top
  const stopped = new Set(pendingRows.filter(isStopped).map((c) => c.machine_id || c.machine_name || c.id)).size
  const waiting = pendingRows.filter((c) => caseStage(c, machineById.get(c.machine_id)).waiting).length
  const late = pendingRows.filter((c) => serviceGap(c, machineById.get(c.machine_id))?.late).length
  const month = new Date().toISOString().slice(0, 7)
  const monthCost = solvedRows.filter((c) => (c.solved_at || '').startsWith(month)).reduce((n, c) => n + Number(c.cost || 0), 0)

  function exportCsv() {
    const all = [...pendingRows, ...solvedRows]
    const d = (v) => (v ? String(v).slice(0, 10) : '')
    downloadCsv(
      `maintenance-cases-${current?.code || 'company'}-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        { header: 'Case no', value: (c) => c.case_no },
        { header: 'Type', value: (c) => CASE_TYPES[caseType(c)].label },
        { header: 'Status', value: (c) => (c.status === 'solved' ? 'Solved' : caseStage(c, machineById.get(c.machine_id)).label) },
        { header: 'Machine', value: (c) => c.machine_name || '' },
        { header: 'Category / part', value: (c) => c.category || '' },
        { header: 'Problem / job', value: (c) => c.problem || '' },
        { header: 'Action done', value: (c) => c.action_done || '' },
        { header: 'Parts used', value: (c) => (c.parts || []).filter((p) => p?.name).map((p) => `${p.name} x${p.qty || 1}`).join('; ') },
        { header: 'SMU', value: (c) => c.smu ?? '' },
        { header: 'Service due at', value: (c) => c.service_due ?? '' },
        { header: 'Machine stopped', value: (c) => (c.machine_stopped ? 'Yes' : c.machine_stopped === false ? 'No' : '') },
        { header: 'Stopped from', value: (c) => d(c.stopped_from) },
        { header: 'Fixed on', value: (c) => d(c.fixed_on) },
        { header: 'Sent by', value: (c) => c.sender_name || c.wa_from || '' },
        { header: 'Source', value: (c) => (fromApp(c) ? 'App' : 'WhatsApp') },
        { header: 'Opened', value: (c) => d(c.opened_at) },
        { header: 'Supplier', value: (c) => supplierById.get(c.supplier_id)?.name || (caseType(c) === 'repair_done' ? 'Own mechanic' : '') },
        { header: 'Sent out', value: (c) => d(c.sent_at) },
        { header: 'Solved', value: (c) => d(c.solved_at) },
        { header: 'Cost (RM)', value: (c) => c.cost ?? '' }
      ],
      all
    )
  }

  // Worker CMMS opens in its own tab, straight on this page's own module (Machine Service & Maintenance),
  // with a fresh ?v= so it is never a cached copy.
  const openMobile = () => window.open(`${window.location.pathname}?v=${Date.now()}#/app/service`, '_blank')

  return (
    <div className="space-y-4">
      <PageHeader
        title="Maintenance Work Manage"
        right={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={() => reload()} aria-label="Refresh" className="w-12 px-0">
              <IconRefresh width={18} height={18} />
            </Button>
            {/* Always shown; the app itself says which permission is needed when someone may not send requests. */}
            <Button variant="secondary" onClick={openMobile} title="Worker CMMS → Machine Service & Maintenance, in a new tab: need a mechanic, I fixed something, request a service">
              <IconCamera width={18} height={18} /> Mobile view
            </Button>
            <Button variant="secondary" onClick={exportCsv} disabled={loading || !key} title="All cases of this company as a CSV file">
              <IconDownload width={18} height={18} /> Export for OPISPRO
            </Button>
            <Link
              to="/cmms/work/all"
              title="All companies (consolidated view)"
              className="inline-flex h-12 items-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-dark"
            >
              <IconConsolidate width={20} height={20} />
              <span className="hidden sm:inline">All companies</span>
            </Link>
          </div>
        }
      />

      {(error || actionError) && <p className="rounded-xl bg-red-100 p-3 text-sm text-red-700">{error || actionError}</p>}

      {current && !current.cmms_enabled && (
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
          CMMS 2 is not enabled for {current.name}. A super admin can turn it on under Companies (top right).
        </p>
      )}

      {unassigned > 0 && !loading && (
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
          {unassigned} pending case{unassigned > 1 ? 's' : ''} came from WhatsApp numbers not linked to any company.{' '}
          <Link to="/cmms/work/all" className="font-medium underline">
            View them
          </Link>
          {isSuperAdmin && (
            <>
              {' '}
              or{' '}
              <Link to="/settings" className="font-medium underline">
                link the numbers to a company
              </Link>
            </>
          )}
          .
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Machines stopped (breakdown)" value={stopped} />
        <Tile label="Waiting for office" value={waiting} />
        <Tile label="Late service (> 50 hr / 500 km)" value={late} alert={late > 0} />
        <Tile label="Repair cost this month" value={money(monthCost)} />
      </div>

      <Card className="overflow-hidden">
        {/* Tabs: full width, joined to the table below */}
        <div className="grid grid-cols-2 border-b border-slate-200" role="tablist">
          {TABS.map((t) => {
            const n = t.key === 'pending' ? pendingRows.length : solvedRows.length
            const active = tab === t.key
            return (
              <button
                key={t.key}
                role="tab"
                aria-selected={active}
                onClick={() => setTab(t.key)}
                className={`relative flex h-14 items-center justify-center gap-2.5 text-[15px] font-semibold transition ${
                  active ? 'bg-white text-brand' : 'bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                }`}
              >
                {t.label}
                <span
                  className={`min-w-[1.75rem] rounded-full px-2 py-0.5 text-xs tabular-nums ${
                    active ? 'bg-brand text-white' : t.key === 'pending' && n ? 'bg-amber-100 text-amber-700' : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  {n}
                </span>
                {active && <span className="absolute inset-x-0 bottom-0 h-[3px] bg-brand" />}
              </button>
            )
          })}
        </div>

        <div className="flex flex-wrap gap-2 border-b border-slate-200 px-4 py-3">
          {TYPE_CHIPS.map(([k, label]) => (
            <button
              key={k}
              onClick={() => setType(k)}
              aria-pressed={type === k}
              className={`h-9 rounded-full px-4 text-sm font-medium transition ${
                type === k ? 'bg-brand text-white' : 'border border-slate-300 bg-white text-slate-700 hover:border-brand hover:text-brand'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-16 text-brand">
            <Spinner className="h-7 w-7" />
          </div>
        ) : rows.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <p className="font-medium text-slate-700">{tab === 'pending' ? 'No pending cases' : 'No solved cases yet'}</p>
            <p className="mt-1 text-sm text-slate-500">
              {type
                ? 'Nothing of this type. Choose “All types” to see the rest.'
                : tab === 'pending'
                  ? 'Requests from the worker app and WhatsApp reports from this company’s numbers appear here as cases.'
                  : 'Cases marked as solved appear here.'}
            </p>
          </div>
        ) : (
          <>
            <CaseTableHeader />
            <div className="divide-y divide-slate-100">
              {rows.map((c) => (
                <CaseTableRow
                  key={c.id}
                  c={c}
                  urls={urls}
                  machine={machineById.get(c.machine_id)}
                  supplierName={supplierById.get(c.supplier_id)?.name}
                  access={access}
                  busy={busyId === c.id}
                  onNext={(action) => next(c, action)}
                  onReopen={() => window.confirm(`Reopen case ${caseNo(c)}?`) && act(c, () => closeCase(c.id, false))}
                  onSupplier={() => setEditing(c)}
                  onPin={() => act(c, () => setCasePinned(c.id, !c.pinned_at))}
                  onEdit={() => setEditing(c)}
                  onDelete={() =>
                    window.confirm(`Delete case ${caseNo(c)} and its WhatsApp messages? This cannot be undone.`) && act(c, () => deleteCase(c.id))
                  }
                />
              ))}
            </div>
          </>
        )}
      </Card>

      <p className="text-xs text-slate-500">
        Cases come from the worker app (Mobile view) or WhatsApp (#number in the caption adds to a case). The cost entered when a case is solved
        adds up to “Repair cost this month”.
      </p>

      {working && (
        <CaseWorkflowModal
          c={pendingRows.find((x) => x.id === working.id) || solvedRows.find((x) => x.id === working.id) || working}
          machines={machines}
          suppliers={suppliers}
          access={access}
          onClose={() => setWorking(null)}
          onChanged={reload}
        />
      )}

      {solving && (
        <SolveModal
          c={solving}
          supplierName={supplierById.get(solving.supplier_id)?.name}
          onClose={() => setSolving(null)}
          onSolved={reload}
        />
      )}

      {editing && <CaseEditModal c={editing} machines={machines} suppliers={suppliers} onClose={() => setEditing(null)} onSaved={reload} />}
    </div>
  )
}

function Tile({ label, value, alert }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-1 font-display text-2xl font-extrabold tabular-nums ${alert ? 'text-red-600' : 'text-slate-900'}`}>{value}</p>
    </Card>
  )
}

// Solve a case: the cost (may be left empty) and an optional closing remark.
function SolveModal({ c, supplierName, onClose, onSolved }) {
  const [cost, setCost] = useState(c.cost ?? '')
  const [remark, setRemark] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function save(e) {
    e.preventDefault()
    if (cost !== '' && !(Number(cost) >= 0)) return setError('The cost cannot be negative.')
    setBusy(true)
    setError('')
    try {
      await solveCase(c.id, cost === '' ? null : Number(cost), remark.trim())
      await onSolved()
      onClose()
    } catch (e2) {
      setError(e2.message || 'Could not solve the case.')
      setBusy(false)
    }
  }

  return (
    <Modal open onClose={onClose} title={`Solve case ${caseNo(c)}${c.machine_name ? ` · ${c.machine_name}` : ''}`}>
      <form onSubmit={save} className="space-y-4">
        {error && <p className="rounded-xl bg-red-100 p-3 text-sm text-red-700">{error}</p>}
        <p className="text-sm text-slate-600">
          {CASE_TYPES[caseType(c)].label}
          {supplierName ? ` · ${supplierName}` : caseType(c) === 'repair_done' ? ' · Own mechanic' : ''}
          {c.machine_stopped && !c.fixed_on ? ' · the machine counts as fixed today' : ''}
        </p>
        <Field label="Cost (RM)" hint="Parts and labour. Leave empty if there is no cost or it is not known yet.">
          <TextInput type="number" inputMode="decimal" min="0" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} autoFocus />
        </Field>
        <Field label="Closing remark (optional)">
          <TextArea rows={2} value={remark} onChange={(e) => setRemark(e.target.value)} maxLength={400} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Solve case'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
