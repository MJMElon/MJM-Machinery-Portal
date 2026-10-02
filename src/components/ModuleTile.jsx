import { Children, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { IconExternal } from './icons.jsx'
import { useAuth } from '../auth/AuthContext.jsx'

// Square module button for the portal pages: app-style icon + label, or a
// full-tile picture (`Art`) that already shows the module name.
// Pass `to` for an in-app route or `href` for an external app (opens in a new tab).
// `label` may contain "\n" to break the line. `disabled` shows the tile greyed
// out with `note` underneath (e.g. a module the company does not have).
// size: 'md' (main page) or 'sm' (module sub-pages).
const SIZES = {
  md: {
    tile: 'sm:w-[140px]',
    icon: 'h-12 w-12 sm:h-14 sm:w-14',
    pad: 'gap-2.5 p-3 sm:gap-3',
    text: 'text-sm',
    round: 'rounded-[22px]'
  },
  sm: {
    tile: 'sm:w-[120px]',
    icon: 'h-11 w-11',
    pad: 'gap-2 p-2.5',
    text: 'text-[13px]',
    round: 'rounded-[20px]'
  }
}

export function ModuleTile({ to, href, label, Icon, Art, badge, disabled, note, size = 'md' }) {
  const z = SIZES[size]
  const frame = `group relative flex aspect-square w-full flex-col items-center justify-center overflow-hidden ${z.round} border border-slate-200/80 bg-white text-center shadow-sm transition hover:-translate-y-1 hover:shadow-lg hover:shadow-slate-300/50 active:translate-y-0`
  // Art: a shaped picture button with no box — the picture's outline is the button.
  const body = Art ? (
    <span className="group relative flex w-full flex-col items-center">
      <Art className="h-auto w-full transition duration-300 [filter:drop-shadow(0_0_0_transparent)] group-hover:-translate-y-1 group-hover:[filter:drop-shadow(0_10px_12px_rgb(59_36_18/0.25))]" />
      <span className="sr-only">{label}</span>
      {note && <span className="-mt-1 text-[11px] font-semibold text-slate-500">{note}</span>}
    </span>
  ) : (
    <span className={`${frame} ${z.pad}`}>
      <Icon className={`${z.icon} drop-shadow-sm transition group-hover:scale-105`} />
      <span
        className={`whitespace-pre-line text-[15px] font-semibold leading-snug tracking-tight text-slate-800 ${z.text}`}
      >
        {label}
      </span>
      {note && <span className="-mt-1 text-[11px] font-medium text-slate-400">{note}</span>}
      {href && <IconExternal width={13} height={13} className="absolute right-2.5 top-2.5 text-slate-300" />}
      {badge}
    </span>
  )
  const tileW = Art ? 'sm:w-[270px]' : z.tile
  const cls = `block ${Art ? 'rounded-2xl' : z.round} focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 ${tileW}`
  if (disabled) {
    return (
      <div className={`select-none opacity-50 grayscale ${tileW}`} aria-disabled="true">
        {body}
      </div>
    )
  }
  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className={cls} draggable={false}>
      {body}
    </a>
  ) : (
    <Link to={to} className={cls} draggable={false}>
      {body}
    </Link>
  )
}

/**
 * Module area. Phones: a simple two-column grid. Laptop: a free canvas where
 * each button can be dragged anywhere and resized from its corner handle, so
 * users can lay out ("decorate") their page. With `orderKey` the layout is
 * remembered per user in this browser; without it the buttons sit in a row.
 */
export function TileGrid({ children, orderKey }) {
  const items = Children.toArray(children).filter(Boolean)
  const wide = useMediaQuery('(min-width: 640px)')
  if (!wide || !orderKey) {
    return (
      <div className="mx-auto grid max-w-4xl grid-cols-2 gap-4 sm:flex sm:flex-wrap sm:items-end sm:justify-center sm:gap-5">
        {items}
      </div>
    )
  }
  return <FreeCanvas items={items} orderKey={orderKey} />
}

const GAP = 22
const MIN_SCALE = 0.6
const MAX_SCALE = 2.4

// Natural size of a tile (before the user's scale).
function baseSize(el) {
  const p = el.props || {}
  if (p.Art) return { w: 270, h: Math.round((270 * 170) / 256) + (p.note ? 16 : 0) }
  const w = p.size === 'sm' ? 120 : 140
  return { w, h: w }
}

