import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import PageHeader from '../../components/PageHeader.jsx'
import { Button, Card, Spinner } from '../../components/ui.jsx'
import { IconConsolidate, IconRefresh, IconWarning } from '../../components/icons.jsx'
import { CaseTableHeader, CaseTableRow } from '../../components/CaseTable.jsx'
import { formatSender, formatTime } from '../../lib/whatsapp.js'
import { UNASSIGNED, useCases } from '../../lib/useCases.js'
import { useAuth } from '../../auth/AuthContext.jsx'
import { useCompany } from '../../lib/CompanyContext.jsx'
import { CaseEditModal } from '../../components/CaseEditModal.jsx'
import { setCaseSolved, caseNo } from '../../lib/cases.js'
import { deleteCase, listMachines, listSuppliers, useCmmsAccess } from '../../lib/cmms.js'

const TABS = [
  { key: 'pending', label: 'Pending case' },
  { key: 'solved', label: 'Solved case' }
]

// Maintenance Work Manage: one company's cases, split into Pending / Solved.
export default function WorkManage() {
  const { isSuperAdmin } = useAuth()
  const { current } = useCompany()
  const [tab, setTab] = useState('pending')
  const [showProblems, setShowProblems] = useState(false)
  const { pending, solved, problems, urls, loading, error, reload, forCompany } = useCases()

  // The company chosen in the top bar; its cases only if it has CMMS 2.
  const key = current?.cmms_enabled ? current.id : null
  const pendingRows = key ? forCompany(pending, key) : []
  const solvedRows = key ? forCompany(solved, key) : []
  const rows = tab === 'pending' ? pendingRows : solvedRows
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
  const supplierName = (id) => suppliers.find((s) => s.id === id)?.name

  const [editing, setEditing] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [actionError, setActionError] = useState('')
  async function act(c, fn) {
    setBusyId(c.id)
    setActionError('')
    try {
      await fn()
      await reload()
    } catch (e) {
      setActionError(e.message || 'Could not update the case.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        backTo="/"
        backLabel="Back to main page"
        title={current?.name}
        right={
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => reload()} aria-label="Refresh" className="w-12 px-0">
              <IconRefresh width={18} height={18} />
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

      {(error || actionError) && (
        <p className="rounded-xl bg-red-100 p-3 text-sm text-red-700">{error || actionError}</p>
      )}

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
              <Link to="/admin/companies" className="font-medium underline">
                link the numbers to a company
              </Link>
            </>
          )}
          .
        </p>
      )}

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
                    active
                      ? 'bg-brand text-white'
                      : t.key === 'pending' && n
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  {n}
                </span>
                {active && <span className="absolute inset-x-0 bottom-0 h-[3px] bg-brand" />}
              </button>
            )
          })}
        </div>

        {loading ? (
          <div className="flex justify-center py-16 text-brand">
            <Spinner className="h-7 w-7" />
          </div>
        ) : rows.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <p className="font-medium text-slate-700">
              {tab === 'pending' ? 'No pending cases' : 'No solved cases yet'}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {tab === 'pending'
                ? 'New WhatsApp reports from this company’s numbers appear here as cases.'
                : 'Cases marked as solved appear here.'}
            </p>
          </div>
        ) : (
          <>
            <CaseTableHeader solved={tab === 'solved'} />
            <div className="divide-y divide-slate-100">
              {rows.map((c) => (
                <CaseTableRow
                  key={c.id}
                  c={c}
                  urls={urls}
                  supplierName={supplierName(c.supplier_id)}
                  access={access}
                  busy={busyId === c.id}
                  onSolve={() => act(c, () => setCaseSolved(c.id, c.status !== 'solved'))}
                  onEdit={() => setEditing(c)}
                  onDelete={() =>
                    window.confirm(`Delete case ${caseNo(c)} and its WhatsApp messages? This cannot be undone.`) &&
                    act(c, () => deleteCase(c.id))
                  }
                />
              ))}
            </div>
          </>
        )}
      </Card>

      {editing && (
        <CaseEditModal
          c={editing}
          machines={machines}
          suppliers={suppliers}
          onClose={() => setEditing(null)}
          onSaved={reload}
        />
      )}

      {problems.length > 0 && (
        <div className="space-y-2">
          <button
            onClick={() => setShowProblems((v) => !v)}
            className="flex items-center gap-1.5 text-sm text-amber-700 hover:underline"
          >
            <IconWarning width={16} height={16} />
            {problems.length} WhatsApp message{problems.length > 1 ? 's' : ''} could not be saved or replied to
            {showProblems ? ' · hide' : ' · show'}
          </button>
          {showProblems && (
            <Card className="divide-y divide-slate-100 overflow-hidden text-sm">
              {problems.map((m) => (
                <div key={m.id} className="px-4 py-3">
                  <p className="font-medium text-slate-800">
                    {m.sender_name || formatSender(m.wa_from)} · {m.message_type} · {formatTime(m.received_at)}
                  </p>
                  <p className="mt-0.5 break-words text-red-700">{m.error_details || m.ack_error || m.status}</p>
                </div>
              ))}
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
