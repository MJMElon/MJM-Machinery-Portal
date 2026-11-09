// Shared by gw-login and sync-intranet: pull the businesses / companies from
// MJM Intranet (gw-master-data, API key of the portal's Icon) and apply them
// in this project (machinery_apply_intranet_master, service role).

export const DEFAULT_INTRANET_FUNCTIONS = 'https://briqzyxfxsvulyizzbiu.supabase.co/functions/v1'

const env = (k: string) => (Deno.env.get(k) ?? '').trim()

export function intranetFunctionsBase(): string {
  const check = env('GW_CHECK_ACCESS_URL')
  if (check) return check.replace(/\/gw-check-access\/?$/, '')
  return env('GW_INTRANET_FUNCTIONS_URL') || DEFAULT_INTRANET_FUNCTIONS
}

export interface MasterData {
  module_code: string
  businesses: unknown[]
  companies: unknown[]
  links: unknown[]
  module_company_ids: string[]
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

// deno-lint-ignore no-explicit-any
export async function syncMasterData(db: any, apiKey: string): Promise<Record<string, unknown>> {
  const data = await fetchMasterData(apiKey)
  const { data: result, error } = await db.rpc('machinery_apply_intranet_master', {
    p: { businesses: data.businesses, companies: data.companies, links: data.links },
  })
  if (error) throw new Error(`apply master data: ${error.message}`)
  return { ...(result ?? {}), exported_at: data.exported_at }
}
