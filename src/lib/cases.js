import { supabase, CASE_TABLE } from './supabase.js'

// A maintenance case groups the WhatsApp texts and photos about one breakdown.
// Cases are created by the webhook; the portal edits machine/problem and status.

const MESSAGE_COLUMNS =
  'id, wa_message_id, wa_from, sender_name, message_type, received_at, caption, storage_path, status, ack_status, ack_error, error_details'
const CASE_COLUMNS = `id, case_no, wa_from, sender_name, machine_name, problem, status, opened_at, solved_at, solved_by_email, messages:machinery_whatsapp_messages(${MESSAGE_COLUMNS})`

export const caseNo = (c) => `#${c.case_no}`

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

export async function updateCase(id, patch) {
  const { error } = await supabase.from(CASE_TABLE).update(patch).eq('id', id)
  if (error) throw friendly(error)
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
