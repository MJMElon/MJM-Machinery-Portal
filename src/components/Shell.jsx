import { useEffect, useRef, useState } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.jsx'
import { CompanyProvider, useCompany } from '../lib/CompanyContext.jsx'
import { IconCheck, IconLogout } from './icons.jsx'

// Page side padding, shared by the top bar and the content so they line up.
const GUTTER = 'px-5 sm:px-10 lg:px-16 xl:px-20'

// Laptop-first layout. On the main page the MJM title is big and centred; on
// every other page MJM moves to the left and the page title sits in the middle.
export function Shell() {
  const { pathname } = useLocation()
  const title = pageTitle(pathname)
  return (
    <CompanyProvider>
      <div className="flex min-h-[100dvh] w-full flex-col">
        <TopBar title={title} />
        <main className={`w-full flex-1 pb-12 pt-6 sm:pt-8 ${GUTTER}`}>
          <Outlet />
        </main>
      </div>
    </CompanyProvider>
  )
}

// Centre title of the top bar for each page ('' = main page).
function pageTitle(path) {
  if (path === '/') return ''
  if (path.startsWith('/cmms/work/all')) return 'All Companies'
  if (path.startsWith('/cmms/work/case')) return 'Maintenance Case'
  if (path.startsWith('/cmms/work')) return 'Maintenance Work Manage'
  if (path.startsWith('/cmms')) return 'CMMS 2'
  if (path.startsWith('/settings')) return 'Settings'
  if (path.startsWith('/admin/companies')) return 'Manage Companies'
  return ''
}

function Brand({ size }) {
  const big = size === 'lg'
  return (
    <span className={`flex flex-col ${big ? 'items-center' : 'items-start'}`}>
      <span
        className={`font-extrabold leading-none tracking-tight text-brand ${big ? 'text-4xl sm:text-5xl' : 'text-2xl'}`}
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

function TopBar({ title }) {
  const { user, logout, isSuperAdmin } = useAuth()
  const navigate = useNavigate()
  const home = !title
  return (
    <header className="pt-safe sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div
        className={`grid grid-cols-[1fr_auto_1fr] items-center gap-3 ${GUTTER} ${home ? 'h-24' : 'h-16 sm:h-[72px]'}`}
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
          <h1 className="max-w-[40vw] truncate text-center text-base font-bold tracking-tight text-slate-900 sm:max-w-none sm:text-xl">
            {title}
          </h1>
        )}

        <div className="flex min-w-0 items-center justify-end gap-1.5 sm:gap-2">
          {isSuperAdmin && (
            <Link
              to="/admin/companies"
              title="Super admin: manage companies"
              aria-label="Super admin: manage companies"
              className="shrink-0 rounded-xl transition hover:scale-105 hover:shadow-md hover:shadow-red-500/20"
            >
              <SuperAdminIcon />
            </Link>
          )}
          <span className="mx-1 hidden max-w-[220px] truncate text-sm text-slate-500 2xl:block">{user?.email}</span>
          <button
            onClick={async () => {
              await logout()
              navigate('/login', { replace: true })
            }}
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
      <div className={`border-t border-slate-100 py-2 sm:hidden ${GUTTER}`}>
        <CompanySwitcher wide />
      </div>
    </header>
  )
}

// "Working in: <company> ▾" — picks the company every module works on.
function CompanySwitcher({ wide = false }) {
  const { companies, current, select } = useCompany()
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
        className={`flex h-10 min-w-0 items-center gap-2 rounded-xl border border-slate-200 bg-white pl-3 pr-2 text-sm font-semibold text-slate-800 hover:border-brand/50 ${wide ? 'w-full' : 'max-w-[260px]'}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Change company"
      >
        <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
        <span className="min-w-0 flex-1 truncate text-left">{current.name}</span>
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
          className="absolute left-0 z-30 mt-2 w-72 max-w-[calc(100vw-2.5rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white py-1.5 shadow-xl shadow-slate-300/40"
        >
          <p className="px-4 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Company</p>
          {companies.map((c) => (
            <button
              key={c.id}
              role="option"
              aria-selected={c.id === current.id}
              onClick={() => {
                select(c.id)
                setOpen(false)
              }}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-slate-50"
            >
              <span className="min-w-0 flex-1 truncate font-medium text-slate-800">{c.name}</span>
              {c.id === current.id && <IconCheck width={18} height={18} className="text-brand" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// Super admin button: a red gear on blue (Superman colours).
function SuperAdminIcon() {
  const teeth = Array.from({ length: 8 }, (_, i) => i * 45)
  return (
    <svg viewBox="0 0 40 40" className="h-10 w-10" aria-hidden="true">
      <defs>
        <linearGradient id="superadmin-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1d4ed8" />
          <stop offset="1" stopColor="#1e3a8a" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="11" fill="url(#superadmin-bg)" />
      <g transform="translate(20 20)">
        {teeth.map((deg) => (
          <rect
            key={deg}
            x="-2.4"
            y="-12.5"
            width="4.8"
            height="6"
            rx="1.3"
            fill="#ef4444"
            transform={`rotate(${deg})`}
          />
        ))}
        <circle r="8.6" fill="#ef4444" />
        <circle r="3.6" fill="#1e40af" />
      </g>
    </svg>
  )
}
