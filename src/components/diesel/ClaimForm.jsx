import { useMemo, useRef, useState } from 'react'
import { Button, Card } from '../ui.jsx'
import { IconPlus, IconTrash } from '../icons.jsx'
import { F, inputCls, opt } from './shared.jsx'
import {
  PAYMENTS,
  compressReceipt,
  createClaimWithLines,
  removeReceipt,
  updateClaimWithLines,
  uploadReceipt,
  vehicleLabel
} from '../../lib/diesel.js'
import { scanReceipt } from '../../lib/ocr.js'
import { money, num, today } from '../../lib/format.js'

// New / edit fuel claim: a header (submission date, company, claimant, totals,
// drag & drop for receipts), then one row per receipt. A dropped file becomes
// a row, is read for a draft of the figures, and is attached to that row; rows
// can also be typed by hand. Payable = cash rows only; fleet-card rows are
// recorded for litres / cost but are not paid back.
const fuelWord = (v) => (v?.fuel_type === 'petrol' ? 'Petrol' : 'Diesel')
const blankLine = (mine) => ({
  key: Math.random().toString(36).slice(2),
  fill_date: today(),
  vehicle_id: mine?.id || '',
  litres: '',
  unit_price: '',
  amount: '',
  payment: 'cash',
  subsidised: false,
  receipt_no: '',
  station: '',
  description: fuelWord(mine), // the fuel product
  remark: '',
  receipt_path: '',
  file: null,
  scan: null
})

