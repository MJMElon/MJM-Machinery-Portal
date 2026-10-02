import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import PageHeader from '../../components/PageHeader.jsx'
import { Button, Card, Select, Spinner } from '../../components/ui.jsx'
import { IconConsolidate, IconRefresh, IconWarning } from '../../components/icons.jsx'
import { CaseTableHeader, CaseTableRow } from '../../components/CaseTable.jsx'
import { formatSender, formatTime } from '../../lib/whatsapp.js'
import { UNASSIGNED, useCases } from '../../lib/useCases.js'

const TABS = [
  { key: 'pending', label: 'Pending case' },
  { key: 'solved', label: 'Solved case' }
]
const LAST_COMPANY_KEY = 'cmms.company'

// Maintenance Work Manage: one company's cases, split into Pending / Solved.
export default function WorkManage() {
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
        backTo="/"
        backLabel="Back to main page"
        title={company?.label}
        right={
          <div className="flex items-center gap-2">
            {options.length > 1 && (
              <div className="w-56 sm:w-72">
                <Select
                  aria-label="Company"
                  value={company?.key}
                  onChange={(e) => setParams({ company: e.target.value }, { replace: true })}
                >
                  {options.map((o) => (
                    <option key={o.key} value={o.key}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </div>
            )}
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

      {error && <p className="rounded-xl bg-red-100 p-3 text-sm text-red-700">{error}</p>}

      {company?.key === UNASSIGNED && !loading && (
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
          These senders are not linked to a company yet. Add their WhatsApp numbers to a company in{' '}
          <Link to="/settings" className="font-medium underline">
            Settings
          </Link>
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
            <CaseTableHeader />
            <div className="divide-y divide-slate-100">
              {rows.map((c) => (
                <CaseTableRow key={c.id} c={c} urls={urls} />
              ))}
            </div>
          </>
        )}
      </Card>

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
