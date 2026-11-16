// Supabase Edge Function: email about a fuel claim.
//
// The portal calls it (supabase.functions.invoke('claim-notify', { body: { claim_id } }))
// right after a claim is submitted or reviewed. What is sent depends on the
// claim as it is now in the database, not on what the browser says:
//   pending,  called by the claimant  → "New fuel claim to approve" to the
//                                        claimant's approvers (Claim approval
//                                        setting → Claims approved by)
//   approved, called by the reviewer  → "approved" to the claimant, and
//                                        "ready to pay" to the accountants
//   rejected, called by the reviewer  → "rejected" (with the reason) to the claimant
//   paid,     called by the accountant → "paid" to the claimant
// Each message goes out once (table machinery_claim_notifications).
//
// Secrets (Supabase → Edge Functions → Secrets):
//   RESEND_API_KEY   API key from resend.com (no key = nothing is sent)
//   MAIL_FROM        sender, e.g. "CMMS 2 <cmms@puigroups.com>" (domain verified in Resend)
//   APP_URL          optional; default https://mjmelon.github.io/MJM-Machinery-Portal/
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.

import { createClient } from 'npm:@supabase/supabase-js@2'

const env = (k: string) => (Deno.env.get(k) ?? '').trim()
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

type Person = { user_id: string; email: string | null; full_name: string | null }
type Perms = { claims?: string[]; approve_for?: string[] }

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)
const rm = (n: number) => `RM ${n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const day = (d: string | null) => {
  if (!d) return ''
  const [y, m, dd] = d.slice(0, 10).split('-').map(Number)
  return `${dd} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]} ${y}`
}

function page(o: { heading: string; intro: string; rows: [string, string][]; note?: string; button: string; link: string; company: string }) {
  const rows = o.rows
    .map(([k, v]) => `<tr><td style="padding:6px 12px 6px 0;color:#64748b">${esc(k)}</td><td style="padding:6px 0;font-weight:600;color:#0f172a">${esc(v)}</td></tr>`)
    .join('')
  return `<!doctype html><html><body style="margin:0;background:#eef2f7;font-family:Arial,Helvetica,sans-serif">
