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

export interface MasterData {
  module_code: string
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
  let fuelNote: string | undefined
  if (fuelKey) {
    try {
      payload.diesel_company_ids = companiesWithIcon(await fetchMasterData(fuelKey))
    } catch (e) {
      fuelNote = String((e as Error)?.message ?? e)
    }
  }
  const { data: result, error } = await db.rpc('machinery_apply_intranet_master', { p: payload })
  if (error) throw new Error(`apply master data: ${error.message}`)
  return { ...(result ?? {}), exported_at: data.exported_at, ...(fuelNote ? { fuel_icon_warning: fuelNote } : {}) }
}
