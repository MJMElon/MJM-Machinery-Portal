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
  /** MJM Intranet Super Admin (= super admin in this portal too) */
  is_super_admin?: boolean
  // Intranet companies this person may use with the Icon (HR allocation in the
  // Businesses where the Icon is opened for them). Absent from older Intranets.
  company_ids?: string[]
}

export interface MasterData {
  module_code: string
  module_users?: IntranetUser[]
  businesses: { id: string }[]
  companies: { id: string }[]
  links: { group_id: string; company_id: string }[]
  module_company_ids: string[]
  module_business_ids?: string[]
  /** Master Manage → Company → Locations (per company and business). Absent from older Intranets. */
  locations?: { id: string; company_id: string; group_id: string | null; name: string }[]
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
  // Everyone who already has a portal row, in one query (the table is small)
  let { data: rows, error: readErr } = await db.from('machinery_portal_admins').select('user_id, email, full_name, intranet_user_id')
  if (readErr) ({ data: rows } = await db.from('machinery_portal_admins').select('user_id, email, full_name'))
  const byEmail = new Map<string, { user_id: string; full_name: string | null; intranet_user_id?: string | null }>()
  // Intranet accounts that already own a login here
  const pinned = new Set<string>((rows ?? []).map((r: { intranet_user_id?: string | null }) => r.intranet_user_id).filter(Boolean) as string[])
  for (const r of rows ?? []) if (r.email) byEmail.set(String(r.email).trim().toLowerCase(), r)
  const upserts: { user_id: string; email: string; full_name: string | null }[] = []
  for (const u of users) {
    const email = (u.email || '').trim().toLowerCase()
    if (!email) continue
    const have = byEmail.get(email)
    let userId: string | undefined = have?.user_id
    if (!userId) {
      // New person: create the login (no e-mail is sent)
      const created = await db.auth.admin.createUser({ email, email_confirm: true, user_metadata: { full_name: u.full_name, source: 'mjm-intranet' } })
      userId = created.data?.user?.id
      if (!userId) {
        // already a login (e.g. from MachTrek): look it up through a magic link
        const { data } = await db.auth.admin.generateLink({ type: 'magiclink', email })
        userId = data?.user?.id
      }
    }
    if (!userId) continue
    ids.set(u.id, userId)
    // Only write rows that are new or whose name changed
    if (!have || (u.full_name || null) !== (have.full_name || null)) upserts.push({ user_id: userId, email, full_name: u.full_name || null })
  }
  if (upserts.length) {
    let { error } = await db.from('machinery_portal_admins').upsert(upserts, { onConflict: 'user_id' })
    if (error && /full_name/.test(error.message)) {
      ;({ error } = await db.from('machinery_portal_admins').upsert(upserts.map(({ user_id, email }) => ({ user_id, email })), { onConflict: 'user_id' }))
    }
    if (error) throw new Error(`portal users: ${error.message}`)
  }
  // Tie each login to its Intranet account now (not only at the first sign-in), so the
  // sign-in check can refuse a different Intranet account that later shows the same e-mail.
  if (!readErr) {
    for (const u of users) {
      const userId = ids.get(u.id)
      const have = byEmail.get((u.email || '').trim().toLowerCase())
      if (!userId || !u.id || pinned.has(u.id) || have?.intranet_user_id) continue
      const { error } = await db.from('machinery_portal_admins').update({ intranet_user_id: u.id }).eq('user_id', userId).is('intranet_user_id', null)
      if (!error) pinned.add(u.id)
    }
  }
  return ids
}

