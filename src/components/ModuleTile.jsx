import { Children, useEffect, useRef, useState } from 'react'
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
    tile: 'sm:w-[150px]',
    icon: 'h-14 w-14 sm:h-16 sm:w-16',
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
  const body = Art ? (
    <span className="group relative flex w-full flex-col items-center">
      <Art className="h-auto w-full transition duration-300 group-hover:-translate-y-1" />
      <span className="sr-only">{label}</span>
      {note && <span className="-mt-1 text-[11px] font-semibold text-slate-500">{note}</span>}
    </span>
  ) : (
    <span className={`${frame} ${z.pad}`}>
      <Icon className={`${z.icon} drop-shadow-sm transition group-hover:scale-105`} />
      <span className={`whitespace-pre-line text-[15px] font-semibold leading-snug tracking-tight text-slate-800 ${z.text}`}>
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
 * Module area: a neat grid of equal tiles. With `orderKey` a tile can be
 * picked up and dragged: it follows the pointer, the other tiles make room
 * where it would land, and on release it drops into that slot. The order is
 * remembered per user in this browser. Tiles never float freely.
 */
export function TileGrid({ children, orderKey }) {
  const items = Children.toArray(children).filter(Boolean)
  const { user } = useAuth()
  const storageKey = orderKey ? `tiles.order.${orderKey}.${user?.id || 'anon'}` : null
  const [order, setOrder] = useState(() => (storageKey ? readJson(storageKey) : []))
  const [drag, setDrag] = useState(null) // { id, x, y, w, h, dx, dy, live: [ids] }
  const gridRef = useRef(null)
  const gesture = useRef(null)
  const suppressClick = useRef(false)

  useEffect(() => setOrder(storageKey ? readJson(storageKey) : []), [storageKey])

  const ids = items.map((c) => String(c.key))
  const baseOrder = [...ids].sort((a, b) => rank(order, ids, a) - rank(order, ids, b))
  const shown = drag?.live || baseOrder
  const byId = Object.fromEntries(items.map((c) => [String(c.key), c]))

  function commit(next) {
    setOrder(next)
    if (storageKey) writeJson(storageKey, next)
  }

  function start(e, id) {
    if (!storageKey || e.button !== 0) return
    const r = e.currentTarget.getBoundingClientRect()
    gesture.current = { id, sx: e.clientX, sy: e.clientY, dx: e.clientX - r.left, dy: e.clientY - r.top, w: r.width, h: r.height, moved: false, target: e.currentTarget, pointerId: e.pointerId }
  }
  function move(e) {
    const g = gesture.current
    if (!g) return
    if (!g.moved && Math.hypot(e.clientX - g.sx, e.clientY - g.sy) < 6) return
    if (!g.moved) {
      g.moved = true
      g.target.setPointerCapture?.(g.pointerId)
    }
    // Where would it land? The slot whose centre is nearest the pointer.
    const slots = [...gridRef.current.querySelectorAll('[data-tile]')]
    let best = null
    for (const el of slots) {
      const r = el.getBoundingClientRect()
      const d = Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2))
      if (!best || d < best.d) best = { id: el.getAttribute('data-tile'), d }
    }
    const live = [...(drag?.live || baseOrder)]
    if (best && best.id !== g.id) {
      live.splice(live.indexOf(g.id), 1)
      live.splice(live.indexOf(best.id) + (live.indexOf(best.id) < 0 ? 0 : 0), 0, g.id)
    }
    setDrag({ id: g.id, x: e.clientX - g.dx, y: e.clientY - g.dy, w: g.w, h: g.h, live })
  }
  function end() {
    const g = gesture.current
    gesture.current = null
    if (g?.moved) {
      suppressClick.current = true
      if (drag?.live) commit(drag.live)
    }
    setDrag(null)
  }

  return (
    <div>
      <div ref={gridRef} className="mx-auto grid max-w-4xl grid-cols-2 gap-4 sm:flex sm:flex-wrap sm:items-start sm:justify-center sm:gap-5">
        {shown.map((id) => {
          const el = byId[id]
          if (!el) return null
          const lifted = drag?.id === id
          return (
            <div
              key={id}
              data-tile={id}
              className={`touch-none transition-opacity ${storageKey ? 'cursor-grab active:cursor-grabbing' : ''} ${lifted ? 'opacity-30' : ''}`}
              onPointerDown={(e) => start(e, id)}
              onPointerMove={move}
              onPointerUp={end}
              onPointerCancel={end}
              onClickCapture={(e) => {
                if (suppressClick.current) {
                  e.preventDefault()
                  e.stopPropagation()
                  suppressClick.current = false
                }
              }}
            >
              {el}
            </div>
          )
        })}
      </div>
      {/* The lifted tile follows the pointer */}
      {drag && (
        <div
          className="pointer-events-none fixed z-50 rotate-2 scale-105 drop-shadow-2xl"
          style={{ left: drag.x, top: drag.y, width: drag.w, height: drag.h }}
        >
          {byId[drag.id]}
        </div>
      )}
      {storageKey && (
        <p className="mt-6 text-center text-xs text-slate-400">
          Hold and drag a button to move it; it drops where you let go.{' '}
          {order.length > 0 && (
            <button onClick={() => commit([])} className="text-xs font-medium text-brand hover:underline">
              Reset order
            </button>
          )}
        </p>
      )}
    </div>
  )
}

const rank = (order, ids, id) => {
  const i = order.indexOf(id)
  return i >= 0 ? i : order.length + ids.indexOf(id)
}

function readJson(key) {
  try {
    const v = JSON.parse(localStorage.getItem(key) || '[]')
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // ignore (private mode)
  }
}
