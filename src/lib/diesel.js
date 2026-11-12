import { supabase, DIESEL } from './supabase.js'
import { FUEL_SECTIONS, usePerms } from './perms.js'

// Diesel Manage: vehicles, cash fuel claims (receipt photos), fleet cards
// (reloads + card fill-ups), reports and user access — all per company.
// Ported from the Intranet's Diesel Claims module; every rule is enforced by
// the database (RLS + triggers), this file only talks to it.

export const VEHICLE_TYPES = [
  ['car', 'Car'],
  ['pickup', 'Pickup'],
  ['van', 'Van'],
  ['lorry', 'Lorry'],
  ['motorcycle', 'Motorcycle'],
  ['machinery', 'Machinery'],
  ['other', 'Other']
]
export const FUEL_TYPES = [
  ['diesel', 'Diesel'],
  ['petrol', 'Petrol']
]
export const CLAIM_STATUS = {
  pending: { label: 'Pending', color: 'amber' },
  approved: { label: 'Approved', color: 'green' },
  rejected: { label: 'Rejected', color: 'red' },
  paid: { label: 'Paid', color: 'blue' }
}
export const CARD_STATUS = {
  application: { label: 'Applying', color: 'amber' },
  active: { label: 'Active', color: 'green' },
  inactive: { label: 'Inactive', color: 'slate' },
  blocked: { label: 'Blocked', color: 'amber' },
  cancelled: { label: 'Cancelled', color: 'slate' }
}

// Vehicles and machines are one list (Machinery Manage → Machinery Profile).
export const vehicleLabel = (v) =>
  v ? v.name + (v.reg_no && v.reg_no.trim().toUpperCase() !== String(v.name).trim().toUpperCase() ? ' · ' + v.reg_no : '') : '—'
export const MACHINES = 'machinery_machines'
export const personLabel = (p) => (p ? p.full_name || p.email : '—')

// ---- access ------------------------------------------------------------------

/** What the signed-in user may do in Fuel Manage for a company (from the permission matrix). */
export function useDieselAccess(companyId) {
  const p = usePerms(companyId)
  return {
    loaded: p.loaded,
    error: p.error,
    can: p.can,
    use: p.any(FUEL_SECTIONS),
    admin: p.can('claims', 'approve'),
    pay: p.can('claims', 'pay'),
    claim: p.can('claims', 'add'),
    report: p.can('report', 'view') || p.can('claims', 'view_all'),
    viewAll: p.can('claims', 'view_all') || p.can('report', 'view'),
    reviewable: p.reviewable,
    approveFor: p.approveFor
  }
}

/** Portal users with their Diesel access for a company (admins see everyone). */
export async function listPeople(companyId) {
  const { data, error } = await supabase.rpc('machinery_diesel_people', { p_company: companyId })
  if (error) throw friendly(error)
  return data || []
}

export async function setMember(companyId, userId, { is_admin, can_claim, can_report }) {
  const { error } = await supabase
    .from(DIESEL.members)
    .upsert({ company_id: companyId, user_id: userId, is_admin, can_claim, can_report }, { onConflict: 'company_id,user_id' })
  if (error) throw friendly(error)
}

export async function removeMember(companyId, userId) {
  const { error } = await supabase.from(DIESEL.members).delete().eq('company_id', companyId).eq('user_id', userId)
  if (error) throw friendly(error)
}

// ---- vehicles (= machines of the company, managed in Machinery Manage) ----------

export async function listVehicles(companyId) {
  const { data, error } = await supabase.from(MACHINES).select('*').eq('company_id', companyId).order('name')
  if (error) throw friendly(error)
  // Before the vehicles migration these columns do not exist: treat every machine as an active vehicle.
  return (data || []).map((m) => ({ ...m, is_active: m.is_active !== false, kpdn_subsidy: Boolean(m.kpdn_subsidy) }))
}

// ---- cash claims -------------------------------------------------------------

/** filter: { mine, from, to } */
export async function listClaims(companyId, filter = {}) {
  let q = supabase
    .from(DIESEL.claims)
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
  if (filter.mine) q = q.eq('claimant_id', filter.mine)
  if (filter.from) q = q.gte('fill_date', filter.from)
  if (filter.to) q = q.lte('fill_date', filter.to)
  const { data, error } = await q.limit(2000)
  if (error) throw friendly(error)
  return data || []
}

export async function getClaim(id) {
  const { data, error } = await supabase.from(DIESEL.claims).select('*').eq('id', id).maybeSingle()
  if (error) throw friendly(error)
  return data
}

