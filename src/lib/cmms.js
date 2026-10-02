import { useEffect, useState } from 'react'
import { supabase, ADMIN_TABLE } from './supabase.js'
import { useAuth } from '../auth/AuthContext.jsx'

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
const NONE = { can_solve: false, can_edit: false, can_delete: false, can_manage: false }
const ALL = { can_solve: true, can_edit: true, can_delete: true, can_manage: true }

// ---- machinery profile -------------------------------------------------------

export async function listMachines(companyId) {
  const { data, error } = await supabase.from(MACHINES).select('*').eq('company_id', companyId).order('name')
  if (error) throw friendly(error)
  return data || []
}
export const saveMachine = (companyId, m) => save(MACHINES, companyId, m)
export const deleteMachine = (id) => remove(MACHINES, id)

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

/** What the signed-in user may do in CMMS 2 for a company. */
export function useCmmsAccess(companyId) {
  const { user, isSuperAdmin } = useAuth()
  const [access, setAccess] = useState({ ...NONE, loaded: false })
  useEffect(() => {
    if (isSuperAdmin) return setAccess({ ...ALL, loaded: true })
    if (!companyId || !user) return setAccess({ ...NONE, loaded: true })
    let active = true
    supabase
      .from(MEMBERS)
      .select('can_solve, can_edit, can_delete, can_manage')
      .eq('company_id', companyId)
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => active && setAccess({ ...NONE, ...(data || {}), loaded: true }))
    return () => {
      active = false
    }
  }, [companyId, user, isSuperAdmin])
  return access
}

function friendly(error) {
  if (error?.code === '23505') return new Error('That name is already used.')
  if (error?.code === '42501') return new Error(error.message || 'You do not have access to do this.')
  if (['42P01', 'PGRST205', '42703', 'PGRST204', 'PGRST202', '42883'].includes(error?.code)) {
    return new Error(
      'Database not up to date. Run the latest SQL migration (20261005120000_cmms_setup.sql) in Supabase.'
    )
  }
  return error
}
