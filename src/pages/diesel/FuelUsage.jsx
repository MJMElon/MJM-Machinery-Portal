import { Link, Navigate, useOutletContext } from 'react-router-dom'
import { IconFuel, IconReceipt } from '../../components/icons.jsx'
import FuelRecords from './FuelRecords.jsx'
import DieselUsage from './DieselUsage.jsx'

// Fuel Usage: one module with two views, switched by the two buttons on top.
//   Diesel record (/diesel/records)  every fuel usage record, listed
//   Diesel report (/diesel/usage)    the Fuel Usage Report dashboard
// A person sees the view(s) they have rights for; the other button is greyed.
export default function FuelUsage({ view }) {
  const { access } = useOutletContext()
  const canRecord = access.can('fuel_record', 'view') || access.can('fuel_record', 'add')
  const canReport = access.can('usage', 'view') || access.can('report', 'view')
  if (view === 'record' && !canRecord && canReport) return <Navigate to="/diesel/usage" replace />
  if (view === 'report' && !canReport && canRecord) return <Navigate to="/diesel/records" replace />

  const tabs = [
    { key: 'record', to: '/diesel/records', label: 'Diesel record', Icon: IconReceipt, allowed: canRecord },
    { key: 'report', to: '/diesel/usage', label: 'Diesel report', Icon: IconFuel, allowed: canReport }
  ]
  return (
    <div>
      <div className="mb-4 inline-flex rounded-2xl border border-slate-200 bg-white p-1 shadow-sm print:hidden" role="tablist" aria-label="Fuel Usage view">
        {tabs.map(({ key, to, label, Icon, allowed }) => {
          const active = view === key
          const cls = `inline-flex h-11 items-center gap-2 rounded-xl px-5 text-sm font-bold transition ${
            active ? 'bg-brand text-white shadow' : allowed ? 'text-slate-600 hover:bg-slate-100 hover:text-slate-900' : 'cursor-not-allowed text-slate-300'
          }`
          return allowed && !active ? (
            <Link key={key} to={to} role="tab" aria-selected={false} className={cls}>
              <Icon width={18} height={18} /> {label}
            </Link>
          ) : (
            <span key={key} role="tab" aria-selected={active} aria-disabled={!allowed} title={allowed ? undefined : 'No access'} className={cls}>
              <Icon width={18} height={18} /> {label}
            </span>
          )
        })}
      </div>
      {view === 'record' ? <FuelRecords /> : <DieselUsage />}
    </div>
  )
}
