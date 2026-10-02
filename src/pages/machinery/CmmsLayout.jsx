import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  IconBack,
  IconExcavator,
  IconExternal,
  IconNotebook,
  IconRoute,
  IconUsers,
  IconWorkshop
} from '../../components/icons.jsx'

const MACHTREK_URL = import.meta.env.VITE_MACHTREK_URL || 'https://mjmelon.github.io/MachTrek/'

const NAV = [
  { to: '/cmms/work', label: 'Maintenance Work Manage', Icon: IconNotebook },
  { to: '/cmms/machines', label: 'Machinery Profile', Icon: IconExcavator },
  { to: '/cmms/suppliers', label: 'Supplier Workshop List', Icon: IconWorkshop },
  { to: '/cmms/users', label: 'CMMS User Setting', Icon: IconUsers }
]

// CMMS 2: a left sidebar with the modules; the chosen one opens on the right.
// Phones: the list becomes a scrollable row of tabs above the content.
export default function CmmsLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  // One page back; if CMMS 2 was opened directly (no earlier page), go to the main page.
  const back = () => (location.key === 'default' ? navigate('/') : navigate(-1))
  const item = (active) =>
    `flex items-center gap-3 rounded-xl px-3.5 py-2.5 font-display text-[14px] font-semibold tracking-tight transition whitespace-nowrap ${
      active ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
    }`

  return (
    <div className="lg:grid lg:grid-cols-[290px_minmax(0,1fr)] lg:items-start lg:gap-6">
      <aside className="mb-5 lg:sticky lg:top-[96px] lg:mb-0">
        {/* Back sits outside the card, level with the page heading, so the card
            lines up with the content block (heading row = 56px + 20px gap). */}
        <div className="hidden lg:mb-5 lg:flex lg:h-14 lg:items-end">
          <button
            onClick={back}
            className="-ml-2 inline-flex h-9 items-center gap-1.5 rounded-xl px-2 text-sm font-medium text-slate-500 hover:bg-white hover:text-brand"
          >
            <IconBack width={16} height={16} /> Back
          </button>
        </div>
        {/* Same card style as the content blocks on the right */}
        <nav className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:rounded-2xl lg:border lg:border-slate-200 lg:bg-white lg:p-3 lg:shadow-sm">
          <p className="hidden px-3 pb-1 pt-1.5 font-display text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400 lg:block">
            Modules
          </p>
          {NAV.map(({ to, label, Icon }) => (
            <NavLink key={to} to={to} className={({ isActive }) => item(isActive)}>
              <Icon width={19} height={19} className="shrink-0" />
              <span className="lg:whitespace-normal lg:leading-snug">{label}</span>
            </NavLink>
          ))}
          <div className="my-1 hidden border-t border-slate-200 lg:block" />
          <a href={MACHTREK_URL} target="_blank" rel="noopener noreferrer" className={item(false)}>
            <IconRoute width={19} height={19} className="shrink-0" />
            MachTrek
            <IconExternal width={14} height={14} className="ml-auto text-slate-400" />
          </a>
        </nav>
      </aside>
      <section className="min-w-0">
        <Outlet />
      </section>
    </div>
  )
}
