import { Link } from 'react-router-dom'
import { IconBack } from './icons.jsx'

// A "<" button that grows to show its label when the mouse is over it
// (or when it has the keyboard focus). Same size and colour as "Log out".
// `to` = in-app route, `href` = outside link, `onClick` = custom.
// `top` = leave the whole portal, even when this page runs inside a module window (iframe).
export default function BackButton({ to, href, onClick, label, className = '', top = false }) {
  const cls = `group inline-flex h-10 shrink-0 items-center overflow-hidden whitespace-nowrap rounded-xl border border-slate-200 bg-white pl-2.5 pr-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:pr-3.5 hover:text-slate-900 active:bg-slate-200 print:hidden ${className}`
  const body = (
    <>
      <IconBack width={20} height={20} className="shrink-0" />
      <span className="max-w-0 overflow-hidden opacity-0 transition-all duration-200 group-hover:ml-1.5 group-hover:max-w-[240px] group-hover:opacity-100 group-focus-visible:ml-1.5 group-focus-visible:max-w-[240px] group-focus-visible:opacity-100">
        {label}
      </span>
    </>
  )
  if (href)
    return (
      <a href={href} target={top ? '_top' : undefined} className={cls} title={label} aria-label={label}>
        {body}
      </a>
    )
  if (to)
    return (
      <Link to={to} className={cls} title={label} aria-label={label}>
        {body}
      </Link>
    )
  return (
    <button type="button" onClick={onClick} className={cls} title={label} aria-label={label}>
      {body}
    </button>
  )
}
