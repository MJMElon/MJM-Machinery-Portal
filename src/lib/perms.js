import { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase.js'
import { useAuth } from '../auth/AuthContext.jsx'

// One permission matrix per user and company (table machinery_user_perms,
// column perms = {"section": ["action", …]}). Super admins can do everything.
// This file is the single description of modules → sections → actions; the
// database checks the same keys with machinery_can(company, section, action).

export const PERMS_TABLE = 'machinery_user_perms'

export const ACTION_LABELS = {
  view: 'View',
  add: 'Add',
  edit: 'Edit',
  delete: 'Delete',
  solve: 'Solve / close case',
  send: 'Send to supplier',
  view_all: 'See all users’ claims',
  approve: 'Approve / reject',
  pay: 'Mark paid'
}

export const MODULES = [
  {
    key: 'machinery',
    label: 'Machinery Manage',
    sections: [
      {
        key: 'work',
        label: 'Maintenance Work Manage',
        actions: ['view', 'add', 'edit', 'delete'],
        special: ['solve', 'send'],
        hint: 'Cases from the mobile app and WhatsApp: pending / solved, supplier, notes. Add = send requests from the mobile app'
      },
      { key: 'machines', label: 'Machinery Profile', actions: ['view', 'add', 'edit', 'delete'], special: [] },
      { key: 'suppliers', label: 'Supplier Workshop List', actions: ['view', 'add', 'edit', 'delete'], special: [] }
    ]
  },
  {
    key: 'fuel',
    label: 'Fuel Manage',
    sections: [
      {
        key: 'claims',
        label: 'Fuel Receipt Claims',
        actions: ['view', 'add', 'edit', 'delete'],
        special: ['view_all', 'approve', 'pay'],
        hint: 'View / add / edit / delete apply to the person’s own claims'
      },
      { key: 'usage', label: 'Fuel Usage Reports', actions: ['view', 'add', 'delete'], special: [] },
      { key: 'fuel_record', label: 'Operational Diesel Records', actions: ['view', 'add', 'edit', 'delete'], special: [], hint: 'Fuel issued to machines from the company tank' },
      { key: 'cards', label: 'Fleet Card Manage', actions: ['view', 'add', 'edit', 'delete'], special: [] },
      { key: 'report', label: 'Report', actions: ['view'], special: [] }
    ]
  }
]

// Role setup screen: module → pages → options. Each option ticks a set of
// actions in the matrix; "approvers" marks the option that carries the list
// of people whose claims this user approves (perms.approve_for).
export const ROLE_MODEL = [
  {
    key: 'machinery',
    label: 'Machinery Manage',
    sections: ['work', 'machines', 'suppliers'],
    pages: [
      {
        section: 'work',
        label: 'Maintenance Work Manage',
        options: [
          { key: 'view', label: 'View page', actions: ['view'] },
          { key: 'add', label: 'Send requests from the mobile app (site workers)', actions: ['add'] },
          { key: 'edit', label: 'Edit cases, approve and send to supplier', actions: ['edit', 'send'] },
          { key: 'solve', label: 'Solve / close cases', actions: ['solve'] },
          { key: 'delete', label: 'Delete cases', actions: ['delete'] }
        ]
      },
      {
        section: 'machines',
        label: 'Machinery Profile',
        options: [
          { key: 'view', label: 'View page', actions: ['view'] },
          { key: 'manage', label: 'Add / edit / delete machines & vehicles', actions: ['add', 'edit', 'delete'] }
        ]
      },
      {
        section: 'suppliers',
        label: 'Supplier Workshop List',
        options: [
          { key: 'view', label: 'View page', actions: ['view'] },
          { key: 'manage', label: 'Add / edit / delete suppliers', actions: ['add', 'edit', 'delete'] }
        ]
      }
    ]
  },
  {
    key: 'fuel',
    label: 'Fuel Manage',
    sections: ['claims', 'usage', 'cards', 'report', 'fuel_record'],
    pages: [
      {
        section: 'claims',
        label: 'Fuel Receipt Claims',
        options: [
          { key: 'own', label: 'View own claims record (submit, edit, delete own claims)', actions: ['view', 'add', 'edit', 'delete'] },
          { key: 'all', label: 'View all users’ claims in this company', actions: ['view_all'] },
          { key: 'approve', label: 'Approve claims', actions: ['approve'], approvers: true },
          { key: 'pay', label: 'Accountant: mark approved claims paid', actions: ['pay'] }
        ]
      },
      {
        section: 'cards',
        label: 'Fleet Card Manage',
        options: [
          { key: 'view', label: 'View page', actions: ['view'] },
          { key: 'manage', label: 'Add / edit cards and reloads', actions: ['add', 'edit', 'delete'] }
        ]
      },
      {
        section: 'usage',
        label: 'Fuel Usage Reports',
        options: [
          { key: 'view', label: 'View page', actions: ['view'] },
          { key: 'manage', label: 'Record / delete card fill-ups', actions: ['add', 'delete'] }
        ]
      },
      {
        section: 'fuel_record',
        label: 'Operational Diesel Records',
        options: [
          { key: 'view', label: 'View page', actions: ['view'] },
          { key: 'add', label: 'Add records', actions: ['add'] },
          { key: 'edit', label: 'Edit records', actions: ['edit'] },
          { key: 'delete', label: 'Delete records', actions: ['delete'] }
        ]
      },
      { section: 'report', label: 'Report (old)', options: [{ key: 'view', label: 'View Fuel Usage Reports', actions: ['view'] }] }
    ]
  }
]

export const approveFor = (perms) => (Array.isArray(perms?.approve_for) ? perms.approve_for : [])
// Fleet card top-up requests: perms.topup = ['approve'] and perms.topup_approve_for = [user ids] (none = everyone)
export const topupApproveFor = (perms) => (Array.isArray(perms?.topup_approve_for) ? perms.topup_approve_for : [])
/** May the signed-in user approve / reject top-up requests of this person? */
export const canApproveTopup = (perms, isSuper, requesterId) => {
  if (isSuper) return true
  if (!has(perms, 'topup', 'approve')) return false
  const list = topupApproveFor(perms)
  return list.length === 0 || list.includes(requesterId)
}

/** May the signed-in user approve / reject claims of this claimant? (approver named for them, or approve-all) */
export const canApproveClaimant = (perms, isSuper, claimantId) => {
  if (isSuper) return true
  if (!has(perms, 'claims', 'approve')) return false
  const list = approveFor(perms)
  return list.length === 0 || list.includes(claimantId)
}

/** May the signed-in user open this claimant's claims for review? Approver of that person, or accountant. */
export const canReviewClaimant = (perms, isSuper, claimantId) =>
  canApproveClaimant(perms, isSuper, claimantId) || has(perms, 'claims', 'pay')

// Approval setting: a person's role in Fuel Manage (one per person).
//   Normal user     own claims only
//   Accountant      sees every user's submitted claims, marks approved claims paid
//   Claim approver  can be named as approver (claims, top-up requests); approves
//                   the people who name them (perms.approve_for / topup_approve_for)
//   Procurement     sees every fleet card top-up request, marks them topped up
// The role is kept in perms.fuel_role = [role]; people saved before that get
// it from their rights (pay → accountant, topup process → procurement,
// approve → claim approver).
export const FUEL_ROLES = [
  ['user', 'Normal user', 'Own claims'],
  ['accountant', 'Accountant', "See all users' submitted claims · mark approved claims paid"],
  ['approver', 'Claim approver', 'Approves the claims and top-up requests of the people who name them'],
  ['procurement', 'Procurement', 'Sees all fleet card top-up requests · marks them topped up']
]
export function fuelRole(perms) {
  const marked = Array.isArray(perms?.fuel_role) ? perms.fuel_role[0] : null
  if (FUEL_ROLES.some(([k]) => k === marked)) return marked
  if (has(perms, 'claims', 'pay')) return 'accountant'
  if (has(perms, 'topup', 'process')) return 'procurement'
  if (has(perms, 'claims', 'approve') || has(perms, 'topup', 'approve')) return 'approver'
  return 'user'
}
/** perms with the role applied. Leaving Claim approver also ends being anyone's approver. */
export function withFuelRole(perms, role) {
  const claims = new Set(perms?.claims || [])
  const topup = new Set(perms?.topup || [])
  for (const a of ['view', 'add', 'edit', 'delete']) claims.add(a)
  for (const a of ['view_all', 'pay']) claims.delete(a)
  topup.delete('process')
  const next = { ...perms, fuel_role: [role] }
  if (role !== 'approver') {
    claims.delete('approve')
    topup.delete('approve')
    delete next.approve_for
    delete next.topup_approve_for
  }
  if (role === 'accountant') {
    claims.add('view_all')
    claims.add('pay')
  }
  if (role === 'procurement') {
    topup.add('process')
    next.cards = [...new Set([...(perms?.cards || []), 'view'])]
  }
  next.claims = [...claims]
  next.topup = [...topup]
  if (!next.topup.length) delete next.topup
  return next
}

export const FUEL_SECTIONS = ['claims', 'usage', 'cards', 'report', 'fuel_record', 'topup']
export const MACHINERY_SECTIONS = ['work', 'machines', 'suppliers']

export const has = (perms, section, action) => Array.isArray(perms?.[section]) && perms[section].includes(action)
export const hasAny = (perms, sections) => sections.some((s) => (perms?.[s] || []).length > 0)

/** Short summary of a perms object: "Machinery Manage: 2 sections · Fuel Manage: 1 section" */
export function summarize(perms) {
  return MODULES.map((m) => {
    const n = m.sections.filter((s) => (perms?.[s.key] || []).length > 0).length
    return n ? `${m.label}: ${n} section${n === 1 ? '' : 's'}` : null
  })
    .filter(Boolean)
    .join(' · ')
}

// ---- data --------------------------------------------------------------------

export async function listCompanyPerms(companyId) {
  const { data, error } = await supabase.from(PERMS_TABLE).select('user_id, perms, updated_at').eq('company_id', companyId)
  if (error) throw friendly(error)
  return data || []
}

export async function getUserPerms(companyId, userId) {
  const { data, error } = await supabase
    .from(PERMS_TABLE)
    .select('perms')
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw friendly(error)
  return data?.perms || {}
}

/**
 * Save a person's access. Super admins write the whole row; a module admin
 * passes { modules: ['fuel'] } and only those modules' parts change
 * (database function machinery_save_module_perms).
 */
export async function savePerms(companyId, userId, perms, { modules } = {}) {
  const clean = Object.fromEntries(Object.entries(perms).filter(([k, v]) => Array.isArray(v) && (v.length || k === 'approve_for')))
  if (!has(clean, 'claims', 'approve')) delete clean.approve_for
  if (!has(clean, 'topup', 'approve')) delete clean.topup_approve_for
  if (modules) {
    for (const m of modules) {
      const { error } = await supabase.rpc('machinery_save_module_perms', { p_company: companyId, p_user: userId, p_module: m, p_perms: clean })
      if (error) throw friendly(error)
    }
    return
  }
  const { error } = await supabase
    .from(PERMS_TABLE)
    .upsert({ company_id: companyId, user_id: userId, perms: clean }, { onConflict: 'company_id,user_id' })
  if (error) throw friendly(error)
}

// Module admins: perms.admin = ['machinery', 'fuel']
export const MODULE_ADMIN_LABEL = { machinery: 'Machinery Manage admin', fuel: 'Fuel Manage admin' }
export const adminModules = (perms) => (Array.isArray(perms?.admin) ? perms.admin.filter((m) => MODULE_ADMIN_LABEL[m]) : [])

export async function removePerms(companyId, userId) {
  const { error } = await supabase.from(PERMS_TABLE).delete().eq('company_id', companyId).eq('user_id', userId)
  if (error) throw friendly(error)
}

/** The signed-in user's matrix for a company: { loaded, perms, can(section, action), any(sections) } */
export function usePerms(companyId) {
  const { user, isSuperAdmin } = useAuth()
  const [state, setState] = useState({ loaded: false, perms: {}, error: '' })
  useEffect(() => {
    if (!companyId || !user) return setState({ loaded: true, perms: {}, error: '' })
    if (isSuperAdmin) return setState({ loaded: true, perms: {}, error: '' })
    let active = true
    // Role setup + what the MJM Intranet icons give (machinery_my_perms); before
    // that migration, just the Role setup row.
    supabase
      .rpc('machinery_my_perms', { p_company: companyId })
      .then(({ data, error }) => {
        if (error && ['PGRST202', '42883'].includes(error.code))
          return supabase.from(PERMS_TABLE).select('perms').eq('company_id', companyId).eq('user_id', user.id).maybeSingle().then((r) => ({ data: r.data?.perms, error: r.error }))
        return { data, error }
      })
      .then(({ data, error }) => active && setState({ loaded: true, perms: data || {}, error: error ? friendly(error).message : '' }))
    return () => {
      active = false
    }
  }, [companyId, user, isSuperAdmin])
  return useMemo(
    () => ({
      ...state,
      super: isSuperAdmin,
      can: (section, action) => isSuperAdmin || has(state.perms, section, action),
      any: (sections) => isSuperAdmin || hasAny(state.perms, sections),
      reviewable: (claimantId) => canReviewClaimant(state.perms, isSuperAdmin, claimantId),
      approves: (claimantId) => canApproveClaimant(state.perms, isSuperAdmin, claimantId),
      // Admin of a module ('machinery' / 'fuel'): sets that module's user access
      adminOf: (module) => isSuperAdmin || adminModules(state.perms).includes(module),
      adminModules: isSuperAdmin ? Object.keys(MODULE_ADMIN_LABEL) : adminModules(state.perms),
      approveFor: approveFor(state.perms),
      approvesTopup: (requesterId) => canApproveTopup(state.perms, isSuperAdmin, requesterId)
    }),
    [state, isSuperAdmin]
  )
}

function friendly(error) {
  if (['PGRST202', '42883'].includes(error?.code) && /save_module_perms/.test(error?.message || ''))
    return new Error('Database not up to date. Run the module admins SQL (…module_admins.sql) in Supabase.')
  if (error?.code === '42501') return new Error(error.message || 'You do not have access to do this.')
  if (['42P01', 'PGRST205', '42703', 'PGRST204', 'PGRST202', '42883'].includes(error?.code)) {
    return new Error('Database not up to date. Run the permissions SQL migration (…permissions_matrix.sql) in Supabase.')
  }
  return error instanceof Error ? error : new Error(error?.message || 'Could not save.')
}
