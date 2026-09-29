# MJM Machinery Portal

Company portal (HQ admin login) → **Machinery** module → **Incoming Photos** (WhatsApp) and a link to **MachTrek**.

MachTrek is a separate app and is **not modified** by this repo. Both use the **same Supabase project**; everything here uses new, `machinery_`-prefixed objects.

## Stack (same as MachTrek)

React 18 + Vite 5 (plain JSX), Tailwind, React Router (HashRouter), `@supabase/supabase-js`. UI kit, icons and page header are copied from MachTrek so the look matches. Static hosting on GitHub Pages via `.github/workflows/deploy.yml`; every push to `main` deploys.

The WhatsApp webhook is a **Supabase Edge Function** (`supabase/functions/whatsapp-webhook`), because GitHub Pages cannot run server code.

## How a photo flows

1. Phone → WhatsApp Cloud API test number → Meta POSTs to the Edge Function.
2. Function checks `X-Hub-Signature-256` (HMAC with the app secret). Bad signature → 401.
3. Each message is inserted into `machinery_whatsapp_messages` (unique `wa_message_id`) **before** replying 200. DB error → 500 so Meta retries.
4. Images from allowlisted senders are downloaded via the Media API and uploaded to the private bucket `machinery_whatsapp_photos` (`YYYY/MM/<message-id>.jpg`).
5. After a successful save, "Photo received" is sent back. A send failure is recorded in `ack_status` / `ack_error`; the photo stays saved.
6. Non-image messages and non-allowlisted senders are stored with status `ignored` (logged only, no reply).
7. Duplicate deliveries: a row is only processed when it can be atomically claimed from `received`/`failed` (max 5 attempts), so a saved photo is never downloaded or acknowledged twice. A failed save is retried when Meta redelivers.

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

### 2. Edge Function
```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>        # same project as MachTrek
cp supabase/functions/.env.example supabase/functions/.env  # fill in locally, never commit
npx supabase secrets set --env-file supabase/functions/.env
npx supabase functions deploy whatsapp-webhook --no-verify-jwt
```
Webhook URL: `https://<your-project-ref>.supabase.co/functions/v1/whatsapp-webhook`

Replace the expiring Meta token: edit `WHATSAPP_ACCESS_TOKEN` in `supabase/functions/.env` and run `npx supabase secrets set --env-file supabase/functions/.env` again (or edit it in Supabase → Edge Functions → Secrets). No redeploy needed.

Logs: Supabase → Edge Functions → whatsapp-webhook → Logs.

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
