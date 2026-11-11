import { supabase, ADMIN_TABLE } from './supabase.js'
import { usePerms } from './perms.js'

// CMMS 2 lists (machinery profile, suppliers) and user access.

const MACHINES = 'machinery_machines'
const SUPPLIERS = 'machinery_suppliers'
const MEMBERS = 'machinery_cmms_members'

export const PERMISSIONS = [
  { key: 'can_solve', label: 'Solve', hint: 'Mark cases solved / reopen' },
  { key: 'can_edit', label: 'Edit', hint: 'Edit machine, problem, supplier, sent-out date' },
  { key: 'can_delete', label: 'Delete', hint: 'Delete cases' },
  { key: 'can_manage', label: 'Manage lists', hint: 'Machinery profile and supplier list' }
]

// ---- machinery profile -------------------------------------------------------

export async function listMachines(companyId) {
  const { data, error } = await supabase.from(MACHINES).select('*').eq('company_id', companyId).order('name')
  if (error) throw friendly(error)
  return data || []
}
export async function getMachine(id) {
  const { data, error } = await supabase.from(MACHINES).select('*').eq('id', id).maybeSingle()
  if (error) throw friendly(error)
  return data
}
/** Saves and returns the row's id (new rows get one). */
export async function saveMachine(companyId, { id, ...fields }) {
  const q = id
    ? supabase.from(MACHINES).update(fields).eq('id', id).select('id').single()
    : supabase.from(MACHINES).insert({ company_id: companyId, ...fields }).select('id').single()
  const { data, error } = await q
  if (error) throw friendly(error)
  return data?.id || id
}

export const MACHINE_TYPES = ['Light vehicle', 'Pickup', 'Lorry', 'Van', 'Bus', 'Excavator', 'Bulldozer', 'Wheel loader', 'Backhoe', 'Tractor', 'Forklift', 'Crane', 'Generator', 'Compressor', 'Other']
export const SERVICE_UNITS = [
  ['Liter/Km', 'Liter / Km'],
  ['Liter/Hour', 'Liter / Hour']
]

// ---- machine files (photos, reg card, director's resolution) ----------------
const MACHINE_BUCKET = 'machinery_machine_files'
export const isPdf = (path) => /\.pdf$/i.test(path || '')

async function shrinkImage(file, max = 1600) {
  if (!file.type.startsWith('image/')) return file
  try {
    const bmp = await createImageBitmap(file)
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bmp.width * scale)
    canvas.height = Math.round(bmp.height * scale)
    canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.85))
    return blob ? new File([blob], 'photo.jpg', { type: 'image/jpeg' }) : file
  } catch {
    return file
  }
}