<div style="max-width:520px;margin:24px auto;background:#fff;border-radius:14px;padding:28px">
<p style="margin:0 0 4px;font-size:12px;letter-spacing:2px;color:#94a3b8">CMMS 2 · ${esc(o.company)}</p>
<h1 style="margin:0 0 12px;font-size:20px;color:#0f172a">${esc(o.heading)}</h1>
<p style="margin:0 0 16px;color:#334155;font-size:14px">${esc(o.intro)}</p>
<table style="border-collapse:collapse;font-size:14px;margin-bottom:16px">${rows}</table>
${o.note ? `<p style="margin:0 0 16px;padding:10px 12px;background:#fef2f2;border-radius:8px;color:#991b1b;font-size:14px">${esc(o.note)}</p>` : ''}
<a href="${esc(o.link)}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600;font-size:14px">${esc(o.button)}</a>
</div></body></html>`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return reply({ error: 'POST only' }, 405)
  const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } })

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const { data: auth } = await db.auth.getUser(token)
  const me = auth?.user
  if (!me) return reply({ error: 'Not signed in' }, 401)

  let claimId = ''
  try {
    claimId = String((await req.json())?.claim_id ?? '')
  } catch {
    // empty body
  }
  if (!/^[0-9a-f-]{36}$/i.test(claimId)) return reply({ error: 'claim_id missing' }, 400)

  const { data: claim } = await db.from('machinery_diesel_claims').select('*').eq('id', claimId).maybeSingle()
  if (!claim) return reply({ error: 'Claim not found' }, 404)

  // Which message, and is the caller the one who caused it?
  let event = ''
  let stamp = ''
  if (claim.status === 'pending' && claim.claimant_id === me.id) {
    event = 'submitted'
    stamp = String(claim.created_at)
  } else if (['approved', 'rejected', 'paid'].includes(claim.status) && claim.reviewed_by === me.id) {
    event = claim.status
    stamp = String(claim.reviewed_at)
  } else return reply({ sent: 0, skipped: 'nothing to send' })

  const apiKey = env('RESEND_API_KEY')
  const from = env('MAIL_FROM')
  if (!apiKey || !from) return reply({ sent: 0, skipped: 'email not set up (RESEND_API_KEY / MAIL_FROM)' })

  const [{ data: company }, { data: lines }, { data: permRows }, { data: people }] = await Promise.all([
    db.from('machinery_companies').select('code, name, short_name').eq('id', claim.company_id).maybeSingle(),
    db.from('machinery_diesel_claim_lines').select('litres, amount, payment, line_kind').eq('claim_id', claimId),
    db.from('machinery_user_perms').select('user_id, perms').eq('company_id', claim.company_id),
    db.from('machinery_portal_admins').select('user_id, email, full_name'),
  ])
  const person = new Map((people as Person[] ?? []).map((p) => [p.user_id, p]))
  const nameOf = (id: string | null) => (id && (person.get(id)?.full_name || person.get(id)?.email)) || 'Someone'
  const emailOf = (id: string) => person.get(id)?.email || null
  const has = (p: Perms, a: string) => Array.isArray(p?.claims) && p.claims.includes(a)
  const perms = (permRows ?? []) as { user_id: string; perms: Perms }[]

  // Totals of the claim
  const ls = (lines ?? []) as { litres: number | null; amount: number | null; payment: string; line_kind: string | null }[]
  const litres = ls.reduce((s, l) => s + Number(l.litres || 0), 0)
  const payable = ls.length
    ? ls.filter((l) => l.payment !== 'fleet_card' || l.line_kind === 'reload').reduce((s, l) => s + Number(l.amount || 0), 0)
    : Number(claim.payable_amount ?? claim.amount ?? 0)
  const no = claim.claim_no != null ? String(claim.claim_no).padStart(3, '0') : ''
  const companyName = company?.name || ''
  const appUrl = (env('APP_URL') || 'https://mjmelon.github.io/MJM-Machinery-Portal/').replace(/#.*$/, '')
  const link = (path: string) => `${appUrl}${company?.code ? `?gw_company=${encodeURIComponent(company.code)}` : ''}#${path}`
  const claimant = nameOf(claim.claimant_id)
  const rows: [string, string][] = [
    ['Claim', `#${no}`],
    ['Claimant', claimant],
    ['Submitted', day(claim.submitted_on || claim.fill_date)],
    ['Receipts', String(ls.length)],
    ['Litres', `${litres.toFixed(2)} L`],
    ['Claim payable', rm(payable)],
  ]

  // Messages: [user ids, subject, html]
  const mails: [string[], string, string][] = []
  if (event === 'submitted') {
    const approvers = perms
      .filter((r) => r.user_id !== claim.claimant_id && has(r.perms, 'approve') && (r.perms.approve_for ?? []).includes(claim.claimant_id))
      .map((r) => r.user_id)
    mails.push([
      approvers,
      `New fuel claim #${no} from ${claimant} to approve`,
      page({ company: companyName, heading: 'New fuel claim to approve', intro: `${claimant} has submitted a fuel claim. You are their approver.`, rows, button: 'Review claim', link: link(`/diesel/claims/${claimId}?from=review`) }),
    ])
  } else {
    const by = nameOf(claim.reviewed_by)
    const word = event === 'approved' ? 'approved' : event === 'rejected' ? 'rejected' : 'paid'
    mails.push([
      [claim.claimant_id],
      `Your fuel claim #${no} was ${word}`,
      page({
        company: companyName,
        heading: `Fuel claim #${no} ${word}`,
        intro: event === 'paid' ? `Your fuel claim has been marked paid by ${by}.` : `Your fuel claim was ${word} by ${by}.`,
        rows,
        note: event === 'rejected' && claim.review_note ? `Reason: ${claim.review_note}` : undefined,
        button: 'Open claim',
        link: link(`/diesel/claims/${claimId}`),
      }),
    ])
    if (event === 'approved') {
      const accountants = perms.filter((r) => r.user_id !== claim.claimant_id && has(r.perms, 'pay')).map((r) => r.user_id)
      mails.push([
        accountants,
        `Fuel claim #${no} of ${claimant} approved, ready to pay ${rm(payable)}`,
        page({ company: companyName, heading: 'Approved fuel claim ready to pay', intro: `${by} approved this claim of ${claimant}.`, rows, button: 'Open To pay', link: link('/diesel/claims/review') }),
      ])
    }
  }

  // Once only per claim + event + time of that change
  const { data: logged, error: logErr } = await db
    .from('machinery_claim_notifications')
    .insert({ claim_id: claimId, event, stamp })
    .select('id')
  if (logErr) {
    if (logErr.code === '23505') return reply({ sent: 0, skipped: 'already sent' })
    return reply({ error: `log: ${logErr.message}` }, 500)
  }

  let sent = 0
  const failed: string[] = []
  const to: string[] = []
  for (const [ids, subject, html] of mails) {
    for (const id of [...new Set(ids)]) {
      const email = emailOf(id)
      if (!email) continue
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: [email], subject, html }),
      })
      if (r.ok) {
        sent++
        to.push(email)
      } else failed.push(`${email}: ${r.status} ${(await r.text()).slice(0, 200)}`)
    }
  }
  if (logged?.[0]?.id) await db.from('machinery_claim_notifications').update({ recipients: to, errors: failed.length ? failed : null }).eq('id', logged[0].id)
  return reply({ sent, failed })
})
