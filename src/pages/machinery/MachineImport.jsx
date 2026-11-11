import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PageHeader from '../../components/PageHeader.jsx'
import { Badge, Button, Card } from '../../components/ui.jsx'
import { listMachines, saveMachine, useCmmsAccess } from '../../lib/cmms.js'
import { loadScript } from '../../lib/ocr.js'
import { useCompany } from '../../lib/CompanyContext.jsx'

// Import machines / vehicles from an Excel or CSV file: the export of the old
// CMMS, or the template below. Columns are matched by their heading (any
// order, extra columns ignored). A row whose code already exists in the
// company updates that machine; a new code adds one.
const XLSX_URL = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'

// heading (normalised: letters and digits only) → field
const HEADINGS = {
  name: ['code', 'machinerycode', 'machinecode', 'codename', 'name', 'assetcode', 'machinery'],
  reg_no: ['registrationno', 'regno', 'registration', 'plateno', 'plate', 'vehicleno'],
  machine_type: ['type', 'machinetype', 'category'],
  brand: ['brand', 'make'],
  model: ['model'],
  status: ['status'],
  serial_no: ['serialno', 'serial'],
  chassis_no: ['chasisno', 'chassisno', 'chassis', 'chasis'],
  engine_no: ['engineno', 'engine'],
  market_value: ['marketvalue'],
  acc_code: ['acccode', 'accountcode', 'acc'],
  year_made: ['yearmade', 'year', 'yom'],
  purchase_date: ['datepurchase', 'purchasedate', 'datepurchased'],
  purchase_price: ['purchaseprice', 'price', 'cost'],
  notes: ['remarks', 'remark', 'notes', 'note'],
  ideal_fuel_consumption: ['idealfuelconsumption', 'fuelconsumption'],
  possible_working_units: ['possibleworkingunits', 'workingunits'],
  service_unit: ['serviceunit', 'unit'],
  insurance: ['insurance'],
  insurance_from: ['insurancefrom', 'insurancestart'],
  insurance_to: ['insuranceto', 'insuranceexpiry', 'insuranceend'],
  road_tax: ['roadtax'],
  road_tax_from: ['roadtaxfrom', 'roadtaxstart'],
  road_tax_to: ['roadtaxto', 'roadtaxexpiry', 'roadtaxend'],
  puspakom: ['puspakom'],
  puspakom_from: ['puspakomfrom'],
  puspakom_to: ['puspakomto', 'puspakomexpiry'],
  fuel_type: ['fuel', 'fueltype'],
  tank_capacity_l: ['tankcapacity', 'tankcapacityl', 'tank'],
  kpdn_subsidy: ['kpdn', 'kpdndieselsubsidy', 'kpdnsubsidy'],
  general_use: ['generalusedcar', 'generaluse', 'generalcar']
}
const TEMPLATE = [
  'Code', 'Registration No', 'Type', 'Brand', 'Model', 'Status', 'Serial No', 'Chasis No', 'Engine No', 'Market Value', 'ACC Code', 'Year Made',
  'Date Purchase', 'Purchase Price', 'Remarks', 'Ideal Fuel Consumption', 'Possible Working Units', 'Service Unit', 'Insurance From', 'Insurance To',
  'Road Tax From', 'Road Tax To', 'Puspakom From', 'Puspakom To', 'Fuel', 'Tank Capacity', 'KPDN Diesel Subsidy', 'General Used Car'
]

const norm = (h) => String(h || '').toLowerCase().replace(/[^a-z0-9]/g, '')
const fieldOf = (heading) => {
  const n = norm(heading)
  for (const [field, names] of Object.entries(HEADINGS)) if (names.includes(n)) return field
  return null
}
const num = (v) => {
  if (v === '' || v == null) return null
  const n = Number(String(v).replace(/[^0-9.-]/g, ''))
  return Number.isFinite(n) ? n : null
}
// dd/mm/yyyy, d-m-yy, yyyy-mm-dd, Excel serial numbers, Date objects
function toDate(v) {
  if (v == null || v === '') return null
  if (v instanceof Date) return isNaN(v) ? null : iso(v)
  if (typeof v === 'number') return iso(new Date(Math.round((v - 25569) * 86400000)))
  const s = String(v).trim()
  let m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/)
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3]
    if (Number(y) < 1900 || Number(m[2]) > 12) return null
    return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  }
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  const d = new Date(s)
  return isNaN(d) ? null : iso(d)
}
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
// "From 30/12/2026 To 29/12/2027" → [from, to]
function period(v) {
  const m = String(v || '').match(/(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4})\D+(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4})/)
  return m ? [toDate(m[1]), toDate(m[2])] : [null, null]
}
const yes = (v) => /^(y|yes|true|1|✓|x)$/i.test(String(v ?? '').trim())

