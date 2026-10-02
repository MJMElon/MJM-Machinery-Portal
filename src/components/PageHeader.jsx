import { useNavigate } from 'react-router-dom'
import { IconBack } from './icons.jsx'

// Row under the top bar: a labelled back button, an optional heading, and an
// optional `right` slot for page actions. The page title itself is in the top bar.
// The back button shows only when `backTo` (a route) or `backLabel` is given;
// with a label but no route it goes back in history.
export default function PageHeader({ backTo, backLabel, title, subtitle, right }) {
  const navigate = useNavigate()
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3 lg:min-h-14">
      <div className="min-w-0">
        {(backTo || backLabel) && (
          <button
            onClick={() => (backTo ? navigate(backTo) : navigate(-1))}
            className="-ml-2 mb-2 inline-flex h-9 items-center gap-1.5 rounded-xl px-2 text-sm font-medium text-slate-600 hover:bg-white hover:text-brand"
          >
            <IconBack width={18} height={18} />
            {backLabel || 'Back'}
          </button>
        )}
        {title && <h2 className="truncate font-display text-2xl font-bold tracking-tight text-slate-900">{title}</h2>}
        {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {right}
    </div>
  )
}
