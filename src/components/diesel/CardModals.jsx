import { useState } from 'react'
import { Button, Modal } from '../ui.jsx'
import { F, inputCls, opt, toNum } from './shared.jsx'
import { CARD_STATUS, addReload, addUsage, personLabel, saveCard, vehicleLabel } from '../../lib/diesel.js'
import { today } from '../../lib/format.js'

// Fleet card dialogs (Diesel admins): the card itself, a reload (top-up) and a
// card fill-up (which card, which vehicle, which driver, litres, amount).

function useRun(onSaved, onClose) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const run = async (fn) => {
    setBusy(true)
    setError('')
    try {
      await fn()
      onSaved()
      onClose()
    } catch (e) {
      setError(e.message)
      setBusy(false)
    }
  }
  return { busy, error, run }
}

const Footer = ({ onClose, busy, ok, label = 'Save' }) => (
  <div className="flex justify-end gap-2 pt-1">
    <Button type="button" variant="secondary" size="sm" onClick={onClose}>
      Cancel
    </Button>
    <Button type="submit" size="sm" disabled={busy || !ok}>
      {busy ? 'Saving…' : label}
    </Button>
  </div>
)
const Err = ({ children }) => (children ? <p className="rounded-lg bg-red-100 p-2.5 text-sm text-red-700">{children}</p> : null)

export function CardModal({ company, card, vehicles, onClose, onSaved }) {
  const [f, setF] = useState(() => ({
    card_no: card?.card_no || '',
    provider: card?.provider || '',
    monthly_limit: card?.monthly_limit ?? '',
    status: card?.status || 'active',
    vehicle_id: card?.vehicle_id || '',
    notes: card?.notes || ''
  }))
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))
  const { busy, error, run } = useRun(onSaved, onClose)
  return (
    <Modal open onClose={onClose} title={card ? 'Edit card' : 'Add card'}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          run(() =>
            saveCard(company.id, {
              id: card?.id,
              card_no: f.card_no.trim(),
              provider: f.provider.trim() || null,
              monthly_limit: toNum(f.monthly_limit),
              status: f.status,
              vehicle_id: f.vehicle_id || null,
              notes: f.notes.trim() || null
            })
          )
        }}
        className="space-y-3"
      >
        <Err>{error}</Err>
        <div className="grid grid-cols-2 gap-3">
          <F label="Card no.">
            <input required maxLength={40} value={f.card_no} onChange={set('card_no')} className={inputCls} />
          </F>
          <F label="Provider">
            <input maxLength={40} value={f.provider} onChange={set('provider')} placeholder="Petronas / Shell" className={inputCls} />
          </F>
          <F label="Monthly limit (RM)">
            <input type="number" min="0" step="0.01" value={f.monthly_limit} onChange={set('monthly_limit')} placeholder="RM" className={inputCls} />
          </F>
          <F label="Status">
            <select value={f.status} onChange={set('status')} className={inputCls}>
              {opt(Object.entries(CARD_STATUS).map(([k, v]) => [k, v.label]))}
            </select>
          </F>
          <F label="Linked vehicle" hint="Vehicles ticked “KPDN diesel subsidy” in Machinery Profile are listed first." span>
            <select value={f.vehicle_id} onChange={set('vehicle_id')} className={inputCls}>
              {opt(
                [...vehicles]
                  .sort((a, b) => Number(Boolean(b.kpdn_subsidy)) - Number(Boolean(a.kpdn_subsidy)) || a.name.localeCompare(b.name))
                  .map((v) => [v.id, (v.kpdn_subsidy ? '★ ' : '') + vehicleLabel(v)]),
                'No vehicle linked'
              )}
            </select>
          </F>
          <F label="Notes" span>
            <input value={f.notes} onChange={set('notes')} className={inputCls} />
          </F>
        </div>
        <Footer onClose={onClose} busy={busy} ok={f.card_no.trim()} />
      </form>
    </Modal>
  )
}

