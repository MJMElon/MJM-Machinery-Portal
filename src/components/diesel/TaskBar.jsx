import { useEffect, useState } from 'react'
import { IconBell, IconChevron } from '../icons.jsx'
import { useAuth } from '../../auth/AuthContext.jsx'
import { useWindows } from '../Windows.jsx'
import { DieselClaimsIcon } from '../AppIcons.jsx'
import { listClaims, listTopups, myFuelTasks } from '../../lib/diesel.js'

// Fuel Manage main page → one row under the dashboard with the signed-in
// person's pending tasks, most important first; < > steps through them and
// "Continue to the page" opens the page where the task is done (in its
// window). The bar is warm gold, apart from the white dashboard and the black
// buttons, with the tone of the task as a small dot by the bell. Shown:
// fuel claims waiting for my approval, and my fleet card fill-ups not claimed.
// To add a reminder: push one more { key, rank, tone, text, open } below.
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
    const topupApprover = isSuperAdmin || Boolean(access.topupApprover)
    // Only two reminders: claims / top-up requests waiting for my approval, and
    // my fleet card fill-ups (from the station statement) not put on a fuel claim yet.
    Promise.all([
      approver ? listClaims(company.id).catch(() => []) : [],
      myFuelTasks(company.id),
      topupApprover ? listTopups(company.id).catch(() => null) : null
    ]).then(([all, db, topups]) => {
      if (!live) return
      const t = []
      const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`
      const claimApprove = approver ? all.filter((c) => c.status === 'pending' && c.claimant_id !== user.id && access.approves(c.claimant_id)).length : 0
      const topupApprove = (topups || []).filter((r) => r.status === 'pending' && (r.requested_by !== user.id || isSuperAdmin) && (isSuperAdmin || access.approvesTopup?.(r.requested_by))).length
      const what = [claimApprove && plural(claimApprove, 'fuel claim', 'fuel claims'), topupApprove && plural(topupApprove, 'top-up request', 'top-up requests')].filter(Boolean)
      if (what.length)
        t.push({ key: 'claim-approve', rank: 1, tone: 'amber', text: `${what.join(' and ')} waiting for your approval`, open: { ...REVIEW, path: '/diesel/claims/review?tab=pending' } })
      const unclaimed = Number(db.unclaimed_fills || 0)
      if (unclaimed)
        t.push({ key: 'unclaimed', rank: 2, tone: 'blue', text: `${plural(unclaimed, 'fleet card fill-up', 'fleet card fill-ups')} in the Fuel Station Portal not claimed yet: submit a claim with the receipt`, open: { ...CLAIMS, path: '/diesel/claims/new' } })
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
    <div className="relative mx-auto mb-3 flex max-w-3xl items-center gap-3 overflow-hidden rounded-2xl border border-amber-200/80 bg-gradient-to-r from-amber-50 via-yellow-50 to-white py-2.5 pl-4 pr-3 shadow-sm">
      <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700 ring-1 ring-amber-200">
        <IconBell width={18} height={18} />
        <span className={`absolute right-0.5 top-0.5 h-2 w-2 rounded-full ring-2 ring-amber-50 ${dot}`} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-amber-700">Reminder</p>
        <p className="truncate text-sm font-semibold text-slate-800" title={task.text}>
          {task.text}
        </p>
      </div>
      <button type="button" onClick={() => open(task.open)} className="group inline-flex shrink-0 items-center gap-1 rounded-lg px-1.5 py-1 text-sm font-semibold leading-5 text-slate-800 hover:text-amber-800">
        <span className="hidden underline-offset-4 group-hover:underline sm:inline">Continue to the page</span>
        <span className="underline-offset-4 group-hover:underline sm:hidden">Continue</span>
        {/* the arrow sits on the middle of the small letters, as thick as the text */}
        <IconChevron width={14} height={14} strokeWidth={2.6} className="translate-y-[1.5px] transition-transform group-hover:translate-x-0.5" />
      </button>
      {tasks.length > 1 && (
        <div className="flex shrink-0 items-center gap-0.5">
          <button type="button" onClick={() => step(-1)} className="flex h-8 w-8 items-center justify-center rounded-lg text-amber-800/70 hover:bg-amber-100" aria-label="Previous task">
            <IconChevron width={18} height={18} className="rotate-180" />
          </button>
          <span className="w-9 text-center text-xs font-semibold tabular-nums text-amber-800/80">
            {Math.min(i, tasks.length - 1) + 1}/{tasks.length}
          </span>
          <button type="button" onClick={() => step(1)} className="flex h-8 w-8 items-center justify-center rounded-lg text-amber-800/70 hover:bg-amber-100" aria-label="Next task">
            <IconChevron width={18} height={18} />
          </button>
        </div>
      )}
    </div>
  )
}
