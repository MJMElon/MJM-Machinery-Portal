import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import PageHeader from '../../components/PageHeader.jsx'
import { Button, Card } from '../../components/ui.jsx'
import { IconPlus } from '../../components/icons.jsx'
import { FleetCardTile } from '../../components/diesel/FleetCardTile.jsx'
import { Empty, ErrorBox, Loading } from '../../components/diesel/shared.jsx'
import { CARD_CHECKLIST, cardBalances, cardLedger, checklistDone, listCardData, listVehicles } from '../../lib/diesel.js'
import { thisMonth } from '../../lib/format.js'

// Fleet Card Manage: every fleet card drawn as a card (number, fuel station,
// vehicle, status), with this month's litres against the subsidy quota and
// the RM balance under it; click a card to manage it. "Request top up" and
// "New fleet card application" stay on top.
export default function FleetCardManage() {
  const { company, access } = useOutletContext()
  const navigate = useNavigate()
  const [data, setData] = useState({ cards: [], usage: [] })
  const [vehicles, setVehicles] = useState([])
  const [ledger, setLedger] = useState(null) // null until the database has machinery_card_ledger
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const [d, v, lg] = await Promise.all([listCardData(company.id, thisMonth() + '-01'), listVehicles(company.id), cardLedger(company.id).catch(() => null)])
      setData(d)
      setVehicles(v)
      setLedger(lg)
      setError('')
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [company.id])

  useEffect(() => {
    setLoading(true)
    load()
  }, [load])

  const vById = new Map(vehicles.map((v) => [v.id, v]))
  const month = thisMonth()
  // Litres used on the card this month: from the card balance ledger (fuel-claim receipts + fill-ups on the card) when available
  const usedLitres = (cid) =>
    ledger
      ? ledger.filter((r) => r.card_id === cid && r.kind === 'usage' && r.month === month).reduce((s, r) => s + Number(r.litres || 0), 0)
      : data.usage.filter((u) => u.card_id === cid && u.fill_date.startsWith(month)).reduce((s, u) => s + Number(u.litres || 0), 0)
  const balance = cardBalances(ledger)
  const cards = [...data.cards].sort((a, b) => ['cancelled', 'inactive'].includes(a.status) - ['cancelled', 'inactive'].includes(b.status) || String(a.card_no || 'zz').localeCompare(String(b.card_no || 'zz')))

  return (
    <div className="space-y-5">
      <PageHeader
        right={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => navigate('/diesel/cards/topup')}>
              <IconPlus width={18} height={18} /> Request top up
            </Button>
            {access.can('cards', 'add') && (
              <Button onClick={() => navigate('/diesel/cards/new')}>
                <IconPlus width={18} height={18} /> New fleet card application
              </Button>
            )}
          </div>
        }
      />
      <ErrorBox>{error}</ErrorBox>

      <Card className="p-4 sm:p-5">
        <h3 className="mb-4 font-semibold text-slate-800">
          Fleet cards <span className="font-normal text-slate-500">· {company.name}</span>
        </h3>
        {loading ? (
          <Loading />
        ) : cards.length === 0 ? (
          <Empty>
            No fleet cards in {company.name}. If your cards are under another company, switch company at the top of CMMS 2.
            {access.can('cards', 'add') ? ' Or start with New fleet card application.' : ''}
          </Empty>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {cards.map((c) => (
              <FleetCardTile
                key={c.id}
                card={c}
                vehicle={c.vehicle_id ? vById.get(c.vehicle_id)?.reg_no || vById.get(c.vehicle_id)?.name : null}
                usedL={usedLitres(c.id)}
                balance={ledger ? balance[c.id] || 0 : null}
                checklist={`${checklistDone(c)} / ${CARD_CHECKLIST.length}`}
              />
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
