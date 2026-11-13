import { supabase, CASE_TABLE } from './supabase.js'

// A maintenance case groups the WhatsApp texts and photos about one breakdown.
// Cases are created by the webhook; the portal edits machine/problem and status.

const MESSAGE_COLUMNS =
  'id, wa_message_id, wa_from, sender_name, message_type, received_at, caption, storage_path, status, ack_status, ack_error, error_details'
// '*' keeps older databases working (columns added by later migrations are optional).
const CASE_COLUMNS = `*, messages:machinery_whatsapp_messages(${MESSAGE_COLUMNS})`

export const caseNo = (c) => `#${c.case_no}`

// ---- case types (worker app + WhatsApp) -----------------------------------------
export const CASE_TYPES = {
  repair_request: { label: 'Repair request', color: 'red' },
  repair_done: { label: 'Repair done', color: 'amber' },
  service_request: { label: 'Service request', color: 'blue' }
}
export const caseType = (c) => (CASE_TYPES[c.case_type] ? c.case_type : 'repair_request')
/** Company id of a case made in the mobile app ('app:<company id>'), else null. */
export const appCompanyId = (waFrom) => (String(waFrom || '').startsWith('app:') ? String(waFrom).slice(4) : null)
export const fromApp = (c) => c.source === 'app' || Boolean(appCompanyId(c.wa_from))

// The choices on the worker's forms.
export const PROBLEMS = ["Won't start", 'Leaking', 'Noise', 'Overheat', 'Tyre / track', 'Electrical', 'Others']
export const PARTS = ['Tyre', 'Battery', 'Hydraulic hose', 'Engine', 'Brake', 'Electrical', 'Others']
export const ACTIONS_DONE = ['Changed', 'Repaired', 'Adjusted']

/** Meter unit of a machine (Machinery Profile → Service unit): 'hr' for Liter / Hour, else 'km'. */
export const smuUnit = (machine) => (/hour/i.test(machine?.service_unit || '') ? 'hr' : 'km')
/** A service may be asked this much before it is due, and is late this much after: 50 hr or 500 km. */
export const serviceWindow = (unit) => (unit === 'km' ? 500 : 50)

/**
 * Where a meter reading stands against a machine's next service.
 * Returns null when the machine has no service schedule, else
 * { due, from, to, unit, interval, state: 'early' | 'ok' | 'late', gap } — gap = units
 * before (negative) or after (positive) the due reading.
 */
export function serviceCheck(machine, smu) {
  const interval = Number(machine?.service_interval)
  const last = machine?.last_service_smu
  if (!interval || last == null || last === '') return null
  const unit = smuUnit(machine)
  const w = serviceWindow(unit)
  const due = Number(last) + interval
  const from = due - w
  const to = due + w
  if (smu == null || smu === '' || Number.isNaN(Number(smu))) return { due, from, to, unit, interval, state: null, gap: null }
  const gap = Number(smu) - due
  return { due, from, to, unit, interval, state: Number(smu) < from ? 'early' : Number(smu) > to ? 'late' : 'ok', gap }
}

/** How far a service request was from its due reading when sent: { gap, late, unit } or null. */
export function serviceGap(c, machine) {
  if (c.case_type !== 'service_request' || c.smu == null || c.service_due == null) return null
  const unit = smuUnit(machine)
  const gap = Number(c.smu) - Number(c.service_due)
  return { gap, unit, late: gap > serviceWindow(unit) }
}

const daysSince = (iso) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000))

/**
 * What the office sees for a case: { label, color, action } where action is the
 * next step: 'approve' | 'send' | 'solve' | 'cost' | null.
 */
export function caseStage(c, machine) {
  if (c.status === 'solved') return { label: 'Done', color: 'slate', action: null }
  const t = caseType(c)
  if (t === 'service_request') {
    if (!c.approved_at) {
      return serviceGap(c, machine)?.late
        ? { label: 'Late · check', color: 'red', action: 'approve', waiting: true }
        : { label: 'Waiting approval', color: 'amber', action: 'approve', waiting: true }
    }
    return { label: c.sent_at ? 'Sent to supplier' : 'Approved', color: 'green', action: 'solve' }
  }
  if (t === 'repair_done') {
    return c.fixed_on || !c.machine_stopped
      ? { label: 'Needs cost', color: 'slate', action: 'cost', waiting: true }
      : { label: 'Open · not fixed', color: 'amber', action: 'cost' }
  }
  if (c.sent_at) return { label: 'At workshop', color: 'amber', action: 'solve' }
  const d = daysSince(c.opened_at)
  return { label: d ? `Pending · ${d} day${d === 1 ? '' : 's'}` : 'Pending', color: 'amber', action: 'send', waiting: true }
}

/** Is the machine of this pending case standing still (breakdown)? */
export const isStopped = (c) => c.status === 'pending' && Boolean(c.machine_stopped) && !c.fixed_on

/** One line for the Problem / Job column. */
export function caseSummary(c, machine) {
  const t = caseType(c)
  const unit = smuUnit(machine)
  const n = (v) => Number(v).toLocaleString('en-MY', { maximumFractionDigits: 1 })
  if (t === 'service_request') {
    const bits = [c.service_interval ? `${n(c.service_interval)} ${unit} service` : 'Service']
    if (c.smu != null) bits.push(`SMU ${n(c.smu)}`)
    return bits.join(' · ')
  }
  if (t === 'repair_done') {
    const parts = (c.parts || []).filter((p) => p?.name).map((p) => `${p.name} ×${p.qty || 1}`)
    const bits = [[c.category, c.action_done?.toLowerCase()].filter(Boolean).join(' ') || null, c.problem, parts.join(', ') || null]
    if (c.smu != null) bits.push(`SMU ${n(c.smu)}`)
    return bits.filter(Boolean).join(' · ') || 'Repair'
  }
  return [c.category, c.problem].filter(Boolean).join(' · ')
}

/** status: pending | solved */
export async function listCases({ status = 'pending', limit = 300 } = {}) {
  const { data, error } = await supabase
    .from(CASE_TABLE)
    .select(CASE_COLUMNS)
    .eq('status', status)
    .order(status === 'solved' ? 'solved_at' : 'opened_at', { ascending: false })
    .limit(limit)
  if (error) throw friendly(error)
  return (data || []).map(withSortedMessages)
}

export async function getCase(id) {
  const { data, error } = await supabase.from(CASE_TABLE).select(CASE_COLUMNS).eq('id', id).maybeSingle()
  if (error) throw friendly(error)
  return data ? withSortedMessages(data) : null
}

/** Status goes through an RPC so "solved by" is always the real caller. */
export async function setCaseSolved(id, solved) {
  const { error } = await supabase.rpc('machinery_set_case_solved', { p_id: id, p_solved: solved })
  if (error) throw friendly(error)
}

export const casePhotos = (c) => (c.messages || []).filter((m) => m.message_type === 'image' && m.storage_path)

function withSortedMessages(c) {
  return { ...c, messages: [...(c.messages || [])].sort((a, b) => a.received_at.localeCompare(b.received_at)) }
}

function friendly(error) {
  if (error?.code === '42P01' || error?.code === 'PGRST205' || /machinery_cases/.test(error?.message || '')) {
    return new Error('Cases table missing. Run the cases SQL migration (20261003120000_cases.sql) in Supabase.')
  }
  return error
}
