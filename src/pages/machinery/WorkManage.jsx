import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import PageHeader from '../../components/PageHeader.jsx'
import { Button, Card, EmptyState, Select, Spinner } from '../../components/ui.jsx'
import { IconConsolidate, IconRefresh, IconWarning } from '../../components/icons.jsx'
import { CaseRow } from '../../components/CaseRow.jsx'
import { UNASSIGNED, useCases } from '../../lib/useCases.js'

const TABS = [
  { key: 'pending', label: 'Pending case' },
  { key: 'solved', label: 'Solved case' }
]
const LAST_COMPANY_KEY = 'cmms.company'

// Maintenance Work Manage: one company's cases, split into Pending / Solved.
export default function WorkManage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [tab, setTab] = useState('pending')
  const [showProblems, setShowProblems] = useState(false)
  const { enabled, pending, solved, problems, urls, loading, error, reload, forCompany } = useCases()

  // Company options: companies with CMMS 2 access, then senders not linked to any company.
  const options = useMemo(() => {
    const list = enabled.map((c) => ({ key: c.id, label: c.name }))
    const hasUnassigned = forCompany([...pending, ...solved], UNASSIGNED).length > 0
    if (hasUnassigned || list.length === 0) list.push({ key: UNASSIGNED, label: 'Unassigned numbers' })
    return list
  }, [enabled, pending, solved, forCompany])

  const wanted = params.get('company') || readLast()
  const company = options.find((o) => o.key === wanted) || options[0]

  useEffect(() => {
    if (company) writeLast(company.key)
  }, [company])

  const pendingRows = company ? forCompany(pending, company.key) : []
  const solvedRows = company ? forCompany(solved, company.key) : []
  const rows = tab === 'pending' ? pendingRows : solvedRows

  return (
    <div className="space-y-4">
      <PageHeader
        title="Maintenance Work Manage"
        subtitle={company ? company.label : 'CMMS 2'}
        onBack={() => navigate('/cmms')}
        right={
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={() => reload()} aria-label="Refresh">
              <IconRefresh width={18} height={18} />
            </Button>
            <Link
              to="/cmms/work/all"
              title="All companies (consolidated view)"
              className="inline-flex h-9 items-center gap-2 rounded-xl bg-brand px-3 text-sm font-medium text-white hover:bg-brand-dark"
            >
              <IconConsolidate width={20} height={20} />
              <span className="hidden sm:inline">All companies</span>
            </Link>
          </div>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex gap-1 rounded-xl bg-white p-1 shadow-sm ring-1 ring-slate-200">
          {TABS.map((t) => {
            const n = t.key === 'pending' ? pendingRows.length : solvedRows.length
            const active = tab === t.key
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-medium transition ${
                  active ? 'bg-brand text-white' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {t.label}
                <span
                  className={`rounded-full px-2 text-xs ${active ? 'bg-white/20' : t.key === 'pending' && n ? 'bg-amber-100 text-amber-700' : 'bg-slate-100'}`}
                >
                  {n}
                </span>
              </button>
            )
          })}
        </div>

        {options.length > 1 && (
          <label className="flex items-center gap-2 text-sm text-slate-600 sm:w-80">
            <span className="shrink-0">Company</span>
            <span className="flex-1">
              <Select value={company?.key} onChange={(e) => setParams({ company: e.target.value }, { replace: true })}>
                {options.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </span>
          </label>
        )}
      </div>

      {error && <p className="rounded-xl bg-red-100 p-3 text-sm text-red-700">{error}</p>}

      {company?.key === UNASSIGNED && !loading && (
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
          These senders are not linked to a company yet. Add their WhatsApp numbers to a company in{' '}
          <Link to="/settings" className="font-medium underline">
            Company Settings
          </Link>
          .
        </p>
      )}

      {loading ? (
        <div className="flex justify-center py-12 text-brand">
          <Spinner className="h-7 w-7" />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          title={tab === 'pending' ? 'No pending cases' : 'No solved cases yet'}
          subtitle={
            tab === 'pending'
              ? 'WhatsApp texts and photos from this company’s numbers appear here.'
              : 'Cases marked as solved appear here.'
          }
        />
      ) : (
        <Card className="divide-y divide-slate-100 overflow-hidden">
          {rows.map((r) => (
            <CaseRow key={r.id} row={r} url={urls[r.storage_path]} />
          ))}
        </Card>
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
            <Card className="divide-y divide-slate-100 overflow-hidden">
              {problems.map((r) => (
                <CaseRow key={r.id} row={r} url={urls[r.storage_path]} />
              ))}
            </Card>
          )}
        </div>
      )}
    </div>
  )
}

function readLast() {
  try {
    return localStorage.getItem(LAST_COMPANY_KEY)
  } catch {
    return null
  }
}

function writeLast(key) {
  try {
    localStorage.setItem(LAST_COMPANY_KEY, key)
  } catch {
    // ignore (private mode)
  }
}
