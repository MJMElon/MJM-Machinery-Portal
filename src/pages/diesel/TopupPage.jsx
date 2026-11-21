import { useCallback, useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import PageHeader from '../../components/PageHeader.jsx'
import { Button } from '../../components/ui.jsx'
import { IconPlus } from '../../components/icons.jsx'
import { ErrorBox, Loading } from '../../components/diesel/shared.jsx'
import { RequestTopupModal, TopupSection } from '../../components/diesel/TopupRequests.jsx'
import { cardBalances, cardLedger, listCardData, listPeople, listTopups, listVehicles } from '../../lib/diesel.js'
import { useAuth } from '../../auth/AuthContext.jsx'

// Fleet card top-up requests (/diesel/cards/topup), opened from "Request top
// up" in Fleet Card Manage: the request form and the requests (To approve /
// To top up / My requests / All).
export default function TopupPage() {
  const { company, access } = useOutletContext()
  const { user } = useAuth()
  const [cards, setCards] = useState([])
  const [vehicles, setVehicles] = useState([])
  const [people, setPeople] = useState([])
  const [ledger, setLedger] = useState(null)
  const [topups, setTopups] = useState(null) // null until the database has the top-up requests
  const [asking, setAsking] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const [d, v, lg, tu, pp] = await Promise.all([
        listCardData(company.id),
        listVehicles(company.id),
        cardLedger(company.id).catch(() => null),
        listTopups(company.id).catch(() => null),
        listPeople(company.id).catch(() => [])
      ])
      setCards(d.cards)
      setVehicles(v)
      setLedger(lg)
      setTopups(tu)
      setPeople(pp)
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
  const balance = ledger ? cardBalances(ledger) : null

  return (
    <div className="space-y-5">
      <PageHeader
        backTo="/diesel/cards"
        backLabel="Back to fleet card list"
        title="Fleet card top up"
        right={
          topups && (
            <Button onClick={() => setAsking(true)}>
              <IconPlus width={18} height={18} /> Request top up
            </Button>
          )
        }
      />
      <ErrorBox>{error}</ErrorBox>
      {loading ? (
        <Loading />
      ) : topups === null ? (
        <p className="text-sm text-slate-500">Run the Fuel SQL migration 20261206 (fleet card top-up requests) to turn top-up requests on.</p>
      ) : (
        <TopupSection
          company={company}
          access={access}
          me={user?.id}
          topups={topups}
          cards={cards}
          vById={vById}
          person={new Map(people.map((p) => [p.user_id, p]))}
          balance={balance}
          onChanged={load}
          onError={setError}
        />
      )}
      {asking && <RequestTopupModal company={company} cards={cards} vById={vById} balance={balance} onClose={() => setAsking(false)} onSaved={load} />}
    </div>
  )
}
