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
    tile: 'sm:w-[200px]',
    icon: 'h-16 w-16 sm:h-20 sm:w-20',
    pad: 'gap-4 p-4 sm:gap-5 sm:p-6',
    text: 'sm:text-base'
  },
  sm: {
    tile: 'sm:w-[168px]',
    icon: 'h-14 w-14 sm:h-16 sm:w-16',
    pad: 'gap-3 p-4 sm:gap-4 sm:p-5',
    text: 'sm:text-[15px]'
  }
}

export function ModuleTile({ to, href, label, Icon, Art, badge, disabled, note, size = 'md' }) {
  const z = SIZES[size]
  const frame =
    'group relative flex aspect-square w-full flex-col items-center justify-center overflow-hidden rounded-3xl border border-slate-200/80 bg-white text-center shadow-sm transition hover:-translate-y-1 hover:shadow-lg hover:shadow-slate-300/50 active:translate-y-0'
  const body = Art ? (
    <span className={frame}>
      <Art className="absolute inset-0 h-full w-full transition duration-300 group-hover:scale-[1.04]" />
      <span className="sr-only">{label}</span>
      {note && (
        <span className="absolute inset-x-3 bottom-3 rounded-full bg-white/90 py-1 text-xs font-semibold text-slate-600">
          {note}
        </span>
      )}
    </span>
  ) : (
    <span className={`${frame} ${z.pad}`}>
      <Icon className={`${z.icon} drop-shadow-sm transition group-hover:scale-105`} />
      <span
        className={`whitespace-pre-line text-[15px] font-semibold leading-snug tracking-tight text-slate-800 ${z.text}`}
      >
        {label}
      </span>
      {note && <span className="-mt-2 text-xs font-medium text-slate-400">{note}</span>}
      {href && <IconExternal width={16} height={16} className="absolute right-4 top-4 text-slate-300" />}
      {badge}
    </span>
  )
  const cls = `block rounded-3xl focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 ${z.tile}`
  if (disabled) {
    return (
      <div className={`select-none opacity-50 grayscale ${z.tile}`} aria-disabled="true">
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
      <div className="mx-auto grid max-w-4xl grid-cols-2 gap-4 sm:flex sm:flex-wrap sm:justify-center sm:gap-7">
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
