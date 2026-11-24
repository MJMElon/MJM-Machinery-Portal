import { useEffect, useRef, useState } from 'react'
import { Button, Modal } from '../ui.jsx'
import { IconPaperclip, IconTrash } from '../icons.jsx'
import { addPaymentDoc, paymentDocUrl } from '../../lib/diesel.js'
import { money } from '../../lib/format.js'

// Payment documents of a paid fuel claim (the accountant's bank slip,
// transfer screenshot or PDF). MarkPaidModal: the accountant attaches them
// while marking claims paid. PaymentDocsButton: the paper-clip next to
// "Paid" that shows them (claimant, approvers, accountants).

const isPdf = (d) => /\.pdf$/i.test(d.path || '')

/** Paper-clip next to the Paid status; opens the documents. Nothing when there are none. */
export function PaymentDocsButton({ docs }) {
  const [open, setOpen] = useState(false)
  if (!docs?.length) return null
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-6 items-center gap-0.5 rounded-full bg-blue-50 px-1.5 text-[11px] font-semibold text-blue-700 hover:bg-blue-100"
        title="Payment documents"
        aria-label="Payment documents"
      >
        <IconPaperclip width={13} height={13} />
        {docs.length > 1 && docs.length}
      </button>
      {open && <DocsModal docs={docs} onClose={() => setOpen(false)} />}
    </>
  )
}

function DocsModal({ docs, onClose }) {
  const [urls, setUrls] = useState({})
  const [error, setError] = useState('')
  useEffect(() => {
    let live = true
    Promise.all(docs.map((d) => paymentDocUrl(d.path).then((u) => [d.id, u]).catch(() => [d.id, null]))).then((pairs) => {
      if (!live) return
      setUrls(Object.fromEntries(pairs))
      if (pairs.some(([, u]) => !u)) setError('Some documents could not be opened.')
    })
    return () => {
      live = false
    }
  }, [docs])
  return (
    <Modal open onClose={onClose} title="Payment documents" wide>
      <div className="grid gap-3 sm:grid-cols-2">
        {docs.map((d) => (
          <a
            key={d.id}
            href={urls[d.id] || undefined}
            target="_blank"
            rel="noopener noreferrer"
            className="group block overflow-hidden rounded-xl border border-slate-200 bg-slate-50 hover:border-brand"
          >
            <div className="flex h-48 items-center justify-center bg-white">
              {isPdf(d) ? (
                <span className="rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-red-600">PDF</span>
              ) : urls[d.id] ? (
                <img src={urls[d.id]} alt={d.file_name || 'Payment document'} className="h-full w-full object-contain" />
              ) : (
                <span className="h-full w-full animate-pulse bg-slate-100" />
              )}
            </div>
            <p className="truncate border-t border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 group-hover:text-brand">{d.file_name || 'Document'} · open</p>
          </a>
        ))}
      </div>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      <div className="mt-4 flex justify-end">
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      </div>
    </Modal>
  )
}

/**
 * Mark claims paid: attach the payment documents (optional, pictures or PDF),
 * then the claims turn Paid. Several claims at once get the same documents.
 * onPaid(claims) marks them paid after the upload.
 */
export function MarkPaidModal({ claims, payableOf, claimNo, nameOf, onPaid, onClose }) {
  const [files, setFiles] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const input = useRef(null)
  const total = claims.reduce((s, c) => s + payableOf(c), 0)

  const add = (list) => {
    const ok = [...list].filter((f) => f.type.startsWith('image/') || f.type === 'application/pdf')
    if (ok.length < list.length) setError('Only pictures and PDF files can be attached.')
    else setError('')
    setFiles((fs) => [...fs, ...ok].slice(0, 5))
  }

  async function save() {
    setBusy(true)
    setError('')
    try {
      for (const c of claims) for (const f of files) await addPaymentDoc(c, f)
      await onPaid(claims)
      onClose()
    } catch (e) {
      setError(e.message)
      setBusy(false)
    }
  }

  return (
    <Modal open onClose={busy ? () => {} : onClose} title={claims.length === 1 ? `Mark claim ${claimNo(claims[0], 0)} paid` : `Mark ${claims.length} claims paid`} wide>
      <div className="mb-4 rounded-xl bg-slate-50 px-4 py-3 text-sm">
        {claims.length === 1 ? (
          <p>
            <b className="text-slate-800">{nameOf(claims[0].claimant_id)}</b> · <b className="tabular-nums text-slate-900">{money(total)}</b>
          </p>
        ) : (
          <p>
            {claims.length} claims · <b className="tabular-nums text-slate-900">{money(total)}</b>
          </p>
        )}
      </div>

      <p className="mb-2 text-sm font-semibold text-slate-700">Payment documents</p>
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          add(e.dataTransfer.files)
        }}
        className="flex w-full flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-slate-300 bg-white px-4 py-6 text-sm text-slate-500 hover:border-brand hover:text-brand"
      >
        <IconPaperclip width={22} height={22} />
        <span className="font-semibold">Attach bank slip / payment proof</span>
        <span className="text-xs text-slate-400">Pictures or PDF, up to 5 files</span>
      </button>
      <input ref={input} type="file" accept="image/*,application/pdf" multiple hidden onChange={(e) => (add(e.target.files), (e.target.value = ''))} />

      {files.length > 0 && (
        <ul className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200">
          {files.map((f, i) => (
            <li key={i} className="flex items-center gap-2 px-3 py-2 text-sm">
              <IconPaperclip width={14} height={14} className="shrink-0 text-slate-400" />
              <span className="min-w-0 flex-1 truncate text-slate-700">{f.name}</span>
              <button type="button" disabled={busy} onClick={() => setFiles((fs) => fs.filter((_, j) => j !== i))} className="text-slate-400 hover:text-red-600" aria-label={`Remove ${f.name}`}>
                <IconTrash width={16} height={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {claims.length > 1 && files.length > 0 && <p className="mt-2 text-xs text-slate-500">The same documents are attached to each claim.</p>}
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" disabled={busy} onClick={onClose}>
          Cancel
        </Button>
        <Button disabled={busy} onClick={save}>
          {busy ? 'Saving…' : files.length ? 'Mark paid' : 'Mark paid without document'}
        </Button>
      </div>
    </Modal>
  )
}
