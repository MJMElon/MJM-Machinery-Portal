import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PageHeader from '../PageHeader.jsx'
import { Badge, Button, Card } from '../ui.jsx'
import { IconPencil, IconTrash } from '../icons.jsx'
import { ErrorBox, inputCls } from './shared.jsx'
import { UsageBars } from './CardCharts.jsx'
import { CardMonthUsage } from './CardMonthUsage.jsx'
import { RequestTopupModal } from './TopupRequests.jsx'
import { CARD_STATUS, cardBalances, autoTopupCheck, autoTopupStatus, procurementPeople, deleteCard, personLabel, saveCard, setAutoTopup, setCardPassword, vehicleLabel } from '../../lib/diesel.js'
import { PasswordField, PasswordInput } from './CardPassword.jsx'
import { money, num, thisMonth } from '../../lib/format.js'
import { useAuth } from '../../auth/AuthContext.jsx'

// A fleet card in use (tested), one page, edited in place:
//   top     Fleet card details (Edit → fields, status incl. Inactive, Save,
//           Delete fleet card) | Fleet card drivers (Edit → add / remove, Save),
//           same height, the driver list scrolls
//   middle  this month's usage (‹ › month) with subsidy / used / balance,
//           beside the month's usage by driver
//   bottom  usage by month Jan – Dec, one chart: a litres bar and an RM bar (‹ › year), and the
//           card balance now.
// Editing needs Fleet Card Manage edit rights (delete: delete rights);
// everyone else only reads.

const box = `${inputCls} h-9 px-3 text-sm`
const STATUSES = ['active', 'inactive', 'blocked', 'cancelled']
const STATIONS = ['Petronas', 'Setel', 'Shell', 'Petron', 'Caltex', 'BHP']

const detailsOf = (c) => ({
  card_no: c.card_no || '',
  status: c.status || 'active',
  provider: c.provider || '',
  vehicle_id: c.vehicle_id || '',
  subsidy_litres: c.subsidy_litres ?? '',
  login_id: c.login_id || '',
  login_password: '', // never loaded: typed only to set a new one
  notes: c.notes || ''
})
const driversOf = (c) => (c.driver_ids?.length ? c.driver_ids : c.driver_id ? [c.driver_id] : [])