// An input with its unit printed inside the box (right, or left for RM).
function Unit({ unit, left, children }) {
  return (
    <div className="relative">
      {children}
      <span className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400 ${left ? 'left-3' : 'right-3'}`}>{unit}</span>
    </div>
  )
}

export function ClaimForm({ company, user, vehicles, claim, lines: initialLines, onSaved, onCancel }) {
  const usable = useMemo(() => vehicles.filter((v) => v.is_active || initialLines?.some((l) => l.vehicle_id === v.id)), [vehicles, initialLines])
  const mine = usable.find((v) => v.driver_id === user.id)
  const [submittedOn, setSubmittedOn] = useState(claim?.submitted_on || claim?.fill_date || today())
  const [lines, setLines] = useState(() =>
    initialLines?.length
      ? initialLines.map((l) => ({
          ...blankLine(mine),
          ...l,
          litres: l.litres ?? '',
          unit_price: l.unit_price ?? '',
          amount: l.amount ?? '',
          receipt_no: l.receipt_no || '',
          station: l.station || '',
          description: l.description || (l.remark && /^(diesel|petrol)/i.test(l.remark) ? l.remark : '') || '',
          remark: l.remark && !/^(diesel|petrol)/i.test(l.remark) ? l.remark : '',
          receipt_path: l.receipt_path || '',
          key: l.id
        }))
      : [blankLine(mine)]
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const fileInput = useRef(null)
  const vById = useMemo(() => Object.fromEntries(usable.map((v) => [v.id, v])), [usable])

  const update = (key, patch) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  const remove = (key) => setLines((ls) => ls.filter((l) => l.key !== key))
  const addRow = () => setLines((ls) => [...ls, blankLine(mine)])

  // Keep litres × unit price = amount in step when two of them are typed.
  const setNumber = (l, field, value) => {
    const patch = { [field]: value }
    const L = field === 'litres' ? Number(value) : Number(l.litres)
    const P = field === 'unit_price' ? Number(value) : Number(l.unit_price)
    const A = field === 'amount' ? Number(value) : Number(l.amount)
    if (field !== 'amount' && L > 0 && P > 0) patch.amount = (Math.round(L * P * 100) / 100).toFixed(2)
    else if (field === 'amount' && L > 0 && A > 0 && !l.unit_price) patch.unit_price = (Math.round((A / L) * 1000) / 1000).toFixed(3)
    update(l.key, patch)
  }
  const setVehicle = (l, vehicleId) => {
    const v = vById[vehicleId]
    update(l.key, { vehicle_id: vehicleId, ...(l.description === 'Diesel' || l.description === 'Petrol' || !l.description ? { description: fuelWord(v) } : {}) })
  }
  // Fleet card = KPDN subsidised diesel; cash at the pump = non-subsidised.
  const setPayment = (l, payment) => update(l.key, { payment, subsidised: payment === 'fleet_card' })

  // Receipt files: one row per file, read for a draft, attached to the row.
  const readable = (f) => f.type.startsWith('image/') || f.type === 'application/pdf' || /\.pdf$/i.test(f.name)
  async function addFiles(fileList) {
    const files = [...fileList].filter(Boolean)
    if (!files.length) return
    const fresh = files.map((file) => ({ ...blankLine(mine), file, scan: readable(file) ? 'scanning' : null }))
    setLines((ls) => {
      const onlyBlank = ls.length === 1 && !ls[0].file && !ls[0].amount && !ls[0].litres && !ls[0].receipt_path
      return onlyBlank ? fresh : [...ls, ...fresh]
    })
    for (const row of fresh) if (row.scan === 'scanning') await readRow(row)
  }

  // Read one row's file and fill the draft figures (never overwrites typed values with blanks).
  async function readRow(row) {
    update(row.key, { scan: 'scanning' })
    const small = row.file.type.startsWith('image/') ? await compressReceipt(row.file) : row.file
    const draft = await scanReceipt(small)
    update(row.key, {
      scan: 'done',
      ...(draft.fill_date ? { fill_date: draft.fill_date } : {}),
      ...(draft.litres ? { litres: String(draft.litres) } : {}),
      ...(draft.unit_price ? { unit_price: String(draft.unit_price) } : {}),
      ...(draft.amount ? { amount: Number(draft.amount).toFixed(2) } : {}),
      ...(draft.receipt_no ? { receipt_no: draft.receipt_no } : {}),
      ...(draft.station ? { station: draft.station } : {}),
      ...(draft.product ? { description: draft.product } : {}),
      ...(draft.payment ? { payment: draft.payment, subsidised: draft.payment === 'fleet_card' } : {})
    })
  }

  const total = lines.reduce((s, l) => s + (Number(l.amount) || 0), 0)
  const payable = lines.filter((l) => l.payment === 'cash').reduce((s, l) => s + (Number(l.amount) || 0), 0)
  const litres = lines.reduce((s, l) => s + (Number(l.litres) || 0), 0)
  const reading = lines.some((l) => l.scan === 'scanning')
  const valid = lines.length > 0 && lines.every((l) => l.fill_date && Number(l.amount) >= 0 && (Number(l.amount) > 0 || Number(l.litres) > 0))

  async function save(e) {
    e?.preventDefault?.()
    if (!valid || busy) return
    setBusy(true)
    setError('')
    const uploaded = []
    try {
      const prepared = []
      for (const l of lines) {
        let receipt_path = l.receipt_path || ''
        if (l.file) {
          receipt_path = await uploadReceipt(company.id, user.id, l.file)
          uploaded.push(receipt_path)
          if (l.receipt_path) removeReceipt(l.receipt_path)
        }
        prepared.push({ ...l, company_id: company.id, receipt_path: receipt_path || null, id: l.id || undefined })
      }
      const header = { submitted_on: submittedOn, notes: claim?.notes || '' }
      const id = claim ? (await updateClaimWithLines(claim.id, header, prepared), claim.id) : await createClaimWithLines(company.id, user.id, header, prepared)
      onSaved(id)
    } catch (err) {
      uploaded.forEach(removeReceipt)
      setError(err.message || 'Could not save. Please try again.')
      setBusy(false)
    }
  }

  const buttons = (
    <div className="flex justify-end gap-2">
      <Button type="button" variant="secondary" onClick={onCancel}>
        Cancel
      </Button>
      <Button type="submit" disabled={busy || !valid || reading}>
        {busy ? 'Saving…' : reading ? 'Reading receipts…' : claim ? 'Save changes' : 'Save claim'}
      </Button>
    </div>
  )

  const cell = `${inputCls} h-9 px-2 text-sm`
  const tall = `${inputCls} h-[78px] px-2 text-sm` // two lines tall, same as date + receipt no.

  return (
    <form onSubmit={save} className="space-y-4">
      {error && <p className="rounded-lg bg-red-100 p-2.5 text-sm text-red-700">{error}</p>}
      {buttons}

      {/* Header */}
      <Card className="p-4 sm:p-5">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
          <div className="grid gap-3 sm:grid-cols-3">
            <F label="Submission date">
              <input type="date" required max={today()} value={submittedOn} onChange={(e) => setSubmittedOn(e.target.value)} className={inputCls} />
            </F>
            <F label="Company">
              <input value={company.name} disabled className={inputCls} />
            </F>
            <F label="Name">
              <input value={user.fullName || user.email} disabled className={inputCls} />
            </F>
            <F label="Total amount">
              <input value={money(total)} disabled className={`${inputCls} font-semibold`} />
            </F>
            <F label="Payable amount" hint="Cash receipts only">
              <input value={money(payable)} disabled className={`${inputCls} font-bold text-brand-dark`} />
            </F>
            <F label="Total litres">
              <input value={`${num(litres, 2)} L`} disabled className={inputCls} />
            </F>
          </div>
          {/* Drag & drop */}
          <div
            onClick={() => fileInput.current?.click()}
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragOver(false)
              addFiles(e.dataTransfer.files)
            }}
            className={`flex min-h-[120px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-4 text-center transition ${
              dragOver ? 'border-brand bg-brand-light' : 'border-brand/40 bg-brand-light/40 hover:border-brand'
            }`}
          >
            <input ref={fileInput} type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
            <p className="font-display text-lg font-extrabold tracking-tight text-brand-dark">Drag &amp; Drop</p>
            <p className="mt-1 text-xs text-slate-500">Files for autofill</p>
          </div>
        </div>
      </Card>

      {/* Rows: every cell is two lines tall so the columns line up */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1360px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="w-10 px-3 py-2.5">#</th>
                <th className="w-44 px-2 py-2.5">Vehicle no.</th>
                <th className="w-44 px-2 py-2.5">Receipt</th>
                <th className="w-40 px-2 py-2.5">Description</th>
                <th className="w-40 px-2 py-2.5">Fuel</th>
                <th className="w-36 px-2 py-2.5 text-right">Total fuel expenses</th>
                <th className="w-36 px-2 py-2.5 text-right">Claim payable amount</th>
                <th className="w-52 px-2 py-2.5">Payment method</th>
                <th className="w-44 px-2 py-2.5">Remark</th>
                <th className="w-48 px-2 py-2.5">Attachment</th>
                <th className="w-12 px-2 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lines.map((l, i) => {
                const payableLine = l.payment === 'cash' ? Number(l.amount) || 0 : 0
                return (
                  <tr key={l.key} className={l.scan === 'scanning' ? 'bg-amber-50/40' : ''}>
                    <td className="px-3 py-3 align-top pt-4 font-semibold text-slate-500">{i + 1}</td>
                    <td className="px-2 py-3">
                      <select value={l.vehicle_id} onChange={(e) => setVehicle(l, e.target.value)} className={`${tall} tracking-wide`} title="Vehicle">
                        {opt(usable.map((v) => [v.id, vehicleLabel(v)]), '— No vehicle —')}
                      </select>
                    </td>
                    <td className="px-2 py-3">
                      <div className="space-y-1.5">
                        <input type="date" required max={today()} value={l.fill_date} onChange={(e) => update(l.key, { fill_date: e.target.value })} className={cell} title="Receipt date" />
                        <input value={l.receipt_no} maxLength={60} placeholder="Receipt no." onChange={(e) => update(l.key, { receipt_no: e.target.value })} className={cell} title="Receipt no." />
                      </div>
                    </td>
                    <td className="px-2 py-3">
                      <textarea value={l.description} maxLength={120} placeholder="Diesel / Petrol" onChange={(e) => update(l.key, { description: e.target.value })} className={`${tall} resize-none py-2`} title="Description" />
                    </td>
                    <td className="px-2 py-3">
                      <div className="space-y-1.5">
                        <Unit unit="L">
                          <input type="number" inputMode="decimal" min="0" step="0.01" placeholder="Litre" value={l.litres} onChange={(e) => setNumber(l, 'litres', e.target.value)} className={`${cell} pr-8 text-right`} title="Litres" />
                        </Unit>
                        <Unit unit="RM/L">
                          <input type="number" inputMode="decimal" min="0" step="0.001" placeholder="Unit price" value={l.unit_price} onChange={(e) => setNumber(l, 'unit_price', e.target.value)} className={`${cell} pr-12 text-right`} title="Unit price" />
                        </Unit>
                      </div>
                    </td>
                    <td className="px-2 py-3">
                      <Unit unit="RM" left>
                        <input type="number" inputMode="decimal" min="0" step="0.01" value={l.amount} onChange={(e) => setNumber(l, 'amount', e.target.value)} className={`${tall} pl-10 text-right font-semibold`} title="Total fuel expenses" />
                      </Unit>
                    </td>
                    <td className="px-2 py-3">
                      <Unit unit="RM" left>
                        <input value={payableLine.toFixed(2)} disabled className={`${tall} pl-10 text-right font-bold text-brand-dark`} title="Claim payable amount (cash receipts only)" />
                      </Unit>
                    </td>
                    <td className="px-2 py-3">
                      <select value={l.payment} onChange={(e) => setPayment(l, e.target.value)} className={tall} title="Payment method">
                        {opt(PAYMENTS)}
                      </select>
                    </td>
                    <td className="px-2 py-3">
                      <textarea value={l.remark} maxLength={300} placeholder="Remark" onChange={(e) => update(l.key, { remark: e.target.value })} className={`${tall} resize-none py-2`} title="Remark" />
                    </td>
                    <td className="px-2 py-3">
                      <label className={`${tall} flex cursor-pointer flex-col items-center justify-center gap-1 border-dashed text-xs hover:border-brand`}>
                        <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => e.target.files?.[0] && update(l.key, { file: e.target.files[0], scan: null })} />
                        <span className="rounded-md border border-slate-300 bg-white px-2 py-0.5 font-medium text-slate-700">Choose</span>
                        <span className="w-full truncate px-1 text-center text-slate-600" title={l.file ? l.file.name : l.receipt_path ? 'Attached' : ''}>
                          {l.scan === 'scanning' ? 'Reading…' : l.file ? l.file.name : l.receipt_path ? 'Attached' : 'No file'}
                        </span>
                      </label>
                    </td>
                    <td className="px-2 py-3 align-top pt-4">
                      <button type="button" onClick={() => remove(l.key)} className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-900 hover:bg-red-50 hover:text-red-600" aria-label="Remove row" title="Remove row">
                        <IconTrash width={18} height={18} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-200 bg-slate-50/60 text-sm font-semibold text-slate-800">
                <td className="px-3 py-2.5" colSpan={4}>
                  <button type="button" onClick={addRow} className="inline-flex items-center gap-1.5 text-brand hover:underline">
                    <IconPlus width={16} height={16} /> Add row
                  </button>
                </td>
                <td className="px-2 py-2.5 text-right">{num(litres, 2)} L</td>
                <td className="px-2 py-2.5 text-right">{money(total)}</td>
                <td className="px-2 py-2.5 text-right text-brand-dark">{money(payable)}</td>
                <td colSpan={4} />
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      {buttons}
    </form>
  )
}
