import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { IconX } from './icons.jsx'
import { useAuth } from '../auth/AuthContext.jsx'
import { useCompany } from '../lib/CompanyContext.jsx'

/**
 * Module windows for the whole of CMMS 2. A module opened from a desktop page
 * (Machinery Manage) runs in a window that behaves like a laptop window: drag
 * it by its title bar, resize from the corner, minimise it to the bar at the
 * bottom, maximise it, close it. The windows and the bottom bar live here, in
 * the Shell, so they stay while the person moves around CMMS 2.
 * Each window shows the module page itself (an iframe of this app, which
 * hides its top bar when embedded). On phones the icon simply opens the page.
 *
 * A module is { key, label, Icon, path, href? }.
 */
let TOP = 76 // top bar height; measured from the Shell's header (taller on the main page)
const BAR = 52 // bottom bar height
const MIN_W = 520
const MIN_H = 320
const isPhone = () => window.innerWidth < 1024

const Ctx = createContext({ open: () => {}, windows: [] })
export const useWindows = () => useContext(Ctx)

export function WindowsProvider({ children }) {
  const { user } = useAuth()
  const { current } = useCompany()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [top, setTop] = useState(TOP)
  const storeKey = `desk.windows.${user?.id || 'anon'}`
  const [wins, setWins] = useState([]) // { module, x, y, w, h, min, max, z }
  const zTop = useRef(10)
  const [drag, setDrag] = useState(null)

  const saved = useCallback(() => {
    try {
      return JSON.parse(localStorage.getItem(storeKey) || '{}')
    } catch {
      return {}
    }
  }, [storeKey])
  const remember = (key, box) => {
    try {
      localStorage.setItem(storeKey, JSON.stringify({ ...saved(), [key]: box }))
    } catch {
      /* ignore */
    }
  }

  const raise = useCallback((key) => setWins((ws) => ws.map((w) => (w.module.key === key ? { ...w, z: ++zTop.current, min: false } : w))), [])

  const open = useCallback(
    (m) => {
      if (m.href) return window.open(m.href, '_blank', 'noopener')
      if (isPhone()) return navigate(m.path)
      setWins((ws) => {
        if (ws.some((w) => w.module.key === m.key)) return ws.map((w) => (w.module.key === m.key ? { ...w, z: ++zTop.current, min: false } : w))
        const area = { w: window.innerWidth, h: window.innerHeight - TOP - BAR }
        const box = saved()[m.key]
        const n = ws.length
        const w = Math.min(box?.w || 1180, area.w - 24)
        const h = Math.min(box?.h || Math.round(area.h * 0.9), area.h - 16)
        const x = Math.max(8, Math.min(box?.x ?? (area.w - w) / 2 + n * 28, area.w - w - 8))
        const y = Math.max(8, Math.min(box?.y ?? 16 + n * 28, area.h - h - 8))
        return [...ws, { module: m, x, y, w, h, min: false, max: Boolean(box?.max), z: ++zTop.current }]
      })
    },
    [navigate, saved]
  )
  const close = (key) => setWins((ws) => ws.filter((w) => w.module.key !== key))
  const patch = (key, p) =>
    setWins((ws) =>
      ws.map((w) => {
        if (w.module.key !== key) return w
        const next = { ...w, ...p }
        remember(key, { x: next.x, y: next.y, w: next.w, h: next.h, max: next.max })
        return next
      })
    )

  // The top bar is taller on the main page: windows start right under it.
  useEffect(() => {
    const measure = () => {
      const h = document.querySelector('header')?.getBoundingClientRect().bottom
      if (h) {
        TOP = Math.round(h)
        setTop(TOP)
      }
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [pathname])

  // A click inside an iframe takes the focus: bring that window to the front.
  useEffect(() => {
    const onBlur = () => {
      const el = document.activeElement
      if (el?.tagName === 'IFRAME' && el.dataset.win) raise(el.dataset.win)
    }
    window.addEventListener('blur', onBlur)
    return () => window.removeEventListener('blur', onBlur)
  }, [raise])

  return (
    <Ctx.Provider value={{ open, windows: wins }}>
      {children}

      {wins.map((w) => (
        <Win
          key={w.module.key}
          win={w}
          companyId={current?.id}
          top={top}
          onFocus={() => raise(w.module.key)}
          onClose={() => close(w.module.key)}
          onMin={() => patch(w.module.key, { min: true })}
          onMax={() => patch(w.module.key, { max: !w.max })}
          onMove={(p) => patch(w.module.key, p)}
          onDrag={setDrag}
        />
      ))}
      {/* While dragging, a sheet over everything keeps the pointer out of the iframes */}
      {drag && <div className="fixed inset-0 z-[60]" style={{ cursor: drag === 'resize' ? 'nwse-resize' : 'move' }} />}

      {/* Bar at the bottom: every open window; minimised ones are dimmed */}
      {wins.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 flex items-center gap-2 overflow-x-auto border-t border-slate-200 bg-white/95 px-4 py-2 backdrop-blur print:hidden" style={{ height: BAR }}>
          {wins.map((w) => (
            <button
              key={w.module.key}
              type="button"
              onClick={() => (w.min ? raise(w.module.key) : patch(w.module.key, { min: true }))}
              className={`inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border px-3 text-sm font-medium ${
                w.min ? 'border-slate-200 bg-slate-50 text-slate-500' : 'border-brand/40 bg-brand-light text-brand-dark'
              }`}
              title={w.min ? 'Restore' : 'Minimise'}
            >
              <w.module.Icon className="h-5 w-5" />
              {w.module.label.replace('\n', ' ')}
            </button>
          ))}
        </div>
      )}
    </Ctx.Provider>
  )
}

function Win({ win, companyId, top, onFocus, onClose, onMin, onMax, onMove, onDrag }) {
  const { module } = win
  const [loaded, setLoaded] = useState(false)
  const gesture = useRef(null)
  // ?v=<build stamp> keeps a window from loading an old cached copy of the app
  const src = `${window.location.origin}${window.location.pathname}?v=${typeof __BUILD__ === 'string' ? __BUILD__ : '0'}#${module.path}`

  // Drag by the title bar / resize from the corner.
  function start(e, kind) {
    if (e.button !== 0 || win.max) return
    e.preventDefault()
    onFocus()
    gesture.current = { kind, sx: e.clientX, sy: e.clientY, x: win.x, y: win.y, w: win.w, h: win.h }
    onDrag(kind)
    const move = (ev) => {
      const g = gesture.current
      if (!g) return
      const dx = ev.clientX - g.sx
      const dy = ev.clientY - g.sy
      if (g.kind === 'move') {
        onMove({
          x: Math.max(-g.w + 120, Math.min(g.x + dx, window.innerWidth - 120)),
          y: Math.max(0, Math.min(g.y + dy, window.innerHeight - TOP - BAR - 40))
        })
      } else {
        onMove({ w: Math.max(MIN_W, g.w + dx), h: Math.max(MIN_H, g.h + dy) })
      }
    }
    const up = () => {
      gesture.current = null
      onDrag(null)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  const style = win.max
    ? { left: 0, top, width: '100vw', height: `calc(100dvh - ${top + BAR}px)` }
    : { left: win.x, top: win.y + top, width: win.w, height: win.h }

  return (
    <section
      className={`fixed flex flex-col overflow-hidden border border-slate-300 bg-white shadow-2xl shadow-slate-900/20 print:hidden ${win.max ? '' : 'rounded-xl'} ${win.min ? 'hidden' : ''}`}
      style={{ ...style, zIndex: 30 + win.z }}
      onPointerDown={onFocus}
      aria-label={module.label}
    >
      <header
        onPointerDown={(e) => start(e, 'move')}
        onDoubleClick={onMax}
        className={`flex h-10 shrink-0 select-none items-center gap-2 border-b border-slate-200 bg-slate-50 pl-3 pr-1.5 ${win.max ? '' : 'cursor-move'}`}
      >
        <module.Icon className="h-6 w-6" />
        <span className="truncate text-sm font-semibold text-slate-800">{module.label.replace('\n', ' ')}</span>
        <span className="ml-auto flex items-center gap-0.5" onPointerDown={(e) => e.stopPropagation()}>
          <Ctl onClick={onMin} label="Minimise">
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M3 11h10" />
            </svg>
          </Ctl>
          <Ctl onClick={onMax} label={win.max ? 'Restore' : 'Maximise'}>
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6">
              {win.max ? (
                <>
                  <rect x="5" y="2.5" width="8.5" height="8.5" rx="1" />
                  <path d="M2.5 5.5v7a1 1 0 0 0 1 1h7" />
                </>
              ) : (
                <rect x="2.5" y="2.5" width="11" height="11" rx="1.5" />
              )}
            </svg>
          </Ctl>
          <Ctl onClick={onClose} label="Close" danger>
            <IconX width={14} height={14} />
          </Ctl>
        </span>
      </header>
      <div className="relative min-h-0 flex-1 bg-slate-100">
        {!loaded && <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-400">Loading {module.label.replace('\n', ' ')}…</div>}
        <iframe key={companyId || 'none'} src={src} title={module.label} data-win={module.key} onLoad={() => setLoaded(true)} className="h-full w-full border-0" />
      </div>
      {!win.max && (
        <div onPointerDown={(e) => start(e, 'resize')} className="absolute bottom-0 right-0 h-5 w-5 cursor-nwse-resize" title="Resize">
          <svg viewBox="0 0 20 20" className="h-5 w-5 text-slate-300" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M18 8L8 18M18 13l-5 5" />
          </svg>
        </div>
      )}
    </section>
  )
}

function Ctl({ onClick, label, danger, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`flex h-8 w-9 items-center justify-center rounded-md text-slate-600 ${danger ? 'hover:bg-red-500 hover:text-white' : 'hover:bg-slate-200'}`}
    >
      {children}
    </button>
  )
}
