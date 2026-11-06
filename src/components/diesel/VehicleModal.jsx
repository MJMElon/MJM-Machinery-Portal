import { useState } from 'react'
import { Button, Modal } from '../ui.jsx'
import { IconTrash } from '../icons.jsx'
import { F, inputCls, opt, toNum } from './shared.jsx'
import { FUEL_TYPES, VEHICLE_TYPES, deleteVehicle, personLabel, saveVehicle } from '../../lib/diesel.js'

// Add / edit a vehicle (Diesel admins). The usual driver's claims default to it.
export function VehicleModal({ company, vehicle, people, onClose, onSaved }) {
  const [f, setF] = useState(() => ({
    plate_no: vehicle?.plate_no || '',
    name: vehicle?.name || '',
    vehicle_type: vehicle?.vehicle_type || 'pickup',
    fuel_type: vehicle?.fuel_type || 'diesel',
    tank_capacity_l: vehicle?.tank_capacity_l ?? '',
    status: vehicle?.status || 'active',
    driver_id: vehicle?.driver_id || '',
    notes: vehicle?.notes || ''
  }))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))

  async function run(fn) {
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

  const save = (e) => {
    e.preventDefault()
    run(() =>
      saveVehicle(company.id, {
        id: vehicle?.id,
        plate_no: f.plate_no.trim().toUpperCase().replace(/\s+/g, ' '),
        name: f.name.trim() || null,
        vehicle_type: f.vehicle_type,
        fuel_type: f.fuel_type,
        tank_capacity_l: toNum(f.tank_capacity_l),
        status: f.status,
        driver_id: f.driver_id || null,
        notes: f.notes.trim() || null
      })
    )
  }

  return (
    <Modal open onClose={onClose} title={vehicle ? 'Edit vehicle' : 'Add vehicle'}>
      <form onSubmit={save} className="space-y-3">
        {error && <p className="rounded-lg bg-red-100 p-2.5 text-sm text-red-700">{error}</p>}
        <div className="grid grid-cols-2 gap-3">
          <F label="Plate no.">
            <input required maxLength={20} value={f.plate_no} onChange={set('plate_no')} placeholder="WXY 1234" className={`${inputCls} uppercase`} />
          </F>
          <F label="Name / model">
            <input maxLength={80} value={f.name} onChange={set('name')} placeholder="Toyota Hilux" className={inputCls} />
          </F>
          <F label="Type">
            <select value={f.vehicle_type} onChange={set('vehicle_type')} className={inputCls}>
              {opt(VEHICLE_TYPES)}
            </select>
          </F>
          <F label="Fuel">
            <select value={f.fuel_type} onChange={set('fuel_type')} className={inputCls}>
              {opt(FUEL_TYPES)}
            </select>
          </F>
          <F label="Tank size (L)">
            <input type="number" min="1" step="0.1" value={f.tank_capacity_l} onChange={set('tank_capacity_l')} placeholder="L" className={inputCls} />
          </F>
          <F label="Status">
            <select value={f.status} onChange={set('status')} className={inputCls}>
              {opt([
                ['active', 'Active'],
                ['inactive', 'Inactive']
              ])}
            </select>
          </F>
          <F label="Usual driver" hint="Their claims default to this vehicle." span>
            <select value={f.driver_id} onChange={set('driver_id')} className={inputCls}>
              {opt(
                people.filter((p) => p.has_access || p.is_super_admin).map((p) => [p.user_id, `${personLabel(p)} · ${p.email}`]),
                'No usual driver'
              )}
            </select>
          </F>
          <F label="Notes" span>
            <input value={f.notes} onChange={set('notes')} className={inputCls} />
          </F>
        </div>
        <div className="flex items-center justify-between gap-2 pt-1">
          {vehicle ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-red-600"
              disabled={busy}
              onClick={() =>
                window.confirm(`Delete ${vehicle.plate_no}? Vehicles with claims cannot be deleted — set them to Inactive instead.`) &&
                run(() => deleteVehicle(vehicle.id))
              }
            >
              <IconTrash width={16} height={16} /> Delete
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={busy || !f.plate_no.trim()}>
              {busy ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  )
}
