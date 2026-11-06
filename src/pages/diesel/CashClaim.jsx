import { useCallback, useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import PageHeader from '../../components/PageHeader.jsx'
import { Button, Card } from '../../components/ui.jsx'
import { IconPlus } from '../../components/icons.jsx'
import { ClaimRow, Empty, ErrorBox, Loading, OwnClaimActions, ReceiptButton, Stats } from '../../components/diesel/shared.jsx'
import { ClaimModal } from '../../components/diesel/ClaimModal.jsx'
import { deleteClaim, listClaims, listVehicles, removeReceipt } from '../../lib/diesel.js'
import { money, num, sum, thisMonth } from '../../lib/format.js'
import { useAuth } from '../../auth/AuthContext.jsx'

// Cash Claim: my own fuel claims for the selected company. Pending claims can
// be edited or deleted; approved / paid ones are read-only.
export default function CashClaim() {
  const { company } = useOutletContext()
  const { user } = useAuth()
  const [claims, setClaims] = useState([])
  const [vehicles, setVehicles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [modal, setModal] = useState(null) // 'new' | claim
  const [busyId, setBusyId] = useState(null)

  const load = useCallback(async () => {
    try {
      const [c, v] = await Promise.all([listClaims(company.id, { mine: user.id }), listVehicles(company.id)])
      setClaims(c)
      setVehicles(v)
      setError('')
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [company.id, user.id])

  useEffect(() => {
    setLoading(true)
    load()
  }, [load])

  const vById = new Map(vehicles.map((v) => [v.id, v]))
  const month = thisMonth()
  const inMonth = claims.filter((c) => c.fill_date.startsWith(month) && c.status !== 'rejected')

  async function remove(c) {
    if (!window.confirm('Delete this claim? This cannot be undone.')) return
    setBusyId(c.id)
    try {
      await deleteClaim(c.id)
      removeReceipt(c.receipt_path)
      await load()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Cash Claim"
        subtitle={`${company.name} · your fuel claims`}
        right={
          <Button onClick={() => setModal('new')}>
            <IconPlus width={18} height={18} /> New claim
          </Button>
        }
      />
      <ErrorBox>{error}</ErrorBox>
      <Stats
        items={[
          ['Waiting for approval', claims.filter((c) => c.status === 'pending').length],
          ['Litres this month', num(sum(inMonth, 'litres')) + ' L'],
          ['Spent this month', money(sum(inMonth))],
          ['Approved, not yet paid', money(sum(claims.filter((c) => c.status === 'approved')))]
        ]}
      />
      <Card className="overflow-hidden">
        <div className="border-b border-slate-200 px-5 py-3">
          <p className="font-semibold text-slate-800">My claims</p>
        </div>
        {loading ? (
          <Loading />
        ) : claims.length === 0 ? (
          <Empty>No claims yet. Tap New claim after filling up.</Empty>
        ) : (
          <div className="divide-y divide-slate-100">
            {claims.map((c) => (
              <ClaimRow
                key={c.id}
                claim={c}
                vehicle={vById.get(c.vehicle_id)}
                actions={
                  <>
                    {c.receipt_path && <ReceiptButton path={c.receipt_path} />}
                    <OwnClaimActions claim={c} busy={busyId === c.id} onEdit={() => setModal(c)} onDelete={() => remove(c)} />
                  </>
                }
              />
            ))}
          </div>
        )}
      </Card>

      {modal && (
        <ClaimModal
          company={company}
          userId={user.id}
          vehicles={vehicles}
          claim={modal === 'new' ? null : modal}
          onClose={() => setModal(null)}
          onSaved={load}
        />
      )}
    </div>
  )
}
