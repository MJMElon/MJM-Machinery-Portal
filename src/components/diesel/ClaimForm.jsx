import { useMemo, useRef, useState } from 'react'
import { Badge, Button, Card } from '../ui.jsx'
import { IconCamera, IconPlus, IconTrash } from '../icons.jsx'
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

// New / edit fuel claim: a header (submission date, company, claimant, totals),
// a drop zone for receipt photos (each photo becomes a row, read by the
// scanner and attached to that row), and the rows themselves, which can also
// be typed by hand. Payable = cash rows only; fleet-card rows are recorded
// for litres / cost but are not paid back.
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
  remark: '',
  receipt_path: '',
  file: null,
  scan: null // 'scanning' | 'done' | 'failed'
})

export function ClaimForm({ company, user, vehicles, claim, lines: initialLines, onSaved, onCancel }) {
  const usable = useMemo(() => vehicles.filter((v) => v.is_active || initialLines?.some((l) => l.vehicle_id === v.id)), [vehicles, initialLines])
  const mine = usable.find((v) => v.driver_id === user.id)
  const [submittedOn, setSubmittedOn] = useState(claim?.submitted_on || claim?.fill_date || today())
  const [notes, setNotes] = useState(claim?.notes || '')
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
          remark: l.remark || '',
          receipt_path: l.receipt_path || '',
          key: l.id
        }))
      : [blankLine(mine)]
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
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
    update(l.key, { vehicle_id: vehicleId, subsidised: l.payment === 'fleet_card' ? Boolean(v?.kpdn_subsidy) : l.subsidised })
  }
  const setPayment = (l, payment) => {
    const v = vById[l.vehicle_id]
    update(l.key, { payment, subsidised: payment === 'fleet_card' ? Boolean(v?.kpdn_subsidy) : false })
  }

  // Receipt photos: one row per photo, scanned for a draft, attached to the row.
  async function addFiles(fileList) {
    const files = [...fileList].filter(Boolean)
    if (!files.length) return
    const fresh = files.map((file) => ({ ...blankLine(mine), file, scan: file.type.startsWith('image/') ? 'scanning' : null }))
    setLines((ls) => {
      // Replace a single still-empty first row instead of leaving it behind
      const onlyBlank = ls.length === 1 && !ls[0].file && !ls[0].amount && !ls[0].litres && !ls[0].receipt_path
      return onlyBlank ? fresh : [...ls, ...fresh]
    })
    for (const row of fresh) {
      if (row.scan !== 'scanning') continue
      const small = await compressReceipt(row.file)
      const draft = await scanReceipt(small)
      update(row.key, {
        scan: draft._error ? 'failed' : 'done',
        ...(draft.fill_date ? { fill_date: draft.fill_date } : {}),
        ...(draft.litres ? { litres: String(draft.litres) } : {}),
        ...(draft.unit_price ? { unit_price: String(draft.unit_price) } : {}),
        ...(draft.amount ? { amount: Number(draft.amount).toFixed(2) } : {}),
        ...(draft.receipt_no ? { receipt_no: draft.receipt_no } : {}),
        ...(draft.station ? { station: draft.station } : {}),
        ...(draft.remark ? { remark: draft.remark } : {})
      })
    }
  }

  const total = lines.reduce((s, l) => s + (Number(l.amount) || 0), 0)
  const payable = lines.filter((l) => l.payment === 'cash').reduce((s, l) => s + (Number(l.amount) || 0), 0)
  const litres = lines.reduce((s, l) => s + (Number(l.litres) || 0), 0)
  const valid = lines.length > 0 && lines.every((l) => l.fill_date && (Number(l.amount) >= 0) && (Number(l.amount) > 0 || Number(l.litres) > 0))

  async function save(e) {
    e.preventDefault()
    if (!valid) return
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
      const header = { submitted_on: submittedOn, notes: notes.trim() }
      const id = claim ? (await updateClaimWithLines(claim.id, header, prepared), claim.id) : await createClaimWithLines(company.id, user.id, header, prepared)
      onSaved(id)
    } catch (err) {
      uploaded.forEach(removeReceipt)
      setError(err.message || 'Could not save. Please try again.')
      setBusy(false)
    }
  }

  return (
    <form onSubmit={save} className="space-y-4">
      {error && <p className="rounded-lg bg-red-100 p-2.5 text-sm text-red-700">{error}</p>}

      {/* Header */}
      <Card className="p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
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
        </div>
      </Card>

      {/* Upload */}
      <Card
        className="border-2 border-dashed border-brand/40 bg-brand-light/30 p-5 text-center"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          addFiles(e.dataTransfer.files)
        }}
      >
        <input ref={fileInput} type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
        <IconCamera width={28} height={28} className="mx-auto text-brand" />
        <p className="mt-2 font-semibold text-slate-800">Upload fuel receipts</p>
        <p className="text-xs text-slate-500">Photos or PDFs, several at once. Each receipt becomes a row below; photos are read automatically — check the figures.</p>
        <div className="mt-3 flex justify-center gap-2">
          <Button type="button" variant="secondary" onClick={() => fileInput.current?.click()}>
            Choose files
          </Button>
          <Button type="button" variant="ghost" onClick={addRow}>
            <IconPlus width={18} height={18} /> Add row without receipt
          </Button>
        </div>
      </Card>

      {/* Rows */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="w-10 px-3 py-2.5">#</th>
                <th className="px-2 py-2.5">Vehicle no.</th>
                <th className="w-36 px-2 py-2.5">Receipt date</th>
                <th className="w-32 px-2 py-2.5">Receipt no.</th>
                <th className="w-24 px-2 py-2.5 text-right">Litre</th>
                <th className="w-28 px-2 py-2.5 text-right">Unit price</th>
                <th className="w-28 px-2 py-2.5 text-right">Amount (RM)</th>
                <th className="w-40 px-2 py-2.5">Payment</th>
                <th className="w-20 px-2 py-2.5 text-center">Subsidy</th>
                <th className="px-2 py-2.5">Remark</th>
                <th className="w-44 px-2 py-2.5">Attachment</th>
                <th className="w-12 px-2 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 align-top">
              {lines.map((l, i) => (
                <tr key={l.key} className={l.scan === 'scanning' ? 'bg-amber-50/40' : ''}>
                  <td className="px-3 py-2 pt-4 font-semibold text-slate-500">{i + 1}</td>
                  <td className="px-2 py-2">
                    <select value={l.vehicle_id} onChange={(e) => setVehicle(l, e.target.value)} className={inputCls}>
                      {opt(usable.map((v) => [v.id, vehicleLabel(v)]), '— No vehicle —')}
                    </select>
                  </td>
                  <td className="px-2 py-2">
                    <input type="date" required max={today()} value={l.fill_date} onChange={(e) => update(l.key, { fill_date: e.target.value })} className={inputCls} />
                  </td>
                  <td className="px-2 py-2">
                    <input value={l.receipt_no} maxLength={60} onChange={(e) => update(l.key, { receipt_no: e.target.value })} className={inputCls} />
                  </td>
                  <td className="px-2 py-2">
                    <input type="number" inputMode="decimal" min="0" step="0.01" value={l.litres} onChange={(e) => setNumber(l, 'litres', e.target.value)} className={`${inputCls} text-right`} />
                  </td>
                  <td className="px-2 py-2">
                    <input type="number" inputMode="decimal" min="0" step="0.001" value={l.unit_price} onChange={(e) => setNumber(l, 'unit_price', e.target.value)} className={`${inputCls} text-right`} />
                  </td>
                  <td className="px-2 py-2">
                    <input type="number" inputMode="decimal" min="0" step="0.01" value={l.amount} onChange={(e) => setNumber(l, 'amount', e.target.value)} className={`${inputCls} text-right font-semibold`} />
                  </td>
                  <td className="px-2 py-2">
                    <select value={l.payment} onChange={(e) => setPayment(l, e.target.value)} className={inputCls}>
                      {opt(PAYMENTS)}
                    </select>
                  </td>
                  <td className="px-2 py-2 text-center">
                    <input type="checkbox" className="mt-2.5 h-5 w-5 accent-[#059669]" checked={l.subsidised} onChange={(e) => update(l.key, { subsidised: e.target.checked })} title="Subsidised (KPDN) fuel" />
                  </td>
                  <td className="px-2 py-2">
                    <input value={l.remark} maxLength={300} onChange={(e) => update(l.key, { remark: e.target.value })} placeholder={l.station || ''} className={inputCls} />
                  </td>
                  <td className="px-2 py-2">
                    <label className="flex cursor-pointer items-center gap-2 text-xs">
                      <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => e.target.files?.[0] && update(l.key, { file: e.target.files[0] })} />
                      <span className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 font-medium text-slate-700 hover:border-brand">Choose</span>
                      <span className="min-w-0 truncate text-slate-500">
                        {l.file ? l.file.name : l.receipt_path ? 'Attached' : 'None'}
                      </span>
                    </label>
                    {l.scan === 'scanning' && <Badge color="amber" className="mt-1">Reading…</Badge>}
                    {l.scan === 'done' && <Badge color="green" className="mt-1">Read — please check</Badge>}
                    {l.scan === 'failed' && <Badge color="red" className="mt-1">Could not read</Badge>}
                  </td>
                  <td className="px-2 py-2">
                    <button type="button" onClick={() => remove(l.key)} className="mt-1 flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="Remove row">
                      <IconTrash width={17} height={17} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-200 bg-slate-50/60 text-sm font-semibold text-slate-800">
                <td className="px-3 py-2.5" colSpan={4}>
                  <button type="button" onClick={addRow} className="inline-flex items-center gap-1.5 text-brand hover:underline">
                    <IconPlus width={16} height={16} /> Add row
                  </button>
                </td>
                <td className="px-2 py-2.5 text-right">{num(litres, 2)} L</td>
                <td />
                <td className="px-2 py-2.5 text-right">{money(total)}</td>
                <td className="px-2 py-2.5" colSpan={5}>
                  Payable <span className="text-brand-dark">{money(payable)}</span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      <Card className="p-4">
        <F label="Notes for the whole claim">
          <textarea maxLength={500} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className={`${inputCls} h-auto py-2`} />
        </F>
      </Card>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy || !valid || lines.some((l) => l.scan === 'scanning')}>
          {busy ? 'Saving…' : claim ? 'Save changes' : 'Save claim'}
        </Button>
      </div>
    </form>
  )
}
