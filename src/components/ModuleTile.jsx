import { Children, useEffect, useMemo, useState } from 'react'
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
 * Tiles centred on the page with generous side space (two per row on phones).
 * With `orderKey`, tiles can be dragged into the order the user prefers; the
 * order is remembered per user in this browser.
 */
export function TileGrid({ children, orderKey }) {
  const { user } = useAuth()
  const items = Children.toArray(children).filter(Boolean)
  const ids = items.map((c) => String(c.key))
  const storageKey = orderKey && `tiles.${orderKey}.${user?.id || 'anon'}`
  const [order, setOrder] = useState(() => readOrder(storageKey))
  const [dragId, setDragId] = useState(null)

  useEffect(() => setOrder(readOrder(storageKey)), [storageKey])

  const sorted = useMemo(() => {
    const rank = (id) => {
      const i = order.indexOf(id)
      return i < 0 ? order.length + ids.indexOf(id) : i
    }
    return [...ids].sort((a, b) => rank(a) - rank(b))
  }, [order, ids.join('|')]) // eslint-disable-line react-hooks/exhaustive-deps

  function moveOver(overId) {
    if (!dragId || dragId === overId) return
    const next = sorted.filter((id) => id !== dragId)
    next.splice(next.indexOf(overId), 0, dragId)
    setOrder(next)
  }

  const byId = Object.fromEntries(items.map((c) => [String(c.key), c]))
  return (
    <div>
      <div className="mx-auto grid max-w-4xl grid-cols-2 gap-4 sm:flex sm:flex-wrap sm:items-end sm:justify-center sm:gap-5">
        {sorted.map((id) => (
          <div
            key={id}
            draggable={Boolean(orderKey)}
            onDragStart={(e) => {
              setDragId(id)
              e.dataTransfer.effectAllowed = 'move'
              e.dataTransfer.setData('text/plain', id)
            }}
            onDragOver={(e) => {
              if (!dragId) return
              e.preventDefault()
              moveOver(id)
            }}
            onDrop={(e) => e.preventDefault()}
            onDragEnd={() => {
              setDragId(null)
              writeOrder(storageKey, sorted)
            }}
            className={`transition ${orderKey ? 'cursor-grab active:cursor-grabbing' : ''} ${dragId === id ? 'scale-95 opacity-40' : ''}`}
          >
            {byId[id]}
          </div>
        ))}
      </div>
      {orderKey && ids.length > 1 && (
        <p className="mt-6 hidden text-center text-xs text-slate-400 sm:block">
          Tip: drag the buttons to arrange them your way.
        </p>
      )}
    </div>
  )
}

function readOrder(key) {
  if (!key) return []
  try {
    return JSON.parse(localStorage.getItem(key) || '[]')
  } catch {
    return []
  }
}

function writeOrder(key, order) {
  if (!key) return
  try {
    localStorage.setItem(key, JSON.stringify(order))
  } catch {
    // ignore (private mode)
  }
}
