import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import PageHeader from '../../components/PageHeader.jsx'
import { Badge, Card, Spinner } from '../../components/ui.jsx'
import { EditableTable } from '../../components/EditableTable.jsx'
import { deleteMachine, listMachines, listPortalPeople, saveMachine, useCmmsAccess, userLabel } from '../../lib/cmms.js'
import { useCompany } from '../../lib/CompanyContext.jsx'

// One list for machines AND vehicles of the company. Cases link to these,
// suppliers list which ones they handle, and Fuel Manage uses them as the
// vehicles for claims, fleet cards and fill-ups. Tick "KPDN diesel subsidy"
// for a vehicle that applies for the subsidised-diesel fleet card: it then
// shows under Fuel Manage → Fleet Card Manage.
export default function MachineryProfile() {
  const { current } = useCompany()
  const access = useCmmsAccess(current?.id)
  const [rows, setRows] = useState([])
  const [people, setPeople] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!current) return
    try {
      const [m, p] = await Promise.all([listMachines(current.id), listPortalPeople().catch(() => [])])
      setRows(m)
      setPeople(p)
      setError('')
    } catch (e) {
      setError(e.message || 'Could not load machines.')
    } finally {
      setLoading(false)
    }
  }, [current])

  useEffect(() => {
    setLoading(true)
    load()
  }, [load])

  const guard = (fn) => async (arg) => {
    setError('')
    try {
      await fn(arg)
      await load()
      return true
    } catch (e) {
      setError(e.message || 'Could not save.')
      return false
    }
  }

  const columns = [
    { key: 'name', label: 'Code / name', placeholder: 'e.g. EX-03 or WXY 1234', required: true },
    { key: 'machine_type', label: 'Type', placeholder: 'Excavator, Pickup, Lorry…' },
    { key: 'brand', label: 'Brand', placeholder: 'Hitachi' },
    { key: 'model', label: 'Model', placeholder: 'ZX200' },
    { key: 'reg_no', label: 'Reg. / plate no.', placeholder: 'Optional' },
    {
      key: 'fuel_type',
      label: 'Fuel',
      type: 'select',
      default: 'diesel',
      options: [
        ['diesel', 'Diesel'],
        ['petrol', 'Petrol'],
        ['none', 'None']
      ]
    },
    { key: 'tank_capacity_l', label: 'Tank (L)', type: 'number', placeholder: 'L', hint: 'Fill-ups larger than this are flagged in the Fuel report' },
    {
      key: 'driver_id',
      label: 'Usual driver',
      type: 'select',
      default: '',
      options: [['', '—'], ...people.map((p) => [p.user_id, userLabel(p)])],
      hint: 'Their fuel claims default to this vehicle'
    },
    { key: 'kpdn_subsidy', label: 'KPDN diesel subsidy', type: 'checkbox', hint: 'Applies for the KPDN subsidised-diesel fleet card (shows in Fuel Manage → Fleet Card Manage)' },
    {
      key: 'is_active',
      label: 'Status',
      type: 'select',
      default: 'true',
      options: [
        ['true', 'Active'],
        ['false', 'Inactive']
      ]
    },
    { key: 'notes', label: 'Notes', placeholder: 'Optional' }
  ]

  // Rows for the table: booleans as strings for the select; back again on save.
  const tableRows = rows.map((r) => ({ ...r, is_active: String(r.is_active !== false), driver_id: r.driver_id || '' }))
  const toRow = (v) => ({ ...v, is_active: v.is_active !== 'false', driver_id: v.driver_id || null, fuel_type: v.fuel_type || 'diesel' })
  const kpdn = rows.filter((r) => r.kpdn_subsidy).length

  return (
    <div className="space-y-4">
      <PageHeader
        title="Machinery Profile"
        subtitle={`${current?.name || ''} · ${rows.length} machine${rows.length === 1 ? '' : 's'} / vehicle${rows.length === 1 ? '' : 's'}${access.loaded && !access.can_manage ? ' · view only' : ''}`}
        right={
          kpdn > 0 && (
            <Link to="/diesel/cards" className="inline-flex items-center gap-2 text-sm font-medium text-brand hover:underline">
              <Badge color="green">{kpdn}</Badge> KPDN diesel subsidy vehicle{kpdn === 1 ? '' : 's'} → Fleet Card Manage
            </Link>
          )
        }
      />
      {error && <p className="rounded-xl bg-red-100 p-3 text-sm text-red-700">{error}</p>}
      <Card className="overflow-x-auto">
        {loading ? (
          <div className="flex justify-center py-12 text-brand">
            <Spinner className="h-7 w-7" />
          </div>
        ) : (
          <div className="lg:min-w-[1320px]">
            <EditableTable
              columns={columns}
              template="minmax(0,1.2fr) minmax(0,1fr) minmax(0,0.8fr) minmax(0,0.8fr) minmax(0,1fr) 104px 86px minmax(0,1.1fr) 92px 112px minmax(0,1fr)"
              rows={tableRows}
              canEdit={access.can_manage}
              onAdd={guard((v) => saveMachine(current.id, toRow(v)))}
              onSave={guard((v) => saveMachine(current.id, toRow(v)))}
              onDelete={guard((r) => deleteMachine(r.id))}
              emptyText="No machines or vehicles yet."
              deleteLabel="machine / vehicle"
            />
          </div>
        )}
      </Card>
      <p className="text-xs text-slate-500">
        Vehicles used for fuel (claims, fleet cards, fill-ups) are kept here too. Tick “KPDN diesel subsidy” for a
        vehicle that applies for the subsidised-diesel fleet card; it then appears under Fuel Manage → Fleet Card Manage.
      </p>
    </div>
  )
}
