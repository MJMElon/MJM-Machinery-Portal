import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Card } from '../ui.jsx'
import { IconBuilding, IconNotebook, IconPlus, IconTrash } from '../icons.jsx'
import { useCompany } from '../../lib/CompanyContext.jsx'
import { F, inputCls, opt } from './shared.jsx'
import {
  PAYMENTS,
  PAYMENT_NOTE,
  cardLabel,
  compressReceipt,
  createClaimWithLines,
  getTopup,
  topupNo,
  notifyClaim,
  isReload,
  removeReceipt,
  updateClaimWithLines,
  uploadReceipt,
  vehicleLabel
} from '../../lib/diesel.js'
import { scanReceipt } from '../../lib/ocr.js'
import { money, num, today } from '../../lib/format.js'

// New / edit fuel claim: a header (created date, company, claimant, totals,
// drag & drop for receipts), then one row per receipt. A dropped file becomes
// a row, is read for a draft of the figures, and is attached to that row; rows
// can also be typed by hand. Payable = cash rows only; fleet-card rows are
// recorded for litres / cost but are not paid back.
// Dropped files first fill the rows that have no receipt yet (e.g. the reload
// row of a top-up claim), then make new rows; each row's Attachment box takes a
// dropped file too. A TOP-UP CLAIM (made from an approved top-up request) can
// only be submitted when its reload row is exactly the approved amount.
// A row can also be a FLEET CARD RELOAD (chosen in the vehicle box): the
// person topped up a fleet card with cash and claims that amount back. It has
// a card instead of a vehicle, no litres, and is always payable.
const fuelWord = (v) => (v?.fuel_type === 'petrol' ? 'Petrol' : 'Diesel')
const blankLine = (mine) => ({
  key: Math.random().toString(36).slice(2),
  fill_date: today(),
  line_kind: 'fill',
  card_id: '',
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

export function ClaimForm({ company, user, vehicles, cards = [], claim, lines: initialLines, onSaved, onCancel }) {
  // Vehicle list: the vehicles this person drives (Machinery Profile →
  // drivers) plus the company's general-use vehicles; a vehicle already on
  // the claim stays listed. Own vehicle first, so a new row starts with it.
  const drives = (v) => Boolean(v.driver_ids?.includes(user.id) || v.driver_id === user.id)
  // Active and Insurance-only vehicles (HQ cars are often Insurance only); not Inactive ones.
  const inUse = (v) => (v.status ? v.status !== 'inactive' : v.is_active)
  const usable = useMemo(
    () =>
      vehicles
        .filter((v) => (inUse(v) && (drives(v) || v.general_use)) || initialLines?.some((l) => l.vehicle_id === v.id))
        .sort((a, b) => Number(drives(b)) - Number(drives(a))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [vehicles, initialLines, user.id]
  )
  const mine = usable.find(drives)
  const [submittedOn, setSubmittedOn] = useState(claim?.submitted_on || claim?.fill_date || today())
  const [lines, setLines] = useState(() =>
    initialLines?.length
      ? initialLines.map((l) => ({
          ...blankLine(mine),
          ...l,
          line_kind: l.line_kind || 'fill',
          card_id: l.card_id || '',
          vehicle_id: l.vehicle_id || '',
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
  // Bill to: the companies this person may open in Fuel Manage (one per receipt)
  const { companies } = useCompany()
  const billCos = useMemo(
    () => (companies || []).filter((c) => c.is_active !== false && c.diesel_enabled).sort((a, b) => (a.short_name || a.name).localeCompare(b.short_name || b.name)),
    [companies]
  )
  const coName = (id) => {
    const c = (companies || []).find((x) => x.id === id)
    return c ? c.short_name || c.name : 'Company'
  }
  const [textOpen, setTextOpen] = useState({}) // row key → remark box opened by the note button
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [rowDrag, setRowDrag] = useState(null) // key of the row a file is dragged over
  // Top-up claim: the approved request (its card and amount)
  const [topup, setTopup] = useState(null)
  useEffect(() => {
    let live = true
    if (claim?.topup_request_id) getTopup(claim.topup_request_id).then((t) => live && setTopup(t))
    return () => {
      live = false
    }
  }, [claim?.topup_request_id])
  const topupRow = topup ? lines.find((l) => isReload(l) && l.card_id === topup.card_id) : null
  const sameAmount = (a, b) => Math.round(Number(a || 0) * 100) === Math.round(Number(b || 0) * 100)
  const topupOk = !topup || Boolean(topupRow && sameAmount(topupRow.amount, topup.amount))
  const fileInput = useRef(null)
  const vById = useMemo(() => Object.fromEntries(usable.map((v) => [v.id, v])), [usable])

  const update = (key, patch) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  const remove = (key) => setLines((ls) => ls.filter((l) => l.key !== key))
  const addRow = () => setLines((ls) => [...ls, blankLine(mine)])

  // Keep litres × unit price = amount in step when two of them are typed.
  // Litres and RM amounts are kept to 2 decimals, unit price to 3; the
  // browser refuses to submit a box whose value has more decimals than its
  // step, so rounding happens on autofill, on leaving the box and on save.
  const DP = { litres: 2, unit_price: 3, amount: 2 }
  const fixDp = (field, value) => {
    if (value === '' || value == null) return ''
    const n = Number(value)
    if (!Number.isFinite(n)) return ''
    const f = 10 ** DP[field]
    return (Math.round(n * f) / f).toFixed(DP[field])
  }
  const blurNumber = (l, field) => {
    const v = fixDp(field, l[field])
    if (v !== l[field]) setNumber(l, field, v)
  }
  const setNumber = (l, field, value) => {
    const patch = { [field]: value }
    const L = field === 'litres' ? Number(value) : Number(l.litres)
    const P = field === 'unit_price' ? Number(value) : Number(l.unit_price)
    const A = field === 'amount' ? Number(value) : Number(l.amount)
    if (field !== 'amount' && L > 0 && P > 0) patch.amount = (Math.round(L * P * 100) / 100).toFixed(2)
    else if (field === 'amount' && L > 0 && A > 0 && !l.unit_price) patch.unit_price = (Math.round((A / L) * 1000) / 1000).toFixed(3)
    update(l.key, patch)
  }
  // The vehicle box also lists the fleet cards: picking one makes the row a reload.
  const RELOAD_DESC = 'Fleet card reload'
  const setVehicle = (l, value) => {
    if (value.startsWith('card:'))
      return update(l.key, { line_kind: 'reload', card_id: value.slice(5), vehicle_id: '', litres: '', unit_price: '', payment: 'cash', subsidised: false, description: RELOAD_DESC })
    const v = vById[value]
    const generic = l.description === 'Diesel' || l.description === 'Petrol' || l.description === RELOAD_DESC || !l.description
    update(l.key, { line_kind: 'fill', card_id: '', vehicle_id: value, ...(generic ? { description: fuelWord(v) } : {}) })
  }
  const vehicleValue = (l) => (isReload(l) ? `card:${l.card_id}` : l.vehicle_id)
  // Fleet card = KPDN subsidised diesel; cash at the pump = non-subsidised.
  const setPayment = (l, payment) => update(l.key, { payment, subsidised: payment === 'fleet_card' })

  // Receipt files: one row per file, read for a draft, attached to the row.
  const readable = (f) => f.type.startsWith('image/') || f.type === 'application/pdf' || /\.pdf$/i.test(f.name)
  async function addFiles(fileList) {
    const files = [...fileList].filter(Boolean)
    if (!files.length) return
    // rows still without a receipt get the files first (the top-up reload row first), then new rows
    const empty = lines.filter((l) => !l.file && !l.receipt_path).sort((a, b) => Number(b === topupRow) - Number(a === topupRow))
    const filled = files.slice(0, empty.length).map((file, i) => ({ ...empty[i], file, scan: readable(file) ? 'scanning' : null }))
    const fresh = files.slice(empty.length).map((file) => ({ ...blankLine(mine), file, scan: readable(file) ? 'scanning' : null }))
    const byKey = new Map(filled.map((r) => [r.key, r]))
    setLines((ls) => [...ls.map((l) => byKey.get(l.key) || l), ...fresh])
    for (const row of [...filled, ...fresh]) if (row.scan === 'scanning') await readRow(row)
  }
  // A file chosen or dropped on one row's Attachment box: attached to that row and read.
  async function attach(l, file) {
    if (!file) return
    const row = { ...l, file, scan: readable(file) ? 'scanning' : null }
    update(l.key, { file, scan: row.scan })
    if (row.scan === 'scanning') await readRow(row)
  }

  // Read one row's file and fill the draft figures (never overwrites typed values with blanks).
  async function readRow(row) {
    update(row.key, { scan: 'scanning' })
    const small = row.file.type.startsWith('image/') ? await compressReceipt(row.file) : row.file
    const draft = await scanReceipt(small)
    // A reload row keeps its card: only the date, amount, receipt no. and station are read
    if (isReload(row))
      return update(row.key, {
        scan: 'done',
        ...(draft.fill_date ? { fill_date: draft.fill_date } : {}),
        ...(draft.amount ? { amount: fixDp('amount', draft.amount) } : {}),
        ...(draft.receipt_no ? { receipt_no: draft.receipt_no } : {}),
        ...(draft.station ? { station: draft.station } : {})
      })
    update(row.key, {
      scan: 'done',
      ...(draft.fill_date ? { fill_date: draft.fill_date } : {}),
      ...(draft.litres ? { litres: fixDp('litres', draft.litres) } : {}),
      ...(draft.unit_price ? { unit_price: fixDp('unit_price', draft.unit_price) } : {}),
      ...(draft.amount ? { amount: fixDp('amount', draft.amount) } : {}),
      ...(draft.receipt_no ? { receipt_no: draft.receipt_no } : {}),
      // The person's own vehicle (driver in Machinery Profile) when the row has none yet
      ...(!row.vehicle_id && !row.card_id && mine ? { vehicle_id: mine.id, ...(draft.product ? {} : { description: fuelWord(mine) }) } : {}),
      ...(draft.station ? { station: draft.station } : {}),
      ...(draft.product ? { description: draft.product } : {}),
      ...(draft.payment ? { payment: draft.payment, subsidised: draft.payment === 'fleet_card' } : {})
    })
  }

  const total = lines.reduce((s, l) => s + (Number(l.amount) || 0), 0)
  const payable = lines.filter((l) => l.payment === 'cash').reduce((s, l) => s + (Number(l.amount) || 0), 0)
  const litres = lines.reduce((s, l) => s + (Number(l.litres) || 0), 0)
  const reading = lines.some((l) => l.scan === 'scanning')
  const valid =
    topupOk &&
    lines.length > 0 &&
    lines.every((l) => l.fill_date && Number(l.amount) >= 0 && (isReload(l) ? l.card_id && Number(l.amount) > 0 : Number(l.amount) > 0 || Number(l.litres) > 0))
  // A draft may be half filled: any row with something in it (a photo, a date,
  // a figure); a reload row still needs its card. Blank dates save as today.
  const filled = (l) => Boolean(l.file || l.receipt_path || Number(l.amount) > 0 || Number(l.litres) > 0 || l.receipt_no || l.station || l.vehicle_id)
  const draftValid = lines.some(filled) && lines.every((l) => !isReload(l) || l.card_id)

  // status: 'draft' (Save as draft) or 'pending' (Submit). A pending claim being edited stays pending.
  async function save(e, status = 'pending') {
    e?.preventDefault?.()
    const asDraft = status === 'draft' && (!claim || claim.status === 'draft')
    if (!(asDraft ? draftValid : valid) || busy) return
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
      // A draft keeps its empty rows out, and blank figures as blanks.
      if (asDraft) {
        const kept = prepared.filter(filled)
        prepared.length = 0
        for (const l of kept)
          prepared.push({
            ...l,
            fill_date: l.fill_date || today(),
            amount: Number(l.amount) > 0 ? l.amount : 0,
            litres: Number(l.litres) > 0 ? l.litres : '',
            unit_price: Number(l.unit_price) >= 0 ? l.unit_price : ''
          })
      }
      const wasDraft = claim?.status === 'draft'
      const next = claim && !wasDraft ? undefined : status // only a new claim or a draft changes status here
      const header = { submitted_on: submittedOn, notes: claim?.notes || '', status: next }
      const id = claim ? (await updateClaimWithLines(claim.id, header, prepared), claim.id) : await createClaimWithLines(company.id, user.id, header, prepared)
      if ((!claim || wasDraft) && status === 'pending') notifyClaim(id) // email the approvers about the submitted claim
      onSaved(id)
    } catch (err) {
      uploaded.forEach(removeReceipt)
      setError(err.message || 'Could not save. Please try again.')
      setBusy(false)
    }
  }

  // New claim or a draft: Save as draft / Submit claim. A pending claim: Save changes.
  const draftable = !claim || claim.status === 'draft'
  const buttons = (
    <div className="flex justify-end gap-2">
      <Button type="button" variant="secondary" onClick={onCancel}>
        Cancel
      </Button>
      {draftable && (
        <Button type="button" variant="secondary" disabled={busy || !draftValid || reading} onClick={(e) => save(e, 'draft')}>
          {busy ? 'Saving…' : 'Save as draft'}
        </Button>
      )}
      <Button type="submit" disabled={busy || !valid || reading}>
        {busy ? 'Saving…' : reading ? 'Reading receipts…' : draftable ? 'Submit claim' : 'Save changes'}
      </Button>
    </div>
  )

  const cell = `${inputCls} h-9 px-2 text-sm`
  const tall = `${inputCls} h-[78px] px-2 text-sm` // two lines tall, same as date + receipt no.

  return (
    <form onSubmit={save} className="space-y-4">
      {error && <p className="rounded-lg bg-red-100 p-2.5 text-sm text-red-700">{error}</p>}
      {buttons}
      {topup && (
        <p className={`rounded-xl px-4 py-2.5 text-sm ${topupOk ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900'}`}>
          Top-up claim for request <b>{topupNo(topup)}</b>: approved <b>{money(topup.amount)}</b>.{' '}
          {topupOk
            ? 'The reload matches the approved amount.'
            : topupRow
              ? `The reload receipt must be ${money(topup.amount)} (now ${money(Number(topupRow.amount) || 0)}). Attach the matching receipt or correct the amount.`
              : 'Keep the fleet card reload row for this card.'}
        </p>
      )}

      {/* Header */}
      <Card className="p-4 sm:p-5">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
          <div className="grid gap-3 sm:grid-cols-3">
            <F label="Created date">
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
            <F label="Payable amount" hint="Cash receipts and fleet card reloads">
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
                <th className="w-40 px-2 py-2.5">Payment method</th>
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
                      <select value={vehicleValue(l)} onChange={(e) => setVehicle(l, e.target.value)} className={`${tall} tracking-wide ${isReload(l) ? 'font-semibold text-emerald-700' : ''}`} title="Vehicle, or a fleet card to reload">
                        {opt(usable.map((v) => [v.id, vehicleLabel(v)]), '— No vehicle —')}
                        {cards.length > 0 && (
                          <optgroup label="Fleet card reload">
                            {cards.map((c) => (
                              <option key={c.id} value={`card:${c.id}`}>
                                Reload · {cardLabel(c)}
                              </option>
                            ))}
                          </optgroup>
                        )}
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
                          <input type="number" inputMode="decimal" min="0" step="any" placeholder={isReload(l) ? '—' : 'Litre'} disabled={isReload(l)} value={l.litres} onChange={(e) => setNumber(l, 'litres', e.target.value)} onBlur={() => blurNumber(l, 'litres')} className={`${cell} pr-8 text-right`} title="Litres" />
                        </Unit>
                        <Unit unit="RM/L">
                          <input type="number" inputMode="decimal" min="0" step="any" placeholder={isReload(l) ? '—' : 'Unit price'} disabled={isReload(l)} value={l.unit_price} onChange={(e) => setNumber(l, 'unit_price', e.target.value)} onBlur={() => blurNumber(l, 'unit_price')} className={`${cell} pr-12 text-right`} title="Unit price" />
                        </Unit>
                      </div>
                    </td>
                    <td className="px-2 py-3">
                      <Unit unit="RM" left>
                        <input type="number" inputMode="decimal" min="0" step="any" value={l.amount} onChange={(e) => setNumber(l, 'amount', e.target.value)} onBlur={() => blurNumber(l, 'amount')} className={`${tall} pl-10 text-right font-semibold ${l === topupRow && !topupOk ? 'border-red-400 ring-2 ring-red-200' : ''}`} title="Total fuel expenses" />
                      </Unit>
                      {l === topupRow && (
                        <p className={`mt-1 text-right text-[11px] font-medium ${topupOk ? 'text-emerald-700' : 'text-red-600'}`}>Approved {money(topup.amount)}</p>
                      )}
                    </td>
                    <td className="px-2 py-3">
                      <Unit unit="RM" left>
                        <input value={payableLine.toFixed(2)} disabled className={`${tall} pl-10 text-right font-bold text-brand-dark`} title="Claim payable amount (cash receipts and fleet card reloads)" />
                      </Unit>
                    </td>
                    <td className="px-2 py-3">
                      <div className="space-y-1.5">
                        <select value={l.payment} disabled={isReload(l)} onChange={(e) => setPayment(l, e.target.value)} className={cell} title={isReload(l) ? 'A reload is paid in cash and claimed back' : 'Payment method'}>
                          {opt(PAYMENTS)}
                        </select>
                        <p className={`flex h-9 items-center rounded-lg px-2 text-xs font-medium ${isReload(l) ? 'bg-sky-50 text-sky-700' : l.payment === 'fleet_card' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                          {isReload(l) ? 'Card top-up · paid back' : PAYMENT_NOTE[l.payment]}
                        </p>
                      </div>
                    </td>
                    <td className="px-2 py-3">
                      {/* Remark: two buttons — Bill to company (one per receipt) and a text note */}
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-1.5">
                          <label
                            className={`relative inline-flex h-8 min-w-0 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-2 text-xs font-semibold ${
                              l.bill_to_company_id ? 'border-brand bg-brand text-white' : 'border-dashed border-slate-300 text-slate-500 hover:border-slate-500 hover:text-slate-800'
                            }`}
                            title={l.bill_to_company_id ? `Bill to ${coName(l.bill_to_company_id)} (click to change)` : 'Bill to company: which company this fuel is charged to later'}
                          >
                            <IconBuilding width={15} height={15} className="shrink-0" />
                            <span className="truncate">{l.bill_to_company_id ? coName(l.bill_to_company_id) : 'Bill to'}</span>
                            {/* the real drop-down sits invisibly on top, so it opens the phone / browser list */}
                            <select
                              value={l.bill_to_company_id || ''}
                              onChange={(e) => update(l.key, { bill_to_company_id: e.target.value })}
                              className="absolute inset-0 cursor-pointer opacity-0"
                              aria-label="Bill to company"
                            >
                              <option value="">— Not charged to another company —</option>
                              {billCos.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.name}
                                  {c.short_name ? ` (${c.short_name})` : ''}
                                </option>
                              ))}
                            </select>
                          </label>
                          <button
                            type="button"
                            onClick={() => setTextOpen((o) => ({ ...o, [l.key]: !(o[l.key] ?? Boolean(l.remark)) }))}
                            className={`inline-flex h-8 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg border px-2 text-xs font-semibold ${
                              l.remark ? 'border-slate-400 bg-slate-100 text-slate-800' : 'border-dashed border-slate-300 text-slate-500 hover:border-slate-500 hover:text-slate-800'
                            }`}
                            title={l.remark ? 'Remark text' : 'Add remark text'}
                            aria-label="Remark text"
                          >
                            <IconNotebook width={15} height={15} className="shrink-0" />
                            <span className="truncate">Note</span>
                          </button>
                        </div>
                        {(textOpen[l.key] ?? Boolean(l.remark)) && (
                          <textarea autoFocus={textOpen[l.key] === true && !l.remark} value={l.remark} maxLength={300} rows={2} placeholder="More details…" onChange={(e) => update(l.key, { remark: e.target.value })} className={`${cell} h-auto resize-none py-1.5`} title="Remark" />
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-3">
                      <label
                        onDragOver={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          setRowDrag(l.key)
                        }}
                        onDragLeave={() => setRowDrag((k) => (k === l.key ? null : k))}
                        onDrop={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          setRowDrag(null)
                          attach(l, e.dataTransfer.files?.[0])
                        }}
                        className={`${tall} flex cursor-pointer flex-col items-center justify-center gap-1 border-dashed text-xs hover:border-brand ${rowDrag === l.key ? 'border-brand bg-brand-light' : ''}`}
                        title="Choose a file, or drop it here"
                      >
                        <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => (attach(l, e.target.files?.[0]), (e.target.value = ''))} />
                        <span className="rounded-md border border-slate-300 bg-white px-2 py-0.5 font-medium text-slate-700">{rowDrag === l.key ? 'Drop here' : 'Choose or drop'}</span>
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
