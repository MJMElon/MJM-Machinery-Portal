import { useEffect, useRef, useState } from 'react'

/**
 * A drop-down with tick boxes: choose one, several or none (none = all).
 * options: [{ value, label, group? }] — options with a group are listed under
 * that heading. value: array of chosen values.
 */
// head: a column title that opens the list (in a table header). The list is
// placed on the screen (fixed) so the table's scroll box does not cut it off.
// searchable: always show the search box at the top (else only for long lists).
export function MultiPick({ label, allLabel, options, value, onChange, head = false, align = 'left', searchable = false, searchPlaceholder = 'Search…' }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [pos, setPos] = useState(null)
  const box = useRef(null)
  const btn = useRef(null)

  useEffect(() => {
    if (!open) return
    const away = (e) => box.current && !box.current.contains(e.target) && setOpen(false)
    const esc = (e) => e.key === 'Escape' && setOpen(false)
    // a head list is fixed on the screen: close it when the page scrolls under it
    const moved = (e) => head && box.current && !box.current.contains(e.target) && setOpen(false)
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', esc)
    window.addEventListener('scroll', moved, true)
    window.addEventListener('resize', moved)
    return () => {
      document.removeEventListener('pointerdown', away)
      document.removeEventListener('keydown', esc)
      window.removeEventListener('scroll', moved, true)
      window.removeEventListener('resize', moved)
    }
  }, [open, head])

  const toggleOpen = () => {
    if (head && !open && btn.current) {
      const r = btn.current.getBoundingClientRect()
      const w = 288
      const left = align === 'right' ? r.right - w : r.left
      setPos({ top: r.bottom + 4, left: Math.max(8, Math.min(left, window.innerWidth - w - 8)), width: w })
    }
    if (open) setQ('')
    setOpen((o) => !o)
  }

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
    <div className={head ? 'inline-block' : 'relative'} ref={box}>
      {head ? (
        <button
          ref={btn}
          type="button"
          onClick={toggleOpen}
          aria-expanded={open}
          title={value.length ? `${label}: ${summary}` : `Filter by ${label.toLowerCase()}`}
          className={`-mx-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-semibold uppercase tracking-wide ${value.length ? 'bg-brand/10 text-brand' : 'text-slate-500 hover:bg-slate-200/60 hover:text-slate-700'}`}
        >
          {label}
          {value.length > 0 && <span className="rounded-full bg-brand px-1.5 text-[10px] font-semibold normal-case leading-4 text-white">{value.length}</span>}
          <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M3.5 5h13l-5 6v4.5l-3 1.5V11z" />
          </svg>
        </button>
      ) : (
      <>
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
      </>
      )}

      {open && (
        <div
          className={`z-50 overflow-hidden rounded-xl border border-slate-200 bg-white text-left font-normal normal-case tracking-normal shadow-xl ${head ? 'fixed' : 'absolute left-0 right-0 top-full mt-1 min-w-[16rem]'}`}
          style={head && pos ? { top: pos.top, left: pos.left, width: pos.width } : undefined}
        >
          {(searchable || options.length > 8) && (
            <div className="border-b border-slate-100 p-2">
              <input
                autoFocus
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={searchPlaceholder}
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
