import { supabase, DIESEL } from './supabase.js'
import { FUEL_SECTIONS, topupApproveFor, usePerms } from './perms.js'

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
  draft: { label: 'Draft', color: 'slate' },
  pending: { label: 'Pending for approval', color: 'amber' },
  // fleet card fill-ups only: nothing to pay back, no approval (migration 20261224)
  recorded: { label: 'Recorded', color: 'slate' },
  approved: { label: 'Pending for reimbursement', color: 'green' },
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
    // Approver = named as the approver of somebody in User setting (a bare 'approve' tick is not enough)
    admin: p.super || (p.can('claims', 'approve') && p.approveFor.length > 0),
    pay: p.can('claims', 'pay'),
    claim: p.can('claims', 'add'),
    report: p.can('report', 'view') || p.can('claims', 'view_all'),
    viewAll: p.can('claims', 'view_all') || p.can('report', 'view'),
    reviewable: p.reviewable,
    approves: p.approves,
    fuelAdmin: p.adminOf('fuel'),
    approveFor: p.approveFor,
    approvesTopup: p.approvesTopup,
    topupApprover: p.super || (p.can('topup', 'approve') && topupApproveFor(p.perms).length > 0),
    // Procurement role: may see fleet card web login passwords (eye button)
    procurement: p.fuelRole === 'procurement'
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

/** Signed links (10 min) for many receipts at once: { path: url }; PDFs and failures are left out. */
export async function receiptUrls(paths, seconds = 600) {
  const list = [...new Set((paths || []).filter((p) => p && !/\.pdf$/i.test(p)))]
  const out = {}
  for (let i = 0; i < list.length; i += 100) {
    const { data } = await supabase.storage.from(DIESEL.bucket).createSignedUrls(list.slice(i, i + 100), seconds)
    for (const d of data || []) if (d.signedUrl && !d.error) out[d.path] = d.signedUrl
  }
  return out
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
  notifyClaim(id)
  return data
}

/**
 * Email about a claim (Edge Function claim-notify): new claim → its approvers;
 * approved / rejected / paid → the claimant (approved also → accountants).
 * Never blocks or fails the save: before the function is set up it does nothing.
 */
export function notifyClaim(id) {
  if (!id) return
  supabase.functions.invoke('claim-notify', { body: { claim_id: id } }).catch(() => {})
}

/** The claimant's bell: remind the approvers of a pending claim (once a day). Returns 'sent' / 'already' / 'none' / 'off'. */
export async function remindApprovers(id) {
  const { data, error } = await supabase.functions.invoke('claim-notify', { body: { claim_id: id, remind: true } })
  if (error) throw new Error('Could not send the reminder. Please try again.')
  if (data?.skipped === 'already sent') return 'already'
  if (String(data?.skipped || '').startsWith('email not set up')) return 'off'
  if (data?.error) throw new Error(data.error)
  return data?.sent > 0 ? 'sent' : 'none'
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
/** A fleet card fill-up (KPDN subsidised diesel): its RM/L is amount ÷ litres, not the printed pump price. */
export const isSubsidisedFill = (l) => !isReload(l) && l?.payment === 'fleet_card'
/** The RM/L to show for a claim row ('' when there is none). */
export const linePrice = (l) =>
  isSubsidisedFill(l)
    ? Number(l.litres) > 0 ? (Number(l.amount || 0) / Number(l.litres)).toFixed(3) : ''
    : l?.unit_price != null && l.unit_price !== '' ? Number(l.unit_price).toFixed(3) : ''
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
      // saved as a draft first; submitted after its receipts are in (a claim with
      // nothing to pay back then becomes Recorded instead of Pending)
      status: 'draft',
      amount: 0
    })
    .select('id')
    .single()
  if (error) throw friendly(error)
  try {
    await replaceLines(data.id, lines)
    if (header.status !== 'draft') await setClaimStatus(data.id, 'pending')
  } catch (e) {
    await supabase.from(DIESEL.claims).delete().eq('id', data.id)
    throw e
  }
  return data.id
}

/** Update a pending / draft claim's header and replace its lines; header.status ('draft' / 'pending') changes it after. */
export async function updateClaimWithLines(claimId, header, lines) {
  const { error } = await supabase
    .from(DIESEL.claims)
    .update({ submitted_on: header.submitted_on, fill_date: header.submitted_on, notes: header.notes || null })
    .eq('id', claimId)
  if (error) throw friendly(error)
  // back to Draft first, then the rows (a submitted top-up claim's rows can only change as a draft)
  if (header.status === 'draft') await setClaimStatus(claimId, 'draft')
  await replaceLines(claimId, lines)
  if (header.status && header.status !== 'draft') await setClaimStatus(claimId, header.status)
  // a pending claim whose receipts changed: checked again (nothing to pay back → Recorded)
  else await supabase.from(DIESEL.claims).update({ status: 'pending' }).eq('id', claimId).eq('status', 'pending')
}

