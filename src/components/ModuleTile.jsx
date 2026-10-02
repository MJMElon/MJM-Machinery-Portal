import { Link } from 'react-router-dom'
import { IconExternal } from './icons.jsx'

// Square module button for the laptop-first portal pages.
// Pass `to` for an in-app route or `href` for an external app (opens in a new tab).
export function ModuleTile({ to, href, label, Icon, badge }) {
  const body = (
    <span className="relative flex aspect-square w-full flex-col items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 sm:gap-4 sm:p-6 text-center shadow-sm transition hover:-translate-y-0.5 hover:border-brand hover:shadow-md active:bg-slate-50">
      <span className="flex h-14 w-14 items-center sm:h-20 sm:w-20 justify-center rounded-2xl bg-brand-light text-brand">
        <Icon width={44} height={44} className="h-8 w-8 sm:h-11 sm:w-11" />
      </span>
      <span className="text-base font-semibold leading-tight sm:text-lg text-slate-800">{label}</span>
      {href && <IconExternal width={18} height={18} className="absolute right-4 top-4 text-slate-400" />}
      {badge}
    </span>
  )
  const cls = 'block rounded-2xl focus:outline-none focus:ring-2 focus:ring-brand/40'
  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
      {body}
    </a>
  ) : (
    <Link to={to} className={cls}>
      {body}
    </Link>
  )
}

export function TileGrid({ children }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-[repeat(auto-fill,minmax(200px,220px))] sm:gap-6">
      {children}
    </div>
  )
}
