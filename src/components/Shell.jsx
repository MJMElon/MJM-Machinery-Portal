import { useEffect, useRef, useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.jsx'
import { CompanyProvider, useCompany } from '../lib/CompanyContext.jsx'
import { INTRANET_URL } from '../lib/supabase.js'
import { IconBack, IconCheck, IconLogout } from './icons.jsx'

// Page side padding, shared by the top bar and the content so they line up.
const GUTTER = 'px-5 sm:px-10 lg:px-16 xl:px-20'
// Inner pages (modules) use the width more fully: MJM sits closer to the left edge.
const INNER = 'px-4 sm:px-5 lg:px-6'

// Laptop-first layout. On the main page the MJM title is big and centred; on
// every other page MJM moves to the left and the page title sits in the middle.
export function Shell() {
  const { pathname } = useLocation()
  const title = pageTitle(pathname)
  const gutter = title ? INNER : GUTTER
  return (
    <CompanyProvider>
      <div className="flex min-h-[100dvh] w-full flex-col">
        <TopBar title={title} gutter={gutter} />
        <main className={`w-full flex-1 pb-12 pt-6 sm:pt-8 ${gutter}`}>
          <Outlet />
        </main>
      </div>
    </CompanyProvider>
  )
}

// Centre title of the top bar for each page ('' = main page).
function pageTitle(path) {
  if (path === '/') return ''
  if (path.startsWith('/cmms')) return 'Machinery Manage'
  if (path.startsWith('/diesel/claims')) return 'Fuel Claims'
  if (path.startsWith('/diesel/usage')) return 'Fuel Usage'
  if (path.startsWith('/diesel/cards')) return 'Fleet Card Manage'
  if (path.startsWith('/diesel/report')) return 'Report'
  if (path.startsWith('/diesel')) return 'Fuel Manage'
  if (path.startsWith('/settings')) return 'Settings'
  return ''
}

// Top bar.
// Main page: "Back to MJM Intranet" button (left), "CMMS 2" (centre), user tools (right).
// Inner pages: company switcher (left), "CMMS 2" above the section name (centre).
function TopBar({ title, gutter }) {
  const { user, logout } = useAuth()
  const home = !title
  return (
    <header className="pt-safe sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur print:hidden">
      <div
        className={`grid grid-cols-[1fr_auto_1fr] items-center gap-3 ${gutter} ${home ? 'h-20 sm:h-24' : 'h-16 sm:h-[76px]'}`}
      >
        {/* Left: back to the Intranet (main page only) + the company switcher */}
        <div className="flex min-w-0 items-center gap-3">
          {home && (
            <a
              href={INTRANET_URL}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-200 bg-white pl-2.5 pr-3 text-[13px] font-semibold text-slate-800 hover:border-brand/50 hover:text-brand"
              title="Back to MJM Intranet"
            >
              <IconBack width={15} height={15} className="text-slate-400" />
              <span className="hidden sm:inline">Back to MJM Intranet</span>
              <span className="sm:hidden">Intranet</span>
            </a>
          )}
          <div className="hidden min-w-0 sm:block">
            <CompanySwitcher />
          </div>
        </div>

        {/* Centre: CMMS 2, with the section name under it on inner pages */}
        <Link to="/" className="flex flex-col items-center text-center" aria-label="CMMS 2 main page">
          {home ? (
            <span className="font-display text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">CMMS 2</span>
          ) : (
            <>
              <span className="font-display text-[11px] font-bold uppercase tracking-[0.3em] text-slate-400 sm:text-xs">
                CMMS 2
              </span>
              <h1 className="max-w-[40vw] truncate font-display text-lg font-extrabold tracking-tight text-slate-900 sm:max-w-none sm:text-[26px]">
                {title}
              </h1>
            </>
          )}
        </Link>

        <div className="flex min-w-0 items-center justify-end gap-1.5 sm:gap-2">
          <span className="mx-1 hidden max-w-[220px] truncate text-sm text-slate-500 lg:block">{user?.email}</span>
          <button
            onClick={logout}
            className="flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 active:bg-slate-200"
            aria-label="Log out"
            title={user?.email ? `Log out ${user.email}` : 'Log out'}
          >
            <IconLogout width={19} height={19} />
            <span className="hidden lg:inline">Log out</span>
          </button>
        </div>
      </div>
      {/* Phones: the company switcher gets its own row */}
      <div className={`border-t border-slate-100 py-2 sm:hidden ${gutter}`}>
        <CompanySwitcher wide />
      </div>
    </header>
  )
}

// "<company> · <business> ▾" — picks the company every module works on.
// The list is sorted by company code (smallest first); the user can drag rows
// to their own order, remembered in this browser.
function CompanySwitcher({ wide = false }) {
  const { companies, current, select, businessesOf } = useCompany()
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const storageKey = `portal.companyOrder.${user?.id || 'anon'}`
  const [order, setOrder] = useState(() => readOrder(storageKey))
  const [dragId, setDragId] = useState(null)
  const [overId, setOverId] = useState(null)

  useEffect(() => {
    if (!open) return
    const close = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  if (!current) return null
  const active = companies.filter((c) => c.is_active !== false)
  const byCode = [...active].sort((a, b) => (a.code || '\uffff').localeCompare(b.code || '\uffff') || a.name.localeCompare(b.name))
  const list = [...byCode].sort((a, b) => rankOf(order, byCode, a.id) - rankOf(order, byCode, b.id))
  const bizNames = (c) => businessesOf(c).map((b) => b.name).join(', ')

  function drop(targetId) {
    if (!dragId || dragId === targetId) return
    const ids = list.map((c) => c.id)
    ids.splice(ids.indexOf(targetId), 0, ids.splice(ids.indexOf(dragId), 1)[0])
    setOrder(ids)
    try {
      localStorage.setItem(storageKey, JSON.stringify(ids))
    } catch {
      // ignore
    }
  }

  return (
    <div className={`relative min-w-0 ${wide ? 'w-full' : ''}`} ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex h-9 min-w-0 items-center gap-2 rounded-xl border border-slate-200 bg-white pl-3 pr-2 text-[13px] font-semibold text-slate-800 hover:border-brand/50 ${wide ? 'w-full' : 'max-w-[320px]'}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Change company"
      >
        <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
        <span className="min-w-0 flex-1 truncate text-left">
          {current.name}
          {bizNames(current) && <span className="ml-1.5 font-normal text-slate-400">· {bizNames(current)}</span>}
        </span>
        <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute left-0 z-30 mt-2 max-h-[70vh] w-96 max-w-[calc(100vw-2.5rem)] overflow-y-auto rounded-2xl border border-slate-200 bg-white py-1.5 shadow-xl shadow-slate-300/40"
        >
          {list.map((c) => (
            <button
              key={c.id}
              role="option"
              aria-selected={c.id === current.id}
              draggable
              onDragStart={(e) => {
                setDragId(c.id)
                e.dataTransfer.effectAllowed = 'move'
              }}
              onDragOver={(e) => {
                e.preventDefault()
                setOverId(c.id)
              }}
              onDragLeave={() => setOverId(null)}
              onDrop={(e) => {
                e.preventDefault()
                drop(c.id)
                setDragId(null)
                setOverId(null)
              }}
              onDragEnd={() => {
                setDragId(null)
                setOverId(null)
              }}
              onClick={() => {
                select(c.id)
                setOpen(false)
              }}
              className={`flex w-full cursor-grab items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-slate-50 active:cursor-grabbing ${
                overId === c.id && dragId && dragId !== c.id ? 'border-t-2 border-brand' : ''
              } ${dragId === c.id ? 'opacity-50' : ''}`}
            >
              <span className="text-slate-300" aria-hidden="true">⋮⋮</span>
              <span className="min-w-0 flex-1 truncate">
                <span className="font-medium text-slate-800">{c.name}</span>
                {bizNames(c) && <span className="text-slate-400"> · {bizNames(c)}</span>}
              </span>
              {c.id === current.id && <IconCheck width={18} height={18} className="shrink-0 text-brand" />}
            </button>
          ))}
          <p className="px-4 pb-1 pt-2 text-[11px] text-slate-400">Sorted by company code. Drag a row to change your order.</p>
        </div>
      )}
    </div>
  )
}

const rankOf = (order, base, id) => {
  const i = order.indexOf(id)
  return i >= 0 ? i : order.length + base.findIndex((c) => c.id === id)
}

function readOrder(key) {
  try {
    const v = JSON.parse(localStorage.getItem(key) || '[]')
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}
