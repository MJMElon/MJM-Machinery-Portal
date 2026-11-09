import { useMemo, useState } from 'react'
import { Button, Card } from '../ui.jsx'
import { F, inputCls, opt, toNum } from './shared.jsx'
import { insertClaim, lastOdometer, removeReceipt, updateClaim, uploadReceipt, vehicleLabel } from '../../lib/diesel.js'
import { money, today } from '../../lib/format.js'

// New / edit fuel claim form (a page, not a dialog): vehicle, date, odometer,
// litres, amount, station, receipt photo (required for a new claim), notes.
// The receipt is compressed on the phone and uploaded to the private bucket
// before the row is saved.
export function ClaimForm({ company, userId, vehicles, claim, onSaved, onCancel }) {
  const usable = useMemo(
    () => vehicles.filter((v) => v.is_active || (claim && v.id === claim.vehicle_id)),
    [vehicles, claim]
  )
  // Default vehicle: the one this person is the usual driver of (else none).
  const mine = usable.find((v) => v.driver_id === userId)
  const [f, setF] = useState(() => ({
    vehicle_id: claim ? claim.vehicle_id || '' : mine?.id || '',
    fill_date: claim?.fill_date || today(),
    odometer_km: claim?.odometer_km ?? '',
    litres: claim?.litres ?? '',
    amount: claim?.amount ?? '',
    station: claim?.station || '',
    notes: claim?.notes || ''
  }))
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))

  const litres = Number(f.litres)
  const amount = Number(f.amount)
  const ok = f.fill_date && litres > 0 && amount >= 0 && f.amount !== '' && (claim || file)

  async function submit(e) {
    e.preventDefault()
    if (!ok) return
    setBusy(true)
    setError('')
    try {
      const row = {
        vehicle_id: f.vehicle_id || null,
        fill_date: f.fill_date,
        odometer_km: toNum(f.odometer_km),
        litres,
        amount,
        station: f.station.trim() || null,
        notes: f.notes.trim() || null
      }
      // Odometer lower than the vehicle's last reading: ask first (likely a typo).
      if (row.odometer_km != null && row.vehicle_id) {
        const last = await lastOdometer(row.vehicle_id, row.fill_date)
        if (
          last != null &&
          last > row.odometer_km &&
          !window.confirm(`The last reading for this vehicle was ${last.toLocaleString()} km, which is higher than what you entered. Submit anyway?`)
        ) {
          setBusy(false)
          return
        }
      }
      if (file) row.receipt_path = await uploadReceipt(company.id, userId, file)
      try {
        if (claim) await updateClaim(claim.id, row)
        else await insertClaim(company.id, userId, row)
      } catch (err) {
        removeReceipt(row.receipt_path)
        throw err
      }
      if (claim && row.receipt_path && claim.receipt_path) removeReceipt(claim.receipt_path)
      onSaved()
    } catch (err) {
      setError(err.message || 'Could not save. Please try again.')
      setBusy(false)
    }
  }

  return (
    <Card className="mx-auto max-w-2xl p-5 sm:p-6">
      <form onSubmit={submit} className="space-y-4">
        {error && <p className="rounded-lg bg-red-100 p-2.5 text-sm text-red-700">{error}</p>}
        <F label="Vehicle" hint={mine ? `Your linked vehicle (${vehicleLabel(mine)}) is chosen for you; change it if needed.` : 'Optional. Vehicles are kept under Machinery Manage → Machinery Profile.'}>
          <select value={f.vehicle_id} onChange={set('vehicle_id')} className={inputCls}>
            {opt(usable.map((v) => [v.id, vehicleLabel(v)]), '— No vehicle —')}
          </select>
        </F>
        <div className="grid grid-cols-2 gap-3">
          <F label="Date">
            <input type="date" required max={today()} value={f.fill_date} onChange={set('fill_date')} className={inputCls} />
          </F>
          <F label="Odometer (km)">
            <input type="number" inputMode="numeric" min="0" step="1" value={f.odometer_km} onChange={set('odometer_km')} placeholder="km" className={inputCls} />
          </F>
          <F label="Litres">
            <input type="number" inputMode="decimal" min="0.01" step="0.01" required value={f.litres} onChange={set('litres')} className={inputCls} />
          </F>
          <F label="Claim amount (RM)">
            <input type="number" inputMode="decimal" min="0" step="0.01" required value={f.amount} onChange={set('amount')} placeholder="RM" className={inputCls} />
          </F>
        </div>
        {litres > 0 && amount > 0 && <p className="-mt-2 text-xs text-slate-500">{money(amount / litres)} per litre</p>}
        <F label="Station">
          <input maxLength={120} value={f.station} onChange={set('station')} placeholder="e.g. Petronas Jalan Ipoh" className={inputCls} />
        </F>
        <F
          label="Receipt"
          hint={claim?.receipt_path ? 'Leave empty to keep the current receipt.' : 'Take a photo of the receipt (or choose a PDF).'}
        >
          <input
            type="file"
            accept="image/*,application/pdf"
            capture="environment"
            required={!claim}
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-light file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand-dark"
          />
        </F>
        <F label="Notes">
          <textarea maxLength={500} rows={2} value={f.notes} onChange={set('notes')} className={`${inputCls} h-auto py-2`} />
        </F>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy || !ok}>
            {busy ? 'Saving…' : claim ? 'Save changes' : 'Submit claim'}
          </Button>
        </div>
      </form>
    </Card>
  )
}
