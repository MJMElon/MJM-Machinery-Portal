import { createClient } from '@supabase/supabase-js'

// Browser client: PUBLIC url + anon key only. Everything sensitive (Meta
// tokens, app secret, service_role key) lives in Edge Function secrets.
const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabaseEnabled = Boolean(url && anonKey)

export const supabase = supabaseEnabled
  ? createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'mjm-portal-auth' },
      global: { headers: { 'x-application-name': 'mjm-machinery-portal' } }
    })
  : null

// Names shared with the SQL migration + Edge Function. `machinery_` prefix keeps
// them apart from MachTrek's `workrecords_` tables in the same project.
export const WA_TABLE = 'machinery_whatsapp_messages'
export const WA_BUCKET = 'machinery_whatsapp_photos'
export const ADMIN_TABLE = 'machinery_portal_admins'
export const COMPANY_TABLE = 'machinery_companies'
export const BUSINESS_TABLE = 'machinery_businesses'
export const BUSINESS_COMPANY_TABLE = 'machinery_business_companies'
export const CASE_TABLE = 'machinery_cases'
export const BLOCK_TABLE = 'machinery_company_blocks'

// Diesel Manage (ported from the Intranet's Diesel Claims; per company here)
export const DIESEL = {
  members: 'machinery_diesel_members',
  vehicles: 'machinery_diesel_vehicles',
  claims: 'machinery_diesel_claims',
  cards: 'machinery_diesel_cards',
  reloads: 'machinery_diesel_card_reloads',
  usage: 'machinery_diesel_card_usage',
  bucket: 'machinery_diesel_receipts'
}

// Where MJM Intranet lives; the portal is one of its icons.
export const INTRANET_URL = import.meta.env.VITE_INTRANET_URL || 'https://mjmelon.github.io/MJM-Intranet/'
