import { useState } from 'react'
import { Button, Modal } from '../ui.jsx'
import { importPayload, normalizeRows, parseCsv } from '../../../supabase/functions/_shared/statement.js'
import { importStatement } from '../../lib/diesel.js'
import { day } from '../../lib/format.js'

// Fleet Card Manage → "Import statement": the fuel station statement (Setel
// CSV export) for any days. The AI agent sends the same thing every day by
// itself; this is the by-hand way. Every transaction is kept once, so the
// same file (or overlapping days) can be imported again safely.

const n2 = (v) => (v == null ? '—' : Number(v).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
const when = (ts) =>
  ts ? new Date(ts).toLocaleString('en-MY', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }) : ''

export function StatementImportModal({ company, onClose, onDone }) {
  const [rows, setRows] = useState(null)
  const [fileName, setFileName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  async function pick(file) {
    setError('')
    setResult(null)
    if (!file) return
    if (file.size > 3_000_000) return setError('The file is too big (3 MB at most). Export fewer days at a time.')
    setFileName(file.name)
    const text = await file.text()
    const parsed = normalizeRows(parseCsv(text))
    if (!parsed.length) {
      setRows(null)
      return setError('No transactions found. The file needs a header row with the card number, date, litres and amount (the Setel CSV export has these).')
    }
    setRows(parsed)
  }

  async function run() {
    setBusy(true)
    setError('')
    try {
      const payload = importPayload(rows)
      const sent = rows.filter((r) => !r._skip && !r._problem)
      const r = await importStatement(company.id, payload)
      const dbProblems = (r.problems || []).map((p) => ({ ...p, row: sent[p.row - 1]?._row ?? p.row }))
      const early = rows.filter((x) => x._problem).map((x) => ({ row: x._row, txn_id: x.txn_id, card_no: x.card_no, date: x.date, reason: x._problem }))
      setResult({ ...r, problems: [...early, ...dbProblems].sort((a, b) => a.row - b.row) })
      onDone?.()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const fuel = rows ? rows.filter((r) => !r._skip) : []
  const skipped = rows ? rows.length - fuel.length : 0
  const bad = fuel.filter((r) => r._problem).length

  return (
    <Modal open onClose={onClose} title="Import fuel station statement" wide>
      <div className="space-y-4 text-sm">
        <p className="text-slate-600">
          Upload the statement exported from Setel (CSV) for <b>{company.name}</b>. Each purchase is put on its fleet card and matched with the driver&apos;s
          fuel claim receipt. Purchases already imported are skipped, so importing the same days again is safe.
        </p>
        {!result && (
          <label className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-slate-300 px-4 py-6 text-center hover:border-brand hover:bg-slate-50">
            <span className="font-semibold text-slate-700">{fileName || 'Choose the statement file'}</span>
            <span className="text-xs text-slate-500">CSV or text file · columns like Date, Transaction ID, Card Number, Volume (L), Amount (RM), Station</span>
            <input type="file" accept=".csv,.txt,text/csv,text/plain" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
          </label>
        )}
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-red-700">{error}</p>}

        {rows && !result && (
          <>
            <p className="font-medium text-slate-700">
              {fuel.length} fuel purchase{fuel.length === 1 ? '' : 's'} found
              {skipped > 0 && <span className="font-normal text-slate-500"> · {skipped} other line{skipped === 1 ? '' : 's'} skipped (no litres)</span>}
              {bad > 0 && <span className="font-normal text-red-600"> · {bad} incomplete</span>}
            </p>
            <div className="max-h-72 overflow-auto rounded-lg border border-slate-200">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-slate-50 text-left text-slate-500">
                  <tr>
                    <th className="px-2 py-1.5">Date</th>
                    <th className="px-2 py-1.5">Card</th>
                    <th className="px-2 py-1.5">Station</th>
                    <th className="px-2 py-1.5 text-right">Litres</th>
                    <th className="px-2 py-1.5 text-right">RM</th>
                    <th className="px-2 py-1.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {fuel.slice(0, 200).map((r) => (
                    <tr key={r._row} className={r._problem ? 'bg-red-50' : ''}>
                      <td className="whitespace-nowrap px-2 py-1">
                        {r.date ? day(r.date) : '—'} <span className="text-slate-400">{r.time}</span>
                      </td>
                      <td className="whitespace-nowrap px-2 py-1">{r.card_no || '—'}</td>
                      <td className="px-2 py-1">{r.station}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{n2(r.litres)}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{n2(r.amount)}</td>
                      <td className="px-2 py-1 text-red-600">{r._problem}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={run} disabled={busy || fuel.length === bad}>
                {busy ? 'Importing…' : `Import ${fuel.length - bad}`}
              </Button>
            </div>
          </>
        )}

        {result && (
          <>
            <ImportSummary r={result} />
            <div className="flex justify-end">
              <Button onClick={onClose}>Close</Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}

function ImportSummary({ r }) {
  const problems = r.problems || []
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ['New', r.added, 'text-emerald-700'],
          ['Already in', r.duplicates, 'text-slate-600'],
          ['Matched to claims', r.paired_with_claims ?? r.paired, 'text-brand'],
          ['Not saved', problems.length, problems.length ? 'text-red-600' : 'text-slate-400']
        ].map(([label, v, cls]) => (
          <div key={label} className="rounded-xl border border-slate-200 px-3 py-2">
            <p className="text-xs text-slate-500">{label}</p>
            <p className={`text-xl font-bold ${cls}`}>{v ?? 0}</p>
          </div>
        ))}
      </div>
      {problems.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50/60 p-3">
          <p className="mb-1 text-xs font-semibold text-red-700">Not saved — fix in Fleet Card Manage (card number) or check the statement:</p>
          <ul className="max-h-48 space-y-0.5 overflow-auto text-xs text-red-800">
            {problems.map((p, i) => (
              <li key={i}>
                Row {p.row}
                {p.card_no ? ` · card ${p.card_no}` : ''}
                {p.date ? ` · ${p.date}` : ''}
                {p.txn_id ? ` · ${p.txn_id}` : ''} — {p.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

/** One line under the Fleet Card Manage header: the latest statement import. */
export function LastImportLine({ imports, onOpen }) {
  if (!imports) return null
  const last = imports[0]
  if (!last)
    return <p className="text-xs text-slate-500">Fuel station statement: nothing imported yet. The AI agent will send it every day once it is set up.</p>
  const problems = (last.problems || []).length
  return (
    <p className="text-xs text-slate-500">
      Fuel station statement: last import {when(last.created_at)} by {last.by_user ? 'upload' : 'the AI agent'} · {last.added} new · {last.paired} matched to claims
      {problems > 0 && (
        <>
          {' · '}
          <button type="button" className="text-xs font-semibold text-red-600 hover:underline" onClick={() => onOpen(last)}>
            {problems} not saved
          </button>
        </>
      )}
    </p>
  )
}

export function ImportProblemsModal({ entry, onClose }) {
  return (
    <Modal open onClose={onClose} title={`Statement import · ${when(entry.created_at)}`}>
      <ImportSummary r={entry} />
      <div className="mt-4 flex justify-end">
        <Button onClick={onClose}>Close</Button>
      </div>
    </Modal>
  )
}