/** Uploads a photo / PDF for a machine of the company; returns the storage path. */
export async function uploadMachineFile(companyId, file, { image = false } = {}) {
  if (image && !file.type.startsWith('image/')) throw new Error('Please choose a photo (JPG or PNG).')
  if (!file.type.startsWith('image/') && file.type !== 'application/pdf') throw new Error('Please choose a photo or a PDF.')
  const upload = await shrinkImage(file)
  if (upload.size > 10 * 1024 * 1024) throw new Error('The file is too big (max 10 MB).')
  const ext = upload.type === 'application/pdf' ? 'pdf' : upload.type === 'image/png' ? 'png' : upload.type === 'image/webp' ? 'webp' : 'jpg'
  const path = `${companyId}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from(MACHINE_BUCKET).upload(path, upload, { contentType: upload.type })
  if (error) throw new Error(error.message?.includes('row-level security') ? 'You may not upload files for this company.' : 'Could not upload the file. Please try again.')
  return path
}
export async function machineFileUrl(path, seconds = 600) {
  if (!path) return null
  const { data, error } = await supabase.storage.from(MACHINE_BUCKET).createSignedUrl(path, seconds)
  if (error || !data) return null
  return data.signedUrl
}
export async function openMachineFile(path) {
  const url = await machineFileUrl(path, 60)
  if (!url) throw new Error('Could not open the file.')
  window.open(url, '_blank', 'noopener')
}
export function removeMachineFile(path) {
  if (path) supabase.storage.from(MACHINE_BUCKET).remove([path]).catch(() => {})
}

/** Expiry state of a dated cover (insurance, road tax, Puspakom): 'expired' | 'soon' | 'ok' | null. */
export function coverState(to, soonDays = 30) {
  if (!to) return null
  const d = Math.round((new Date(to) - new Date(new Date().toDateString())) / 86400000)
  return d < 0 ? 'expired' : d <= soonDays ? 'soon' : 'ok'
}
export async function deleteMachine(id) {
  try {
    await remove(MACHINES, id)
  } catch (e) {
    if (e?.code === '23503') throw new Error('This machine / vehicle has diesel claims or card records, so it cannot be deleted. Set it to Inactive instead.')
    throw e
  }
}

// ---- suppliers / workshops ---------------------------------------------------

export async function listSuppliers(companyId) {
  const { data, error } = await supabase.from(SUPPLIERS).select('*').eq('company_id', companyId).order('name')
  if (error) throw friendly(error)
  return data || []
}
export const saveSupplier = (companyId, s) => save(SUPPLIERS, companyId, s)
export const deleteSupplier = (id) => remove(SUPPLIERS, id)

async function save(table, companyId, { id, ...fields }) {
  const q = id
    ? supabase.from(table).update(fields).eq('id', id)
    : supabase.from(table).insert({ company_id: companyId, ...fields })
  const { error } = await q
  if (error) throw friendly(error)
}

async function remove(table, id) {
  const { error } = await supabase.from(table).delete().eq('id', id)
  if (error) throw friendly(error)
}

// ---- cases (all changes go through access-checked RPCs) ----------------------

export async function updateCaseDetails(id, { machine_id, machine_name, problem, supplier_id, sent_at }) {
  const { error } = await supabase.rpc('machinery_update_case', {
    p_id: id,
    p_machine_id: machine_id || null,
    p_machine_name: machine_name || null,
    p_problem: problem || null,
    p_supplier_id: supplier_id || null,
    p_sent_at: sent_at || null
  })
  if (error) throw friendly(error)
}

export async function deleteCase(id) {
  const { error } = await supabase.rpc('machinery_delete_case', { p_id: id })
  if (error) throw friendly(error)
}

// ---- case workflow: pins, timeline, notes, send to supplier, close ------------

export async function setCasePinned(id, pinned) {
  const { error } = await supabase.rpc('machinery_set_case_pinned', { p_id: id, p_pinned: pinned })
  if (error) throw friendly(error)
}

export async function listCaseActions(caseId) {
  const { data, error } = await supabase
    .from('machinery_case_actions')
    .select('*')
    .eq('case_id', caseId)
    .order('created_at')
  if (error) throw friendly(error)
  return data || []
}

export async function addCaseNote(caseId, body) {
  const { error } = await supabase.rpc('machinery_add_case_note', { p_case: caseId, p_body: body })
  if (error) throw friendly(error)
}

/** Close (solved = true) or reopen a case, with an optional remark; logged on the timeline. */
export async function closeCase(id, solved, remark) {
  const { error } = await supabase.rpc('machinery_close_case', { p_id: id, p_solved: solved, p_remark: remark || null })
  if (error) throw friendly(error)
}

/** Official WhatsApp message from the company number to the supplier (Edge Function). */
export async function sendToSupplier({ caseId, supplierId, message }) {
  const { data, error } = await supabase.functions.invoke('case-action', {
    body: { case_id: caseId, supplier_id: supplierId, message }
  })
  if (error) {
    let msg = error.message
    try {
      const body = await error.context?.json?.()
      if (body?.error) msg = body.error
    } catch {
      // keep the generic message
    }
    if (/Failed to send a request|FunctionsFetchError|Function not found|404/i.test(msg)) {
      msg = 'The case-action function is not deployed yet (GitHub → Actions → Deploy WhatsApp webhook).'
    }
    throw new Error(msg)
  }
  return data
}

// ---- users and access --------------------------------------------------------

export async function listPortalUsers() {
  const { data, error } = await supabase.from(ADMIN_TABLE).select('*').order('email')
  if (error) throw friendly(error)
  return data || []
}

export async function addPortalUser(email) {
  const { error } = await supabase.rpc('machinery_add_portal_user', { p_email: email })
  if (error) throw friendly(error)
}

/** Display name shown in Diesel Manage lists / reports (super admin, or your own). */
export async function setUserName(userId, name) {
  const { error } = await supabase.rpc('machinery_set_user_name', { p_user: userId, p_name: name })
  if (error) throw friendly(error)
}

/** Portal users (name + e-mail) for drop-downs; any portal user may call it. */
export async function listPortalPeople() {
  const { data, error } = await supabase.rpc('machinery_portal_people')
  if (error) {
    if (['PGRST202', '42883'].includes(error.code)) return [] // before the vehicles migration
    throw friendly(error)
  }
  return data || []
}

/** Name to show for a portal user: full name, else the e-mail. */
export const userLabel = (u) => (u ? u.full_name || u.email || u.user_id : '—')

export async function removePortalUser(userId) {
  const { error } = await supabase.rpc('machinery_remove_portal_user', { p_user: userId })
  if (error) throw friendly(error)
}

export async function listMembers(companyId) {
  const { data, error } = await supabase.from(MEMBERS).select('*').eq('company_id', companyId)
  if (error) throw friendly(error)
  return data || []
}

export async function setMember(companyId, userId, perms) {
  const { error } = await supabase
    .from(MEMBERS)
    .upsert({ company_id: companyId, user_id: userId, ...perms }, { onConflict: 'company_id,user_id' })
  if (error) throw friendly(error)
}

/** What the signed-in user may do in Machinery Manage for a company (from the permission matrix). */
export function useCmmsAccess(companyId) {
  const p = usePerms(companyId)
  return {
    loaded: p.loaded,
    can: p.can,
    can_solve: p.can('work', 'solve'),
    can_edit: p.can('work', 'edit'),
    can_send: p.can('work', 'send'),
    can_delete: p.can('work', 'delete'),
    // machines / suppliers pages: one "may change" flag each
    can_manage: p.can('machines', 'edit') || p.can('suppliers', 'edit'),
    can_machines: p.can('machines', 'edit') || p.can('machines', 'add'),
    can_suppliers: p.can('suppliers', 'edit') || p.can('suppliers', 'add')
  }
}

function friendly(error) {
  if (error?.code === '23505') return new Error('That name is already used.')
  if (error?.code === '42501' || error?.code === '22023')
    return new Error(error.message || 'You do not have access to do this.')
  if (['42P01', 'PGRST205', '42703', 'PGRST204', 'PGRST202', '42883'].includes(error?.code)) {
    return new Error(
      'Database not up to date. Run the latest SQL migrations (…cmms_setup.sql, …case_workflow.sql, …businesses.sql) in Supabase.'
    )
  }
  return error
}
