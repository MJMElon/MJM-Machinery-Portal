// Shared by gw-login and sync-intranet: pull the businesses / companies from
// MJM Intranet (gw-master-data) and apply them in this project
// (machinery_apply_intranet_master, service role).
//
// Which companies may use each module also comes from the Intranet: the
// companies (and the companies of the businesses) tagged to the CMMS 2 Icon
// (GW_API_KEY) get Machinery Manage; those tagged to the Fuel Manage Icon
// (GW_API_KEY_DIESEL) get Fuel Manage.

export const DEFAULT_INTRANET_FUNCTIONS = 'https://briqzyxfxsvulyizzbiu.supabase.co/functions/v1'

const env = (k: string) => (Deno.env.get(k) ?? '').trim()

export function intranetFunctionsBase(): string {
  const check = env('GW_CHECK_ACCESS_URL')
  if (check) return check.replace(/\/gw-check-access\/?$/, '')
  return env('GW_INTRANET_FUNCTIONS_URL') || DEFAULT_INTRANET_FUNCTIONS
}

export interface IntranetUser {
  id: string
  email: string
  full_name: string | null
  is_admin?: boolean
}

export interface MasterData {
  module_code: string
  module_users?: IntranetUser[]
  businesses: { id: string }[]
  companies: { id: string }[]
  links: { group_id: string; company_id: string }[]
  module_company_ids: string[]
  module_business_ids?: string[]
  exported_at: string
}

export async function fetchMasterData(apiKey: string): Promise<MasterData> {
  const res = await fetch(`${intranetFunctionsBase()}/gw-master-data`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-gw-api-key': apiKey },
    body: '{}',
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`gw-master-data ${res.status}: ${body?.error ?? 'failed'}${body?.detail ? ` (${body.detail})` : ''}`)
  return body as MasterData
}

/** Companies that have an Icon: tagged directly, or under a tagged business. */
export function companiesWithIcon(d: MasterData): string[] {
  const ids = new Set<string>(d.module_company_ids ?? [])
  const biz = new Set<string>(d.module_business_ids ?? [])
  for (const l of d.links ?? []) if (biz.has(l.group_id)) ids.add(l.company_id)
  return [...ids]
}

/**
 * Make sure every Intranet user with access to an Icon has a login + portal
 * user row here (no e-mail is sent), so their name shows in Role setup before
 * they first sign in. Returns the portal user ids by Intranet user id.
 */
// deno-lint-ignore no-explicit-any
async function ensureUsers(db: any, users: IntranetUser[]): Promise<Map<string, string>> {
  const ids = new Map<string, string>()
  for (const u of users) {
    const email = (u.email || '').trim().toLowerCase()
    if (!email) continue
    let userId: string | undefined
    const { data: existing } = await db.from('machinery_portal_admins').select('user_id').ilike('email', email).maybeSingle()
    userId = existing?.user_id
    if (!userId) {
      const created = await db.auth.admin.createUser({ email, email_confirm: true, user_metadata: { full_name: u.full_name, source: 'mjm-intranet' } })
      userId = created.data?.user?.id
      if (!userId) {
        // already a login (e.g. from MachTrek): look it up through a magic link
        const { data } = await db.auth.admin.generateLink({ type: 'magiclink', email })
        userId = data?.user?.id
      }
    }
    if (!userId) continue
    let { error } = await db.from('machinery_portal_admins').upsert({ user_id: userId, email, full_name: u.full_name || null }, { onConflict: 'user_id' })
    if (error && /full_name/.test(error.message)) {
      ;({ error } = await db.from('machinery_portal_admins').upsert({ user_id: userId, email }, { onConflict: 'user_id' }))
    }
    if (!error) ids.set(u.id, userId)
  }
  return ids
}

// deno-lint-ignore no-explicit-any
export async function syncMasterData(db: any, apiKey: string): Promise<Record<string, unknown>> {
  const data = await fetchMasterData(apiKey)
  const payload: Record<string, unknown> = {
    businesses: data.businesses,
    companies: data.companies,
    links: data.links,
    cmms_company_ids: companiesWithIcon(data),
  }
  // Fuel Manage Icon has its own key; without it the Fuel flags are left alone.
  const fuelKey = env('GW_API_KEY_DIESEL')
  let fuel: MasterData | null = null
  let fuelNote: string | undefined
  if (fuelKey) {
    try {
      fuel = await fetchMasterData(fuelKey)
      payload.diesel_company_ids = companiesWithIcon(fuel)
    } catch (e) {
      fuelNote = String((e as Error)?.message ?? e)
    }
  }
  const { data: result, error } = await db.rpc('machinery_apply_intranet_master', { p: payload })
  if (error) throw new Error(`apply master data: ${error.message}`)

  // People with access to the Icons → portal users + flags
  let users: Record<string, unknown> = {}
  try {
    const all = new Map<string, IntranetUser>()
    for (const u of data.module_users ?? []) all.set(u.id, u)
    for (const u of fuel?.module_users ?? []) all.set(u.id, u)
    const ids = await ensureUsers(db, [...all.values()])
    const flags: Record<string, unknown> = {}
    if (data.module_users) flags.cmms = data.module_users.map((u) => ids.get(u.id)).filter(Boolean)
    if (fuel?.module_users) flags.fuel = fuel.module_users.map((u) => ids.get(u.id)).filter(Boolean)
    const { data: r, error: e2 } = await db.rpc('machinery_apply_intranet_users', { p: flags })
    users = e2 ? { users_warning: e2.message } : { users: all.size, ...(r ?? {}) }
  } catch (e) {
    users = { users_warning: String((e as Error)?.message ?? e) }
  }
  return { ...(result ?? {}), ...users, exported_at: data.exported_at, ...(fuelNote ? { fuel_icon_warning: fuelNote } : {}) }
}