function FreeCanvas({ items, orderKey }) {
  const { user } = useAuth()
  const storageKey = `tiles.layout.${orderKey}.${user?.id || 'anon'}`
  const [saved, setSavedState] = useState(() => readJson(storageKey))
  const latest = useRef(saved)
  const setSaved = (v) => {
    latest.current = v
    setSavedState(v)
  }
  const [width, setWidth] = useState(0)
  const [active, setActive] = useState(null) // id being moved/resized
  const ref = useRef(null)
  const gesture = useRef(null)
  const suppressClick = useRef(false)

  useEffect(() => setSaved(readJson(storageKey)), [storageKey])
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const ids = items.map((c) => String(c.key))
  const sizes = Object.fromEntries(items.map((c) => [String(c.key), baseSize(c)]))

  // Default: one centred row, bottoms aligned.
  const defaults = useMemo(() => {
    const total = ids.reduce((n, id) => n + sizes[id].w, 0) + GAP * (ids.length - 1)
    const maxH = Math.max(...ids.map((id) => sizes[id].h))
    let x = Math.max(0, (width - total) / 2)
    const out = {}
    ids.forEach((id, i) => {
      out[id] = { x: width ? x / width : 0, y: 16 + maxH - sizes[id].h, s: 1, z: i }
      x += sizes[id].w + GAP
    })
    return out
  }, [width, ids.join('|')]) // eslint-disable-line react-hooks/exhaustive-deps

  const pos = (id) => ({ ...defaults[id], ...(saved[id] || {}) })
  const height = Math.max(
    300,
    ...ids.map((id) => {
      const p = pos(id)
      return p.y + sizes[id].h * p.s + 40
    })
  )

  function commit(next) {
    setSaved(next)
    writeJson(storageKey, next)
  }

  function start(e, id, mode) {
    if (e.button !== 0) return
    e.stopPropagation()
    const p = pos(id)
    gesture.current = { id, mode, sx: e.clientX, sy: e.clientY, p, moved: false }
    // Resizing grabs the pointer at once; moving only after a real drag, so a
    // plain click still reaches the link and opens the module.
    if (mode === 'resize') e.currentTarget.setPointerCapture(e.pointerId)
  }

  function move(e) {
    const g = gesture.current
    if (!g) return
    const dx = e.clientX - g.sx
    const dy = e.clientY - g.sy
    if (!g.moved && Math.hypot(dx, dy) < 5) return
    if (!g.moved && g.mode === 'move') e.currentTarget.setPointerCapture(e.pointerId)
    g.moved = true
    setActive(g.id)
    const size = sizes[g.id]
    const z = Math.max(0, ...ids.map((id) => pos(id).z || 0)) + 1
    let next
    if (g.mode === 'resize') {
      const s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, (size.w * g.p.s + dx) / size.w))
      const maxS = (width - g.p.x * width) / size.w
      next = { ...g.p, s: Math.min(s, maxS), z }
    } else {
      const w = size.w * g.p.s
      const left = Math.min(Math.max(0, g.p.x * width + dx), Math.max(0, width - w))
      next = { ...g.p, x: left / width, y: Math.max(0, g.p.y + dy), z }
    }
    // Fill in every tile so the others stay put once the user starts arranging.
    const all = Object.fromEntries(ids.map((id) => [id, pos(id)]))
    setSaved({ ...all, [g.id]: next })
  }

  function end() {
    const g = gesture.current
    gesture.current = null
    setActive(null)
    if (g?.moved) {
      suppressClick.current = true
      writeJson(storageKey, latest.current)
    }
  }

  return (
    <div>
      <div ref={ref} className="relative mx-auto w-full max-w-6xl select-none" style={{ height }}>
        {width > 0 &&
          items.map((el) => {
            const id = String(el.key)
            const p = pos(id)
            const size = sizes[id]
            return (
              <div
                key={id}
                className={`group/tile absolute touch-none ${active === id ? 'cursor-grabbing' : 'cursor-grab'}`}
                style={{
                  left: p.x * width,
                  top: p.y,
                  width: size.w,
                  transform: `scale(${p.s})`,
                  transformOrigin: 'top left',
                  zIndex: p.z || 0
                }}
                onPointerDown={(e) => start(e, id, 'move')}
                onPointerMove={move}
                onPointerUp={end}
                onClickCapture={(e) => {
                  if (suppressClick.current) {
                    e.preventDefault()
                    e.stopPropagation()
                    suppressClick.current = false
                  }
                }}
              >
                <div className="[&>*]:!w-full">{el}</div>
                {/* resize handle */}
                <span
                  onPointerDown={(e) => start(e, id, 'resize')}
                  onPointerMove={move}
                  onPointerUp={end}
                  title="Drag to resize"
                  className="absolute -bottom-1.5 -right-1.5 hidden h-5 w-5 cursor-nwse-resize items-center justify-center rounded-full border border-slate-300 bg-white text-slate-500 shadow group-hover/tile:flex"
                  style={{ transform: `scale(${1 / p.s})` }}
                >
                  <svg viewBox="0 0 10 10" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="1.4">
                    <path d="M9 3 3 9M9 6.5 6.5 9" strokeLinecap="round" />
                  </svg>
                </span>
              </div>
            )
          })}
      </div>
      <p className="mt-2 text-center text-xs text-slate-400">
        Drag the buttons anywhere and drag a corner to resize.{' '}
        {Object.keys(saved).length > 0 && (
          <button onClick={() => commit({})} className="text-xs font-medium text-brand hover:underline">
            Reset layout
          </button>
        )}
      </p>
    </div>
  )
}

function useMediaQuery(query) {
  const get = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : true)
  const [match, setMatch] = useState(get)
  useEffect(() => {
    const m = window.matchMedia(query)
    const on = () => setMatch(m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [query])
  return match
}

function readJson(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || '{}') || {}
  } catch {
    return {}
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // ignore (private mode)
  }
}
