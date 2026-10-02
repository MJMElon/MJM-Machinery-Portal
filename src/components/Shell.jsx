import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.jsx'
import { IconLogout } from './icons.jsx'

// Laptop-first layout. On the main page the MJM title is big and centred; on
// every other page MJM moves to the left and the page title sits in the middle.
export function Shell() {
  const { pathname } = useLocation()
  const title = pageTitle(pathname)
  return (
    <div className="flex min-h-[100dvh] w-full flex-col">
      <TopBar title={title} />
      <main className="w-full flex-1 px-4 pb-12 pt-6 sm:px-8 sm:pt-8 lg:px-10">
        <Outlet />
      </main>
    </div>
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
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const home = !title
  return (
    <header className="pt-safe sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div
        className={`grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 sm:px-8 lg:px-10 ${home ? 'h-24' : 'h-16 sm:h-[72px]'}`}
      >
        <div className="min-w-0">
          {!home && (
            <Link to="/" aria-label="Main page" className="inline-block">
              <Brand />
            </Link>
          )}
        </div>

        {home ? (
          <Brand size="lg" />
        ) : (
          <h1 className="max-w-[46vw] truncate text-center text-base font-bold tracking-tight text-slate-900 sm:max-w-none sm:text-xl">
            {title}
          </h1>
        )}

        <div className="flex items-center justify-end gap-3">
          <span className="hidden truncate text-sm text-slate-500 lg:block">{user?.email}</span>
          <button
            onClick={async () => {
              await logout()
              navigate('/login', { replace: true })
            }}
            className="flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-medium text-slate-600 hover:bg-slate-100 active:bg-slate-200"
            aria-label="Log out"
          >
            <IconLogout width={19} height={19} />
            <span className="hidden sm:inline">Log out</span>
          </button>
        </div>
      </div>
    </header>
  )
}
