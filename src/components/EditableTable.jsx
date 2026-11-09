import { useState } from 'react'
import { Button, TextInput } from './ui.jsx'
import { IconPlus, IconTrash } from './icons.jsx'

// A simple list you can edit in place: an "add" row on top, then one row per
// item with inline inputs, Save (when changed) and Delete.
// columns: [{ key, label, placeholder?, required?, type?, options?, hint? }]
//   type: 'text' (default) | 'number' | 'select' (with options: [[value, label]]) | 'checkbox'
// `template` is the CSS grid-template-columns for laptop width.
export function EditableTable({ columns, rows, template, canEdit, onAdd, onSave, onDelete, emptyText, deleteLabel }) {
  // Columns only from laptop width; below that each row stacks.
  const grid = 'lg:grid lg:items-center lg:gap-3 lg:[grid-template-columns:var(--cols)]'
  return (
    <div>
      {canEdit && <AddRow columns={columns} template={template} grid={grid} onAdd={onAdd} />}
      <div
        className={`hidden border-y border-slate-200 bg-slate-50/80 px-5 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500 ${grid}`}
        style={{ '--cols': `${template} 96px` }}
      >
        {columns.map((c) => (
          <span key={c.key} title={c.hint} className={c.type === 'checkbox' ? 'text-center' : ''}>
            {c.label}
          </span>
        ))}
        <span />
      </div>
      {rows.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-slate-400">{emptyText}</p>
      ) : (
        <div className="divide-y divide-slate-100">
          {rows.map((r) => (
            <Row
              key={r.id}
              row={r}
              columns={columns}
              template={template}
              grid={grid}
              canEdit={canEdit}
              onSave={onSave}
              onDelete={onDelete}
              deleteLabel={deleteLabel}
            />
          ))}
        </div>
      )}
    </div>
  )
}

const blankValue = (c) => (c.type === 'checkbox' ? false : c.type === 'select' ? (c.default ?? c.options?.[0]?.[0] ?? '') : '')
const blank = (columns) => Object.fromEntries(columns.map((c) => [c.key, blankValue(c)]))
const fromRow = (columns, row) =>
  Object.fromEntries(columns.map((c) => [c.key, c.type === 'checkbox' ? Boolean(row[c.key]) : (row[c.key] ?? '')]))
const norm = (c, v) => (c.type === 'checkbox' ? Boolean(v) : String(v ?? '').trim())
const clean = (columns, values) =>
  Object.fromEntries(
    columns.map((c) => {
      const v = values[c.key]
      if (c.type === 'checkbox') return [c.key, Boolean(v)]
      if (c.type === 'number') return [c.key, String(v ?? '').trim() === '' ? null : Number(v)]
      return [c.key, String(v ?? '').trim() || null]
    })
  )
const valid = (columns, values) => columns.every((c) => !c.required || norm(c, values[c.key]) !== '')

// One input, by column type.
function Cell({ c, value, onChange, disabled, className = '', inAddRow }) {
  if (c.type === 'checkbox') {
    return (
      <label className={`flex h-10 items-center ${inAddRow ? 'gap-2' : 'justify-center'}`} title={c.hint}>
        <input
          type="checkbox"
          className="h-5 w-5 cursor-pointer accent-[#2563eb] disabled:cursor-not-allowed"
          checked={Boolean(value)}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          aria-label={c.label}
        />
        {inAddRow && <span className="text-sm text-slate-600 lg:hidden">{c.label}</span>}
      </label>
    )
  }
  if (c.type === 'select') {
    return (
      <select
        value={value ?? ''}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        aria-label={c.label}
        className={`h-10 w-full rounded-lg border border-slate-300 bg-white px-2 text-[15px] text-slate-900 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30 disabled:bg-transparent disabled:text-slate-700 disabled:opacity-100 ${className}`}
      >
        {(c.options || []).map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    )
  }
  return (
    <TextInput
      type={c.type === 'number' ? 'number' : 'text'}
      inputMode={c.type === 'number' ? 'decimal' : undefined}
      step={c.type === 'number' ? 'any' : undefined}
      aria-label={c.label}
      disabled={disabled}
      className={className}
      value={value ?? ''}
      placeholder={c.placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

function AddRow({ columns, template, grid, onAdd }) {
  const [values, setValues] = useState(blank(columns))
  const [busy, setBusy] = useState(false)
  const ok = valid(columns, values)
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault()
        if (!ok) return
        setBusy(true)
        try {
          if (await onAdd(clean(columns, values))) setValues(blank(columns))
        } finally {
          setBusy(false)
        }
      }}
      className={`grid gap-2 bg-brand-light/30 px-5 py-4 ${grid}`}
      style={{ '--cols': `${template} 96px` }}
    >
      {columns.map((c) => (
        <label key={c.key} className="block">
          <span className={`mb-1 block text-xs font-medium text-slate-600 ${c.type === 'checkbox' ? 'text-center' : ''}`}>
            {c.label}
            {c.required && <span className="text-red-500"> *</span>}
          </span>
          <Cell c={c} value={values[c.key]} onChange={(v) => setValues((s) => ({ ...s, [c.key]: v }))} inAddRow />
        </label>
      ))}
      <Button type="submit" disabled={busy || !ok} className="lg:self-end">
        <IconPlus width={18} height={18} /> Add
      </Button>
    </form>
  )
}

function Row({ row, columns, template, grid, canEdit, onSave, onDelete, deleteLabel }) {
  const initial = fromRow(columns, row)
  const [values, setValues] = useState(initial)
  const [busy, setBusy] = useState(false)
  const dirty = columns.some((c) => norm(c, values[c.key]) !== norm(c, initial[c.key]))
  const ok = valid(columns, values)
  const cell =
    'h-10 rounded-lg border-transparent bg-transparent px-2 hover:border-slate-200 focus:bg-white disabled:bg-transparent'

  async function run(fn) {
    setBusy(true)
    try {
      await fn()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={`grid gap-1 px-5 py-2.5 ${grid}`} style={{ '--cols': `${template} 96px` }}>
      {columns.map((c, i) => (
        <div key={c.key} className="flex items-center gap-2">
          <span className="w-28 shrink-0 text-xs text-slate-500 lg:hidden">{c.label}</span>
          <div className="min-w-0 flex-1">
            <Cell
              c={c}
              value={values[c.key]}
              disabled={!canEdit}
              className={`${cell} ${i === 0 ? 'font-semibold' : ''}`}
              onChange={(v) => setValues((s) => ({ ...s, [c.key]: v }))}
            />
          </div>
        </div>
      ))}
      <div className="flex items-center justify-end gap-1">
        {canEdit && dirty && (
          <Button size="sm" disabled={busy || !ok} onClick={() => run(() => onSave({ id: row.id, ...clean(columns, values) }))}>
            Save
          </Button>
        )}
        {canEdit && (
          <button
            disabled={busy}
            onClick={() =>
              window.confirm(`Delete ${deleteLabel || 'this item'} "${row[columns[0].key]}"?`) &&
              run(() => onDelete(row))
            }
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"
            aria-label="Delete"
          >
            <IconTrash width={18} height={18} />
          </button>
        )}
      </div>
    </div>
  )
}