export function FleetCardInUse({ company, access, card, vehicles, people, ledger, reload, startEdit = false, companyTag = null }) {
  const navigate = useNavigate()
  const canEdit = access.can('cards', 'edit')
  const canDelete = access.can('cards', 'delete')
  const [editDetails, setEditDetails] = useState(startEdit && canEdit)
  const [editDrivers, setEditDrivers] = useState(false)
  const [form, setForm] = useState(() => detailsOf(card))
  const [drivers, setDrivers] = useState(() => driversOf(card))
  const [vehicleQuery, setVehicleQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [clearPw, setClearPw] = useState(false)
  const hasPw = Boolean(card.login_password_set || card.login_password)
  const [error, setError] = useState('')
  const [askTopup, setAskTopup] = useState(false)
  const [year, setYear] = useState(new Date().getFullYear())

  // a fresh copy of the card (after saving) resets the boxes
  useEffect(() => {
    setForm(detailsOf(card))
    setDrivers(driversOf(card))
  }, [card])

  const vById = useMemo(() => new Map(vehicles.map((v) => [v.id, v])), [vehicles])
  const person = useMemo(() => new Map(people.map((p) => [p.user_id, p])), [people])
  const nameOf = (uid) => (person.get(uid) ? personLabel(person.get(uid)) : 'Unknown user')
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const st = CARD_STATUS[card.status] || CARD_STATUS.active
  const quota = card.subsidy_litres == null ? null : Number(card.subsidy_litres)

  async function run(fn) {
    setBusy(true)
    setError('')
    try {
      await fn()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }
  const saveDetails = () =>
    run(async () => {
      if (!form.vehicle_id) throw new Error('Choose the vehicle.')
      await saveCard(company.id, {
        id: card.id,
        card_no: form.card_no.trim() || null,
        status: form.status,
        provider: form.provider.trim() || null,
        vehicle_id: form.vehicle_id,
        subsidy_litres: form.subsidy_litres === '' ? null : Number(form.subsidy_litres),
        login_id: form.login_id.trim() || null,
        notes: form.notes.trim() || null
      })
      // the password is kept in a locked table (Procurement can see it)
      if (form.login_password.trim() || clearPw) await setCardPassword(card.id, clearPw ? '' : form.login_password.trim())
      setClearPw(false)
      setEditDetails(false)
      await reload()
    })
  const saveDrivers = () =>
    run(async () => {
      await saveCard(company.id, { id: card.id, driver_ids: drivers, driver_id: drivers[0] || null })
      setEditDrivers(false)
      await reload()
    })
  const remove = () => {
    if (!window.confirm(`Delete fleet card ${card.card_no || ''}? This cannot be undone.`)) return
    run(async () => {
      await deleteCard(card.id)
      navigate('/diesel/cards', { replace: true })
    })
  }

  // vehicle choice: search any machine; light vehicles first
  const q = vehicleQuery.trim().toLowerCase()
  const vehicleList = vehicles
    .filter((v) => v.id === form.vehicle_id || !q || [v.name, v.reg_no, v.machine_type, v.brand, v.model].filter(Boolean).join(' ').toLowerCase().includes(q))
    .sort((a, b) => Number(/light/i.test(b.machine_type || '')) - Number(/light/i.test(a.machine_type || '')) || a.name.localeCompare(b.name))

  // usage by month for the year shown, and the balance now
  const mine = (ledger || []).filter((r) => r.card_id === card.id)
  const balanceNow = cardBalances(mine)[card.id] || 0
  const month = thisMonth()
  const monthRows = Array.from({ length: 12 }, (_, i) => {
    const m = `${year}-${String(i + 1).padStart(2, '0')}`
    const used = mine.filter((r) => r.month === m && r.kind === 'usage')
    return {
      month: m,
      future: m > month,
      litres: used.reduce((t, r) => t + Number(r.litres || 0), 0),
      rm: used.reduce((t, r) => t + Number(r.amount || 0), 0)
    }
  })
  const thisYear = new Date().getFullYear()
  const firstYear = Math.min(thisYear, ...mine.map((r) => Number(r.month.slice(0, 4))))

  const editBtn = (onClick) =>
    canEdit && (
      <button
        type="button"
        onClick={onClick}
        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
      >
        <IconPencil width={14} height={14} /> Edit
      </button>
    )
  const arrow = 'flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-30'

  return (
    <div className="space-y-4">
      <PageHeader
        backTo="/diesel/cards"
        backLabel="Back to fleet card list"
        title={
          <span className="inline-flex flex-wrap items-center gap-3">
            {/* opened from the Consolidate view: the company short name first */}
            {companyTag && <span className="rounded-lg bg-slate-200 px-2 py-0.5 text-base font-bold text-slate-700">{companyTag}</span>}
            {card.card_no || 'Fleet card'}
            <Badge color={st.color}>{st.label}</Badge>
          </span>
        }
        right={
          <div className="flex flex-wrap gap-2">
            {access.procurement && card.card_no && !['cancelled', 'inactive'].includes(card.status) && <Button onClick={() => setAskTopup(true)}>Request top up</Button>}
            {canDelete && (
              <Button variant="secondary" className="text-red-600" disabled={busy} onClick={remove}>
                <IconTrash width={18} height={18} /> Delete fleet card
              </Button>
            )}
          </div>
        }
      />
      <ErrorBox>{error}</ErrorBox>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* Fleet card details */}
        <Card className="p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="font-display text-lg font-bold text-slate-900 underline decoration-slate-300 underline-offset-4">Fleet card details</h3>
            {!editDetails && editBtn(() => setEditDetails(true))}
          </div>
          {!editDetails ? (
            <div className="grid gap-x-8 md:grid-cols-2">
              <div>
                <Field label="Card number">{card.card_no}</Field>
                <Field label="Status">{st.label}</Field>
                <Field label="Fuel station">{card.provider}</Field>
                <Field label="Vehicle">{card.vehicle_id ? vehicleLabel(vById.get(card.vehicle_id)) : ''}</Field>
              </div>
              <div>
                <Field label="Subsidy / month">{quota != null ? `${num(quota, 2)} L` : ''}</Field>
                <Field label="Web login ID">{card.login_id}</Field>
                <Field label="Login password">
                  <PasswordField cardId={card.id} has={hasPw} canSee={access.procurement} />
                </Field>
                <Field label="Notes">{card.notes}</Field>
              </div>
            </div>
          ) : (
            <div>
              <div className="grid gap-x-6 gap-y-3 md:grid-cols-2">
                <Input label="Card number">
                  <input value={form.card_no} onChange={set('card_no')} maxLength={40} className={box} />
                </Input>
                <Input label="Status">
                  <select value={form.status} onChange={set('status')} className={box}>
                    {STATUSES.map((k) => (
                      <option key={k} value={k}>
                        {CARD_STATUS[k].label}
                      </option>
                    ))}
                  </select>
                </Input>
                <Input label="Fuel station">
                  <input value={form.provider} onChange={set('provider')} list="fuel-stations-inuse" placeholder="Petronas / Shell / Petron" className={box} />
                  <datalist id="fuel-stations-inuse">
                    {STATIONS.map((s) => (
                      <option key={s} value={s} />
                    ))}
                  </datalist>
                </Input>
                <Input label="Subsidy / month (L)">
                  <input type="number" min="0" step="0.01" value={form.subsidy_litres} onChange={set('subsidy_litres')} className={box} />
                </Input>
                <Input label="Vehicle" wide>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <input type="search" value={vehicleQuery} onChange={(e) => setVehicleQuery(e.target.value)} placeholder="Search name, plate, type…" className={box} aria-label="Search vehicle" />
                    <select value={form.vehicle_id} onChange={set('vehicle_id')} className={box} aria-label="Vehicle">
                      <option value="">Choose vehicle…</option>
                      {vehicleList.map((v) => (
                        <option key={v.id} value={v.id}>
                          {vehicleLabel(v)}
                        </option>
                      ))}
                    </select>
                  </div>
                </Input>
                <Input label="Web login ID">
                  <input value={form.login_id} onChange={set('login_id')} maxLength={80} autoComplete="off" className={box} />
                </Input>
                <Input label="Login password">
                  <PasswordInput
                    value={form.login_password}
                    onChange={(e) => {
                      setClearPw(false)
                      set('login_password')(e)
                    }}
                    maxLength={80}
                    autoComplete="new-password"
                    placeholder={hasPw && !clearPw ? 'Saved · type to change' : 'Not set'}
                    className={box}
                  />
                  {hasPw && !form.login_password && (
                    <button type="button" onClick={() => setClearPw((v) => !v)} className="mt-1 text-xs font-medium text-red-600 hover:underline">
                      {clearPw ? 'Keep the saved password' : 'Remove the saved password'}
                    </button>
                  )}
                </Input>
                <Input label="Notes" wide>
                  <input value={form.notes} onChange={set('notes')} maxLength={500} className={box} />
                </Input>
              </div>
              {form.status !== card.status && form.status === 'inactive' && (
                <p className="mt-2 text-xs text-amber-700">Inactive: the card is no longer offered on fuel claims. Its history stays.</p>
              )}
              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                {canDelete && (
                  <button type="button" onClick={remove} disabled={busy} className="inline-flex items-center gap-1.5 text-sm font-medium text-red-600 hover:underline disabled:opacity-50">
                    <IconTrash width={16} height={16} /> Delete fleet card
                  </button>
                )}
                <span className="flex-1" />
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => {
                    setForm(detailsOf(card))
                    setEditDetails(false)
                  }}
                >
                  Cancel
                </Button>
                <Button type="button" disabled={busy} onClick={saveDetails}>
                  {busy ? 'Saving…' : 'Save'}
                </Button>
              </div>
            </div>
          )}
        </Card>

        {/* Fleet card drivers: as tall as the details box, the list scrolls */}
        <Card className="relative p-4 lg:min-h-[220px]">
          <div className="flex flex-col lg:absolute lg:inset-0 lg:p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="font-display text-lg font-bold text-slate-900 underline decoration-slate-300 underline-offset-4">Fleet card drivers</h3>
              {!editDrivers && editBtn(() => setEditDrivers(true))}
            </div>
            <div className="max-h-72 min-h-0 flex-1 overflow-y-auto rounded-xl border border-slate-200 lg:max-h-none">
              {drivers.length === 0 && <p className="px-3 py-4 text-sm text-slate-400">No driver set.</p>}
              <ul className="divide-y divide-slate-100">
                {drivers.map((uid, i) => (
                  <li key={uid} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">{i + 1}</span>
                    <span className="flex-1 truncate text-slate-800">{nameOf(uid)}</span>
                    {i === 0 && <span className="text-xs text-slate-500">Main driver</span>}
                    {editDrivers && (
                      <button
                        type="button"
                        onClick={() => setDrivers((d) => d.filter((x) => x !== uid))}
                        className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"
                        aria-label={`Remove ${nameOf(uid)}`}
                      >
                        <IconTrash width={15} height={15} />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
            {editDrivers && (
              <div className="mt-3 space-y-2">
                <select
                  value=""
                  onChange={(e) => e.target.value && setDrivers((d) => (d.includes(e.target.value) ? d : [...d, e.target.value]))}
                  className={box}
                  aria-label="Add driver"
                >
                  <option value="">+ Add driver…</option>
                  {people
                    .filter((p) => !drivers.includes(p.user_id))
                    .map((p) => (
                      <option key={p.user_id} value={p.user_id}>
                        {personLabel(p)}
                      </option>
                    ))}
                </select>
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => {
                      setDrivers(driversOf(card))
                      setEditDrivers(false)
                    }}
                  >
                    Cancel
                  </Button>
                  <Button type="button" disabled={busy} onClick={saveDrivers}>
                    {busy ? 'Saving…' : 'Save'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* automatic top-up request: Procurement sets the balance and the amount */}
      <AutoTopupBox card={card} canSet={Boolean(access.procurement) && !card.status?.match(/inactive|cancelled/)} nameOf={nameOf} balanceNow={ledger ? balanceNow : null} onSaved={reload} />

      {/* this month's usage (with subsidy / used / balance) | usage by driver */}
      <CardMonthUsage
        company={company}
        cardId={card.id}
        card={card}
        title={`${card.card_no || 'Fleet card'}${card.vehicle_id && vById.get(card.vehicle_id) ? ` (${vById.get(card.vehicle_id).reg_no || vById.get(card.vehicle_id).name})` : ''}`}
        drivers={driversOf(card).map((id) => ({ id, name: nameOf(id) }))}
        canAdd={access.can('usage', 'add')}
        canDelete={access.can('usage', 'delete')}
        quota={quota}
        driverNames={driversOf(card).map(nameOf)}
      />

      {/* usage by month, litres and RM, and the balance now */}
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-4 py-2.5">
          <h3 className="font-semibold text-slate-800">Fleet card usage by month</h3>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setYear((y) => y - 1)} disabled={year <= firstYear} className={arrow} aria-label="Previous year">
              ‹
            </button>
            <span className="w-14 text-center text-sm font-semibold text-slate-800">{year}</span>
            <button type="button" onClick={() => setYear((y) => y + 1)} disabled={year >= thisYear} className={arrow} aria-label="Next year">
              ›
            </button>
          </div>
          <span className="flex-1" />
          <span className="text-sm text-slate-500">Card balance now</span>
          <span className={`text-lg font-bold tabular-nums ${balanceNow < 0 ? 'text-red-600' : 'text-brand-dark'}`}>{ledger ? money(balanceNow) : '—'}</span>
        </div>
        <div className="px-4 py-4">
          <UsageBars rows={monthRows} />
        </div>
      </Card>

      {askTopup && (
        <RequestTopupModal
          company={company}
          cards={[card]}
          vById={vById}
          balance={ledger ? cardBalances(ledger) : null}
          cardId={card.id}
          onClose={() => setAskTopup(false)}
          onSaved={() => navigate('/diesel/cards/topup')}
        />
      )}
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-2 border-b border-slate-100 py-1.5 text-sm">
      <span className="font-semibold text-slate-700">{label}</span>
      <span className="break-words text-slate-800">{children || <span className="text-slate-400">—</span>}</span>
    </div>
  )
}

function Input({ label, wide, children }) {
  return (
    <label className={`block ${wide ? 'md:col-span-2' : ''}`}>
      <span className="mb-1 block text-xs font-semibold text-slate-600">{label}</span>
      {children}
    </label>
  )
}

// "Auto top-up request" box: when the card balance is below RM X, a top-up
// request of RM Y is sent by itself (checked every hour, when statements come
// in and when Fleet Card Manage opens; migration 20261220). Only Procurement
// sets it; "Request top up" by hand stays. Requestor: the Procurement person
// the requests are sent as (they show in that person's claim list and go to
// their approvers; migration 20261228).
function AutoTopupBox({ card, canSet, nameOf, balanceNow, onSaved }) {
  const { user } = useAuth()
  const [reqBy, setReqBy] = useState(card.auto_topup_by || '')
  const [procs, setProcs] = useState(null) // Procurement user ids; null = not known (before the migration)
  useEffect(() => {
    let live = true
    procurementPeople(card.company_id).then((ids) => live && setProcs(ids))
    return () => {
      live = false
    }
  }, [card.company_id])
  useEffect(() => setReqBy(card.auto_topup_by || ''), [card.id, card.auto_topup_by])
  // the requestor shown when nobody is set yet: me (when I am Procurement)
  const requester = reqBy || (procs?.includes(user?.id) ? user.id : procs?.[0] || '')
  const reqOpts = [...new Set([...(procs || []), card.auto_topup_by, user?.id].filter(Boolean))].filter((id) => !procs || procs.includes(id) || id === card.auto_topup_by)
  const ready = 'auto_topup' in card // the database has the columns
  const [on, setOn] = useState(Boolean(card.auto_topup))
  // Min balance (auto request below it) and Max balance (no top-up above it)
  const [below, setBelow] = useState(card.auto_topup_below ?? '')
  const [amount, setAmount] = useState(card.auto_topup_max ?? '') // Max balance
  const [topupAmt, setTopupAmt] = useState(card.auto_topup_amount ?? '') // what each automatic request asks for (fixed)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  useEffect(() => {
    setOn(Boolean(card.auto_topup))
    setBelow(card.auto_topup_below ?? '')
    setAmount(card.auto_topup_max ?? '')
    setTopupAmt(card.auto_topup_amount ?? '')
  }, [card.id, card.auto_topup, card.auto_topup_below, card.auto_topup_max, card.auto_topup_amount])
  // Why a request was / was not sent (balance now, a request still waiting)
  const [why, setWhy] = useState(null)
  const [checking, setChecking] = useState(false)
  useEffect(() => {
    let live = true
    if (ready && card.auto_topup) autoTopupStatus(card.id).then((w) => live && setWhy(w))
    else setWhy(null)
    return () => {
      live = false
    }
  }, [card.id, card.auto_topup, card.auto_topup_below, card.auto_topup_last_at, ready])
  async function checkNow() {
    setChecking(true)
    setMsg('')
    const made = await autoTopupCheck(card.company_id)
    await onSaved()
    const w = await autoTopupStatus(card.id)
    setWhy(w)
    const tu = (n) => `TU-${String(n ?? '').padStart(4, '0')}`
    if (made && w?.waiting) setMsg(`${tu(w.waiting.request_no)} (${money(w.waiting.amount)}) is newly created and waiting for approval`)
    else if (made) setMsg('A new request is created and waiting for approval')
    else if (!w) setMsg('Checked')
    else if (w.card_status !== 'active') setMsg(`No request: the card is ${w.card_status}`)
    else if (w.waiting)
      setMsg(`${tu(w.waiting.request_no)} (${money(w.waiting.amount)}) is ${w.waiting.status === 'pending' ? 'waiting for approval' : 'approved; its top-up claim is not submitted yet'}`)
    else if (Number(w.balance) >= Number(card.auto_topup_below)) setMsg(`No request needed: balance ${money(w.balance)} is not below the min`)
    else setMsg(`No request: ${money(card.auto_topup_amount)} would take the card above the max (balance ${money(w.balance)}, on the way ${money(w.on_way || 0)})`)
    setChecking(false)
  }
  const dirty = (procs != null && on && requester !== (card.auto_topup_by || '')) || on !== Boolean(card.auto_topup) || String(below) !== String(card.auto_topup_below ?? '') || String(amount) !== String(card.auto_topup_max ?? '') || String(topupAmt) !== String(card.auto_topup_amount ?? '')
  // Max above Min when both are filled; the automatic request needs both
  const orderOk = below === '' || amount === '' || Number(amount) > Number(below)
  // the top-up amount: not more than the max; needed for the automatic request
  const amountOk = topupAmt === '' || (Number(topupAmt) > 0 && (amount === '' || Number(topupAmt) <= Number(amount)))
  const valid = orderOk && amountOk && (!on || topupAmt !== '') && (!on || (below !== '' && Number(below) >= 0 && Number(amount) > 0 && (procs == null || Boolean(requester))))

  async function save() {
    setBusy(true)
    setMsg('')
    try {
      await setAutoTopup(card.id, on, below, amount, procs != null ? requester : null, topupAmt)
      await onSaved()
      setMsg('Saved')
    } catch (e) {
      setMsg(e.message)
    } finally {
      setBusy(false)
    }
  }

  const box = `${inputCls} h-10 pl-11 text-right font-semibold tabular-nums`
  const rm = (v, set, label, hint = '0.00') => (
    <span className="relative block w-36">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400">RM</span>
      <input type="number" min="0" step="0.01" inputMode="decimal" value={v} onChange={(e) => set(e.target.value)} disabled={!canSet || busy} aria-label={label} placeholder={hint} className={box} />
    </span>
  )

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-display text-lg font-bold text-slate-900 underline decoration-slate-300 underline-offset-4">Card balance limits</h3>
        <label className={`inline-flex items-center gap-2 text-sm font-semibold ${canSet ? 'cursor-pointer' : 'cursor-not-allowed opacity-70'}`}>
          <span className={on ? 'text-emerald-700' : 'text-slate-500'}>Auto request {on ? 'on' : 'off'}</span>
          <button
            type="button"
            role="switch"
            aria-checked={on}
            disabled={!canSet || busy || !ready}
            onClick={() => setOn((v) => !v)}
            className={`relative h-6 w-11 rounded-full transition ${on ? 'bg-emerald-500' : 'bg-slate-300'} disabled:cursor-not-allowed`}
          >
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
          </button>
        </label>
      </div>

      {!ready ? (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">Needs the SQL migration 20261220 (automatic top-up) in the database.</p>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-slate-700">
            <span className="font-semibold">Min balance</span>
            {rm(below, setBelow, 'Min balance')}
            <span className="font-semibold">Max balance</span>
            {rm(amount, setAmount, 'Max balance')}
            <span className="font-semibold">Top-up amount</span>
            {rm(topupAmt, setTopupAmt, 'Top-up amount')}
            {canSet && (
              <span className="ml-auto flex items-center gap-3">
                {msg && (
                  <span className={`text-sm ${msg === 'Saved' || /newly created|^A new request|^No request needed|^Checked/.test(msg) ? 'text-green-700' : /^TU-|^No request:/.test(msg) ? 'text-amber-700' : 'text-red-600'}`}>{msg}</span>
                )}
                {card.auto_topup && !dirty && (
                  <Button size="sm" variant="secondary" disabled={checking || busy} onClick={checkNow}>
                    {checking ? 'Checking…' : 'Check now'}
                  </Button>
                )}
                <Button size="sm" disabled={busy || !dirty || !valid} onClick={save}>
                  {busy ? 'Saving…' : 'Save'}
                </Button>
              </span>
            )}
          </div>
          {/* Requestor: the Procurement person the automatic requests are sent as */}
          <div className={`mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm ${on ? 'text-slate-700' : 'text-slate-400'}`}>
            <span>Requestor</span>
            {procs != null && canSet ? (
              <select
                value={requester}
                onChange={(e) => setReqBy(e.target.value)}
                disabled={!on || busy}
                aria-label="Requestor"
                className={`${inputCls} h-10 w-auto min-w-[14rem] font-semibold`}
              >
                {!requester && <option value="">Choose a Procurement person…</option>}
                {reqOpts.map((id) => (
                  <option key={id} value={id}>
                    {nameOf(id)}
                  </option>
                ))}
              </select>
            ) : (
              <span className="font-semibold text-slate-800">{card.auto_topup_by ? nameOf(card.auto_topup_by) : '—'}</span>
            )}
            <span className="text-xs text-slate-500">The requests are sent in this person's name and show in their claim list.</span>
          </div>
          {!orderOk && <p className="mt-2 text-xs font-medium text-red-600">The max balance must be more than the min balance.</p>}
          {orderOk && !amountOk && <p className="mt-2 text-xs font-medium text-red-600">The top-up amount cannot be more than the max balance.</p>}
          {on && amountOk && topupAmt === '' && <p className="mt-2 text-xs font-medium text-red-600">Fill in the top-up amount to use the automatic request.</p>}
        </>
      )}
    </Card>
  )
}
