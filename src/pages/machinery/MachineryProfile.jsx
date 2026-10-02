import { useCallback, useEffect, useState } from 'react'
import PageHeader from '../../components/PageHeader.jsx'
import { Card, Spinner } from '../../components/ui.jsx'
import { EditableTable } from '../../components/EditableTable.jsx'
import { deleteMachine, listMachines, saveMachine, useCmmsAccess } from '../../lib/cmms.js'
import { useCompany } from '../../lib/CompanyContext.jsx'

const COLUMNS = [
  { key: 'name', label: 'Machine code / name', placeholder: 'e.g. EX-03', required: true },
  { key: 'machine_type', label: 'Type', placeholder: 'Excavator' },
  { key: 'brand', label: 'Brand', placeholder: 'Hitachi' },
  { key: 'model', label: 'Model', placeholder: 'ZX200' },
  { key: 'reg_no', label: 'Reg. / serial no.', placeholder: 'Optional' },
  { key: 'notes', label: 'Notes', placeholder: 'Optional' }
]

// The company's machines. Cases can be linked to these, and suppliers list
// which of them they handle.
export default function MachineryProfile() {
  const { current } = useCompany()
  const access = useCmmsAccess(current?.id)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!current) return
    try {
      setRows(await listMachines(current.id))
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

  return (
    <div className="space-y-4">
      <PageHeader
        title="Machinery Profile"
        subtitle={`${current?.name || ''} · ${rows.length} machine${rows.length === 1 ? '' : 's'}${access.loaded && !access.can_manage ? ' · view only' : ''}`}
      />
      {error && <p className="rounded-xl bg-red-100 p-3 text-sm text-red-700">{error}</p>}
      <Card className="overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12 text-brand">
            <Spinner className="h-7 w-7" />
          </div>
        ) : (
          <EditableTable
            columns={COLUMNS}
            template="minmax(0,1.1fr) minmax(0,1fr) minmax(0,0.9fr) minmax(0,0.9fr) minmax(0,1fr) minmax(0,1.3fr)"
            rows={rows}
            canEdit={access.can_manage}
            onAdd={guard((v) => saveMachine(current.id, v))}
            onSave={guard((v) => saveMachine(current.id, v))}
            onDelete={guard((r) => deleteMachine(r.id))}
            emptyText="No machines yet."
            deleteLabel="machine"
          />
        )}
      </Card>
    </div>
  )
}