function rowToMachine(headers, row) {
  const get = (field) => {
    const i = headers.findIndex((h) => h === field)
    return i >= 0 ? row[i] : undefined
  }
  const txt = (f) => {
    const v = get(f)
    return v == null || v === '' ? null : String(v).trim()
  }
  const m = {
    name: txt('name') || txt('reg_no'),
    reg_no: txt('reg_no'),
    machine_type: txt('machine_type'),
    brand: txt('brand'),
    model: txt('model'),
    is_active: !/inactive|disposed|sold|scrap/i.test(txt('status') || 'active'),
    serial_no: txt('serial_no'),
    chassis_no: txt('chassis_no'),
    engine_no: txt('engine_no'),
    market_value: num(get('market_value')),
    acc_code: txt('acc_code'),
    year_made: num(get('year_made')),
    purchase_date: toDate(get('purchase_date')),
    purchase_price: num(get('purchase_price')),
    notes: txt('notes'),
    ideal_fuel_consumption: num(get('ideal_fuel_consumption')),
    possible_working_units: num(get('possible_working_units')),
    service_unit: txt('service_unit'),
    insurance_from: toDate(get('insurance_from')),
    insurance_to: toDate(get('insurance_to')),
    road_tax_from: toDate(get('road_tax_from')),
    road_tax_to: toDate(get('road_tax_to')),
    puspakom_from: toDate(get('puspakom_from')),
    puspakom_to: toDate(get('puspakom_to')),
    fuel_type: /petrol/i.test(txt('fuel_type') || '') ? 'petrol' : /none|^-$/i.test(txt('fuel_type') || '') ? 'none' : 'diesel',
    tank_capacity_l: num(get('tank_capacity_l')),
    kpdn_subsidy: yes(get('kpdn_subsidy')),
    general_use: yes(get('general_use'))
  }
  for (const k of ['insurance', 'road_tax', 'puspakom']) {
    if (get(k) != null && !m[`${k}_from`] && !m[`${k}_to`]) [m[`${k}_from`], m[`${k}_to`]] = period(get(k))
  }
  if (m.service_unit && /hour|hr/i.test(m.service_unit)) m.service_unit = 'Liter/Hour'
  else if (m.service_unit) m.service_unit = 'Liter/Km'
  if (m.year_made && (m.year_made < 1950 || m.year_made > 2100)) m.year_made = null
  return m
}