/** The payable part of a claim: cash receipts and fleet card reloads (what an approver looks at). */
export const payableLine = (l) => l.payment !== 'fleet_card' || l.line_kind === 'reload'

/** The claimant: submit a draft (→ Pending) or keep it as Draft. */
export async function setClaimStatus(claimId, status) {
  const { error } = await supabase.from(DIESEL.claims).update({ status }).eq('id', claimId)
  if (error && /status_check/.test(error.message || '')) throw new Error('Run the SQL 20261221 (repair claim drafts) to save drafts.')
  if (error) throw friendly(error)
}

/** The top-up request a claim was made from ({ id, request_no, card_id, amount }); null if it cannot be read. */
export async function getTopup(id) {
  if (!id) return null
  const { data } = await supabase.from('machinery_fleet_topup_requests').select('id, request_no, card_id, amount, status').eq('id', id).maybeSingle()
  return data || null
}

async function replaceLines(claimId, lines) {
  const { data: existing } = await supabase.from(LINES).select('id').eq('claim_id', claimId)
  const keep = new Set(lines.filter((l) => l.id).map((l) => l.id))
  const gone = (existing || []).filter((l) => !keep.has(l.id)).map((l) => l.id)
  if (gone.length) {
    const { error } = await supabase.from(LINES).delete().in('id', gone)
    if (error) throw friendly(error)
  }
  // Every row carries its own id: in one bulk upsert, rows without an id would be sent
  // as id: null (the columns are shared by all rows), so new rows get a uuid here.
  const rows = lines.map((l, i) => ({
    id: l.id || crypto.randomUUID(),
    claim_id: claimId,
    company_id: l.company_id,
    line_no: i + 1,
    fill_date: l.fill_date,
    // A reload has a card, no vehicle, no litres, and is always paid back (cash).
    line_kind: isReload(l) ? 'reload' : 'fill',
    card_id: isReload(l) ? l.card_id || null : null,
    vehicle_id: isReload(l) ? null : l.vehicle_id || null,
    litres: isReload(l) || l.litres === '' || l.litres == null ? null : round(l.litres, 2),
    // Fleet card (KPDN subsidised) fill: RM/L = amount ÷ litres (the database works it out the same way);
    // the printed pump price is kept apart, for reference only.
    unit_price: isReload(l)
      ? null
      : (l.payment || 'cash') === 'fleet_card'
        ? Number(l.litres) > 0 ? round(Number(l.amount || 0) / Number(l.litres), 3) : null
        : l.unit_price === '' || l.unit_price == null ? null : round(l.unit_price, 3),
    pump_price: !isReload(l) && (l.payment || 'cash') === 'fleet_card' && Number(l.pump_price) > 0 ? round(l.pump_price, 3) : null,
    amount: round(l.amount || 0, 2),
    payment: isReload(l) ? 'cash' : l.payment || 'cash',
    subsidised: !isReload(l) && (l.payment || 'cash') === 'fleet_card',
    receipt_no: l.receipt_no || null,
    station: l.station || null,
    odometer_km: l.odometer_km === '' || l.odometer_km == null ? null : Number(l.odometer_km),
    description: l.description || null,
    remark: l.remark || null,
    receipt_path: l.receipt_path || null,
    // Bill to company (migration 20261229); only sent when one is chosen, so older databases still save
    ...(l.bill_to_company_id ? { bill_to_company_id: l.bill_to_company_id } : 'bill_to_company_id' in l ? { bill_to_company_id: null } : {})
  }))
  if (!rows.length) return
  // Columns an older database may not have yet: saved without them (pump price = reference only)
  let send = rows
  let { error } = await supabase.from(LINES).upsert(send, { onConflict: 'id' })
  for (let i = 0; i < 2 && error && ['PGRST204', '42703'].includes(error.code); i++) {
    const msg = error.message || ''
    if (/bill_to/.test(msg)) {
      if (send.some((r) => r.bill_to_company_id)) throw new Error('Bill to company needs the SQL migration 20261229 in the database first.')
      send = send.map(({ bill_to_company_id, ...r }) => r) // eslint-disable-line no-unused-vars
    } else if (/pump_price/.test(msg)) send = send.map(({ pump_price, ...r }) => r) // eslint-disable-line no-unused-vars
    else break
    ;({ error } = await supabase.from(LINES).upsert(send, { onConflict: 'id' }))
  }
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

// ---- payment documents of a paid claim (bank slip etc.; migration 20261217) ----
const PAY_DOCS = 'machinery_claim_payment_docs'

/** Payment documents of these claims: { claimId: [{ id, path, file_name }] }; {} before the migration. */
export async function listPaymentDocs(claimIds) {
  if (!claimIds?.length) return {}
  const out = {}
  for (let i = 0; i < claimIds.length; i += 200) {
    const { data, error } = await supabase.from(PAY_DOCS).select('id, claim_id, path, file_name, created_at').in('claim_id', claimIds.slice(i, i + 200)).order('created_at')
    if (error) return out
    for (const d of data || []) (out[d.claim_id] ||= []).push(d)
  }
  return out
}

/** Accountant: attach one payment document to an approved / paid claim. */
export async function addPaymentDoc(claim, file) {
  const upload = file.type.startsWith('image/') ? await compressReceipt(file) : file
  if (upload.size > 10 * 1024 * 1024) throw new Error(`${file.name} is too big (max 10 MB).`)
  const ext = upload.type === 'application/pdf' ? 'pdf' : upload.type === 'image/png' ? 'png' : upload.type === 'image/webp' ? 'webp' : 'jpg'
  const path = `${claim.company_id}/${claim.id}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from(PAY_DOCS).upload(path, upload, { contentType: upload.type })
  if (error) throw new Error(/bucket|not found/i.test(error.message) ? 'Run the SQL migration 20261217 (payment documents) first.' : `Could not upload ${file.name}.`)
  const { data: me } = await supabase.auth.getUser()
  const { error: e2 } = await supabase.from(PAY_DOCS).insert({ claim_id: claim.id, company_id: claim.company_id, path, file_name: file.name.slice(0, 200), uploaded_by: me?.user?.id })
  if (e2) {
    supabase.storage.from(PAY_DOCS).remove([path]).catch(() => {})
    throw friendly(e2)
  }
}

/** Signed link (10 min) to a payment document. */
export async function paymentDocUrl(path) {
  const { data, error } = await supabase.storage.from(PAY_DOCS).createSignedUrl(path, 600)
  if (error || !data) throw new Error('Could not open the document.')
  return data.signedUrl
}

// ---- fuel usage records (fuel issued to machines from the company tank) --------
const FUEL_RECORDS = 'machinery_fuel_records'
const RECORDS_SQL = { '42P01': 'Database not up to date. Run the SQL migration …fuel_usage_records.sql in Supabase.', PGRST205: 'Database not up to date. Run the SQL migration …fuel_usage_records.sql in Supabase.' }

export async function listFuelRecords(companyId) {
  const { data, error } = await supabase
    .from(FUEL_RECORDS)
    .select('*')
    .eq('company_id', companyId)
    .order('record_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(10000)
  if (error) throw friendly(error, RECORDS_SQL)
  return data || []
}

export async function saveFuelRecord(companyId, { id, ...fields }) {
  const q = id ? supabase.from(FUEL_RECORDS).update(fields).eq('id', id) : supabase.from(FUEL_RECORDS).insert({ company_id: companyId, ...fields })
  const { error } = await q
  if (error) throw friendly(error, RECORDS_SQL)
}

export async function deleteFuelRecord(id) {
  const { error } = await supabase.from(FUEL_RECORDS).delete().eq('id', id)
  if (error) throw friendly(error, RECORDS_SQL)
}

// Diesel price per litre by date (company tank): RM of a record = litres x the price in force on its date.
const DIESEL_PRICES = 'machinery_diesel_prices'
/** Prices of a company, newest first ([] before the fuel_usage_merge migration). */
export async function listDieselPrices(companyId) {
  const { data, error } = await supabase.from(DIESEL_PRICES).select('*').eq('company_id', companyId).order('effective_from', { ascending: false })
  if (error) {
    if (['42P01', 'PGRST205'].includes(error.code)) return []
    throw friendly(error)
  }
  return data || []
}
export async function saveDieselPrice(companyId, { effective_from, price }) {
  const { error } = await supabase.from(DIESEL_PRICES).upsert({ company_id: companyId, effective_from, price }, { onConflict: 'company_id,effective_from' })
  if (error) throw friendly(error, { '42P01': 'Database not up to date. Run the SQL migration …fuel_usage_merge.sql in Supabase.', PGRST205: 'Database not up to date. Run the SQL migration …fuel_usage_merge.sql in Supabase.' })
}
export async function deleteDieselPrice(id) {
  const { error } = await supabase.from(DIESEL_PRICES).delete().eq('id', id)
  if (error) throw friendly(error)
}
/** The price in force on a date: the newest one dated on or before it (prices newest first), else null. */
export const dieselPriceOn = (prices, date) => {
  const p = prices.find((x) => x.effective_from <= date)
  return p ? Number(p.price) : null
}

// Meter photos taken in the mobile view: private bucket, <company>/<user>/<uuid>.jpg
const RECORD_PHOTOS = 'machinery_fuel_record_photos'
export async function uploadRecordPhoto(companyId, userId, file) {
  const upload = await compressReceipt(file)
  if (!upload.type.startsWith('image/')) throw new Error('Please take a photo.')
  if (upload.size > 10 * 1024 * 1024) throw new Error('The photo is too big (max 10 MB).')
  const ext = upload.type === 'image/png' ? 'png' : upload.type === 'image/webp' ? 'webp' : 'jpg'
  const path = `${companyId}/${userId}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from(RECORD_PHOTOS).upload(path, upload, { contentType: upload.type })
  if (error) throw new Error('Could not upload the photo. Please try again.')
  return path
}
export function removeRecordPhoto(path) {
  if (path) supabase.storage.from(RECORD_PHOTOS).remove([path]).catch(() => {})
}
export async function openRecordPhoto(path) {
  const { data, error } = await supabase.storage.from(RECORD_PHOTOS).createSignedUrl(path, 60)
  if (error || !data) throw new Error('Could not open the photo.')
  window.open(data.signedUrl, '_blank', 'noopener')
}

/** Meter unit of a machine: hours for machines served per hour, else km. */
export const meterUnit = (m) => (/hour/i.test(m?.service_unit || '') ? 'h' : 'km')

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
  if (error) throw friendly(error, { '23503': 'This card has fill-ups or reloads recorded, so it cannot be deleted. Set it to Inactive instead (Edit in Fleet card details).' })
}

