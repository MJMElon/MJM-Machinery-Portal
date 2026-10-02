import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button, Select, Spinner, TextArea } from './ui.jsx'
import { IconChat, IconCheckCircle, IconExternal, IconImage } from './icons.jsx'
import { caseNo, casePhotos } from '../lib/cases.js'
import { addCaseNote, closeCase, listCaseActions, sendToSupplier } from '../lib/cmms.js'
import { formatSender, formatTime, signPaths } from '../lib/whatsapp.js'

const digits = (s) => String(s ?? '').replace(/\D/g, '')

// The work on one case, top to bottom:
//   1. Open case   – what was reported (machine, problem, photos, who/when)
//   2. Action      – a running conversation: official WhatsApp messages to the
//                    supplier and internal notes
//   3. Close case  – milestones with date and time, closing remark, Close case
export function CaseWorkflowModal({ c, machines, suppliers, access, onClose, onChanged }) {
  const [actions, setActions] = useState([])
  const [urls, setUrls] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [supplierId, setSupplierId] = useState(c.supplier_id || '')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(null) // { phone, text } for "Open in my WhatsApp"
  const [remark, setRemark] = useState('')
  const threadEnd = useRef(null)

  const photos = casePhotos(c)
  const load = useCallback(async () => {
    try {
      setActions(await listCaseActions(c.id))
      setError('')
    } catch (e) {
      setError(e.message || 'Could not load the case history.')
    } finally {
      setLoading(false)
    }
  }, [c.id])

  useEffect(() => {
    load()
    signPaths(photos.map((m) => m.storage_path))
      .then(setUrls)
      .catch(() => {})
  }, [load]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    threadEnd.current?.scrollIntoView({ block: 'nearest' })
  }, [actions.length])

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Suppliers that handle this case's machine first (★).
  const handles = (s) => c.machine_id && (s.machine_ids || []).includes(c.machine_id)
  const sortedSuppliers = useMemo(
    () => [...suppliers].sort((a, b) => Number(handles(b)) - Number(handles(a)) || a.name.localeCompare(b.name)),
    [suppliers] // eslint-disable-line react-hooks/exhaustive-deps
  )
  const supplier = suppliers.find((s) => s.id === supplierId)
  const thread = actions.filter((a) => a.kind === 'sent' || a.kind === 'note')
  const milestones = actions.filter((a) => a.kind !== 'note')
  const solved = c.status === 'solved'

  async function run(fn) {
    setBusy(true)
    setError('')
    try {
      await fn()
      await load()
      await onChanged?.()
      return true
    } catch (e) {
      setError(e.message || 'Something went wrong.')
      await load()
      return false
    } finally {
      setBusy(false)
    }
  }

  async function send() {
    setFailed(null)
    const message = text.trim()
    const ok = await run(() => sendToSupplier({ caseId: c.id, supplierId, message }))
    if (ok) setText('')
    else if (supplier?.phone) setFailed({ phone: digits(supplier.phone), text: `[Case #${c.case_no}] ${message}` })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        className="flex max-h-[94dvh] w-full max-w-4xl flex-col overflow-hidden rounded-t-3xl bg-slate-50 shadow-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* header */}
        <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-6 py-4">
          <div className="min-w-0 flex-1">
            <p className="font-display text-xl font-extrabold tracking-tight text-slate-900">
              Case {caseNo(c)}
              {c.machine_name && <span className="text-slate-400"> · {c.machine_name}</span>}
            </p>
            <p className="text-sm text-slate-500">
              {solved ? 'Closed' : 'Open'} · work on this case from report to close
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100"
            aria-label="Close window"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
          {error && <p className="rounded-xl bg-red-100 p-3 text-sm text-red-700">{error}</p>}

          {/* 1. Open case */}
          <Section n="1" title="Open case" tone="amber">
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
              <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-2 text-sm">
                <dt className="text-slate-400">Machine</dt>
                <dd className="font-semibold text-slate-800">{c.machine_name || '—'}</dd>
                <dt className="text-slate-400">Problem</dt>
                <dd className="whitespace-pre-wrap text-slate-800">{c.problem || '—'}</dd>
                <dt className="text-slate-400">Reported by</dt>
                <dd className="text-slate-800">
                  {c.sender_name || formatSender(c.wa_from)}
                  {c.sender_name && <span className="text-slate-400"> · {formatSender(c.wa_from)}</span>}
                </dd>
                <dt className="text-slate-400">Reported at</dt>
                <dd className="text-slate-800">{formatTime(c.opened_at)}</dd>
              </dl>
              {photos.length > 0 && (
                <div className="flex flex-wrap gap-2 sm:max-w-[260px] sm:justify-end">
                  {photos.slice(0, 6).map((m) => (
                    <a
                      key={m.id}
                      href={urls[m.storage_path]}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-xl bg-slate-100 text-slate-400 ring-1 ring-slate-200"
                    >
                      {urls[m.storage_path] ? (
                        <img src={urls[m.storage_path]} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <IconImage width={18} height={18} />
                      )}
                    </a>
                  ))}
                </div>
              )}
            </div>
          </Section>

          {/* 2. Action */}
          <Section n="2" title="Action" tone="blue">
            <div className="max-h-64 space-y-2.5 overflow-y-auto rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-100">
              {loading ? (
                <div className="flex justify-center py-6 text-brand">
                  <Spinner className="h-6 w-6" />
                </div>
              ) : thread.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-400">
                  No action yet. Choose a supplier and send them the job, or write a note.
                </p>
              ) : (
                thread.map((a) => <Bubble key={a.id} a={a} />)
              )}
              <div ref={threadEnd} />
            </div>

            {access.can_edit && !solved ? (
              <div className="mt-3 space-y-2">
                <div className="grid gap-2 sm:grid-cols-[minmax(0,260px)_1fr]">
                  <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} aria-label="Supplier">
                    <option value="">— Choose supplier —</option>
                    {sortedSuppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {handles(s) ? '★ ' : ''}
                        {s.name}
                      </option>
                    ))}
                  </Select>
                  <p className="self-center text-xs text-slate-400">
                    {supplier
                      ? supplier.phone
                        ? `Sends from the company WhatsApp number to ${supplier.phone}`
                        : 'This supplier has no phone number yet (Supplier Workshop List).'
                      : suppliers.length
                        ? '★ = handles this machine'
                        : 'Add suppliers in Supplier Workshop List first.'}
                  </p>
                </div>
                <TextArea
                  rows={3}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Write the job for the supplier, or a note for the team…"
                />
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {failed && (
                    <a
                      href={`https://wa.me/${failed.phone}?text=${encodeURIComponent(failed.text)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mr-auto inline-flex h-9 items-center gap-1.5 rounded-xl bg-emerald-50 px-3 text-sm font-semibold text-emerald-700 hover:bg-emerald-100"
                    >
                      Open in my WhatsApp <IconExternal width={14} height={14} />
                    </a>
                  )}
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy || !text.trim()}
                    onClick={async () => (await run(() => addCaseNote(c.id, text.trim()))) && setText('')}
                  >
                    Save as note
                  </Button>
                  <Button size="sm" disabled={busy || !text.trim() || !supplierId || !supplier?.phone} onClick={send}>
                    {busy ? 'Sending…' : 'Send to supplier'}
                  </Button>
                </div>
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-400">
                {solved ? 'This case is closed. Reopen it to continue.' : 'You do not have edit access for this case.'}
              </p>
            )}
          </Section>

          {/* 3. Close case */}
          <Section n="3" title="Close case" tone="green">
            <ol className="relative space-y-3 border-l-2 border-slate-200 pl-5">
              <Milestone dot="bg-amber-500" title="Reported" when={c.opened_at}>
                by {c.sender_name || formatSender(c.wa_from)}
              </Milestone>
              {milestones.map((a) =>
                a.kind === 'sent' ? (
                  <Milestone
                    key={a.id}
                    dot={a.delivery === 'failed' ? 'bg-red-500' : 'bg-brand'}
                    title={`${a.delivery === 'failed' ? 'Send failed' : 'Sent out'} to ${a.supplier_name || 'supplier'}`}
                    when={a.created_at}
                  >
                    by {a.created_by_email || '—'}
                  </Milestone>
                ) : (
                  <Milestone
                    key={a.id}
                    dot={a.kind === 'closed' ? 'bg-emerald-500' : 'bg-slate-400'}
                    title={a.kind === 'closed' ? 'Case closed' : 'Case reopened'}
                    when={a.created_at}
                  >
                    by {a.created_by_email || '—'}
                    {a.body && <span className="block text-slate-600">“{a.body}”</span>}
                  </Milestone>
                )
              )}
            </ol>

            {access.can_solve ? (
              solved ? (
                <div className="mt-4 flex justify-end">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => run(() => closeCase(c.id, false))}
                  >
                    Reopen case
                  </Button>
                </div>
              ) : (
                <div className="mt-4 space-y-2">
                  <TextArea
                    rows={2}
                    value={remark}
                    onChange={(e) => setRemark(e.target.value)}
                    placeholder="Closing remark (what was done) — optional"
                  />
                  <div className="flex justify-end">
                    <button
                      disabled={busy}
                      onClick={async () => {
                        if (await run(() => closeCase(c.id, true, remark.trim()))) onClose()
                      }}
                      className="inline-flex h-10 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      <IconCheckCircle width={18} height={18} /> Close case
                    </button>
                  </div>
                </div>
              )
            ) : (
              <p className="mt-3 text-sm text-slate-400">You do not have solve access for this case.</p>
            )}
          </Section>
        </div>
      </div>
    </div>
  )
}

const TONE = {
  amber: 'bg-amber-100 text-amber-700',
  blue: 'bg-brand-light text-brand-dark',
  green: 'bg-emerald-100 text-emerald-700'
}

function Section({ n, title, tone, children }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <h3 className="mb-3 flex items-center gap-2.5 font-display text-[15px] font-bold tracking-tight text-slate-900">
        <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${TONE[tone]}`}>
          {n}
        </span>
        {title}
      </h3>
      {children}
    </section>
  )
}

