import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import PageHeader from '../../components/PageHeader.jsx'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  SectionTitle,
  Spinner,
  TextArea,
  TextInput
} from '../../components/ui.jsx'
import { IconChat, IconExternal } from '../../components/icons.jsx'
import { caseNo, casePhotos, getCase, setCaseSolved, updateCase } from '../../lib/cases.js'
import { companyByNumber, listCompanies } from '../../lib/companies.js'
import { formatSender, formatTime, signPaths } from '../../lib/whatsapp.js'

// One maintenance case: machine + problem (editable), all its photos, and the
// WhatsApp messages in order.
export default function CaseDetail() {
  const { id } = useParams()
  const [c, setC] = useState(null)
  const [urls, setUrls] = useState({})
  const [company, setCompany] = useState(undefined) // undefined = loading, null = not linked
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [machine, setMachine] = useState('')
  const [problem, setProblem] = useState('')
  const [saved, setSaved] = useState(false)

  const load = useCallback(async () => {
    setError('')
    try {
      const row = await getCase(id)
      setC(row)
      if (row) {
        setMachine(row.machine_name || '')
        setProblem(row.problem || '')
        setUrls(await signPaths(casePhotos(row).map((m) => m.storage_path)))
        listCompanies()
          .then((cos) => setCompany(companyByNumber(cos)(row.wa_from)))
          .catch(() => setCompany(null))
      }
    } catch (e) {
      setError(e.message || 'Could not load this case.')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  async function run(fn) {
    setBusy(true)
    setError('')
    setSaved(false)
    try {
      await fn()
      await load()
      return true
    } catch (e) {
      setError(e.message || 'Could not save.')
      return false
    } finally {
      setBusy(false)
    }
  }

  if (loading)
    return (
      <div className="flex justify-center py-12 text-brand">
        <Spinner className="h-7 w-7" />
      </div>
    )
  if (!c)
    return (
      <div>
        <PageHeader backTo="/cmms/work" backLabel="Back to Work Manage" />
        <EmptyState title="Case not found" subtitle={error} />
      </div>
    )

  const photos = casePhotos(c)
  const dirty = machine.trim() !== (c.machine_name || '') || problem.trim() !== (c.problem || '')
  const solved = c.status === 'solved'

  return (
    <div>
      <PageHeader
        backTo="/cmms/work"
        backLabel="Back to Work Manage"
        title={`Case ${caseNo(c)}${c.machine_name ? ` · ${c.machine_name}` : ''}`}
        subtitle={`Opened ${formatTime(c.opened_at)} by ${c.sender_name || formatSender(c.wa_from)}`}
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <Card className="space-y-4 p-5">
            <div className="grid gap-4 sm:grid-cols-[minmax(0,240px)_minmax(0,1fr)]">
              <Field label="Machine name">
                <TextInput value={machine} onChange={(e) => setMachine(e.target.value)} placeholder="e.g. EX-03" />
              </Field>
              <Field label="Problem">
                <TextArea rows={2} value={problem} onChange={(e) => setProblem(e.target.value)} />
              </Field>
            </div>
            <div className="flex items-center justify-end gap-3">
              {saved && !dirty && <span className="text-sm text-green-700">Saved</span>}
              <Button
                size="sm"
                disabled={busy || !dirty}
                onClick={async () => {
                  const ok = await run(() =>
                    updateCase(c.id, { machine_name: machine.trim() || null, problem: problem.trim() || null })
                  )
                  setSaved(ok)
                }}
              >
                Save changes
              </Button>
            </div>
          </Card>

          <Card className="p-5">
            <SectionTitle>Photos ({photos.length})</SectionTitle>
            {photos.length === 0 ? (
              <p className="text-sm text-slate-400">No photos yet. Staff can send photos with “#{c.case_no}”.</p>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                {photos.map((m) => (
                  <a
                    key={m.id}
                    href={urls[m.storage_path]}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group relative block aspect-square overflow-hidden rounded-xl bg-slate-100 ring-1 ring-slate-200"
                  >
                    {urls[m.storage_path] && (
                      <img
                        src={urls[m.storage_path]}
                        alt={m.caption || 'Case photo'}
                        className="h-full w-full object-cover"
                      />
                    )}
                    <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-2 pb-1.5 pt-6 text-xs text-white">
                      {formatTime(m.received_at)}
                    </span>
                    <IconExternal
                      width={16}
                      height={16}
                      className="absolute right-2 top-2 text-white opacity-0 drop-shadow group-hover:opacity-100"
                    />
                  </a>
                ))}
              </div>
            )}
          </Card>

          <Card className="p-5">
            <SectionTitle>WhatsApp messages ({c.messages.length})</SectionTitle>
            <ol className="space-y-3">
              {c.messages.map((m) => (
                <li key={m.id} className="flex gap-3">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-light text-brand">
                    <IconChat width={16} height={16} />
                  </span>
                  <div className="min-w-0 flex-1 rounded-2xl rounded-tl-sm bg-slate-50 px-4 py-2.5 ring-1 ring-slate-100">
                    <p className="text-xs text-slate-500">
                      <span className="font-semibold text-slate-700">{m.sender_name || formatSender(m.wa_from)}</span> ·{' '}
                      {formatTime(m.received_at)} · {m.message_type === 'image' ? 'Photo' : 'Text'}
                    </p>
                    {m.message_type === 'image' && urls[m.storage_path] && (
                      <img
                        src={urls[m.storage_path]}
                        alt=""
                        className="mt-2 max-h-48 rounded-lg object-cover ring-1 ring-slate-200"
                      />
                    )}
                    {m.caption && <p className="mt-1 whitespace-pre-wrap break-words text-slate-800">{m.caption}</p>}
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="space-y-5">
          {error && <p className="rounded-xl bg-red-100 p-3 text-sm text-red-700">{error}</p>}

          <Card className="space-y-3 p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-500">Status</span>
              {solved ? <Badge color="green">Solved</Badge> : <Badge color="amber">Pending</Badge>}
            </div>
            <Button
              full
              variant={solved ? 'secondary' : 'primary'}
              disabled={busy}
              onClick={() => run(() => setCaseSolved(c.id, !solved))}
            >
              {busy ? 'Saving…' : solved ? 'Reopen case' : 'Mark Solved'}
            </Button>
            {solved && (
              <p className="text-xs text-slate-500">
                Solved {formatTime(c.solved_at)}
                {c.solved_by_email ? ` by ${c.solved_by_email}` : ''}
              </p>
            )}
          </Card>

          <Card className="p-5">
            <SectionTitle>Details</SectionTitle>
            <dl className="space-y-2.5 text-sm">
              <Row label="Case No." value={caseNo(c)} />
              <Row
                label="Company"
                value={
                  company === undefined ? (
                    '…'
                  ) : company ? (
                    company.name + (company.cmms_enabled ? '' : ' (CMMS 2 off)')
                  ) : (
                    <span>
                      Not linked ·{' '}
                      <Link to="/admin/companies" className="text-brand hover:underline">
                        add this number to a company
                      </Link>
                    </span>
                  )
                }
              />
              <Row label="Sent by" value={c.sender_name || '—'} />
              <Row label="Phone" value={formatSender(c.wa_from)} />
              <Row label="Opened" value={formatTime(c.opened_at)} />
              <Row label="Photos" value={String(photos.length)} />
              <Row label="Messages" value={String(c.messages.length)} />
            </dl>
            <p className="mt-4 rounded-xl bg-brand-light/60 p-3 text-xs leading-relaxed text-slate-600">
              To add to this case from WhatsApp, reply to the “Case #{c.case_no} created” message, or write{' '}
              <span className="font-semibold text-brand">#{c.case_no}</span> in the text or photo caption.
            </p>
          </Card>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value }) {
  return (
    <div className="grid grid-cols-[100px_1fr] gap-2">
      <dt className="text-slate-500">{label}</dt>
      <dd className="break-words text-slate-800">{value}</dd>
    </div>
  )
}
