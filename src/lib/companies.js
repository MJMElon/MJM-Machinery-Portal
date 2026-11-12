import { supabase, BLOCK_TABLE, BUSINESS_COMPANY_TABLE, BUSINESS_TABLE, COMPANY_TABLE, LOCATION_TABLE } from './supabase.js'

// Businesses and companies follow the Intranet's master data: a Business
// (e.g. Plantation, Machinery) has companies under it, and a company can sit
// under more than one business. Companies carry the same code / short name /
// registration number as in MJM Intranet, so both systems name them alike.
// A WhatsApp message belongs to the company whose `whatsapp_numbers` list
// contains the sender's number.

// '*' so the list still loads before newer columns exist.
const COLUMNS = '*'

export const digitsOnly = (s) => String(s ?? '').replace(/\D/g, '')

/** "+60 12-345 6789, 6019…" → ["60123456789", "6019…"] (deduped, digits only) */
export function parseNumbers(text) {
  return [
    ...new Set(
      String(text ?? '')
        .split(/[,;\n]+/)
        .map(digitsOnly)
        .filter(Boolean)
    )
  ]
}

/** Company code as in the Intranet: capitals, digits, - or _ (2–20 chars). */
export const normalizeCode = (s) =>
  String(s ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '-')
export const isValidCode = (s) => !s || /^[A-Z0-9][A-Z0-9_-]{1,19}$/.test(s)

/** Short name if set, else the full name (for tight spaces). */
export const companyLabel = (c) => (c ? c.short_name || c.name : '')

// ---- companies ---------------------------------------------------------------

/** Companies with `business_ids` (from the link table; [] before that migration). */
export async function listCompanies() {
  const { data, error } = await supabase.from(COMPANY_TABLE).select(COLUMNS).order('name')
  if (error) throw error
  const links = await listBusinessLinks()
  return (data || []).map((c) => ({
    ...c,
    business_ids: links.filter((l) => l.company_id === c.id).map((l) => l.business_id)
  }))
}

export async function createCompany({ name, code, short_name, registration_no, business_ids = [] }) {
  const row = {
    name: name.trim(),
    code: normalizeCode(code) || null,
    short_name: (short_name || '').trim() || null,
    registration_no: (registration_no || '').trim() || null
  }
  // Older databases (before the businesses migration) only know `name`.
  let { data, error } = await supabase.from(COMPANY_TABLE).insert(row).select(COLUMNS).single()
  if (error && (error.code === '42703' || error.code === 'PGRST204')) {
    ;({ data, error } = await supabase.from(COMPANY_TABLE).insert({ name: row.name }).select(COLUMNS).single())
  }
  if (error) throw friendly(error)
  if (business_ids.length) await setCompanyBusinesses(data.id, business_ids)
  return { ...data, business_ids }
}

export async function updateCompany(id, patch) {
  const { data, error } = await supabase.from(COMPANY_TABLE).update(patch).eq('id', id).select(COLUMNS).single()
  if (error) throw friendly(error)
  return data
}

export async function deleteCompany(id) {
  const { error } = await supabase.from(COMPANY_TABLE).delete().eq('id', id)
  if (error) throw friendly(error)
}

/** Sender number → company, for grouping messages. */
export function companyByNumber(companies) {
  const map = new Map()
  for (const c of companies) for (const n of c.whatsapp_numbers || []) if (!map.has(n)) map.set(n, c)
  return (waFrom) => map.get(digitsOnly(waFrom)) || null
}

// ---- businesses ---------------------------------------------------------------

export async function listBusinesses() {
  const { data, error } = await supabase.from(BUSINESS_TABLE).select('*').order('sort_order').order('name')
  if (error) {
    if (missing(error)) return [] // before the businesses migration
    throw friendly(error)
  }
  return data || []
}

async function listBusinessLinks() {
  const { data, error } = await supabase.from(BUSINESS_COMPANY_TABLE).select('business_id, company_id')
  if (error) {
    if (missing(error)) return []
    throw friendly(error)
  }
  return data || []
}

export async function createBusiness({ name, description }) {
  const { data, error } = await supabase
    .from(BUSINESS_TABLE)
    .insert({ name: name.trim(), description: (description || '').trim() || null })
    .select('*')
    .single()
  if (error) throw friendly(error)
  return data
}

export async function updateBusiness(id, patch) {
  const { data, error } = await supabase.from(BUSINESS_TABLE).update(patch).eq('id', id).select('*').single()
  if (error) throw friendly(error)
  return data
}

