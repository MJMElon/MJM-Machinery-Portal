import { Link } from 'react-router-dom'
import { IconExternal } from './icons.jsx'

// Square module button for the portal pages: app-style icon + label.
// Pass `to` for an in-app route or `href` for an external app (opens in a new tab).
// `label` may contain "\n" to break the line.
export function ModuleTile({ to, href, label, Icon, badge }) {
  const body = (
    <span className="group relative flex aspect-square w-full flex-col items-center justify-center gap-4 rounded-3xl border border-slate-200/80 bg-white p-4 text-center shadow-sm transition hover:-translate-y-1 hover:shadow-lg hover:shadow-slate-300/50 active:translate-y-0 sm:gap-5 sm:p-6">
      <Icon className="h-16 w-16 drop-shadow-sm transition group-hover:scale-105 sm:h-20 sm:w-20" />
      <span className="whitespace-pre-line text-[15px] font-semibold leading-snug tracking-tight text-slate-800 sm:text-base">
        {label}
      </span>
      {href && <IconExternal width={16} height={16} className="absolute right-4 top-4 text-slate-300" />}
      {badge}
    </span>
  )
  const cls = 'block rounded-3xl focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40'
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
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-[repeat(auto-fill,minmax(190px,200px))] sm:gap-6">
      {children}
    </div>
  )
}
