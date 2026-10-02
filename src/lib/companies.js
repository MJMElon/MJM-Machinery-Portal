import { supabase, COMPANY_TABLE } from './supabase.js'

// Companies are managed in Company Settings. A WhatsApp message belongs to the
// company whose `whatsapp_numbers` list contains the sender's number.

const COLUMNS = 'id, name, cmms_enabled, whatsapp_numbers'

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

function friendly(error) {
  if (error?.code === '23505') return new Error('A company with this name already exists.')
  if (error?.code === '42P01') return new Error('Company table missing. Run the companies SQL migration in Supabase.')
  return error
}
