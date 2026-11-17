import { useEffect, useRef, useState } from 'react'

/**
 * A drop-down with tick boxes: choose one, several or none (none = all).
 * options: [{ value, label, group? }] — options with a group are listed under
 * that heading. value: array of chosen values.
 */
export function MultiPick({ label, allLabel, options, value, onChange }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const box = useRef(null)

  useEffect(() => {
    if (!open) return
    const away = (e) => box.current && !box.current.contains(e.target) && setOpen(false)
    const esc = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('pointerdown', away)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  const chosen = new Set(value)
  const byValue = new Map(options.map((o) => [o.value, o]))
  const summary =
    value.length === 0
      ? allLabel
      : value.length === 1
        ? byValue.get(value[0])?.label || '1 selected'
        : value.length <= 2
          ? value.map((v) => byValue.get(v)?.label).filter(Boolean).join(', ')
          : `${value.length} selected`
  const toggle = (v) => onChange(chosen.has(v) ? value.filter((x) => x !== v) : [...value, v])
  const needle = q.trim().toLowerCase()
  const shown = options.filter((o) => !needle || o.label.toLowerCase().includes(needle))
  const groups = []
  for (const o of shown) {
    const g = o.group || ''
    let last = groups[groups.length - 1]
    if (!last || last.name !== g) groups.push((last = { name: g, items: [] }))
    last.items.push(o)
  }

  return (
    <div className="relative" ref={box}>
      <span className="mb-1 block text-xs font-semibold text-slate-600">{label}</span>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`flex h-12 w-full items-center gap-2 rounded-xl border bg-white px-3.5 text-left ${open ? 'border-brand ring-2 ring-brand/30' : 'border-slate-300'}`}
      >
        <span className={`min-w-0 flex-1 truncate ${value.length ? 'text-slate-900' : 'text-slate-600'}`}>{summary}</span>
        {value.length > 0 && (
          <span className="shrink-0 rounded-full bg-brand px-1.5 text-[11px] font-semibold leading-5 text-white">{value.length}</span>
        )}
        <svg className="h-4 w-4 shrink-0 text-slate-500" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path d="M5 7.5l5 5 5-5" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-40 mt-1 min-w-[16rem] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
          {options.length > 8 && (
            <div className="border-b border-slate-100 p-2">
              <input
                autoFocus
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search…"
                className="h-9 w-full rounded-lg border border-slate-200 px-2.5 text-sm focus:border-brand focus:outline-none"
              />
            </div>
          )}
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-1.5 text-xs">
            <button type="button" onClick={() => onChange([...new Set([...value, ...shown.map((o) => o.value)])])} className="text-xs font-medium text-brand hover:underline">
              Tick all{needle ? ' shown' : ''}
            </button>
            <button type="button" onClick={() => onChange([])} className="text-xs font-medium text-slate-500 hover:underline">
              Clear (show all)
            </button>
          </div>
          <div className="max-h-72 overflow-y-auto py-1">
            {shown.length === 0 && <p className="px-3 py-3 text-center text-sm text-slate-400">No match</p>}
            {groups.map((g) => (
              <div key={g.name || '_'}>
                {g.name && <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{g.name}</p>}
                {g.items.map((o) => (
                  <label key={o.value} className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm hover:bg-slate-50">
                    <input type="checkbox" checked={chosen.has(o.value)} onChange={() => toggle(o.value)} className="h-4 w-4 rounded border-slate-300 text-brand" />
                    <span className="min-w-0 flex-1 truncate text-slate-800">{o.label}</span>
                  </label>
                ))}
              </div>
            ))}
          </div>
          <div className="border-t border-slate-100 p-2 text-right">
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white">
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
