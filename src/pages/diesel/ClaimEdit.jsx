import { useEffect, useState } from 'react'
import { useNavigate, useOutletContext, useParams } from 'react-router-dom'
import PageHeader from '../../components/PageHeader.jsx'
import { ErrorBox, Loading } from '../../components/diesel/shared.jsx'
import { ClaimForm } from '../../components/diesel/ClaimForm.jsx'
import { getClaim, getClaimLines, listClaimCards, listVehicles } from '../../lib/diesel.js'
import { useAuth } from '../../auth/AuthContext.jsx'
import { claimNo } from './DieselClaims.jsx'

// New claim (/diesel/claims/new) and edit claim (/diesel/claims/:id/edit) pages.
export default function ClaimEdit() {
  const { company } = useOutletContext()
  const { user } = useAuth()
  const { id } = useParams()
  const navigate = useNavigate()
  const [vehicles, setVehicles] = useState(null)
  const [cards, setCards] = useState([])
  const [claim, setClaim] = useState(null)
  const [lines, setLines] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    // Fleet cards are optional (older database without them: no reload rows, nothing else changes)
    Promise.all([listVehicles(company.id), id ? getClaim(id) : null, id ? getClaimLines(id) : [], listClaimCards(company.id).catch(() => [])])
      .then(([v, c, ls, cs]) => {
        if (!active) return
        if (id && !c) setError('Claim not found.')
        if (id && c && (c.claimant_id !== user.id || c.status !== 'pending')) setError('Only your own pending claims can be edited.')
        setVehicles(v)
        setCards(cs)
        setClaim(c)
        setLines(ls)
      })
      .catch((e) => active && setError(e.message))
    return () => {
      active = false
    }
  }, [company.id, id, user.id])

  return (
    <div className="space-y-4">
      <PageHeader
        backTo={id ? `/diesel/claims/${id}` : '/diesel/claims'}
        backLabel={id ? 'Back to claim' : 'Back to claim list'}
        title={id ? `Edit fuel claim ${claim ? claimNo(claim, 0) : ''}` : 'New fuel claim'}
      />
      <ErrorBox>{error}</ErrorBox>
      {!vehicles || lines === null ? (
        <Loading />
      ) : error ? null : (
        <ClaimForm
          company={company}
          user={user}
          vehicles={vehicles}
          cards={cards}
          claim={claim}
          lines={lines}
          onSaved={(savedId) => navigate(`/diesel/claims/${savedId}`, { replace: true })}
          onCancel={() => navigate(id ? `/diesel/claims/${id}` : '/diesel/claims')}
        />
      )}
    </div>
  )
}
