import { Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.jsx'
import { IconLogout } from './icons.jsx'

// Top bar + content column, styled like MachTrek's Shell (no bottom nav: the
// portal navigates by module tiles).
export function Shell() {
  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-app flex-col lg:max-w-5xl">
      <TopBar />
      <main className="flex-1 px-4 pb-10 pt-3">
        <Outlet />
      </main>
    </div>
  )
}

function TopBar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  return (
    <header className="pt-safe sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="flex h-14 items-center justify-between px-4">
        <button onClick={() => navigate('/')} className="min-w-0 text-left">
          <p className="truncate text-sm font-semibold text-slate-800">MJM Portal</p>
          <p className="truncate text-[11px] uppercase tracking-wide text-slate-500">{user?.email || 'Administrator'}</p>
        </button>
        <button
          onClick={async () => {
            await logout()
            navigate('/login', { replace: true })
          }}
          className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-500 active:bg-slate-100"
          aria-label="Log out"
        >
          <IconLogout width={20} height={20} />
        </button>
      </div>
    </header>
  )
}