export async function deleteBusiness(id) {
  const { error } = await supabase.from(BUSINESS_TABLE).delete().eq('id', id)
  if (error) throw friendly(error)
}

/** Replace the businesses a company belongs to. */
export async function setCompanyBusinesses(companyId, businessIds) {
  const { error: delError } = await supabase.from(BUSINESS_COMPANY_TABLE).delete().eq('company_id', companyId)
  if (delError) throw friendly(delError)
  if (!businessIds.length) return
  const { error } = await supabase
    .from(BUSINESS_COMPANY_TABLE)
    .insert(businessIds.map((business_id) => ({ business_id, company_id: companyId })))
  if (error) throw friendly(error)
}

/**
 * Companies grouped the way the Intranet shows them: one section per
 * business (in order), then "Other companies" for those under no business.
 * A company under two businesses appears under both.
 */
export function groupByBusiness(businesses, companies) {
  const groups = businesses
    .map((b) => ({ id: b.id, name: b.name, companies: companies.filter((c) => (c.business_ids || []).includes(b.id)) }))
    .filter((g) => g.companies.length)
  const other = companies.filter((c) => !(c.business_ids || []).length)
  if (other.length) groups.push({ id: 'other', name: businesses.length ? 'Other companies' : 'Companies', companies: other })
  return groups
}

// ---- sync from MJM Intranet ---------------------------------------------------

/** Pull businesses / companies from MJM Intranet (super admins; Edge Function sync-intranet). */
export async function syncFromIntranet() {
  const { data, error } = await supabase.functions.invoke('sync-intranet', { body: {} })
  if (error) {
    let msg = error.message
    try {
      const body = await error.context?.json?.()
      if (body?.detail || body?.error) msg = body.detail || body.error
    } catch {
      // keep
    }
    if (/Failed to send a request|FunctionsFetchError/i.test(msg)) msg = 'The sync-intranet function is not deployed yet (GitHub → Actions → Deploy WhatsApp webhook).'
    throw new Error(msg)
  }
  return data
}

export const fromIntranet = (row) => Boolean(row?.intranet_id)

// ---- blocks of a company ---------------------------------------------------

export async function listBlocks(companyId) {
  const { data, error } = await supabase
    .from(BLOCK_TABLE)
    .select('id, name, area_ha, notes')
    .eq('company_id', companyId)
    .order('name')
  if (error) throw friendly(error)
  return data || []
}

export async function createBlock(companyId, block) {
  const { error } = await supabase.from(BLOCK_TABLE).insert({ company_id: companyId, ...block })
  if (error) throw friendly(error)
}

export async function updateBlock(id, patch) {
  const { error } = await supabase.from(BLOCK_TABLE).update(patch).eq('id', id)
  if (error) throw friendly(error)
}

export async function deleteBlock(id) {
  const { error } = await supabase.from(BLOCK_TABLE).delete().eq('id', id)
  if (error) throw friendly(error)
}

// ---- locations of a company (plantations / estates / sites) -----------------
// Machines in Machinery Profile can be put under one of these.

/** Locations of a company, by name ([] before the locations migration). */
export async function listLocations(companyId) {
  const { data, error } = await supabase
    .from(LOCATION_TABLE)
    .select('id, name, notes')
    .eq('company_id', companyId)
    .order('name')
  if (error) {
    if (missing(error)) return []
    throw friendly(error)
  }
  return data || []
}

export async function createLocation(companyId, location) {
  const { error } = await supabase.from(LOCATION_TABLE).insert({ company_id: companyId, ...location })
  if (error) throw friendly(error)
}

export async function updateLocation(id, patch) {
  const { error } = await supabase.from(LOCATION_TABLE).update(patch).eq('id', id)
  if (error) throw friendly(error)
}

/** Machines of the location stay, without a location. */
export async function deleteLocation(id) {
  const { error } = await supabase.from(LOCATION_TABLE).delete().eq('id', id)
  if (error) throw friendly(error)
}

const missing = (error) => error?.code === '42P01' || error?.code === 'PGRST205'

function friendly(error) {
  if (error?.code === '23505') return new Error('That name or code is already used.')
  if (error?.code === '23514') return new Error('Company code: capital letters, numbers, - or _ (2–20 characters).')
  if (error?.code === '42501') return new Error(error.message || 'Not allowed.')
  if (error?.code === '42P01' || error?.code === 'PGRST205' || error?.code === '42703' || error?.code === 'PGRST204') {
    return new Error('Database not up to date. Run the latest SQL migrations in Supabase (see README).')
  }
  return error
}