// deno-lint-ignore no-explicit-any
export async function syncMasterData(db: any, apiKey: string): Promise<Record<string, unknown>> {
  // The two Intranet Icons are read with their own API keys (secrets of THIS project, from
  // MJM Intranet → Master Manage → Module → Generate key): GW_API_KEY = the CMMS 2 Icon,
  // GW_API_KEY_DIESEL = the Fuel Claims Icon. Each is read on its own: a key that fails
  // changes nothing for its Icon (old flags and permissions stay), the other one still syncs.
  const fuelKey = env('GW_API_KEY_DIESEL')
  const read = async (key: string, secret: string, icon: string): Promise<MasterData> => {
    if (!key) throw new Error(`${icon} icon not synced: the ${secret} secret is not set in this project (Edge Functions → Secrets).`)
    try {
      return await fetchMasterData(key)
    } catch (e) {
      const msg = String((e as Error)?.message ?? e)
      if (/invalid_api_key|api_key_required/.test(msg))
        throw new Error(`${icon} icon not synced: MJM Intranet does not accept the ${secret} secret (it starts with "${key.slice(0, 10)}"). ` +
          `In MJM Intranet → Master Manage → Module → ${icon}, compare "API key: …" with that start; if it differs, press "Generate API key" there and put the new key in ${secret}.`)
      throw new Error(`${icon} icon not synced: ${msg}`)
    }
  }
  const [mainRes, fuelRes] = await Promise.allSettled([read(apiKey, 'GW_API_KEY', 'CMMS 2'), read(fuelKey, 'GW_API_KEY_DIESEL', 'Fuel Claims')])
  const data: MasterData | null = mainRes.status === 'fulfilled' ? mainRes.value : null
  const fuel: MasterData | null = fuelRes.status === 'fulfilled' ? fuelRes.value : null
  const why = (r: PromiseSettledResult<unknown>) => (r.status === 'rejected' ? String((r.reason as Error)?.message ?? r.reason) : undefined)
  const cmmsNote = why(mainRes)
  const fuelNote = why(fuelRes)
  // Neither Icon could be read: stop here, nothing is changed
  if (!data && !fuel) throw new Error([cmmsNote, fuelNote].filter(Boolean).join(' · '))
  const base = (data ?? fuel)!
  const payload: Record<string, unknown> = {
    businesses: base.businesses,
    companies: base.companies,
    links: base.links,
  }
  if (data) payload.cmms_company_ids = companiesWithIcon(data)
  if (fuel) payload.diesel_company_ids = companiesWithIcon(fuel)
  const { data: result, error } = await db.rpc('machinery_apply_intranet_master', { p: payload })
  if (error) throw new Error(`apply master data: ${error.message}`)

  // Locations of the companies (after the companies and businesses exist here).
  // Only when the Intranet sends them; a failure is a warning, the rest is kept.
  let locs: Record<string, unknown> = {}
  if (Array.isArray(base.locations)) {
    const { data: l, error: le } = await db.rpc('machinery_apply_intranet_locations', { p: base.locations })
    locs = le ? { locations_warning: /function|does not exist|PGRST202/i.test(le.message) ? 'Run the SQL migration …locations_from_intranet.sql in Supabase.' : le.message } : (l ?? {})
  }

  // People with access to the Icons → portal users + flags
  let users: Record<string, unknown> = {}
  try {
    const all = new Map<string, IntranetUser>()
    for (const u of data?.module_users ?? []) all.set(u.id, u)
    for (const u of fuel?.module_users ?? []) all.set(u.id, u)
    const ids = await ensureUsers(db, [...all.values()])
    const flags: Record<string, unknown> = {}
    if (data?.module_users) flags.cmms = data.module_users.map((u) => ids.get(u.id)).filter(Boolean)
    if (fuel?.module_users) flags.fuel = fuel.module_users.map((u) => ids.get(u.id)).filter(Boolean)
    // Intranet Super Admins → super admin here (only when the Intranet already sends is_super_admin)
    const everyone = [...(data?.module_users ?? []), ...(fuel?.module_users ?? [])]
    if (everyone.some((u) => typeof u.is_super_admin === 'boolean')) {
      flags.super = [...new Set(everyone.filter((u) => u.is_super_admin).map((u) => ids.get(u.id)).filter(Boolean))]
    }
    const { data: r, error: e2 } = await db.rpc('machinery_apply_intranet_users', { p: flags })
    users = e2 ? { users_warning: e2.message } : { users: all.size, ...(r ?? {}) }

    // Which companies each person may see, per Icon (only when the Intranet sends it)
    const scope = (list?: IntranetUser[]) =>
      list && list.every((u) => Array.isArray(u.company_ids))
        ? list.map((u) => ({ user_id: ids.get(u.id), company_ids: u.company_ids })).filter((x) => x.user_id)
        : null
    const companies: Record<string, unknown> = {}
    const cmmsScope = scope(data?.module_users)
    const fuelScope = scope(fuel?.module_users)
    if (cmmsScope) companies.cmms = cmmsScope
    if (fuelScope) companies.fuel = fuelScope
    if (Object.keys(companies).length) {
      const { data: c, error: e3 } = await db.rpc('machinery_apply_intranet_user_companies', { p: companies })
      users = { ...users, ...(e3 ? { companies_warning: e3.message } : { user_companies: c }) }
    }
  } catch (e) {
    users = { users_warning: String((e as Error)?.message ?? e) }
  }
  const fuelUsers = fuel?.module_users?.length ?? null
  return {
    ...(result ?? {}),
    ...locs,
    ...users,
    ...(fuelUsers != null ? { fuel_users: fuelUsers } : {}),
    exported_at: base.exported_at,
    ...(cmmsNote ? { cmms_icon_warning: cmmsNote } : {}),
    ...(fuelNote ? { fuel_icon_warning: fuelNote } : {}),
  }
}
