import { useState } from 'react'
import { Button, TextInput } from './ui.jsx'
import { IconPlus, IconTrash } from './icons.jsx'

// A simple list you can edit in place: an "add" row on top, then one row per
// item with inline inputs, Save (when changed) and Delete.
// columns: [{ key, label, placeholder?, required?, className? }]
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
          <span key={c.key}>{c.label}</span>
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

const blank = (columns) => Object.fromEntries(columns.map((c) => [c.key, '']))
const clean = (values) =>
  Object.fromEntries(Object.entries(values).map(([k, v]) => [k, String(v ?? '').trim() || null]))

function AddRow({ columns, template, grid, onAdd }) {
  const [values, setValues] = useState(blank(columns))
  const [busy, setBusy] = useState(false)
  const ok = columns.every((c) => !c.required || String(values[c.key]).trim())
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault()
        if (!ok) return
        setBusy(true)
        try {
          if (await onAdd(clean(values))) setValues(blank(columns))
        } finally {
          setBusy(false)
        }
      }}
      className={`grid gap-2 bg-brand-light/30 px-5 py-4 ${grid}`}
      style={{ '--cols': `${template} 96px` }}
    >
      {columns.map((c) => (
        <label key={c.key} className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">
            {c.label}
            {c.required && <span className="text-red-500"> *</span>}
          </span>
          <TextInput
            value={values[c.key]}
            placeholder={c.placeholder}
            onChange={(e) => setValues((v) => ({ ...v, [c.key]: e.target.value }))}
          />
        </label>
      ))}
      <Button type="submit" disabled={busy || !ok} className="lg:self-end">
        <IconPlus width={18} height={18} /> Add
      </Button>
    </form>
  )
}

function Row({ row, columns, template, grid, canEdit, onSave, onDelete, deleteLabel }) {
  const initial = Object.fromEntries(columns.map((c) => [c.key, row[c.key] ?? '']))
  const [values, setValues] = useState(initial)
  const [busy, setBusy] = useState(false)
  const dirty = columns.some((c) => String(values[c.key] ?? '').trim() !== String(initial[c.key] ?? ''))
  const ok = columns.every((c) => !c.required || String(values[c.key]).trim())
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
        <TextInput
          key={c.key}
          aria-label={c.label}
          disabled={!canEdit}
          className={`${cell} ${i === 0 ? 'font-semibold' : ''}`}
          value={values[c.key]}
          placeholder={canEdit ? '—' : ''}
          onChange={(e) => setValues((v) => ({ ...v, [c.key]: e.target.value }))}
        />
      ))}
      <div className="flex items-center justify-end gap-1">
        {canEdit && dirty && (
          <Button size="sm" disabled={busy || !ok} onClick={() => run(() => onSave({ id: row.id, ...clean(values) }))}>
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