/** Signed link (10 min) to show a receipt image on the page; null for PDFs. */
export async function receiptUrl(path, seconds = 600) {
  if (!path) return null
  const { data, error } = await supabase.storage.from(DIESEL.bucket).createSignedUrl(path, seconds)
  if (error || !data) return null
  return data.signedUrl
}

/** Last odometer reading recorded for a vehicle before a date (claims + card fill-ups). */
export async function lastOdometer(vehicleId, beforeDate) {
  const pick = (table) =>
    supabase
      .from(table)
      .select('odometer_km')
      .eq('vehicle_id', vehicleId)
      .lt('fill_date', beforeDate)
      .not('odometer_km', 'is', null)
      .order('fill_date', { ascending: false })
      .limit(1)
      .then((r) => r.data?.[0]?.odometer_km ?? null)
  const [a, b] = await Promise.all([pick(DIESEL.claims), pick(DIESEL.usage).catch(() => null)])
  return Math.max(a ?? -1, b ?? -1) < 0 ? null : Math.max(a ?? 0, b ?? 0)
}

export async function insertClaim(companyId, userId, row) {
  const { error } = await supabase.from(DIESEL.claims).insert({ company_id: companyId, claimant_id: userId, ...row })
  if (error) throw friendly(error)
}

export async function updateClaim(id, row) {
  const { error } = await supabase.from(DIESEL.claims).update(row).eq('id', id)
  if (error) throw friendly(error)
}

export async function deleteClaim(id) {
  const { error } = await supabase.from(DIESEL.claims).delete().eq('id', id)
  if (error) throw friendly(error)
}

/** Admin review: pending → approved / rejected, approved → paid, back to pending. */
export async function reviewClaim(id, status, note) {
  const { data, error } = await supabase
    .from(DIESEL.claims)
    .update({ status, review_note: note || null })
    .eq('id', id)
    .select()
    .single()
  if (error) throw friendly(error)
  return data
}

// ---- claim lines (one per receipt) ----------------------------------------------

const round = (v, dp) => Math.round(Number(v) * 10 ** dp) / 10 ** dp

export const PAYMENTS = [
  ['cash', 'Cash'],
  ['fleet_card', 'Fleet card']
]
export const PAYMENT_NOTE = { cash: 'Non-subsidised', fleet_card: 'KPDN subsidy' }

// A line is a fill-up (receipt for fuel) or a fleet card reload: the person
// paid cash to top up a fleet card and claims it back (payable, no litres).
export const isReload = (l) => l?.line_kind === 'reload'
export const cardLabel = (c) => (c ? [c.card_no, c.provider].filter(Boolean).join(' · ') : '—')
export const reloadLabel = (c) => `Fleet card reload · ${c?.card_no || '—'}`

/** Fleet cards a claimant may record a reload for (card no. + provider only). */
export async function listClaimCards(companyId) {
  const { data, error } = await supabase.rpc('machinery_claim_cards', { p_company: companyId })
  if (error) throw friendly(error)
  return data || []
}

/** Per card and month: reloads in and fuel taken out → [{ card_id, month, kind: 'reload' | 'usage', amount, litres, entries }]. */
export async function cardLedger(companyId) {
  const { data, error } = await supabase.rpc('machinery_card_ledger', { p_company: companyId })
  if (error) throw friendly(error)
  return data || []
}

/** Reloads − fuel taken, per card, from the ledger rows (all months, or up to and including `month`). */
/** Fill-up receipts on fuel claims (fleet card and cash) that belong to one card, for a year; null before migration 20261128. */
export async function cardClaimLines(companyId, cardId, year) {
  const { data, error } = await supabase.rpc('machinery_card_claim_lines', {
    p_company: companyId,
    p_card: cardId,
    p_from: `${year}-01-01`,
    p_to: `${year}-12-31`
  })
  if (error) return null
  return data || []
}

export function cardBalances(ledger, month) {
  const bal = {}
  for (const r of ledger || []) {
    if (month && r.month > month) continue
    bal[r.card_id] = (bal[r.card_id] || 0) + (r.kind === 'reload' ? 1 : -1) * Number(r.amount || 0)
  }
  return bal
}

export const LINES = 'machinery_diesel_claim_lines'

export async function listClaimLines(companyId, { claimIds } = {}) {
  let q = supabase.from(LINES).select('*').eq('company_id', companyId).order('fill_date', { ascending: false }).order('line_no')
  if (claimIds) q = q.in('claim_id', claimIds)
  const { data, error } = await q.limit(5000)
  if (error) throw friendly(error)
  return data || []
}

export async function getClaimLines(claimId) {
  const { data, error } = await supabase.from(LINES).select('*').eq('claim_id', claimId).order('line_no')
  if (error) throw friendly(error)
  return data || []
}

