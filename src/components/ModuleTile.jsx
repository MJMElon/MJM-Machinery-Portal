import { Link } from 'react-router-dom'
import { IconExternal } from './icons.jsx'

// Square module button for the portal pages: app-style icon + label.
// Pass `to` for an in-app route or `href` for an external app (opens in a new tab).
// `label` may contain "\n" to break the line. `disabled` shows the tile greyed
// out with `note` underneath (e.g. a module the company does not have).
// size: 'md' (main page) or 'sm' (module sub-pages).
const SIZES = {
  md: {
    tile: 'sm:w-[200px]',
    icon: 'h-16 w-16 sm:h-20 sm:w-20',
    pad: 'gap-4 p-4 sm:gap-5 sm:p-6',
    text: 'sm:text-base'
  },
  sm: {
    tile: 'sm:w-[168px]',
    icon: 'h-14 w-14 sm:h-16 sm:w-16',
    pad: 'gap-3 p-4 sm:gap-4 sm:p-5',
    text: 'sm:text-[15px]'
  }
}

export function ModuleTile({ to, href, label, Icon, badge, disabled, note, size = 'md' }) {
  const z = SIZES[size]
  const body = (
    <span
      className={`group relative flex aspect-square w-full flex-col items-center justify-center rounded-3xl border border-slate-200/80 bg-white text-center shadow-sm transition hover:-translate-y-1 hover:shadow-lg hover:shadow-slate-300/50 active:translate-y-0 ${z.pad}`}
    >
      <Icon className={`${z.icon} drop-shadow-sm transition group-hover:scale-105`} />
      <span
        className={`whitespace-pre-line text-[15px] font-semibold leading-snug tracking-tight text-slate-800 ${z.text}`}
      >
        {label}
      </span>
      {note && <span className="-mt-2 text-xs font-medium text-slate-400">{note}</span>}
      {href && <IconExternal width={16} height={16} className="absolute right-4 top-4 text-slate-300" />}
      {badge}
    </span>
  )
  const cls = `block rounded-3xl focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 ${z.tile}`
  if (disabled) {
    return (
      <div className={`pointer-events-none select-none opacity-50 grayscale ${z.tile}`} aria-disabled="true">
        {body}
      </div>
    )
  }
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

// Tiles centred on the page with generous side space (two per row on phones).
export function TileGrid({ children }) {
  return (
    <div className="mx-auto grid max-w-4xl grid-cols-2 gap-4 sm:flex sm:flex-wrap sm:justify-center sm:gap-7">
      {children}
    </div>
  )
}
