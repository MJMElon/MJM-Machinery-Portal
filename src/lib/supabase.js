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
export const CASE_TABLE = 'machinery_cases'