export function ReloadModal({ company, cards, onClose, onSaved }) {
  const usable = cards.filter((c) => c.status !== 'cancelled')
  const [f, setF] = useState({ card_id: usable[0]?.id || '', reload_date: today(), amount: '', reference: '' })
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))
  const { busy, error, run } = useRun(onSaved, onClose)
  return (
    <Modal open onClose={onClose} title="Record reload">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          run(() =>
            addReload(company.id, {
              card_id: f.card_id,
              reload_date: f.reload_date,
              amount: Number(f.amount),
              reference: f.reference.trim() || null
            })
          )
        }}
        className="space-y-3"
      >
        <Err>{error}</Err>
        <F label="Card">
          <select required value={f.card_id} onChange={set('card_id')} className={inputCls}>
            {opt(usable.map((c) => [c.id, c.card_no + (c.provider ? ' · ' + c.provider : '')]))}
          </select>
        </F>
        <div className="grid grid-cols-2 gap-3">
          <F label="Date">
            <input type="date" required max={today()} value={f.reload_date} onChange={set('reload_date')} className={inputCls} />
          </F>
          <F label="Amount (RM)">
            <input type="number" min="0.01" step="0.01" required value={f.amount} onChange={set('amount')} className={inputCls} />
          </F>
        </div>
        <F label="Reference">
          <input maxLength={80} value={f.reference} onChange={set('reference')} placeholder="Receipt / transfer no." className={inputCls} />
        </F>
        <Footer onClose={onClose} busy={busy} ok={f.card_id && Number(f.amount) > 0} />
      </form>
    </Modal>
  )
}

export function UsageModal({ company, cards, vehicles, people, onClose, onSaved }) {
  const active = cards.filter((c) => c.status === 'active')
  const activeVehicles = vehicles.filter((v) => v.is_active)
  const [f, setF] = useState({
    card_id: active[0]?.id || '',
    vehicle_id: active[0]?.vehicle_id || activeVehicles[0]?.id || '',
    driver_id: '',
    fill_date: today(),
    odometer_km: '',
    litres: '',
    amount: '',
    station: ''
  })
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))
  const { busy, error, run } = useRun(onSaved, onClose)

  // Choosing a card jumps the vehicle to the one linked to that card.
  const pickCard = (e) => {
    const c = cards.find((x) => x.id === e.target.value)
    setF((x) => ({ ...x, card_id: e.target.value, vehicle_id: c?.vehicle_id || x.vehicle_id }))
  }

  return (
    <Modal open onClose={onClose} title="Record card fill-up">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          const card = cards.find((c) => c.id === f.card_id)
          if (
            card?.vehicle_id &&
            card.vehicle_id !== f.vehicle_id &&
            !window.confirm('This card is linked to another vehicle. Record it anyway?')
          )
            return
          run(() =>
            addUsage(company.id, {
              card_id: f.card_id,
              vehicle_id: f.vehicle_id,
              driver_id: f.driver_id || null,
              fill_date: f.fill_date,
              odometer_km: toNum(f.odometer_km),
              litres: Number(f.litres),
              amount: Number(f.amount),
              station: f.station.trim() || null
            })
          )
        }}
        className="space-y-3"
      >
        <Err>{error}</Err>
        <F label="Card">
          <select required value={f.card_id} onChange={pickCard} className={inputCls}>
            {opt(
              active.map((c) => [
                c.id,
                c.card_no + (c.vehicle_id ? ' · ' + vehicleLabel(vehicles.find((v) => v.id === c.vehicle_id)) : '')
              ])
            )}
          </select>
        </F>
        <F label="Vehicle">
          <select required value={f.vehicle_id} onChange={set('vehicle_id')} className={inputCls}>
            {opt(activeVehicles.map((v) => [v.id, vehicleLabel(v)]))}
          </select>
        </F>
        <F label="Driver">
          <select value={f.driver_id} onChange={set('driver_id')} className={inputCls}>
            {opt(
              people.filter((p) => p.has_access || p.is_super_admin).map((p) => [p.user_id, `${personLabel(p)} · ${p.email}`]),
              'Driver not recorded'
            )}
          </select>
        </F>
        <div className="grid grid-cols-2 gap-3">
          <F label="Date">
            <input type="date" required max={today()} value={f.fill_date} onChange={set('fill_date')} className={inputCls} />
          </F>
          <F label="Odometer (km)">
            <input type="number" min="0" step="1" value={f.odometer_km} onChange={set('odometer_km')} className={inputCls} />
          </F>
          <F label="Litres">
            <input type="number" min="0.01" step="0.01" required value={f.litres} onChange={set('litres')} className={inputCls} />
          </F>
          <F label="Amount (RM)">
            <input type="number" min="0" step="0.01" required value={f.amount} onChange={set('amount')} className={inputCls} />
          </F>
        </div>
        <F label="Station">
          <input maxLength={120} value={f.station} onChange={set('station')} className={inputCls} />
        </F>
        <Footer
          onClose={onClose}
          busy={busy}
          ok={f.card_id && f.vehicle_id && Number(f.litres) > 0 && f.amount !== '' && Number(f.amount) >= 0}
        />
      </form>
    </Modal>
  )
}
