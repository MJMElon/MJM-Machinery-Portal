import { useEffect, useState } from 'react'
import { Button, Card } from '../ui.jsx'
import { IconChevron } from '../icons.jsx'
import { useAuth } from '../../auth/AuthContext.jsx'
import { useWindows } from '../Windows.jsx'
import { DieselClaimsIcon, FleetCardIcon } from '../AppIcons.jsx'
import { listClaims, listTopups, myFuelTasks } from '../../lib/diesel.js'

// Fuel Manage main page → one row under the dashboard with the signed-in
// person's pending tasks, most important first; < > steps through them and
// the button opens the page where the task is done (in its window).
// To add a reminder: push one more { key, rank, text, button, open } below.
// Lower rank = shown first.
const REVIEW = { key: 'diesel-claims-review', label: 'Claims Approval', Icon: DieselClaimsIcon }
const CLAIMS = { key: 'diesel-claims', label: 'Fuel Claims', Icon: DieselClaimsIcon }

export function TaskBar({ company, access }) {
  const { user, isSuperAdmin } = useAuth()
  const { open } = useWindows()
  const [tasks, setTasks] = useState(null)
  const [i, setI] = useState(0)

  useEffect(() => {
    if (!user) return
    let live = true
    const approver = isSuperAdmin || access.admin
    const accountant = isSuperAdmin || access.pay
    const topupRole = isSuperAdmin || access.topupApprover || access.can('topup', 'process')
    Promise.all([
      approver || accountant ? listClaims(company.id).catch(() => []) : [],
      listClaims(company.id, { mine: user.id }).catch(() => []),
      topupRole ? listTopups(company.id).catch(() => null) : null,
      myFuelTasks(company.id)
    ]).then(([all, mine, topups, db]) => {
      if (!live) return
      const t = []
      const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`
      const notMine = (id) => id !== user.id
      const topupApprove = (topups || []).filter((r) => r.status === 'pending' && notMine(r.requested_by) && access.approvesTopup?.(r.requested_by)).length
      if (topupApprove)
        t.push({ key: 'topup-approve', rank: 1, tone: 'amber', text: `${plural(topupApprove, 'top up request', 'top up requests')} waiting for your approval`, button: 'Approve', open: { ...REVIEW, path: '/diesel/claims/review?tab=topup' } })
      const topupDo = access.can('topup', 'process') ? (topups || []).filter((r) => r.status === 'approved').length : 0
      if (topupDo)
        t.push({ key: 'topup-do', rank: 2, tone: 'blue', text: `${plural(topupDo, 'approved top up', 'approved top ups')} to top up`, button: 'Top up', open: { ...REVIEW, path: '/diesel/claims/review?tab=topup' } })
      const claimApprove = approver ? all.filter((c) => c.status === 'pending' && notMine(c.claimant_id) && access.approves(c.claimant_id)).length : 0
      if (claimApprove)
        t.push({ key: 'claim-approve', rank: 3, tone: 'amber', text: `${plural(claimApprove, 'fuel claim', 'fuel claims')} waiting for your approval`, button: 'Approve', open: { ...REVIEW, path: '/diesel/claims/review?tab=pending' } })
      const claimPay = accountant ? all.filter((c) => c.status === 'approved' && (notMine(c.claimant_id) || isSuperAdmin)).length : 0
      if (claimPay)
        t.push({ key: 'claim-pay', rank: 4, tone: 'green', text: `${plural(claimPay, 'approved claim', 'approved claims')} to pay`, button: 'Pay', open: { ...REVIEW, path: '/diesel/claims/review?tab=topay' } })
      const unclaimed = Number(db.unclaimed_fills || 0)
      if (unclaimed)
        t.push({ key: 'unclaimed', rank: 5, tone: 'blue', text: `${plural(unclaimed, 'fleet card fill-up', 'fleet card fill-ups')} not claimed yet`, button: 'New claim', open: { ...CLAIMS, path: '/diesel/claims/new' } })
      const drafts = mine.filter((c) => c.status === 'draft').length
      if (drafts)
        t.push({ key: 'drafts', rank: 6, tone: 'slate', text: `${plural(drafts, 'draft claim', 'draft claims')} not submitted yet`, button: 'Open', open: { ...CLAIMS, path: '/diesel/claims' } })
      setTasks(t.sort((a, b) => a.rank - b.rank))
      setI(0)
    })
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company.id, user?.id, isSuperAdmin, access.loaded])

  if (!tasks || tasks.length === 0) return null
  const task = tasks[Math.min(i, tasks.length - 1)]
  const dot = { amber: 'bg-amber-500', blue: 'bg-sky-500', green: 'bg-emerald-500', slate: 'bg-slate-400' }[task.tone]
  const step = (d) => setI((x) => (x + d + tasks.length) % tasks.length)

  return (
    <Card className="mx-auto mb-3 flex max-w-3xl items-center gap-3 px-4 py-2.5">
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${dot}`} aria-hidden="true" />
      <p className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800" title={task.text}>
        {task.text}
      </p>
      <Button size="sm" onClick={() => open(task.open)}>
        {task.button}
      </Button>
      {tasks.length > 1 && (
        <div className="flex shrink-0 items-center gap-0.5">
          <button type="button" onClick={() => step(-1)} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100" aria-label="Previous task">
            <IconChevron width={18} height={18} className="rotate-180" />
          </button>
          <span className="w-9 text-center text-xs font-semibold tabular-nums text-slate-500">
            {Math.min(i, tasks.length - 1) + 1}/{tasks.length}
          </span>
          <button type="button" onClick={() => step(1)} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100" aria-label="Next task">
            <IconChevron width={18} height={18} />
          </button>
        </div>
      )}
    </Card>
  )
}