/** Create a claim with its lines. Returns the new claim id. */
export async function createClaimWithLines(companyId, userId, header, lines) {
  const { data, error } = await supabase
    .from(DIESEL.claims)
    .insert({
      company_id: companyId,
      claimant_id: userId,
      submitted_on: header.submitted_on,
      fill_date: header.submitted_on,
      notes: header.notes || null,
      amount: 0
    })
    .select('id')
    .single()
  if (error) throw friendly(error)
  try {
    await replaceLines(data.id, lines)
  } catch (e) {
    await supabase.from(DIESEL.claims).delete().eq('id', data.id)
    throw e
  }
  return data.id
}

/** Update a pending claim's header and replace its lines. */
export async function updateClaimWithLines(claimId, header, lines) {
  const { error } = await supabase
    .from(DIESEL.claims)
    .update({ submitted_on: header.submitted_on, fill_date: header.submitted_on, notes: header.notes || null })
    .eq('id', claimId)
  if (error) throw friendly(error)
  await replaceLines(claimId, lines)
}

async function replaceLines(claimId, lines) {
  const { data: existing } = await supabase.from(LINES).select('id').eq('claim_id', claimId)
  const keep = new Set(lines.filter((l) => l.id).map((l) => l.id))
  const gone = (existing || []).filter((l) => !keep.has(l.id)).map((l) => l.id)
  if (gone.length) {
    const { error } = await supabase.from(LINES).delete().in('id', gone)
    if (error) throw friendly(error)
  }
  const rows = lines.map((l, i) => ({
    ...(l.id ? { id: l.id } : {}),
    claim_id: claimId,
    company_id: l.company_id,
    line_no: i + 1,
    fill_date: l.fill_date,
    // A reload has a card, no vehicle, no litres, and is always paid back (cash).
    line_kind: isReload(l) ? 'reload' : 'fill',
    card_id: isReload(l) ? l.card_id || null : null,
    vehicle_id: isReload(l) ? null : l.vehicle_id || null,
    litres: isReload(l) || l.litres === '' || l.litres == null ? null : round(l.litres, 2),
    unit_price: isReload(l) || l.unit_price === '' || l.unit_price == null ? null : round(l.unit_price, 3),
    amount: round(l.amount || 0, 2),
    payment: isReload(l) ? 'cash' : l.payment || 'cash',
    subsidised: !isReload(l) && (l.payment || 'cash') === 'fleet_card',
    receipt_no: l.receipt_no || null,
    station: l.station || null,
    odometer_km: l.odometer_km === '' || l.odometer_km == null ? null : Number(l.odometer_km),
    description: l.description || null,
    remark: l.remark || null,
    receipt_path: l.receipt_path || null
  }))
  if (!rows.length) return
  const { error } = await supabase.from(LINES).upsert(rows, { onConflict: 'id' })
  if (error) throw friendly(error)
}

// ---- receipts (private bucket: <company>/<user>/<uuid>.<ext>) --------------------

/** Phone photos are shrunk to 1600px JPEG before upload; PDFs go as they are. */
export async function compressReceipt(file) {
  if (!file.type.startsWith('image/')) return file
  try {
    const bmp = await createImageBitmap(file)
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bmp.width * scale)
    canvas.height = Math.round(bmp.height * scale)
    canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.82))
    return blob ? new File([blob], 'receipt.jpg', { type: 'image/jpeg' }) : file
  } catch {
    return file
  }
}

