import { useEffect, useRef, useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.jsx'
import { CompanyProvider, useCompany } from '../lib/CompanyContext.jsx'
import { INTRANET_URL } from '../lib/supabase.js'
import { IconCheck, IconCog, IconExternal, IconLogout } from './icons.jsx'

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
  if (path.startsWith('/cmms')) return 'CMMS 2'
  if (path.startsWith('/diesel')) return 'Diesel Manage'
  if (path.startsWith('/settings')) return 'Settings'
  if (path.startsWith('/admin/companies')) return 'Businesses & Companies'
  return ''
}

function Brand({ size }) {
  const big = size === 'lg'
  return (
    <span className={`flex flex-col ${big ? 'items-center' : 'items-start'}`}>
      <span
        className={`text-silver font-extrabold leading-none tracking-tight ${big ? 'text-4xl sm:text-5xl' : 'text-2xl'}`}
      >
        MJM
      </span>
      <span
        className={`mt-1.5 whitespace-nowrap font-semibold uppercase text-slate-500 ${big ? 'text-[11px] tracking-[0.32em] sm:text-xs' : 'hidden text-[9px] tracking-[0.24em] sm:block'}`}
      >
        Plantation Sector
      </span>
    </span>
  )
}

function TopBar({ title, gutter }) {
  const { user, logout, isSuperAdmin } = useAuth()
  const home = !title
  return (
    <header className="pt-safe sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div
        className={`grid grid-cols-[1fr_auto_1fr] items-center gap-3 ${gutter} ${home ? 'h-24' : 'h-16 sm:h-[72px]'}`}
      >
        {/* Left: (MJM on inner pages) + the company switcher */}
        <div className="flex min-w-0 items-center gap-4">
          {!home && (
            <Link to="/" aria-label="Main page" className="shrink-0">
              <Brand />
            </Link>
          )}
          <div className="hidden min-w-0 sm:block">
            <CompanySwitcher />
          </div>
        </div>

        {home ? (
          <Brand size="lg" />
        ) : (
          <h1 className="max-w-[40vw] truncate text-center font-display text-lg font-extrabold tracking-tight text-slate-900 sm:max-w-none sm:text-[28px]">
            {title}
          </h1>
        )}

        <div className="flex min-w-0 items-center justify-end gap-1.5 sm:gap-2">
          <span className="mx-1 hidden max-w-[220px] truncate text-sm text-slate-500 lg:block">{user?.email}</span>
          <a
            href={INTRANET_URL}
            target="_blank"
            rel="noopener noreferrer"
            title="Open MJM Intranet"
            className="hidden h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl px-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 active:bg-slate-200 md:flex"
          >
            MJM Intranet
            <IconExternal width={14} height={14} className="text-slate-400" />
          </a>
          {isSuperAdmin && (
            <Link
              to="/admin/companies"
              title="Super admin: manage companies"
              aria-label="Super admin: manage companies"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 active:bg-slate-200"
            >
              <IconCog width={20} height={20} />
            </Link>
          )}
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

// "Working in: <company> ▾" — picks the company every module works on.
// Companies are listed under their business, as in MJM Intranet.
function CompanySwitcher({ wide = false }) {
  const { groups, current, select, businessesOf } = useCompany()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const close = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  if (!current) return null
  return (
    <div className={`relative min-w-0 ${wide ? 'w-full' : ''}`} ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex h-9 min-w-0 items-center gap-2 rounded-xl border border-slate-200 bg-white pl-3 pr-2 text-[13px] font-semibold text-slate-800 hover:border-brand/50 ${wide ? 'w-full' : 'max-w-[260px]'}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Change company"
      >
        <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
        <span className="min-w-0 flex-1 truncate text-left">
          {current.name}
          {businessesOf(current).length > 0 && (
            <span className="ml-1.5 font-normal text-slate-400">
              · {businessesOf(current).map((b) => b.name).join(', ')}
            </span>
          )}
        </span>
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4 shrink-0 text-slate-400"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute left-0 z-30 mt-2 max-h-[70vh] w-80 max-w-[calc(100vw-2.5rem)] overflow-y-auto rounded-2xl border border-slate-200 bg-white py-1.5 shadow-xl shadow-slate-300/40"
        >
          {groups.map((g) => (
            <div key={g.id}>
              <p className="px-4 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{g.name}</p>
              {g.companies.map((c) => (
                <button
                  key={`${g.id}:${c.id}`}
                  role="option"
                  aria-selected={c.id === current.id}
                  onClick={() => {
                    select(c.id)
                    setOpen(false)
                  }}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-slate-50"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-slate-800">{c.name}</span>
                    {(c.code || c.short_name) && (
                      <span className="block truncate text-xs text-slate-400">
                        {[c.code, c.short_name].filter(Boolean).join(' · ')}
                      </span>
                    )}
                  </span>
                  {c.id === current.id && <IconCheck width={18} height={18} className="shrink-0 text-brand" />}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
