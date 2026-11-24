import { useEffect, useMemo, useState } from 'react'
import { Button, Modal } from '../ui.jsx'
import { IconPencil, IconTrash } from '../icons.jsx'
import { addUsage, cardMonthUsage, deleteCardRecord } from '../../lib/diesel.js'
import { monthLabel, thisMonth } from '../../lib/format.js'

// Fleet card usage by date and driver (the card page → Usage → View):
// rows = dates 1–31 of the month, columns = drivers, cells = litres used.
// A box is green when its fill-ups come from fuel claims, orange when added by
// hand or from the Fuel Station Portal (the AI agent's daily import), i.e. not
// claimed (a day with both is orange).
// Edit (usage: add): click a cell to add a fill-up by hand; a fill-up added by
// hand can be removed again (usage: delete); claims and the Fuel Station
// Portal stay as they are.

export const ORIGIN = {
  claim: { tag: 'C', label: 'Fuel claim', cls: 'bg-emerald-100 text-emerald-800' },
  portal: { tag: 'P', label: 'Fuel Station Portal', cls: 'bg-sky-100 text-sky-800' },
  manual: { tag: 'M', label: 'Added by hand', cls: 'bg-slate-200 text-slate-700' }
}
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
  const [cell, setCell] = useState(null) // { date, col } being edited
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
  const sum = (rs) => rs.reduce((s, r) => s + Number(r.litres || 0), 0)
  const today = new Date().toISOString().slice(0, 10)
  // green = all from fuel claims; orange = added by hand / from the Fuel Station Portal (not claimed)
  const tone = (rs) => (!rs.length ? '' : rs.every((r) => (r.origin || 'claim') === 'claim') ? 'bg-emerald-100' : 'bg-orange-100')

  return (
    <Modal open onClose={onClose} wide="xl" title={`Fleet card : ${title}`}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setMonth((m) => shift(m, -1))} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50" aria-label="Previous month">
          ‹
        </button>
        <span className="w-28 text-center text-sm font-semibold text-slate-800">{monthLabel(month)}</span>
        <button
          type="button"
          onClick={() => setMonth((m) => shift(m, 1))}
          disabled={month >= thisMonth()}
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
          <span className="text-slate-400">· litres</span>
        </span>
        <span className="flex-1" />
        {editing && <span className="text-xs text-brand-dark">Click a box to add a fill-up</span>}
        {canAdd && (
          <Button size="sm" variant={editing ? 'primary' : 'secondary'} onClick={() => setEditing((v) => !v)}>
            <IconPencil width={15} height={15} /> {editing ? 'Done' : 'Edit'}
          </Button>
        )}
      </div>

      {rows === undefined ? (
        <p className="py-10 text-center text-sm text-slate-400">Loading…</p>
      ) : rows === null ? (
        <p className="py-10 text-center text-sm text-slate-500">Run the Fuel SQL migration 20261212 (fleet card statement) to see the usage here.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          {/* compact rows: the whole month (28–31 days) shows without scrolling */}
          <table className="w-full border-collapse text-xs">
            <thead className="bg-slate-50">
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="sticky left-0 z-20 w-16 border-b border-slate-200 bg-slate-50 px-3 py-1.5">Date</th>
                {cols.map((c) => (
                  <th key={c.key} className="min-w-[8rem] border-b border-l border-slate-200 px-3 py-1.5 text-right normal-case tracking-normal">
                    {c.name}
                  </th>
                ))}
                <th className="min-w-[6rem] border-b border-l border-slate-200 px-3 py-1.5 text-right">Total L</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: days }, (_, i) => i + 1).map((d) => {
                const date = dateOf(d)
                const future = date > today
                const dayRows = list.filter((r) => r.date === date)
                return (
                  <tr key={d} className={`${new Date(date).getDay() === 0 ? 'bg-slate-50/70' : ''} ${future ? 'text-slate-300' : ''}`}>
                    <td className="sticky left-0 z-[1] border-b border-slate-100 bg-white px-3 py-px font-semibold tabular-nums text-slate-700">{d}</td>
                    {cols.map((c) => {
                      const rs = inCell(date, c)
                      const clickable = editing && !future
                      return (
                        <td
                          key={c.key}
                          onClick={clickable ? () => setCell({ date, col: c }) : undefined}
                          className={`border-b border-l border-slate-100 px-3 py-px text-right tabular-nums ${tone(rs)} ${clickable ? 'cursor-pointer hover:ring-2 hover:ring-inset hover:ring-brand/40' : ''}`}
                        >
                          {rs.length ? (
                            <b className="font-semibold text-slate-900">{n2(sum(rs))}</b>
                          ) : clickable ? (
                            <span className="text-slate-300">+</span>
                          ) : (
                            ''
                          )}
                        </td>
                      )
                    })}
                    <td className="border-b border-l border-slate-100 px-3 py-px text-right font-semibold tabular-nums text-slate-700">{dayRows.length ? n2(sum(dayRows)) : ''}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot className="bg-slate-50">
              <tr className="font-bold">
                <td className="sticky left-0 border-t-2 border-slate-200 bg-slate-50 px-3 py-1.5 uppercase tracking-wide text-slate-500">Total</td>
                {cols.map((c) => (
                  <td key={c.key} className="border-l border-t-2 border-slate-200 px-3 py-1.5 text-right tabular-nums">
                    {n2(sum(list.filter((r) => colKey(r) === c.key)))}
                  </td>
                ))}
                <td className="border-l border-t-2 border-slate-200 px-3 py-1.5 text-right tabular-nums">{n2(sum(list))}</td>
              </tr>
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
