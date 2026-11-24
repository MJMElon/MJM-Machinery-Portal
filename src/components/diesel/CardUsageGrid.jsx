import { useEffect, useMemo, useState } from 'react'
import { Button, Modal } from '../ui.jsx'
import { IconPencil, IconTrash } from '../icons.jsx'
import { addUsage, cardMonthUsage, deleteCardRecord, updateUsage } from '../../lib/diesel.js'
import { monthLabel, thisMonth } from '../../lib/format.js'

// Fleet card usage by date and driver (the card page → Usage → View):
// rows = dates 1–31 of the month, columns = drivers, cells = litres used.
// A box is green when its fill-ups come from fuel claims, orange when added by
// hand or from the Fuel Station Portal (the AI agent's daily import), i.e. not
// claimed (a day with both is orange).
// Days 1–31 left to right, two rows per driver: Litre and RM. Edit (usage: add): every box can be
// typed into (litre and RM, both needed), one Save for the month; a box from a
// claim or the Fuel Station Portal stays locked (click it to add beside it);
// a fill-up added by hand can be changed or cleared (clearing removes it).

export const ORIGIN = {
  claim: { tag: 'C', label: 'Fuel claim', cls: 'bg-emerald-100 text-emerald-800' },
  portal: { tag: 'P', label: 'Fuel Station Portal', cls: 'bg-sky-100 text-sky-800' },
  manual: { tag: 'M', label: 'Added by hand', cls: 'bg-slate-200 text-slate-700' }
}
// day boxes (narrow): up to 2 decimals without trailing zeros (86, 90.3, 76.33)
const n1 = (v) => String(Math.round(Number(v || 0) * 100) / 100)
const n2 = (v) => Number(v || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const shift = (month, d) => {
  const [y, m] = month.split('-').map(Number)
  const t = new Date(y, m - 1 + d, 1)
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`
}
// the column of a fill-up: the driver's id, or the name the station gave
export const colKey = (r) => (r.driver_id ? r.driver_id : `name:${(r.driver || 'No driver recorded').toUpperCase()}`)
export const mismatch = (r) => r.origin === 'claim' && r.on_statement && Math.abs(Number(r.statement_amount) - Number(r.amount)) >= 0.01

export function CardUsageGrid({ company, card, title, drivers, startMonth, canAdd, canDelete, onClose, onChanged }) {
  const [month, setMonth] = useState(startMonth || thisMonth())
  const [rows, setRows] = useState(undefined)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState({}) // 'date|col' → { l, rm } typed in Edit
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [cell, setCell] = useState(null) // a locked box (claim / portal) clicked in Edit: add beside it
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let live = true
    setRows(undefined)
    cardMonthUsage(company.id, card.id, month).then((r) => live && setRows(r))
    return () => {
      live = false
    }
  }, [company.id, card.id, month, tick])

  const list = rows || []
  // columns: the card's drivers first, then anyone else who used it this month
  const cols = useMemo(() => {
    const out = drivers.map((d) => ({ key: d.id, id: d.id, name: d.name }))
    for (const r of list) {
      const k = colKey(r)
      if (!out.some((c) => c.key === k)) out.push({ key: k, id: r.driver_id || null, name: r.driver || 'No driver recorded' })
    }
    return out
  }, [drivers, list])
  const days = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate()
  const dateOf = (d) => `${month}-${String(d).padStart(2, '0')}`
  const inCell = (date, col) => list.filter((r) => r.date === date && colKey(r) === col.key)
  const sumL = (rs) => rs.reduce((s, r) => s + Number(r.litres || 0), 0)
  const sumRM = (rs) => rs.reduce((s, r) => s + Number(r.amount || 0), 0)
  const today = new Date().toISOString().slice(0, 10)
  // green = all from fuel claims; orange = added by hand / from the Fuel Station Portal (not claimed)
  const tone = (rs) => (!rs.length ? '' : rs.every((r) => (r.origin || 'claim') === 'claim') ? 'bg-emerald-100' : 'bg-orange-100')
  // A box is typed into in Edit when it is empty or holds one fill-up added by hand;
  // claims and the Fuel Station Portal stay locked (click to add beside them).
  const editable = (rs) => rs.length === 0 || (rs.length === 1 && rs[0].origin === 'manual' && rs[0].usage_id)
  const key = (date, col) => `${date}|${col.key}`
  const valueOf = (date, col, rs, f) => {
    const d = draft[key(date, col)]
    if (d && d[f] !== undefined) return d[f]
    if (rs.length === 1 && rs[0].origin === 'manual') return String(f === 'l' ? rs[0].litres ?? '' : rs[0].amount ?? '')
    return ''
  }
  const setVal = (date, col, f, v) => setDraft((d) => ({ ...d, [key(date, col)]: { ...d[key(date, col)], [f]: v } }))
  // the changes waiting to be saved; a box with only one of the two is not complete
  const changes = []
  const incomplete = new Set()
  if (editing)
    for (const [k, v] of Object.entries(draft)) {
      const [date, colKeyStr] = k.split('|')
      const col = cols.find((c) => c.key === colKeyStr)
      if (!col) continue
      const rs = inCell(date, col)
      const l = v.l ?? (rs[0]?.origin === 'manual' ? String(rs[0].litres) : '')
      const rm = v.rm ?? (rs[0]?.origin === 'manual' ? String(rs[0].amount) : '')
      const had = rs.length === 1 && rs[0].origin === 'manual' ? rs[0] : null
      const blank = l === '' && rm === ''
      if (!blank && !(Number(l) > 0 && Number(rm) > 0)) {
        incomplete.add(k)
        continue
      }
      if (blank && had) changes.push({ kind: 'delete', had })
      else if (!blank && !had) changes.push({ kind: 'add', date, col, l, rm })
      else if (!blank && had && (Number(l) !== Number(had.litres) || Number(rm) !== Number(had.amount))) changes.push({ kind: 'update', had, l, rm })
    }

  async function save() {
    setSaving(true)
    setError('')
    try {
      const r2 = (v) => Math.round(Number(v) * 100) / 100
      for (const c of changes) {
        if (c.kind === 'add')
          await addUsage(company.id, {
            card_id: card.id,
            fill_date: c.date,
            litres: r2(c.l),
            amount: r2(c.rm),
            source: 'manual',
            vehicle_id: card.vehicle_id || null,
            ...(c.col.id ? { driver_id: c.col.id } : { driver_name: c.col.name })
          })
        else if (c.kind === 'update') await updateUsage(c.had.usage_id, { litres: r2(c.l), amount: r2(c.rm) })
        else if (c.kind === 'delete') await deleteCardRecord('usage', c.had.usage_id)
      }
      setDraft({})
      setEditing(false)
      setTick((t) => t + 1)
      onChanged?.()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }
  const cancel = () => {
    setDraft({})
    setError('')
    setEditing(false)
  }
  const inp = 'block h-5 w-full min-w-0 rounded-sm border border-slate-300 bg-white px-0.5 py-0 text-center text-[11px] leading-none tabular-nums outline-none focus:border-brand focus:ring-1 focus:ring-brand/30'

  return (
    <Modal
      open
      onClose={onClose}
      wide="full"
      title={
        <span className="block">
          <span className="block text-xs font-semibold uppercase tracking-wider text-brand">Fuel Records</span>
          Fleet card : {title}
        </span>
      }
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <button type="button" disabled={editing} onClick={() => setMonth((m) => shift(m, -1))} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-30" aria-label="Previous month">
          ‹
        </button>
        <span className="w-28 text-center text-sm font-semibold text-slate-800">{monthLabel(month)}</span>
        <button
          type="button"
          onClick={() => setMonth((m) => shift(m, 1))}
          disabled={editing || month >= thisMonth()}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-30"
          aria-label="Next month"
        >
          ›
        </button>
        <span className="ml-3 inline-flex items-center gap-3 text-xs text-slate-600">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-5 rounded bg-emerald-100 ring-1 ring-emerald-200" /> Fuel claim
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-5 rounded bg-orange-100 ring-1 ring-orange-200" /> Fuel Station Portal / added by hand
          </span>
        </span>
        <span className="flex-1" />
        {editing ? (
          <>
            {incomplete.size > 0 ? (
              <span className="text-xs font-medium text-red-600">Fill in both litre and RM</span>
            ) : (
              <span className="text-xs text-slate-500" title="Boxes from a claim or the Fuel Station Portal stay as they are: click one to add another fill-up beside it">
                Type litre and RM in the boxes
              </span>
            )}
            <Button size="sm" variant="secondary" disabled={saving} onClick={cancel}>
              Cancel
            </Button>
            <Button size="sm" disabled={saving || incomplete.size > 0 || changes.length === 0} onClick={save}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </>
        ) : (
          canAdd && (
            <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
              <IconPencil width={15} height={15} /> Edit
            </Button>
          )
        )}
      </div>
      {error && <p className="mb-2 rounded-lg bg-red-50 px-3 py-1.5 text-sm text-red-700">{error}</p>}

      {rows === undefined ? (
        <p className="py-10 text-center text-sm text-slate-400">Loading…</p>
      ) : rows === null ? (
        <p className="py-10 text-center text-sm text-slate-500">Run the Fuel SQL migration 20261212 (fleet card statement) to see the usage here.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-300">
          {/* days 1–31 left to right; each driver has a Litre row and an RM row */}
          <table className="w-full table-fixed border-collapse text-[11px]">
            <colgroup>
              <col style={{ width: '8.5rem' }} />
              <col style={{ width: '2.5rem' }} />
              {Array.from({ length: days }, (_, i) => (
                <col key={i} />
              ))}
              <col style={{ width: '4.25rem' }} />
            </colgroup>
            <thead className="bg-slate-100 text-slate-600">
              <tr className="font-semibold">
                <th className="sticky left-0 z-20 border border-slate-300 bg-slate-100 px-2 py-1 text-center">Driver</th>
                <th className="border border-slate-300 px-1 py-1 text-center" />
                {Array.from({ length: days }, (_, i) => i + 1).map((d) => (
                  <th key={d} className={`border border-slate-300 px-0 py-1 text-center tabular-nums ${dateOf(d) > today ? 'text-slate-300' : ''}`}>
                    {d}
                  </th>
                ))}
                <th className="border border-slate-300 px-1 py-1 text-center">Total</th>
              </tr>
            </thead>
            <tbody>
              {cols.map((c) =>
                ['l', 'rm'].map((f) => {
                  const mine = list.filter((r) => colKey(r) === c.key)
                  return (
                    <tr key={`${c.key}-${f}`} className={f === 'rm' ? 'border-b-2 border-slate-300' : ''}>
                      {f === 'l' && (
                        <th rowSpan={2} className="sticky left-0 z-10 border border-slate-300 bg-white px-2 py-1 text-center align-middle text-xs font-semibold text-slate-800">
                          {c.name}
                        </th>
                      )}
                      <td className="border border-slate-300 bg-slate-50 px-1 py-0.5 text-center text-[10px] font-semibold uppercase text-slate-500">{f === 'l' ? 'Litre' : 'RM'}</td>
                      {Array.from({ length: days }, (_, i) => i + 1).map((d) => {
                        const date = dateOf(d)
                        const future = date > today
                        const rs = inCell(date, c)
                        const k = key(date, c)
                        const bad = incomplete.has(k)
                        if (editing && !future && editable(rs))
                          return (
                            <td key={d} className={`border border-slate-300 px-px py-px ${bad ? 'bg-red-50' : tone(rs)}`}>
                              <input
                                inputMode="decimal"
                                aria-label={`${c.name} ${d} ${f === 'l' ? 'litre' : 'RM'}`}
                                value={valueOf(date, c, rs, f)}
                                onChange={(e) => setVal(date, c, f, e.target.value)}
                                className={`${inp} ${bad ? '!border-red-500 !bg-red-50' : ''}`}
                              />
                            </td>
                          )
                        const lock = editing && !future && rs.length > 0 ? () => setCell({ date, col: c }) : undefined
                        return (
                          <td
                            key={d}
                            onClick={lock}
                            title={lock ? 'From a claim or the Fuel Station Portal: click to add beside it' : undefined}
                            className={`border border-slate-300 px-0 py-0.5 text-center tabular-nums ${tone(rs)} ${f === 'l' ? 'font-semibold text-slate-900' : 'text-slate-600'} ${lock ? 'cursor-pointer' : ''}`}
                          >
                            {rs.length ? (f === 'l' ? n1(sumL(rs)) : n1(sumRM(rs))) : ''}
                          </td>
                        )
                      })}
                      <td className="border border-slate-300 bg-slate-50 px-1 py-0.5 text-center font-bold tabular-nums">{f === 'l' ? n2(sumL(mine)) : n2(sumRM(mine))}</td>
                    </tr>
                  )
                })
              )}
            </tbody>
            <tfoot className="bg-slate-100 font-bold">
              {['l', 'rm'].map((f) => (
                <tr key={f}>
                  {f === 'l' && (
                    <th rowSpan={2} className="sticky left-0 border border-slate-300 bg-slate-100 px-2 py-1 text-center uppercase tracking-wide text-slate-600">
                      Total
                    </th>
                  )}
                  <td className="border border-slate-300 px-1 py-0.5 text-center text-[10px] uppercase text-slate-500">{f === 'l' ? 'Litre' : 'RM'}</td>
                  {Array.from({ length: days }, (_, i) => i + 1).map((d) => {
                    const rs = list.filter((r) => r.date === dateOf(d))
                    return (
                      <td key={d} className="border border-slate-300 px-0 py-0.5 text-center tabular-nums">
                        {rs.length ? (f === 'l' ? n1(sumL(rs)) : n1(sumRM(rs))) : ''}
                      </td>
                    )
                  })}
                  <td className="border border-slate-300 px-1 py-0.5 text-center tabular-nums">{f === 'l' ? n2(sumL(list)) : n2(sumRM(list))}</td>
                </tr>
              ))}
            </tfoot>
          </table>
        </div>
      )}

      {cell && (
        <CellEditor
          company={company}
          card={card}
          date={cell.date}
          col={cell.col}
          rows={inCell(cell.date, cell.col)}
          canDelete={canDelete}
          onClose={() => setCell(null)}
          onChanged={() => {
            setTick((t) => t + 1)
            onChanged?.()
          }}
        />
      )}
    </Modal>
  )
}

// One date × driver: what is there (claims and the Fuel Station Portal stay;
// fill-ups added by hand can be removed) and a form to add a fill-up: date,
// litres and RM are all needed (they are compared with the claimant's receipts).
function CellEditor({ company, card, date, col, rows, canDelete, onClose, onChanged }) {
  const [when, setWhen] = useState(date)
  const [litres, setLitres] = useState('')
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const ready = when && Number(litres) > 0 && Number(amount) > 0

  async function run(fn) {
    setBusy(true)
    setError('')
    try {
      await fn()
      onChanged()
      onClose()
    } catch (e) {
      setError(e.message)
      setBusy(false)
    }
  }
  const save = (e) => {
    e.preventDefault()
    if (!ready) return
    run(() =>
      addUsage(company.id, {
        card_id: card.id,
        fill_date: when,
        litres: Math.round(Number(litres) * 100) / 100,
        amount: Math.round(Number(amount) * 100) / 100,
        source: 'manual',
        vehicle_id: card.vehicle_id || null,
        ...(col.id ? { driver_id: col.id } : { driver_name: col.name })
      })
    )
  }
  const box = 'h-10 w-full rounded-xl border border-slate-300 px-3 tabular-nums outline-none focus:border-brand focus:ring-2 focus:ring-brand/20'

  return (
    <Modal open onClose={onClose} title={col.name}>
      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {rows.length > 0 && (
        <ul className="mb-4 divide-y divide-slate-100 rounded-xl border border-slate-200">
          {rows.map((r, i) => {
            const o = ORIGIN[r.origin || 'claim']
            return (
              <li key={r.usage_id || `${r.claim_id}-${i}`} className="flex items-center gap-2 px-3 py-2 text-sm">
                <span className={`rounded px-1.5 py-0.5 text-[11px] font-bold ${o.cls}`}>{o.label}</span>
                {r.origin === 'claim' && r.claim_no != null && <span className="text-xs text-slate-500">Claim {String(r.claim_no).padStart(3, '0')}</span>}
                {mismatch(r) && <span className="text-xs font-semibold text-amber-700">Station portal: RM {n2(r.statement_amount)}</span>}
                <span className="ml-auto tabular-nums text-slate-800">
                  <b>{n2(r.litres)} L</b> · RM {n2(r.amount)}
                </span>
                {r.origin === 'manual' && canDelete && r.usage_id ? (
                  <button type="button" disabled={busy} onClick={() => run(() => deleteCardRecord('usage', r.usage_id))} className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="Remove" title="Remove">
                    <IconTrash width={16} height={16} />
                  </button>
                ) : (
                  <span className="w-6" title="Kept: it comes from a claim or the Fuel Station Portal" />
                )}
              </li>
            )
          })}
        </ul>
      )}
      <form onSubmit={save} className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-slate-600">Date</span>
          <input type="date" required max={new Date().toISOString().slice(0, 10)} value={when} onChange={(e) => setWhen(e.target.value)} className={box} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-slate-600">Litre</span>
          <input type="number" min="0.01" step="0.01" required autoFocus inputMode="decimal" value={litres} onChange={(e) => setLitres(e.target.value)} placeholder="0.00" className={`${box} text-right`} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-slate-600">RM</span>
          <input type="number" min="0.01" step="0.01" required inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className={`${box} text-right`} />
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy || !ready}>
            {busy ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
