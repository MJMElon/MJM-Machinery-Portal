import { supabase, BLOCK_TABLE, COMPANY_TABLE } from './supabase.js'

// Companies are managed in Company Settings. A WhatsApp message belongs to the
// company whose `whatsapp_numbers` list contains the sender's number.

// '*' so the list still loads before newer columns (area_ha) exist.
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

export async function listCompanies() {
  const { data, error } = await supabase.from(COMPANY_TABLE).select(COLUMNS).order('name')
  if (error) throw error
  return data || []
}

export async function createCompany(name) {
  const { data, error } = await supabase.from(COMPANY_TABLE).insert({ name: name.trim() }).select(COLUMNS).single()
  if (error) throw friendly(error)
  return data
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

function friendly(error) {
  if (error?.code === '23505') return new Error('That name is already used.')
  if (error?.code === '42501') return new Error(error.message || 'Not allowed.')
  if (error?.code === '42P01' || error?.code === 'PGRST205' || error?.code === '42703' || error?.code === 'PGRST204') {
    return new Error('Database not up to date. Run the latest SQL migrations in Supabase (see README).')
  }
  return error
}