export async function uploadReceipt(companyId, userId, file) {
  const upload = await compressReceipt(file)
  if (upload.size > 10 * 1024 * 1024) throw new Error('The receipt file is too big (max 10 MB).')
  const ext =
    upload.type === 'application/pdf' ? 'pdf' : upload.type === 'image/png' ? 'png' : upload.type === 'image/webp' ? 'webp' : 'jpg'
  const path = `${companyId}/${userId}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from(DIESEL.bucket).upload(path, upload, { contentType: upload.type })
  if (error) throw new Error('Could not upload the receipt. Please try again.')
  return path
}

export function removeReceipt(path) {
  if (path) supabase.storage.from(DIESEL.bucket).remove([path]).catch(() => {})
}

/** Opens a receipt in a new tab with a 60-second signed link. */
export async function openReceipt(path) {
  const { data, error } = await supabase.storage.from(DIESEL.bucket).createSignedUrl(path, 60)
  if (error || !data) throw new Error('Could not open the receipt.')
  window.open(data.signedUrl, '_blank', 'noopener')
}

// ---- fleet cards ---------------------------------------------------------------

export async function listCardData(companyId, from) {
  const usageQ = supabase.from(DIESEL.usage).select('*').eq('company_id', companyId).order('fill_date', { ascending: false })
  const reloadQ = supabase.from(DIESEL.reloads).select('*').eq('company_id', companyId).order('reload_date', { ascending: false })
  const [cards, usage, reloads] = await Promise.all([
    supabase.from(DIESEL.cards).select('*').eq('company_id', companyId).order('card_no').then(check),
    (from ? usageQ.gte('fill_date', from) : usageQ).limit(5000).then(check),
    (from ? reloadQ.gte('reload_date', from) : reloadQ).limit(5000).then(check)
  ])
  return { cards, usage, reloads }
}

// Fleet card application check list. Each item is kept in the card's
// `checklist` json as { done, date, note } under its key.
export const CARD_CHECKLIST = [
  { group: 'Company', key: 'vehicle_sticker', label: 'Vehicle sticker' },
  { group: 'Company', key: 'puspakom', label: 'Puspakom test' },
  { group: 'Company', key: 'insurance', label: 'Convert of insurance' },
  { group: 'Company', key: 'road_tax', label: 'Renew road tax' },
  { group: 'Company', key: 'subsidy_apply', label: 'Subsidy application' },
  { group: 'Company', key: 'subsidy_awarded', label: 'Awarded subsidy' },
  { group: 'Company', key: 'card_apply', label: 'Apply fleet card (subsidy linked to fleet card)' },
  { group: 'Company', key: 'card_tested', label: 'Tested fleet card' },
  { group: 'Driver', key: 'medical', label: 'Medical check' },
  { group: 'Driver', key: 'gdl', label: 'GDL course' }
]
export const checklistDone = (card) => CARD_CHECKLIST.filter((i) => card?.checklist?.[i.key]?.done).length

export async function getCard(id) {
  const { data, error } = await supabase.from(DIESEL.cards).select('*').eq('id', id).maybeSingle()
  if (error) throw friendly(error)
  return data
}

export async function saveCard(companyId, { id, ...fields }) {
  const run = (f) =>
    (id ? supabase.from(DIESEL.cards).update(f).eq('id', id) : supabase.from(DIESEL.cards).insert({ company_id: companyId, ...f }))
      .select('id')
      .single()
  let { data, error } = await run(fields)
  // Before migration 20261127 (shared drivers, Inactive) the card has one driver only.
  if (error && 'driver_ids' in fields && /driver_ids/.test(error.message || '')) {
    const { driver_ids, ...rest } = fields
    ;({ data, error } = await run(rest))
  }
  if (error && fields.status === 'inactive' && /status_check/.test(error.message || ''))
    throw new Error('Run the Fuel SQL migration 20261127 (fleet card drivers) to use Inactive.')
  if (error) throw friendly(error, { '23505': 'A card with this number already exists.' })
  return data?.id || id
}
export async function deleteCard(id) {
  const { error } = await supabase.from(DIESEL.cards).delete().eq('id', id)
  if (error) throw friendly(error, { '23503': 'This card has fill-ups or reloads recorded, so it cannot be deleted. Set it to Cancelled instead.' })
}

export async function addReload(companyId, row) {
  const { error } = await supabase.from(DIESEL.reloads).insert({ company_id: companyId, ...row })
  if (error) throw friendly(error)
}

export async function addUsage(companyId, row) {
  const { error } = await supabase.from(DIESEL.usage).insert({ company_id: companyId, ...row })
  if (error) throw friendly(error)
}

export async function deleteCardRecord(kind, id) {
  const { error } = await supabase.from(kind === 'reload' ? DIESEL.reloads : DIESEL.usage).delete().eq('id', id)
  if (error) throw friendly(error)
}

// ---- helpers -------------------------------------------------------------------

function check({ data, error }) {
  if (error) throw friendly(error)
  return data || []
}

function friendly(error, custom = {}) {
  if (custom[error?.code]) return new Error(custom[error.code])
  if (error?.code === '23505') return new Error('That value is already used.')
  if (error?.code === '42501' || error?.code === '23514') return new Error(error.message || 'You do not have access to do this.')
  if (['42P01', 'PGRST205', '42703', 'PGRST204', 'PGRST202', '42883'].includes(error?.code)) {
    return new Error('Database not up to date. Run the Fuel SQL migrations (…diesel.sql, …vehicles_into_machines.sql, …fuel_claims_intranet_sync.sql) in Supabase.')
  }
  return error instanceof Error ? error : new Error(error?.message || 'Could not save. Please try again.')
}
