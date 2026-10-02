import { Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.jsx'
import { IconLogout } from './icons.jsx'

// Laptop-first layout: full-width top bar with the MJM title centred,
// content in a wide centred column.
export function Shell() {
  return (
    <div className="flex min-h-[100dvh] w-full flex-col">
      <TopBar />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-12 pt-8 sm:px-8">
        <Outlet />
      </main>
    </div>
  )
}

function TopBar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  return (
    <header className="pt-safe sticky top-0 z-20 border-b border-slate-200 bg-white shadow-sm">
      <div className="mx-auto grid h-24 max-w-6xl grid-cols-[1fr_auto_1fr] items-center px-4 sm:px-8">
        <div />
        <button onClick={() => navigate('/')} className="text-center" aria-label="Portal home">
          <p className="text-4xl font-extrabold tracking-widest text-brand sm:text-5xl">MJM</p>
          <p className="mt-1 text-xs font-medium uppercase tracking-[0.25em] text-slate-500 sm:text-sm">
            Plantation Sector
          </p>
        </button>
        <div className="flex items-center justify-end gap-3">
          <span className="hidden truncate text-sm text-slate-500 md:block">{user?.email}</span>
          <button
            onClick={async () => {
              await logout()
              navigate('/login', { replace: true })
            }}
            className="flex h-10 items-center gap-2 rounded-lg px-3 text-sm text-slate-600 hover:bg-slate-100 active:bg-slate-200"
            aria-label="Log out"
          >
            <IconLogout width={20} height={20} />
            <span className="hidden sm:inline">Log out</span>
          </button>
        </div>
      </div>
    </header>
  )
}
