import { Children, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { IconExternal } from './icons.jsx'
import { useAuth } from '../auth/AuthContext.jsx'

// Module icon for the portal pages: the app-style icon with its name under
// it (no box around it). Every tile has the same width, icon size and a
// two-line title area, so a long or short name never shifts the row.
// Pass `to` for an in-app route, `href` for an external app (new tab) or
// `onClick`. `disabled` shows it greyed out with `note` under the name.
const SIZES = {
  md: { tile: 'w-[112px] sm:w-[132px]', icon: 'h-[72px] w-[72px] sm:h-20 sm:w-20', text: 'text-[13px] sm:text-sm' },
  sm: { tile: 'w-[104px] sm:w-[120px]', icon: 'h-16 w-16 sm:h-[72px] sm:w-[72px]', text: 'text-[12px] sm:text-[13px]' }
}

export function ModuleTile({ to, href, onClick, label, Icon, badge, disabled, note, size = 'md' }) {
  const z = SIZES[size]
  const body = (
    <span className={`group flex flex-col items-center ${z.tile}`}>
      <span className={`relative ${z.icon} transition duration-200 group-hover:-translate-y-1 group-hover:scale-[1.04] group-active:scale-95`}>
        <Icon className="block h-full w-full" />
        {href && <IconExternal width={12} height={12} className="absolute -right-1 -top-1 rounded-full bg-white p-0.5 text-slate-400 shadow" />}
        {badge}
      </span>
      <span className={`mt-2 line-clamp-2 h-10 w-full whitespace-pre-line text-center font-semibold leading-tight tracking-tight text-slate-800 ${z.text}`}>{label}</span>
      {note && <span className="-mt-1 text-[11px] font-medium text-slate-400">{note}</span>}
    </span>
  )
  const cls = 'block select-none rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40'
  if (disabled)
    return (
      <div className="select-none opacity-45 grayscale" aria-disabled="true">
        {body}
      </div>
    )
  if (onClick)
    return (
      <button type="button" onClick={onClick} className={cls} draggable={false}>
        {body}
      </button>
    )
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
 * Module area: a neat grid of equal tiles. With `orderKey`, press and hold a
 * tile (about half a second) and the icons start to wiggle: now any of them
 * can be dragged to a new place; the others make room and it drops into the
 * nearest slot. Tap anywhere to stop. The order is remembered
 * per user in this browser.
 */
const HOLD_MS = 450

export function TileGrid({ children, orderKey }) {
  const items = Children.toArray(children).filter(Boolean)
  const { user } = useAuth()
  const storageKey = orderKey ? `tiles.order.${orderKey}.${user?.id || 'anon'}` : null
  const [order, setOrder] = useState(() => (storageKey ? readJson(storageKey) : []))
  const [editing, setEditing] = useState(false)
  const [drag, setDrag] = useState(null) // { id, x, y, w, h, live: [ids] }
  const gridRef = useRef(null)
  const gesture = useRef(null)
  const hold = useRef(null)
  const suppressClick = useRef(false)

  useEffect(() => setOrder(storageKey ? readJson(storageKey) : []), [storageKey])

  // Tap anywhere (or press Escape) ends the wiggle; a tap on a tile is handled in end().
  useEffect(() => {
    if (!editing) return
    const down = (e) => gridRef.current && !gridRef.current.contains(e.target) && setEditing(false)
    const key = (e) => e.key === 'Escape' && setEditing(false)
    document.addEventListener('pointerdown', down)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('pointerdown', down)
      document.removeEventListener('keydown', key)
    }
  }, [editing])

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
    clearTimeout(hold.current)
    if (!editing) {
      hold.current = setTimeout(() => {
        if (gesture.current?.id === id && !gesture.current.moved) {
          setEditing(true)
          suppressClick.current = true
          navigator.vibrate?.(15)
        }
      }, HOLD_MS)
    }
  }
  function move(e) {
    const g = gesture.current
    if (!g) return
    if (!g.moved && Math.hypot(e.clientX - g.sx, e.clientY - g.sy) < 6) return
    if (!editing) {
      // moved before the hold finished: it is a scroll or a slip, not a drag
      clearTimeout(hold.current)
      return
    }
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
      live.splice(live.indexOf(best.id), 0, g.id)
    }
    setDrag({ id: g.id, x: e.clientX - g.dx, y: e.clientY - g.dy, w: g.w, h: g.h, live })
  }
  function end() {
    clearTimeout(hold.current)
    const g = gesture.current
    gesture.current = null
    if (g?.moved) {
      suppressClick.current = true
      if (drag?.live) commit(drag.live)
    } else if (g && editing && !suppressClick.current) {
      // A plain tap on a tile while they shake: stop the shaking (and do not open it).
      suppressClick.current = true
      setEditing(false)
    }
    setDrag(null)
  }

  return (
    <div>
      <div ref={gridRef} className="mx-auto grid max-w-4xl grid-cols-3 justify-items-center gap-x-2 gap-y-6 sm:flex sm:flex-wrap sm:items-start sm:justify-center sm:gap-x-4 sm:gap-y-8">
        {shown.map((id, i) => {
          const el = byId[id]
          if (!el) return null
          const lifted = drag?.id === id
          return (
            <div
              key={id}
              data-tile={id}
              className={`relative touch-none transition-opacity ${editing ? 'cursor-grab active:cursor-grabbing tile-wiggle' : ''} ${lifted ? 'opacity-30' : ''}`}
              style={editing ? { animationDelay: `${(i % 4) * -0.12}s` } : undefined}
              onPointerDown={(e) => start(e, id)}
              onPointerMove={move}
              onPointerUp={end}
              onPointerCancel={end}
              onContextMenu={(e) => storageKey && e.preventDefault()}
              onClickCapture={(e) => {
                if (suppressClick.current || editing) {
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
        <div className="pointer-events-none fixed z-50 scale-110 drop-shadow-2xl" style={{ left: drag.x, top: drag.y, width: drag.w, height: drag.h }}>
          {byId[drag.id]}
        </div>
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