// ---- automatic top-up requests (migration 20261220) ------------------------------
/** Procurement: switch a card's automatic top-up request on / off with its amounts and the
 * requestor (the Procurement person the requests are sent as; migration 20261228). */
export async function setAutoTopup(cardId, on, min, max, requester, amount) {
  const num = (v) => (v === '' || v == null ? null : round(v, 2))
  const args = { p_card: cardId, p_on: on, p_min: num(min), p_max: num(max), p_requester: requester || null, p_amount: num(amount) }
  const { error } = await supabase.rpc('machinery_set_auto_topup', args)
  if (error) {
    if (['PGRST202', '42883'].includes(error.code)) throw new Error('Run the SQL migrations 20261229 (card min / max balance) and 20261230 (top-up amount) first.')
    throw friendly(error)
  }
}
/** The Procurement people of a company (user ids); null before migration 20261228. */
export async function procurementPeople(companyId) {
  const { data, error } = await supabase.rpc('machinery_procurement_people', { p_company: companyId })
  return error ? null : (data || []).map((r) => r.user_id)
}
/** Why a card's automatic top-up request was / was not sent: { balance, card_status, waiting }; null before migration 20261226. */
export async function autoTopupStatus(cardId) {
  const { data, error } = await supabase.rpc('machinery_auto_topup_status', { p_card: cardId })
  return error ? null : data
}
/** Check the cards of a company and send the automatic top-up requests that are due (quietly). */
export function autoTopupCheck(companyId) {
  return supabase.rpc('machinery_auto_topup_check', { p_company: companyId }).then(({ data }) => data || 0, () => 0)
}

