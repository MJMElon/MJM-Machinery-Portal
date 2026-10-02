import { Link } from 'react-router-dom'
import PageHeader from '../../components/PageHeader.jsx'
import { Badge, Button, Card, EmptyState, Spinner } from '../../components/ui.jsx'
import { IconBuilding, IconChevron, IconRefresh } from '../../components/icons.jsx'
import { CaseCompactRow } from '../../components/CaseTable.jsx'
import { UNASSIGNED, useCases } from '../../lib/useCases.js'

// All companies at a glance (like Mission Control): one section per company
// with CMMS 2 access, each listing its pending cases.
export default function WorkConsolidated() {
  const { enabled, pending, urls, loading, error, reload, forCompany } = useCases()

  const sections = enabled.map((c) => ({ key: c.id, name: c.name, rows: forCompany(pending, c.id) }))
  const unassigned = forCompany(pending, UNASSIGNED)
  if (unassigned.length) sections.push({ key: UNASSIGNED, name: 'Unassigned numbers', rows: unassigned })
  const total = sections.reduce((n, s) => n + s.rows.length, 0)

  return (
    <div className="space-y-4">
      <PageHeader
        backTo="/cmms/work"
        backLabel="Back to Work Manage"
        title="Pending cases"
        subtitle={
          loading
            ? 'Loading…'
            : `${total} pending case${total === 1 ? '' : 's'} · ${enabled.length} compan${enabled.length === 1 ? 'y' : 'ies'}`
        }
        right={
          <Button size="sm" variant="secondary" onClick={() => reload()} aria-label="Refresh">
            <IconRefresh width={18} height={18} />
          </Button>
        }
      />

      {error && <p className="rounded-xl bg-red-100 p-3 text-sm text-red-700">{error}</p>}

      {loading ? (
        <div className="flex justify-center py-12 text-brand">
          <Spinner className="h-7 w-7" />
        </div>
      ) : sections.length === 0 ? (
        <EmptyState
          title="No companies with CMMS 2 yet"
          subtitle="Create a company and turn on CMMS 2 access in Settings."
          action={
            <Link to="/settings" className="font-medium text-brand hover:underline">
              Open Settings
            </Link>
          }
        />
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {sections.map((s) => (
            <Card key={s.key} className="flex flex-col overflow-hidden">
              <Link
                to={`/cmms/work?company=${s.key}`}
                className="flex items-center gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 hover:bg-slate-100"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-light text-brand">
                  <IconBuilding width={20} height={20} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold leading-tight text-slate-800">{s.name}</span>
                  <Badge className="mt-1" color={s.rows.length ? 'amber' : 'green'}>
                    {s.rows.length ? `${s.rows.length} pending` : 'All clear'}
                  </Badge>
                </span>
                <IconChevron width={18} height={18} className="text-slate-400" />
              </Link>
              {s.rows.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-slate-400">No pending cases</p>
              ) : (
                <div className="max-h-80 divide-y divide-slate-100 overflow-y-auto">
                  {s.rows.map((r) => (
                    <CaseCompactRow key={r.id} c={r} urls={urls} />
                  ))}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