export default function MachineImport() {
  const { current } = useCompany()
  const navigate = useNavigate()
  const access = useCmmsAccess(current?.id)
  const [existing, setExisting] = useState([])
  const [headers, setHeaders] = useState([]) // mapped fields per column
  const [headingText, setHeadingText] = useState([])
  const [rows, setRows] = useState([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(null)

  useEffect(() => {
    if (current) listMachines(current.id).then(setExisting).catch(() => {})
  }, [current])

  async function pick(file) {
    if (!file) return
    setError('')
    setDone(null)
    try {
      await loadScript(XLSX_URL, () => Boolean(window.XLSX))
      const buf = await file.arrayBuffer()
      const wb = window.XLSX.read(buf, { type: 'array', cellDates: true })
      const sheet = wb.Sheets[wb.SheetNames[0]]
      const data = window.XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true })
      const hi = data.findIndex((r) => r.filter((c) => fieldOf(c)).length >= 2)
      if (hi < 0) throw new Error('No heading row found. The first row should hold headings like Code, Type, Brand, Model, Registration No…')
      const heads = data[hi].map(String)
      setHeadingText(heads)
      setHeaders(heads.map(fieldOf))
      setRows(data.slice(hi + 1).filter((r) => r.some((c) => c !== '' && c != null)))
    } catch (e) {
      setError(e.message || 'Could not read the file.')
    }
  }

  const machines = useMemo(() => rows.map((r) => rowToMachine(headers, r)), [rows, headers])
  const byName = new Map(existing.map((m) => [m.name.trim().toLowerCase(), m]))
  const status = (m) => (!m.name ? 'skip' : byName.has(m.name.toLowerCase()) ? 'update' : 'new')
  const counts = machines.reduce((c, m) => ({ ...c, [status(m)]: (c[status(m)] || 0) + 1 }), {})
  const mapped = headers.filter(Boolean).length

  async function run() {
    setBusy(true)
    setError('')
    let ok = 0
    const failed = []
    // Within one file the same code may appear twice: later rows update the earlier one.
    const seen = new Map()
    for (const m of machines) {
      const st = status(m)
      if (st === 'skip') continue
      try {
        const id = seen.get(m.name.toLowerCase()) || byName.get(m.name.toLowerCase())?.id
        const saved = await saveMachine(current.id, { ...m, id })
        seen.set(m.name.toLowerCase(), saved)
        ok++
      } catch (e) {
        failed.push(`${m.name}: ${e.message}`)
      }
    }
    setDone({ ok, failed })
    setBusy(false)
  }

  function template() {
    const csv = TEMPLATE.join(',') + '\nVNL1234,VNL 1234,Light vehicle,Toyota,Hilux 2 Cabs,Active,GUN125R,PN1BB3CD905706342,2GD1675554,0,machinery00086,2024,31/12/2024,145800,,0.14,3500,Liter/Km,30/12/2026,29/12/2027,30/12/2024,29/12/2025,,,Diesel,80,Yes,No\n'
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = 'machinery-profile-template.csv'
    a.click()
  }

  if (access.loaded && !access.can('machines', 'add'))
    return <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800">You need the “add” right on Machinery Profile to import.</p>

  return (
    <div className="space-y-4">
      <PageHeader
        backTo="/cmms/machines"
        backLabel="Back to listing"
        title="Import machines / vehicles"
        right={
          <Button variant="secondary" onClick={template}>
            Download template (CSV)
          </Button>
        }
      />
      {error && <p className="rounded-xl bg-red-100 p-3 text-sm text-red-700">{error}</p>}

      <Card className="p-5">
        <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 px-4 py-8 text-center hover:border-brand">
          <span className="font-display text-lg font-bold text-brand">Choose Excel or CSV file</span>
          <span className="mt-1 text-sm text-slate-500">The export from the old CMMS works as it is: columns are matched by their headings.</span>
          <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
        </label>
      </Card>

      {rows.length > 0 && (
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge color="green">{counts.new || 0} new</Badge>
              <Badge color="blue">{counts.update || 0} update existing</Badge>
              {counts.skip > 0 && <Badge color="amber">{counts.skip} without code (skipped)</Badge>}
              <span className="text-slate-500">
                {mapped} of {headers.length} columns recognised
              </span>
            </div>
            {!done && (
              <Button onClick={run} disabled={busy || !(counts.new || counts.update)}>
                {busy ? 'Importing…' : `Import ${(counts.new || 0) + (counts.update || 0)} rows into ${current.name}`}
              </Button>
            )}
          </div>
          {done && (
            <div className="border-b border-slate-200 bg-emerald-50 px-5 py-3 text-sm text-emerald-800">
              Imported {done.ok} machine{done.ok === 1 ? '' : 's'}.
              {done.failed.length > 0 && <span className="block text-red-700">Failed: {done.failed.join(' · ')}</span>}
              <Button size="sm" className="ml-3" onClick={() => navigate('/cmms/machines')}>
                Open listing
              </Button>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-left font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2">Result</th>
                  {headingText.map((h, i) => (
                    <th key={i} className={`px-3 py-2 ${headers[i] ? '' : 'text-slate-300 line-through'}`} title={headers[i] ? `→ ${headers[i]}` : 'Not recognised, ignored'}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.slice(0, 200).map((r, i) => {
                  const st = status(machines[i])
                  return (
                    <tr key={i}>
                      <td className="px-3 py-1.5">
                        <Badge color={st === 'new' ? 'green' : st === 'update' ? 'blue' : 'amber'}>{st}</Badge>
                      </td>
                      {headingText.map((_, j) => (
                        <td key={j} className={`max-w-[200px] truncate px-3 py-1.5 ${headers[j] ? 'text-slate-700' : 'text-slate-300'}`}>
                          {r[j] instanceof Date ? iso(r[j]) : String(r[j] ?? '')}
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {rows.length > 200 && <p className="px-5 py-2 text-xs text-slate-500">Showing the first 200 of {rows.length} rows; all are imported.</p>}
          </div>
        </Card>
      )}
    </div>
  )
}