function Bubble({ a }) {
  if (a.kind === 'note') {
    return (
      <div className="max-w-[85%] rounded-2xl rounded-tl-md bg-white px-3.5 py-2 text-sm ring-1 ring-slate-200">
        <p className="mb-0.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          <IconChat width={12} height={12} /> Note · {a.created_by_email || '—'} · {formatTime(a.created_at)}
        </p>
        <p className="whitespace-pre-wrap text-slate-800">{a.body}</p>
      </div>
    )
  }
  const failed = a.delivery === 'failed'
  return (
    <div className="ml-auto max-w-[85%]">
      <div
        className={`rounded-2xl rounded-tr-md px-3.5 py-2 text-sm ${failed ? 'bg-red-50 ring-1 ring-red-200' : 'bg-emerald-600 text-white'}`}
      >
        <p
          className={`mb-0.5 text-[11px] font-semibold uppercase tracking-wide ${failed ? 'text-red-500' : 'text-emerald-100'}`}
        >
          To {a.supplier_name || 'supplier'} · {formatTime(a.created_at)}
        </p>
        <p className={`whitespace-pre-wrap ${failed ? 'text-slate-800' : ''}`}>{a.body}</p>
      </div>
      <p className={`mt-0.5 text-right text-[11px] ${failed ? 'text-red-600' : 'text-slate-400'}`}>
        {failed ? `Not sent: ${a.error || 'error'}` : `Sent by ${a.created_by_email || '—'} ✓`}
      </p>
    </div>
  )
}

function Milestone({ dot, title, when, children }) {
  return (
    <li className="relative">
      <span className={`absolute -left-[27px] top-1 h-3 w-3 rounded-full ring-4 ring-white ${dot}`} />
      <p className="text-sm font-semibold text-slate-800">
        {title} <span className="font-normal text-slate-400">· {formatTime(when)}</span>
      </p>
      <p className="text-xs text-slate-500">{children}</p>
    </li>
  )
}
