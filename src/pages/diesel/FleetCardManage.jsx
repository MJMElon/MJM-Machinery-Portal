import { useCallback, useEffect, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import PageHeader from '../../components/PageHeader.jsx'
import { Button, Card } from '../../components/ui.jsx'
import { IconPlus } from '../../components/icons.jsx'
import { FleetCardTile } from '../../components/diesel/FleetCardTile.jsx'
import { Empty, ErrorBox, Loading } from '../../components/diesel/shared.jsx'
import { StatementImportModal } from '../../components/diesel/StatementImport.jsx'
import { NewTopupModal } from '../../components/diesel/TopupRequests.jsx'
import { CARD_CHECKLIST, cardBalances, cardLedger, checklistDone, lastImports, listCardData, listVehicles } from '../../lib/diesel.js'
import { thisMonth } from '../../lib/format.js'

// Fleet Card Manage: every fleet card drawn as a small card (number, fuel
// station, vehicle, status) with this month's litres against the subsidy
// quota and the RM balance; click a card to open it. The dashed card with
// "+" starts a new fleet card. "Request top up" opens the New Top Up Request
// pop-up; the requests are approved in Claims Approval → Top-up requests.

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

  const load = useCallback(async () => {
    try {
      const [im, g] = await Promise.all([lastImports(company.id), loadCompany(company)])
      setImports(im)
      setGroups([g])
      setError('')
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [company])

  useEffect(() => {
    setLoading(true)
    load()
  }, [load])

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
            <Button variant="secondary" onClick={() => setAsking(true)}>
              <IconPlus width={18} height={18} /> Request top up
            </Button>
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
        <h3 className="mb-4 font-semibold text-slate-800">Fleet cards</h3>
        {loading ? (
          <Loading />
        ) : mineGroup && (mineGroup.cards.length || canAdd) ? (
          tiles(mineGroup, true)
        ) : (
          <Empty>No fleet cards in {company.name}.</Empty>
        )}
      </Card>
    </div>
  )
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
