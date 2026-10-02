# MJM Machinery Portal

Company portal (HQ admin login):

- **CMMS 2** → **Maintenance Work Manage** (WhatsApp texts + photos as cases, Pending / Solved tabs, per company; the consolidate button shows every company's pending cases at once) and a link to **MachTrek**.
- **Company Settings** → create companies, switch on CMMS 2 access, and list each company's staff WhatsApp numbers. A WhatsApp case belongs to the company whose numbers include the sender; unknown senders show as "Unassigned numbers".

MachTrek is a separate app and is **not modified** by this repo. Both use the **same Supabase project**; everything here uses new, `machinery_`-prefixed objects.

## Stack (same as MachTrek)

React 18 + Vite 5 (plain JSX), Tailwind, React Router (HashRouter), `@supabase/supabase-js`. UI kit, icons and page header are copied from MachTrek so the look matches. Static hosting on GitHub Pages via `.github/workflows/deploy.yml`; every push to `main` deploys.

The WhatsApp webhook is a **Supabase Edge Function** (`supabase/functions/whatsapp-webhook`), because GitHub Pages cannot run server code.

## How a WhatsApp message flows

1. Phone → WhatsApp Cloud API test number → Meta POSTs to the Edge Function.
2. Function checks `X-Hub-Signature-256` (HMAC with the app secret). Bad signature → 401.
3. Each message is inserted into `machinery_whatsapp_messages` (unique `wa_message_id`) **before** replying 200. DB error → 500 so Meta retries.
4. Images from allowlisted senders are downloaded via the Media API and uploaded to the private bucket `machinery_whatsapp_photos` (`YYYY/MM/<message-id>.jpg`).
   Text messages from allowlisted senders are saved too; the text goes in the `caption` column.
5. The message is put in a **case** (see below) and the sender gets a reply: "✅ Case #12 created …" for a new report, or "📷 Photo / 📝 Update added to case #12". A send failure is recorded in `ack_status` / `ack_error`; the photo stays saved.
6. Other message types (video, voice, documents, …) and non-allowlisted senders are stored with status `ignored` (logged only, no reply).
7. Duplicate deliveries: a row is only processed when it can be atomically claimed from `received`/`failed` (max 5 attempts), so a saved message is never downloaded or acknowledged twice. A failed save is retried when Meta redelivers.

## Cases (CMMS 2)

A case groups the WhatsApp texts and photos about one breakdown (`machinery_cases`, one row per case, numbered #1, #2, …). For each saved message the webhook picks the case in this order:

1. The message is a WhatsApp **reply** to our case message (or to any message already in a case) → that case.
2. The text or caption mentions a **case number**: `#12`, `case 12`, `case no: 12`, `MR-12` → that case.
3. A **photo without caption** from someone who added to a pending case in the last 30 minutes → that case.
4. Otherwise a **new case** is opened. Machine and problem are read from the text: `EX-03 hydraulic leak`, `TR 11 - flat tyre`, or `Machine: …` / `Problem: …` lines (also `Mesin:` / `Masalah:`). Anything else becomes the problem; both can be edited on the portal.

Portal: CMMS 2 → Maintenance Work Manage lists cases (Case No. · Machine · Problem · Photo · Sent by) under Pending / Solved; the case page shows all photos and messages, edits machine/problem, and marks it solved.

## Access rules

- Sign in with the same Supabase Auth email/password as MachTrek's **HQ admin**.
- The account must also be in `machinery_portal_admins` (the Supabase project is shared with other apps, so "any logged-in user" is not enough).
- RLS: portal admins can read messages and sign photo URLs (10-minute signed URLs). The browser cannot insert/update/delete; "Mark Reviewed" goes through the `machinery_set_whatsapp_reviewed` RPC, which records the real reviewer.
- MachTrek operators/site admins (PIN logins) have no access, since they are not Supabase users.

## Future linking

`company_id`, `machine_id`, `job_id` (uuid, nullable, no foreign keys yet) are on every message row, matching the id type of `workrecords_companies` / `workrecords_machines`.

## Setup / deploy

### 1. Database (once)
Edit the e-mail in section 5 of `supabase/migrations/20260929120000_whatsapp_photo_inbox.sql`, then paste the whole file into **Supabase → SQL Editor** and Run. The final `select` must list your admin. Safe to re-run.

Then do the same, in order, with `supabase/migrations/20261002120000_companies.sql` (companies for Settings / CMMS 2) and `supabase/migrations/20261003120000_cases.sql` (cases; also puts earlier messages into cases). All are safe to re-run.

### 2. Edge Function (no terminal)
Deployed by GitHub Actions (`.github/workflows/deploy-webhook.yml`).

1. Supabase → your avatar → **Account preferences → Access Tokens → Generate new token**. Copy it.
2. GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**: name `SUPABASE_ACCESS_TOKEN`, paste the token.
3. GitHub → **Actions → Deploy WhatsApp webhook → Run workflow**. The run summary shows the webhook URL:
   `https://<project-ref>.supabase.co/functions/v1/whatsapp-webhook`
4. Supabase → **Edge Functions → Secrets** → add each (see `supabase/functions/.env.example` for where to find them):
   `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ALLOWED_NUMBERS`.
   `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are provided automatically.

Replace the expiring Meta token: Supabase → Edge Functions → Secrets → edit `WHATSAPP_ACCESS_TOKEN`. No redeploy needed.

Later code changes to `supabase/functions/**` redeploy automatically on push to `main`.

Logs: Supabase → Edge Functions → whatsapp-webhook → Logs.

(Terminal alternative: `npx supabase secrets set --env-file supabase/functions/.env` and `npx supabase functions deploy whatsapp-webhook --no-verify-jwt`.)

### 3. Web portal
```bash
npm install
cp .env.example .env     # public Supabase URL + anon key (same as MachTrek)
npm run dev
npm run build            # the build check
```
GitHub: create the empty repo, push `main`, then Settings → Pages → Source: GitHub Actions. `.env.production` holds only public values.

## Checks
```bash
npm run build
npm run test:webhook     # needs Deno; runs without network
npm run check:webhook
```
