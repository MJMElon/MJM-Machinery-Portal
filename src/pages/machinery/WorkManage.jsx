import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import PageHeader from '../../components/PageHeader.jsx'
import { Button, Card, Spinner } from '../../components/ui.jsx'
import { IconConsolidate, IconRefresh } from '../../components/icons.jsx'
import { CaseTableHeader, CaseTableRow } from '../../components/CaseTable.jsx'
import { UNASSIGNED, useCases } from '../../lib/useCases.js'
import { useAuth } from '../../auth/AuthContext.jsx'
import { useCompany } from '../../lib/CompanyContext.jsx'
import { CaseEditModal } from '../../components/CaseEditModal.jsx'
import { caseNo } from '../../lib/cases.js'
import { closeCase, deleteCase, listMachines, listSuppliers, setCasePinned, useCmmsAccess } from '../../lib/cmms.js'
import { CaseWorkflowModal } from '../../components/CaseWorkflowModal.jsx'

const TABS = [
  { key: 'pending', label: 'Pending case' },
  { key: 'solved', label: 'Solved case' }
]

// Maintenance Work Manage: one company's cases, split into Pending / Solved.
export default function WorkManage() {
  const { isSuperAdmin } = useAuth()
  const { current } = useCompany()
  const [tab, setTab] = useState('pending')
  const { pending, solved, urls, loading, error, reload, forCompany } = useCases()

  // The company chosen in the top bar; its cases only if it has CMMS 2.
  const key = current?.cmms_enabled ? current.id : null
  // Pinned cases (max 3) stay on top, newest pin first.
  const pendingRows = (key ? forCompany(pending, key) : []).sort(
    (a, b) =>
      Number(Boolean(b.pinned_at)) - Number(Boolean(a.pinned_at)) ||
      (b.pinned_at || '').localeCompare(a.pinned_at || '')
  )
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
  const [working, setWorking] = useState(null) // case open in the Solve window
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
        title="Maintenance Work Manage"
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
                  onSolve={() =>
                    c.status === 'solved'
                      ? window.confirm(`Reopen case ${caseNo(c)}?`) && act(c, () => closeCase(c.id, false))
                      : setWorking(c)
                  }
                  onPin={() => act(c, () => setCasePinned(c.id, !c.pinned_at))}
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

      {editing && (
        <CaseEditModal
          c={editing}
          machines={machines}
          suppliers={suppliers}
          onClose={() => setEditing(null)}
          onSaved={reload}
        />
      )}
    </div>
  )
}
