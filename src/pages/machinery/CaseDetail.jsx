import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import PageHeader from '../../components/PageHeader.jsx'
import { Badge, Button, Card, EmptyState, SectionTitle, Spinner } from '../../components/ui.jsx'
import { IconChat, IconExternal, IconPencil, IconTrash } from '../../components/icons.jsx'
import { CASE_TYPES, appCompanyId, caseNo, casePhotos, caseStage, caseType, fromApp, getCase, serviceGap, setCaseSolved, smuUnit } from '../../lib/cases.js'
import { deleteCase, isVideo, listMachines, listSuppliers, signCaseFiles, useCmmsAccess } from '../../lib/cmms.js'
import { CaseEditModal } from '../../components/CaseEditModal.jsx'
import { companyByNumber, listCompanies } from '../../lib/companies.js'
import { formatSender, formatTime, signPaths } from '../../lib/whatsapp.js'

// One maintenance case: machine, problem, supplier and sent-out date (edit
// dialog), all its photos, and the WhatsApp messages in order.
export default function CaseDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [c, setC] = useState(null)
  const [urls, setUrls] = useState({})
  const [fileUrls, setFileUrls] = useState({}) // photos / videos sent from the mobile app
  const [company, setCompany] = useState(undefined) // undefined = loading, null = not linked
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(false)
  const [machines, setMachines] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const companyId = company?.id ?? null
  const access = useCmmsAccess(companyId)

  const load = useCallback(async () => {
    setError('')
    try {
      const row = await getCase(id)
      setC(row)
      if (row) {
        setUrls(await signPaths(casePhotos(row).map((m) => m.storage_path)))
        signCaseFiles((row.attachments || []).map((a) => a.path)).then(setFileUrls)
        const appCo = appCompanyId(row.wa_from)
        listCompanies()
          .then((cos) => setCompany(appCo ? cos.find((x) => x.id === appCo) || null : companyByNumber(cos)(row.wa_from)))
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

  useEffect(() => {
    if (!companyId) return
    listMachines(companyId)
      .then(setMachines)
      .catch(() => setMachines([]))
    listSuppliers(companyId)
      .then(setSuppliers)
      .catch(() => setSuppliers([]))
  }, [companyId])

  async function run(fn) {
    setBusy(true)
    setError('')
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
  const supplier = suppliers.find((s) => s.id === c.supplier_id)
  const solved = c.status === 'solved'
  const machine = machines.find((m) => m.id === c.machine_id)
  const unit = smuUnit(machine)
  const gap = serviceGap(c, machine)
  const files = c.attachments || []
  const num = (v) => Number(v).toLocaleString('en-MY', { maximumFractionDigits: 1 })
  const dmy = (d) => d && new Date(String(d).slice(0, 10) + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })

  return (
    <div>
      <PageHeader
        backTo="/cmms/work"
        backLabel="Back to Work Manage"
        title={`Case ${caseNo(c)}${c.machine_name ? ` · ${c.machine_name}` : ''}`}
        subtitle={`Opened ${formatTime(c.opened_at)} by ${c.sender_name || formatSender(c.wa_from)}`}
      />

      {editing && (
        <CaseEditModal
          c={c}
          machines={machines}
          suppliers={suppliers}
          onClose={() => setEditing(false)}
          onSaved={load}
        />
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <SectionTitle>Case</SectionTitle>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!access.can_edit || busy}
                  title={access.can_edit ? 'Edit case' : 'No edit access'}
                  onClick={() => setEditing(true)}
                >
                  <IconPencil width={16} height={16} /> Edit
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  className="text-red-600"
                  disabled={!access.can_delete || busy}
                  title={access.can_delete ? 'Delete case' : 'No delete access'}
                  onClick={async () => {
                    if (!window.confirm(`Delete case ${caseNo(c)} and its WhatsApp messages? This cannot be undone.`))
                      return
                    setBusy(true)
                    try {
                      await deleteCase(c.id)
                      navigate('/cmms/work')
                    } catch (e) {
                      setError(e.message || 'Could not delete.')
                      setBusy(false)
                    }
                  }}
                >
                  <IconTrash width={16} height={16} /> Delete
                </Button>
              </div>
            </div>
            <dl className="grid gap-4 sm:grid-cols-2">
              <Info label="Type" value={`${CASE_TYPES[caseType(c)].label} · ${fromApp(c) ? 'Mobile app' : 'WhatsApp'}`} />
              <Info label="Status" value={caseStage(c, machine).label} />
              <Info label="Machine" value={c.machine_name} />
              <Info label="Supplier / workshop" value={supplier?.name} />
              <Info label={caseType(c) === 'repair_done' ? 'Part · what was done' : 'Problem'} value={[c.category, c.action_done, c.problem].filter(Boolean).join(' · ')} />
              <Info
                label="Sent out on"
                value={
                  c.sent_at &&
                  new Date(c.sent_at + 'T00:00:00').toLocaleDateString('en-GB', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric'
                  })
                }
              />
              {c.smu != null && <Info label="Meter (SMU)" value={`${num(c.smu)} ${unit}`} />}
              {c.service_due != null && (
                <Info
                  label="Service due at"
                  value={`${num(c.service_due)} ${unit}${gap && gap.gap !== 0 ? ` · ${num(Math.abs(gap.gap))} ${unit} ${gap.gap < 0 ? 'early' : 'late'}` : ''}`}
                />
              )}
              {c.preferred_date && <Info label="Preferred date" value={dmy(c.preferred_date)} />}
              {c.machine_stopped != null && (
                <Info
                  label="Machine stopped"
                  value={c.machine_stopped ? `Yes${c.stopped_from ? `, from ${dmy(c.stopped_from)}` : ''}${c.fixed_on ? ` to ${dmy(c.fixed_on)}` : ' (not fixed yet)'}` : 'No, still working'}
                />
              )}
              {(c.parts || []).some((p) => p?.name) && <Info label="Parts used" value={c.parts.filter((p) => p?.name).map((p) => `${p.name} ×${p.qty || 1}`).join(', ')} />}
              {c.approved_at && <Info label="Approved" value={formatTime(c.approved_at)} />}
              {c.cost != null && <Info label="Cost" value={`RM ${Number(c.cost).toLocaleString('en-MY', { minimumFractionDigits: 2 })}`} />}
            </dl>
          </Card>

          {files.length > 0 && (
            <Card className="p-5">
              <SectionTitle>From the mobile app ({files.length})</SectionTitle>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                {files.map((f) => (
                  <div key={f.path} className="overflow-hidden rounded-xl bg-slate-100 ring-1 ring-slate-200">
                    {isVideo(f.path) ? (
                      <video src={fileUrls[f.path]} controls preload="metadata" className="aspect-square w-full bg-black object-contain" />
                    ) : (
                      <a href={fileUrls[f.path]} target="_blank" rel="noopener noreferrer" className="block aspect-square">
                        {fileUrls[f.path] && <img src={fileUrls[f.path]} alt={f.kind || 'Photo'} className="h-full w-full object-cover" />}
                      </a>
                    )}
                    {f.kind && f.kind !== 'photo' && <p className="px-2 py-1 text-xs font-medium capitalize text-slate-600">{f.kind === 'meter' ? 'Meter photo' : f.kind}</p>}
                  </div>
                ))}
              </div>
            </Card>
          )}

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
              disabled={busy || !access.can_solve}
              title={access.can_solve ? undefined : 'No solve access'}
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
                      <Link to="/settings" className="text-brand hover:underline">
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

function Info({ label, value }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-wrap break-words text-slate-800">
        {value || <span className="text-slate-400">—</span>}
      </dd>
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
