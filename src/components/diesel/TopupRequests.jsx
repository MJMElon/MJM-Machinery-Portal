import { useState } from 'react'
import { Badge, Button, Card, Modal } from '../ui.jsx'
import { IconPrint } from '../icons.jsx'
import { Empty, F, inputCls } from './shared.jsx'
import { TOPUP_STATUS, cancelTopup, decideTopup, personLabel, requestTopup, topupDone, topupNo } from '../../lib/diesel.js'
import { day, money, today } from '../../lib/format.js'
import { printHtml } from '../../lib/printFrame.js'

// Fleet card top-up requests (Fleet Card Manage).
//   RequestTopupModal  the form: fleet card, amount, needed by, reason → Pending
//   TopupSection       the requests: "To approve" (approver), "My requests", "All";
//                      Approve / Reject, Cancel, Mark topped up, Print approval
// After the top-up is done the user claims the reload on a fuel claim.

const cardText = (c, vById) =>
  c ? `${c.card_no}${c.vehicle_id && vById.get(c.vehicle_id) ? ` (${vById.get(c.vehicle_id).reg_no || vById.get(c.vehicle_id).name})` : ''}` : '—'

export function RequestTopupModal({ company, cards, vById, balance, onClose, onSaved, cardId }) {
  const usable = cards.filter((c) => c.card_no && !['cancelled', 'inactive', 'application'].includes(c.status))
  const [f, setF] = useState({ card_id: cardId || (usable.length === 1 ? usable[0].id : ''), amount: '', needed_by: '', reason: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))
  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await requestTopup(company.id, f)
      await onSaved()
      onClose()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }
  return (
    <Modal open onClose={onClose} title="Request top up">
      <form onSubmit={submit} className="space-y-3">
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {usable.length === 0 ? (
          <p className="text-sm text-slate-500">No active fleet card with a card number in {company.name}.</p>
        ) : (
          <>
            <F label="Fleet card" hint={f.card_id && balance ? `Card balance now: ${money(balance[f.card_id] || 0)}` : null}>
              <select required value={f.card_id} onChange={set('card_id')} className={inputCls}>
                <option value="">Choose fleet card…</option>
                {usable.map((c) => (
                  <option key={c.id} value={c.id}>
                    {cardText(c, vById)}
                    {c.provider ? ` · ${c.provider}` : ''}
                  </option>
                ))}
              </select>
            </F>
            <div className="grid grid-cols-2 gap-3">
              <F label="Top-up amount (RM)">
                <input type="number" min="0.01" step="0.01" required value={f.amount} onChange={set('amount')} className={inputCls} />
              </F>
              <F label="Needed by (optional)">
                <input type="date" min={today()} value={f.needed_by} onChange={set('needed_by')} className={inputCls} />
              </F>
            </div>
            <F label="Reason">
              <textarea rows={3} maxLength={500} value={f.reason} onChange={set('reason')} placeholder="e.g. Balance low, trips to site next week" className={`${inputCls} h-auto py-2`} />
            </F>
          </>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy || !f.card_id || !(Number(f.amount) > 0)}>
            {busy ? 'Submitting…' : 'Submit'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

export function TopupSection({ company, access, me, topups, cards, vById, person, balance, onChanged, onError }) {
  const cById = new Map(cards.map((c) => [c.id, c]))
  const who = (id) => (id ? personLabel(person.get(id)) : '—')
  const approvable = (r) => r.status === 'pending' && r.requested_by !== me && access.approvesTopup?.(r.requested_by)
  const toApprove = topups.filter(approvable)
  const mine = topups.filter((r) => r.requested_by === me)
  // Procurement: every approved request is theirs to top up
  const procurement = access.can('topup', 'process')
  const toTopUp = topups.filter((r) => r.status === 'approved')
  const tabs = [
    access.topupApprover || toApprove.length ? ['approve', `To approve (${toApprove.length})`] : null,
    procurement ? ['topup', `To top up (${toTopUp.length})`] : null,
    ['mine', `My requests (${mine.length})`],
    topups.length > mine.length ? ['all', `All (${topups.length})`] : null
  ].filter(Boolean)
  const [tab, setTab] = useState(tabs[0][0])
  const [decide, setDecide] = useState(null) // { r, approve }
  const [done, setDone] = useState(null) // request to mark topped up
  const [busyId, setBusyId] = useState(null)
  const list = tab === 'approve' ? toApprove : tab === 'topup' ? toTopUp : tab === 'mine' ? mine : topups

  async function act(id, fn) {
    setBusyId(id)
    try {
      await fn()
      await onChanged()
    } catch (e) {
      onError(e.message)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-5 py-3">
        <h3 className="font-semibold text-slate-800">Top-up requests</h3>
        <div className="flex flex-wrap gap-1">
          {tabs.map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${tab === k ? 'bg-brand text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {list.length === 0 ? (
        <Empty>{tab === 'approve' ? 'Nothing waiting for your approval.' : tab === 'topup' ? 'No approved request waiting to be topped up.' : 'No top-up requests yet.'}</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-5 py-2.5">Request</th>
                <th className="px-3 py-2.5">Fleet card</th>
                <th className="px-3 py-2.5 text-right">Amount</th>
                <th className="px-3 py-2.5">Requested by</th>
                <th className="px-3 py-2.5">Reason</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {list.map((r) => {
                const st = TOPUP_STATUS[r.status] || TOPUP_STATUS.pending
                const busy = busyId === r.id
                const printable = ['approved', 'topped_up'].includes(r.status)
                return (
                  <tr key={r.id} className="align-top">
                    <td className="px-5 py-3">
                      <p className="font-semibold text-slate-800">{topupNo(r)}</p>
                      <p className="text-xs text-slate-500">{day(r.requested_at.slice(0, 10))}</p>
                      {r.needed_by && <p className="text-xs text-amber-700">Needed by {day(r.needed_by)}</p>}
                    </td>
                    <td className="px-3 py-3 text-slate-700">
                      {cardText(cById.get(r.card_id), vById)}
                      {balance && <span className="block text-xs text-slate-400">balance now {money(balance[r.card_id] || 0)}</span>}
                    </td>
                    <td className="px-3 py-3 text-right font-semibold tabular-nums">{money(r.amount)}</td>
                    <td className="px-3 py-3 text-slate-700">{who(r.requested_by)}</td>
                    <td className="max-w-[16rem] px-3 py-3 text-slate-600">{r.reason || '—'}</td>
                    <td className="px-3 py-3">
                      <Badge color={st.color}>{st.label}</Badge>
                      {r.decided_by && (
                        <span className="mt-1 block text-xs text-slate-500">
                          {r.status === 'rejected' ? 'Rejected' : 'Approved'} by {who(r.decided_by)}
                          {r.decided_at ? `, ${day(r.decided_at.slice(0, 10))}` : ''}
                        </span>
                      )}
                      {r.decision_note && <span className="block text-xs italic text-slate-500">“{r.decision_note}”</span>}
                      {r.topped_up_on && <span className="block text-xs text-blue-700">Topped up {day(r.topped_up_on)}</span>}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap justify-end gap-1.5">
                        {approvable(r) && (
                          <>
                            <Button size="sm" disabled={busy} onClick={() => setDecide({ r, approve: true })}>
                              Approve
                            </Button>
                            <Button size="sm" variant="secondary" className="text-red-600" disabled={busy} onClick={() => setDecide({ r, approve: false })}>
                              Reject
                            </Button>
                          </>
                        )}
                        {r.status === 'pending' && r.requested_by === me && (
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={busy}
                            onClick={() => window.confirm('Cancel this top-up request?') && act(r.id, () => cancelTopup(r.id))}
                          >
                            Cancel
                          </Button>
                        )}
                        {r.status === 'approved' && (r.requested_by === me || access.approvesTopup?.(r.requested_by) || access.can('cards', 'edit') || procurement) && (
                          <Button size="sm" variant="secondary" disabled={busy} onClick={() => setDone(r)}>
                            Mark topped up
                          </Button>
                        )}
                        {printable && (
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={busy}
                            onClick={() => printTopup({ company, r, card: cById.get(r.card_id), vById, who, balance }).catch((e) => onError(e.message))}
                          >
                            <IconPrint width={16} height={16} /> Print
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="border-t border-slate-100 px-5 py-2.5 text-xs text-slate-500">
        After approval: print it for the office to top up the card, mark it Topped up, then claim the reload on a fuel claim (Fleet card reload line).
      </p>

      {decide && (
        <DecideModal
          r={decide.r}
          approve={decide.approve}
          label={`${topupNo(decide.r)} · ${money(decide.r.amount)} · ${who(decide.r.requested_by)}`}
          onClose={() => setDecide(null)}
          onDone={async (note) => {
            await decideTopup(decide.r.id, decide.approve, note)
            await onChanged()
          }}
        />
      )}
      {done && (
        <DoneModal
          r={done}
          onClose={() => setDone(null)}
          onDone={async (date) => {
            await topupDone(done.id, date)
            await onChanged()
          }}
        />
      )}
    </Card>
  )
}

function DecideModal({ approve, label, onClose, onDone }) {
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function go() {
    setBusy(true)
    try {
      await onDone(note)
      onClose()
    } catch (e) {
      setError(e.message)
      setBusy(false)
    }
  }
  return (
    <Modal open onClose={onClose} title={approve ? 'Approve top-up request' : 'Reject top-up request'}>
      <div className="space-y-3">
        <p className="text-sm font-medium text-slate-700">{label}</p>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <F label={approve ? 'Note (optional)' : 'Reason for rejecting'}>
          <textarea rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} className={`${inputCls} h-auto py-2`} />
        </F>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={go} disabled={busy || (!approve && !note.trim())} className={approve ? '' : 'bg-red-600'}>
            {busy ? 'Saving…' : approve ? 'Approve' : 'Reject'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function DoneModal({ r, onClose, onDone }) {
  const [date, setDate] = useState(today())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function go() {
    setBusy(true)
    try {
      await onDone(date)
      onClose()
    } catch (e) {
      setError(e.message)
      setBusy(false)
    }
  }
  return (
    <Modal open onClose={onClose} title={`Mark ${topupNo(r)} topped up`}>
      <div className="space-y-3">
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <F label="Topped up on">
          <input type="date" max={today()} value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
        </F>
        <p className="text-xs text-slate-500">Then claim the reload on a fuel claim: add a line and choose this card under “Fleet card reload” as the vehicle.</p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={go} disabled={busy || !date}>
            {busy ? 'Saving…' : 'Topped up'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// ---- printout: the approved request, for the office --------------------------
const GREEN = '#14532d'
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function printTopup({ company, r, card, vById, who, balance }) {
  const v = card?.vehicle_id ? vById.get(card.vehicle_id) : null
  const contact = [company.phone && `Tel: ${company.phone}`, company.fax && `Fax: ${company.fax}`, company.email && `Email: ${company.email}`].filter(Boolean).join('    ')
  const row = (k, val) => `<tr><td class="k">${esc(k)}</td><td>${val}</td></tr>`
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8" />
<title>Fleet card top-up ${esc(topupNo(r))}</title>
<style>
@page { size: A4 portrait; margin: 0; }
html, body { margin: 0; padding: 0; background: #fff; color: #111827; }
body { font: 11.5px/1.5 "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.wrap { padding: 16mm 18mm; }
.head { text-align: center; padding-bottom: 10px; border-bottom: 2px solid ${GREEN}; }
.head .name { font-size: 18px; font-weight: 700; }
.head .line { color: #374151; margin-top: 2px; }
.title { margin: 18px 0 14px; text-align: center; font-size: 15px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: ${GREEN}; }
table.d { width: 100%; border-collapse: collapse; }
table.d td { padding: 7px 8px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
table.d td.k { width: 34%; font-weight: 700; background: #f6f8f7; }
.amt { font-size: 16px; font-weight: 700; color: ${GREEN}; }
.status { display: inline-block; padding: 2px 10px; border-radius: 999px; background: #dcfce7; color: #166534; font-weight: 700; }
.sign { width: 100%; margin-top: 48px; border-collapse: collapse; }
.sign td { width: 33.33%; padding-right: 16px; vertical-align: top; }
.sign .label { font-weight: 700; }
.sign .space { height: 48px; }
.sign .ln { border-bottom: 1px solid #111827; width: 88%; padding-bottom: 3px; min-height: 15px; }
.sign .role { padding-top: 4px; color: #374151; }
.foot { margin-top: 26px; color: #6b7280; font-size: 10px; }
</style></head><body><div class="wrap">
  <div class="head">
    <div class="name">${esc(company.name)}</div>
    ${company.registration_no ? `<div class="line">${esc(company.registration_no)}</div>` : ''}
    ${company.address ? `<div class="line">${esc(company.address)}</div>` : ''}
    ${contact ? `<div class="line">${esc(contact)}</div>` : ''}
  </div>
  <div class="title">Fleet card top-up request</div>
  <table class="d">
    ${row('Request no.', `<b>${esc(topupNo(r))}</b>`)}
    ${row('Request date', esc(day(r.requested_at.slice(0, 10))))}
    ${row('Fleet card no.', `<b>${esc(card?.card_no || '—')}</b>${card?.provider ? ` · ${esc(card.provider)}` : ''}`)}
    ${row('Vehicle', esc(v ? v.reg_no || v.name : '—'))}
    ${balance ? row('Card balance (system, when printed)', esc(money(balance[r.card_id] || 0))) : ''}
    ${row('Top-up amount', `<span class="amt">${esc(money(r.amount))}</span>`)}
    ${r.needed_by ? row('Needed by', esc(day(r.needed_by))) : ''}
    ${row('Reason', esc(r.reason || '—'))}
    ${row('Requested by', esc(who(r.requested_by)))}
    ${row('Status', `<span class="status">${esc(TOPUP_STATUS[r.status]?.label || r.status)}</span>`)}
    ${row('Approved by', `${esc(who(r.decided_by))}${r.decided_at ? ` on ${esc(day(r.decided_at.slice(0, 10)))}` : ''}`)}
    ${r.decision_note ? row('Approver note', esc(r.decision_note)) : ''}
    ${r.topped_up_on ? row('Topped up on', esc(day(r.topped_up_on))) : ''}
  </table>
  <table class="sign">
    <tr><td class="label">Requested By:</td><td class="label">Approved By:</td><td class="label">Topped Up By:</td></tr>
    <tr><td class="space"></td><td class="space"></td><td class="space"></td></tr>
    <tr><td><div class="ln">${esc(who(r.requested_by))}</div></td><td><div class="ln">${esc(who(r.decided_by))}</div></td><td><div class="ln"></div></td></tr>
    <tr><td class="role">Requester</td><td class="role">Approver</td><td class="role">Account Department</td></tr>
  </table>
  <p class="foot">After the top-up, the reload is claimed on a fuel claim (Fuel Receipt Claims → Fleet card reload). Printed ${esc(day(today()))}.</p>
</div></body></html>`
  return printHtml(html)
}
