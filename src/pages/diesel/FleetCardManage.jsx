import { useCallback, useEffect, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import PageHeader from '../../components/PageHeader.jsx'
import { Button, Card } from '../../components/ui.jsx'
import { IconConsolidate, IconPlus } from '../../components/icons.jsx'
import { FleetCardTile } from '../../components/diesel/FleetCardTile.jsx'
import { Empty, ErrorBox, Loading } from '../../components/diesel/shared.jsx'
import { StatementImportModal } from '../../components/diesel/StatementImport.jsx'
import { NewTopupModal } from '../../components/diesel/TopupRequests.jsx'
import { CARD_CHECKLIST, cardBalances, cardLedger, checklistDone, lastImports, listCardData, listVehicles } from '../../lib/diesel.js'
import { thisMonth } from '../../lib/format.js'
import { useCompany } from '../../lib/CompanyContext.jsx'

// Fleet Card Manage (tabs Active / Inactive: inactive and cancelled cards are
// kept for their history and listed apart): every fleet card drawn as a small card (number, fuel
// station, vehicle, status) with this month's litres against the subsidy
// quota and the RM balance; click a card to open it. The dashed card with
// "+" starts a new fleet card. "Request top up" opens the New Top Up Request
// pop-up; the requests are approved in Claims Approval → Pending approval.
// Procurement (Fuel Manage role) also gets "Consolidate": the fleet cards of
// every company of the same business on one page, each card with the
// company's short name in front of its number; cards of another company
// open read-only (?co=).

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
  const [groups, setGroups] = useState([]) // [{ company, cards, usage, vehicles, ledger }]
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [imports, setImports] = useState(null) // statement import available (migration 20261212)
  const [importing, setImporting] = useState(false)
  const [asking, setAsking] = useState(false)
  const [sent, setSent] = useState('')

  const { companies } = useCompany()
  const [consolidate, setConsolidate] = useState(readFlag)
  // Companies under the same business as this one (active, with Fuel Manage)
  const sisters = (companies || []).filter(
    (c) => c.id !== company.id && c.is_active !== false && c.diesel_enabled && (c.business_ids || []).some((b) => (company.business_ids || []).includes(b))
  )
  const sisterKey = sisters.map((c) => c.id).join(',')
  const canConsolidate = Boolean(access.procurement) && sisters.length > 0
  const showAll = canConsolidate && consolidate

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

  function toggle(on) {
    setConsolidate(on)
    try {
      localStorage.setItem(CONSOLIDATE_KEY, on ? '1' : '0')
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    setLoading(true)
    load()
  }, [load])

  // Tabs: Active (in use, applying, blocked) | Inactive (inactive or cancelled cards, kept for their history)
  const [view, setView] = useState('active')
  const isOff = (c) => ['inactive', 'cancelled'].includes(c.status)
  const inView = (c) => (view === 'inactive' ? isOff(c) : !isOff(c))
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
    const cards = g.cards.filter(inView).sort((a, b) => String(a.card_no || 'zz').localeCompare(String(b.card_no || 'zz')))
    return (
      <div className={grid}>
        {cards.map((c) => (
          <FleetCardTile
            key={c.id}
            card={c}
            to={own ? `/diesel/cards/${c.id}${showAll ? '?cons=1' : ''}` : `/diesel/cards/${c.id}?co=${g.company.id}&cons=1`}
            companyTag={showAll ? shortName(g.company) : null}
            vehicle={c.vehicle_id ? vById.get(c.vehicle_id)?.reg_no || vById.get(c.vehicle_id)?.name : null}
            usedL={usedLitres(c.id)}
            balance={g.ledger ? balance[c.id] || 0 : null}
            checklist={`${checklistDone(c)} / ${CARD_CHECKLIST.length}`}
          />
        ))}
        {own && canAdd && view === 'active' && <AddCardTile />}
      </div>
    )
  }

  const mineGroup = groups.find((g) => g.company.id === company.id)
  const others = groups.filter((g) => g.company.id !== company.id && g.cards.some(inView))
  const count = (pick) => groups.reduce((n, g) => n + g.cards.filter(pick).length, 0)
  const mineShown = mineGroup ? mineGroup.cards.filter(inView).length : 0

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
            {/* Consolidate: an icon button that shows the fleet cards of every company of this business too */}
            {canConsolidate && (
              <button
                type="button"
                onClick={() => toggle(!showAll)}
                aria-pressed={showAll}
                title={showAll ? 'Consolidate is on: fleet cards of every company. Click to show this company only' : 'Consolidate: show the fleet cards of every company'}
                aria-label="Consolidate"
                className={`flex h-12 w-12 items-center justify-center rounded-xl border ${showAll ? 'border-brand bg-brand text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}
              >
                <IconConsolidate width={20} height={20} />
              </button>
            )}
            {/* Only Procurement (and super admins) request top-ups */}
            {access.procurement && (
              <Button variant="secondary" onClick={() => setAsking(true)}>
                <IconPlus width={18} height={18} /> Request top up
              </Button>
            )}
          </div>
        }
      />
      <ErrorBox>{error}</ErrorBox>
      {sent && <p className="rounded-xl bg-green-50 px-3 py-2 text-sm font-medium text-green-800">{sent}</p>}
      {importing && <StatementImportModal company={company} onClose={() => setImporting(false)} onDone={load} />}
      {asking && (
        <NewTopupModal
          company={company}
          onClose={() => setAsking(false)}
          onSent={(msg) => {
            setSent(msg)
            load()
          }}
        />
      )}

      <Card className="p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold text-slate-800">Fleet cards</h3>
          <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-0.5 text-sm" role="tablist" aria-label="Which fleet cards">
            {[
              ['active', 'Active', count((c) => !isOff(c))],
              ['inactive', 'Inactive', count(isOff)]
            ].map(([k, label, n]) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={view === k}
                onClick={() => setView(k)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1 font-medium ${view === k ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
              >
                {label}
                <span className={`rounded-full px-1.5 text-[11px] font-semibold tabular-nums ${view === k ? 'bg-slate-100 text-slate-600' : 'text-slate-400'}`}>{n}</span>
              </button>
            ))}
          </div>
        </div>
        {loading ? (
          <Loading />
        ) : (
          <div className="space-y-6">
            {mineGroup && (mineShown || (canAdd && view === 'active')) ? (
              <section>
                {showAll && <GroupTitle company={mineGroup.company} />}
                {tiles(mineGroup, true)}
              </section>
            ) : (
              <Empty>{view === 'inactive' ? `No inactive fleet cards in ${company.name}.` : `No fleet cards in ${company.name}.`}</Empty>
            )}
            {showAll &&
              others.map((g) => (
                <section key={g.company.id}>
                  <GroupTitle company={g.company} />
                  {tiles(g, false)}
                </section>
              ))}
            {showAll && others.length === 0 && (
              <p className="text-sm text-slate-400">No {view === 'inactive' ? 'inactive ' : ''}fleet cards you can see in the other companies of this business.</p>
            )}
          </div>
        )}
      </Card>
    </div>
  )
}

const shortName = (c) => c.short_name || c.code || c.name

// Consolidate view: just the company name above its cards.
function GroupTitle({ company }) {
  return <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{company.name}</p>
}

// A dashed, see-through card with "+": starts a new fleet card.
function AddCardTile() {
  return (
    <Link
      to="/diesel/cards/new"
      className="group flex aspect-[1.586] flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-slate-300 bg-white/40 text-slate-400 transition hover:border-brand hover:bg-brand/5 hover:text-brand"
      title="New fleet card"
    >
      {/* a drawn plus, so it sits exactly in the middle of the circle (a "+" letter does not) */}
      <span className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-current">
        <IconPlus width={18} height={18} strokeWidth={2.5} />
      </span>
      <span className="px-2 text-center text-[11px] font-semibold">New fleet card</span>
    </Link>
  )
}