// ---- fleet card top-up requests ----------------------------------------------
// Request (Pending) → an approver of the requester approves / rejects → the
// approved request is printed for the office → Topped up → the reload is
// claimed on a fuel claim. See migration 20261206120000_fleet_card_topup_requests.sql.
export const TOPUPS = 'machinery_fleet_topup_requests'
export const TOPUP_STATUS = {
  pending: { label: 'Pending for approval', color: 'amber' },
  approved: { label: 'Pending for reimbursement', color: 'green' },
  rejected: { label: 'Rejected', color: 'red' },
  cancelled: { label: 'Cancelled', color: 'slate' },
  topped_up: { label: 'Topped up', color: 'blue' }
}
export const topupNo = (r) => `TU-${String(r.request_no ?? '').padStart(4, '0')}`

/** One fleet card's usage in a month ('YYYY-MM'), claimed or not; null before migration 20261211 or without access. */
export async function cardMonthUsage(companyId, cardId, month) {
  const { data, error } = await supabase.rpc('machinery_card_month_usage', { p_company: companyId, p_card: cardId, p_month: month })
  if (error) return null
  return data
}

/** Fuel Manage main page: the fleet cards the signed-in person drives, with this month's quota / use and the latest purchases; null before migration 20261210. */
export async function myFleetCards(companyId) {
  const { data, error } = await supabase.rpc('machinery_my_fleet_cards', { p_company: companyId })
  if (error) return null
  return data || []
}

