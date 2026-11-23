import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useOutletContext } from 'react-router-dom'
import PageHeader from '../../components/PageHeader.jsx'
import { Button, Card } from '../../components/ui.jsx'
import { IconPlus } from '../../components/icons.jsx'
import { FleetCardTile } from '../../components/diesel/FleetCardTile.jsx'
import { Empty, ErrorBox, Loading } from '../../components/diesel/shared.jsx'
import { StatementImportModal } from '../../components/diesel/StatementImport.jsx'
import { CARD_CHECKLIST, cardBalances, cardLedger, checklistDone, lastImports, listCardData, listVehicles } from '../../lib/diesel.js'
import { useCompany } from '../../lib/CompanyContext.jsx'
import { companyLabel } from '../../lib/companies.js'
import { thisMonth } from '../../lib/format.js'

// Fleet Card Manage: every fleet card drawn as a small card (number, fuel
// station, vehicle, status) with this month's litres against the subsidy
// quota and the RM balance; click a card to open it. The dashed card with
// "+" starts a new fleet card application. "Consolidate" shows the cards of
// every company under the same business (those the person may see), each
// company on its own row; cards of another company open read-only.

const CONSOLIDATE_KEY = 'fuel.cards.consolidate'
const readFlag = () => {
  try {
    return localStorage.getItem(CONSOLIDATE_KEY) === '1'
  } catch {
    return false
  }
}

async function loadCompany(co) {
  const [d, v, lg] = await Promise.all([
    listCardData(co.id, thisMonth() + '-01').catch(() => ({ cards: [], usage: [] })),
    listVehicles(co.id).catch(() => []),
    cardLedger(co.id).catch(() => null)
  ])
  return { company: co, cards: d.cards, usage: d.usage, vehicles: v, ledger: lg }
}

export default function FleetCardManage() {
  const { company, access } = useOutletContext()
  const { companies } = useCompany()
  const navigate = useNavigate()
  const [groups, setGroups] = useState([]) // [{ company, cards, usage, vehicles, ledger }], this company first
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [imports, setImports] = useState(null) // statement import available (migration 20261212)
  const [importing, setImporting] = useState(false)
  const [consolidate, setConsolidate] = useState(readFlag)

  // Companies under the same business as this one (active, with Fuel Manage)
  const sisters = companies.filter(
    (c) =>
      c.id !== company.id &&
      c.is_active !== false &&
      c.diesel_enabled &&
      (c.business_ids || []).some((b) => (company.business_ids || []).includes(b))
  )
  const sisterKey = sisters.map((c) => c.id).join(',')
  const showAll = consolidate && sisters.length > 0

  const load = useCallback(async () => {
    try {
      const list = [company, ...(showAll ? sisters : [])]
      const [im, ...loaded] = await Promise.all([lastImports(company.id), ...list.map(loadCompany)])
      setImports(im)
      setGroups(loaded)
      setError('')
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [company, showAll, sisterKey]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setLoading(true)
    load()
  }, [load])

  function toggle(on) {
    setConsolidate(on)
    try {
      localStorage.setItem(CONSOLIDATE_KEY, on ? '1' : '0')
    } catch {
      /* ignore */
    }
  }

  const month = thisMonth()
  const canAdd = access.can('cards', 'add')
  const grid = 'grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 2xl:grid-cols-7'

  const tiles = (g, own) => {
    const vById = new Map(g.vehicles.map((v) => [v.id, v]))
    const balance = cardBalances(g.ledger)
    // Litres used on the card this month: from the card balance ledger when available
    const usedLitres = (cid) =>
      g.ledger
        ? g.ledger.filter((r) => r.card_id === cid && r.kind === 'usage' && r.month === month).reduce((s, r) => s + Number(r.litres || 0), 0)
        : g.usage.filter((u) => u.card_id === cid && u.fill_date.startsWith(month)).reduce((s, u) => s + Number(u.litres || 0), 0)
    const cards = [...g.cards].sort(
      (a, b) =>
        ['cancelled', 'inactive'].includes(a.status) - ['cancelled', 'inactive'].includes(b.status) ||
        String(a.card_no || 'zz').localeCompare(String(b.card_no || 'zz'))
    )
    return (
      <div className={grid}>
        {cards.map((c) => (
          <FleetCardTile
            key={c.id}
            card={c}
            to={own ? `/diesel/cards/${c.id}` : `/diesel/cards/${c.id}?co=${g.company.id}`}
            vehicle={c.vehicle_id ? vById.get(c.vehicle_id)?.reg_no || vById.get(c.vehicle_id)?.name : null}
            usedL={usedLitres(c.id)}
            balance={g.ledger ? balance[c.id] || 0 : null}
            checklist={`${checklistDone(c)} / ${CARD_CHECKLIST.length}`}
          />
        ))}
        {own && canAdd && <AddCardTile />}
      </div>
    )
  }

  const mineGroup = groups.find((g) => g.company.id === company.id)
  const others = groups.filter((g) => g.company.id !== company.id && g.cards.length)

  return (
    <div className="space-y-5">
      <PageHeader
        right={
          <div className="flex flex-wrap gap-2">
            {access.can('cards', 'edit') && imports && (
              <Button variant="secondary" onClick={() => setImporting(true)}>
                Import statement
              </Button>
            )}
            <Button variant="secondary" onClick={() => navigate('/diesel/cards/topup')}>
              <IconPlus width={18} height={18} /> Request top up
            </Button>
          </div>
        }
      />
      <ErrorBox>{error}</ErrorBox>
      {importing && <StatementImportModal company={company} onClose={() => setImporting(false)} onDone={load} />}

      <Card className="p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold text-slate-800">Fleet cards</h3>
          {sisters.length > 0 && (
            <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-0.5 text-sm" role="group" aria-label="Which fleet cards">
              {[
                [false, companyLabel(company)],
                [true, 'Consolidate']
              ].map(([on, label]) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => toggle(on)}
                  aria-pressed={showAll === on}
                  className={`rounded-lg px-3 py-1 font-medium ${showAll === on ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
        {loading ? (
          <Loading />
        ) : (
          <div className="space-y-6">
            {mineGroup && (mineGroup.cards.length || canAdd) ? (
              <section>
                {showAll && <GroupTitle name={mineGroup.company.name} count={mineGroup.cards.length} />}
                {tiles(mineGroup, true)}
              </section>
            ) : (
              <Empty>No fleet cards in {company.name}.</Empty>
            )}
            {showAll &&
              others.map((g) => (
                <section key={g.company.id}>
                  <GroupTitle name={g.company.name} count={g.cards.length} />
                  {tiles(g, false)}
                </section>
              ))}
            {showAll && others.length === 0 && <p className="text-sm text-slate-400">No fleet cards you can see in the other companies of this business.</p>}
          </div>
        )}
      </Card>
    </div>
  )
}

function GroupTitle({ name, count }) {
  return (
    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
      {name} <span className="font-normal normal-case tracking-normal text-slate-400">· {count} card{count === 1 ? '' : 's'}</span>
    </p>
  )
}

// A dashed, see-through card with "+": starts a new fleet card application.
function AddCardTile() {
  return (
    <Link
      to="/diesel/cards/new"
      className="group flex aspect-[1.586] flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-slate-300 bg-white/40 text-slate-400 transition hover:border-brand hover:bg-brand/5 hover:text-brand"
      title="New fleet card application"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-current text-2xl leading-none">+</span>
      <span className="px-2 text-center text-[11px] font-semibold">New fleet card application</span>
    </Link>
  )
}