/** Fuel Manage task bar: reminders worked out in the database ({ unclaimed_fills }); {} before migration 20261216. */
export async function myFuelTasks(companyId) {
  const { data, error } = await supabase.rpc('machinery_my_fuel_tasks', { p_company: companyId })
  if (error) return {}
  return data || {}
}

/** The top-up requests the signed-in user may see (own, as approver, card managers); null before the migration. */
export async function listTopups(companyId) {
  const { data, error } = await supabase.from(TOPUPS).select('*').eq('company_id', companyId).order('requested_at', { ascending: false }).limit(500)
  if (error) {
    if (['42P01', 'PGRST205'].includes(error.code)) return null
    throw friendly(error)
  }
  return data || []
}
export async function requestTopup(companyId, { card_id, amount, needed_by, reason }) {
  const { error } = await supabase
    .from(TOPUPS)
    .insert({ company_id: companyId, card_id, amount: round(amount, 2), needed_by: needed_by || null, reason: reason?.trim() || null })
  if (error) throw friendly(error)
}
export async function decideTopup(id, approve, note) {
  const { error } = await supabase.rpc('machinery_topup_decide', { p_id: id, p_approve: approve, p_note: note || null })
  if (error && /status_check/.test(error.message || '')) throw new Error('The database does not accept Draft claims yet: run the SQL 20261221 (repair claim drafts), then approve again.')
  if (error) throw friendly(error)
}
/** Undo an approve / reject of a top-up request (back to Pending; an unsubmitted top-up claim is removed). */
export async function undoTopup(id) {
  const { error } = await supabase.rpc('machinery_topup_undo', { p_id: id })
  if (error) {
    if (['PGRST202', '42883'].includes(error.code)) throw new Error('Run the SQL migration 20261225 (top-up undo) first.')
    throw friendly(error)
  }
}
export async function cancelTopup(id) {
  const { error } = await supabase.rpc('machinery_topup_cancel', { p_id: id })
  if (error) throw friendly(error)
}
export async function topupDone(id, date) {
  const { error } = await supabase.rpc('machinery_topup_done', { p_id: id, p_date: date || null })
  if (error) throw friendly(error)
}

export async function addReload(companyId, row) {
  const { error } = await supabase.from(DIESEL.reloads).insert({ company_id: companyId, ...row })
  if (error) throw friendly(error)
}

/** Change a fill-up added by hand (litres, RM). */
export async function updateUsage(id, patch) {
  const { error } = await supabase.from(DIESEL.usage).update(patch).eq('id', id)
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

// ---- fleet card statement (Setel) import ----------------------------------

/** Statement rows (normalized, see supabase/functions/_shared/statement.js) → saved on the cards of this company. */
export async function importStatement(companyId, rows) {
  const { data, error } = await supabase.rpc('machinery_import_card_transactions', { p_rows: rows, p_source: 'setel', p_company: companyId })
  if (error) throw friendly(error)
  return data
}

/** The latest statement imports that touched this company (AI agent or upload); null before migration 20261212. */
export async function lastImports(companyId, limit = 5) {
  const { data, error } = await supabase
    .from('machinery_card_imports')
    .select('*')
    .contains('company_ids', [companyId])
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) return null
  return data
}

// ---- fleet card web login password (locked table, migration 20261213) ------

/** The password, for the Procurement role only (the database refuses anyone else). */
export async function cardPassword(cardId) {
  const { data, error } = await supabase.rpc('machinery_card_password', { p_card: cardId })
  if (error) throw friendly(error)
  return data || ''
}

/** Set ('' clears) the password; whoever may edit the card. */
export async function setCardPassword(cardId, password) {
  const { error } = await supabase.rpc('machinery_set_card_password', { p_card: cardId, p_password: password })
  if (error) throw friendly(error)
}
