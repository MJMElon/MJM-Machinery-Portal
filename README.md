# CMMS 2 (MJM Machinery Portal)

Company portal opened from **MJM Intranet** (the Intranet): people log in there and the portal is one of its icons
(no login page here, see [Sign-in](#sign-in-from-mjm-intranet-only-no-login-page)); the top bar has an "MJM Intranet" link back. The **company switcher** (top left) picks the company you work in;
companies are listed under their **business**, with the same names and codes as in MJM Intranet. The main page shows
that company's modules:

- **Machinery Manage** (CMMS 2 access per company):
  - **Maintenance Work Manage**: numbered cases from the worker app and WhatsApp, in three types (repair request, repair done, service request), Pending / Solved. Four figures on top (machines stopped, waiting for office, late service, repair cost this month), a type filter, and each case's next step as a button: Approve & send (service request → WhatsApp to the workshop that handles the machine), Send out, Mark solved, Add cost & solve. CSV export. The consolidate button shows every company's pending cases at once.
  - **Worker CMMS** (`#/app`, see [Worker CMMS](#worker-cmms-for-site-workers)) holds the worker forms. Machine Service & Maintenance, for people with "Send requests from the mobile app": *Need a mechanic* (machine, problem, still working / stopped, photos or video, hour meter), *I fixed something* (hour meter, part, what was done, parts used, before / after photos, stopped from / fixed on) and *Request a service* (hour meter checked against the machine's service schedule: 50 hr or 500 km either side of the due reading; too early cannot be sent). The service schedule (Service every, Last service at / date) is on each machine in Machinery Profile and moves on when a service request is solved. App cases carry their company as `wa_from = 'app:<company id>'`.
  - **Supplier Workshop List**: suppliers/workshops and the machines each handles (suppliers that handle a case's machine are proposed first).
  - **Machinery Profile**: the company's machines **and vehicles** (fuel, tank, usual driver, KPDN diesel subsidy tick).
  - **CMMS User Setting**: per company, Machinery Manage rights (Solve, Edit, Delete, Manage lists) and Diesel Manage rights (Access, Cash Claim, Report, Admin). Also where display names are set.
  - The main page shows the modules as square icons: Machinery Manage, Diesel Manage, Settings.
  - **MachTrek** link.
- **Fuel Manage** (per company) — the Intranet's Diesel Claims module, now per company (see [Fuel Manage](#fuel-manage-was-diesel-manage)). Opens on five draggable square buttons.
- **Settings** → the selected company's profile (total area), its **locations** (plantations / estates / sites under the company; each machine in Machinery Profile can be put under one, and the listing filters by location) and its blocks (name, area, notes).
- **Settings** also holds, for super admins, the company's staff WhatsApp numbers (a case belongs to the company whose numbers include the sender; unknown senders show as "Unassigned numbers") and the "Sync from MJM Intranet" button. Businesses, companies and **which company has which module** all come from MJM Intranet; there is no company admin page in the portal.

## Worker CMMS (for site workers)

`…/MJM-Machinery-Portal/#/app` is a stand-alone phone app inside this project, opened from the **Worker CMMS** icon
on the CMMS 2 main page. It has its own slim header and two modules, and shows no office pages, module windows or
settings; it shares the login, database and code with CMMS 2.

| Module | Link | What it does | Needs (Role setup) |
| --- | --- | --- | --- |
| **Diesel Usage Record** | `#/app/fuel` | The diesel-taken form: photo of the pump meter, machine, litres | Fuel Usage Record → Add records |
| **Machine Service & Maintenance** | `#/app/service` | Need a mechanic, I fixed something, Request a service (`#/app/repair/<kind>`), and "Your requests" | Maintenance Work Manage → Send requests from the mobile app |

The header has a language button (English / Bahasa Melayu) and a bright / dark mode button; both are remembered on
the phone (`src/pages/worker/prefs.jsx` holds the Malay texts; dark colours are in `src/index.css` under `.wk-dark`).
What is saved to the database (problem, part, what was done) stays in English. A module the person has no rights for is greyed out on the start screen. The **Mobile view** buttons of the office
pages open their own module directly in a new tab: Fuel Usage Record → Diesel Usage Record, Maintenance Work Manage →
Machine Service & Maintenance. The old links (`#/cmms/work/mobile`, `#/diesel/records/mobile`) lead there too.

A separate icon in MJM Intranet for workers can be added later: an Icon of kind **Link** with URL
`…/MJM-Machinery-Portal/#/app` and access **2 · Token**, its API key saved in this Supabase project as the Edge
Function secret `GW_API_KEY_<ICON CODE>` ("-" → "_").

## Businesses and companies (same as MJM Intranet)

Master data mirrors the Intranet so both systems name things alike:

| MJM Intranet | This portal |
| --- | --- |
| Business (`gw_groups`) | `machinery_businesses` |
| Company (`gw_companies`: code, short name, registration no.) | `machinery_companies` (+ `code`, `short_name`, `registration_no`, `is_active`) |
| Business ↔ Company (`gw_business_companies`, many-to-many) | `machinery_business_companies` |

The two systems use **different Supabase projects**, so the portal keeps a copy that is **synced from MJM Intranet**:
every sign-in from the Intranet (`gw-login`) and the "Sync from MJM Intranet" button (`sync-intranet`) pull the
businesses, companies and links from the Intranet's `gw-master-data` function (same API key) and apply them with
`machinery_apply_intranet_master()`. Names, codes, status and business links follow the Intranet (those fields are
read-only here); module access, WhatsApp numbers and area are set here. Companies removed in the Intranet become
inactive here. The Intranet side registers the portal as an Icon by SQL (`gw_register_system`, see the Intranet repo).

## Fuel Manage (was Diesel Manage)

Ported from the Intranet's Diesel Claims module, per company. Opens on a page of five square module buttons
(also in the left sidebar); "Back to CMMS main page" returns to the portal home.

| Module | What it holds | Who |
| --- | --- | --- |
| **Fuel Claims** | A year dashboard (litres per month, subsidised vs non-subsidised; RM per month, cash vs fleet card) and the claim list (No. · Description · Claim amount · Action: view / edit / print / delete), latest first. A claim is a **document with receipt rows**: submission date, company, name, totals; a drop zone for receipt photos (each photo becomes a row, read in the browser by Tesseract.js and attached to that row; the figures are a draft to check) or rows typed by hand; per row: vehicle (optional), receipt date, receipt no., litres, unit price, amount, payment (cash = claim back, fleet card = recorded only), subsidy tick, remark, attachment. **Payable = cash rows only.** The claim page prints as a claim form with the receipts; reviewers Approve / Reject / Mark paid | claims: view add edit delete · view_all approve pay |
| **Fuel Usage** | Every fill-up of the company in one log (cash claims not rejected + fleet card fill-ups) by month and vehicle, totals, CSV. Admins record fleet card fill-ups here | Report / Admin |
| **Fuel Usage Record** | The log of fuel issued to machines from the company's own tank: date, machine, litres, issued by, remark. Location follows the machine (Machinery Profile); the list filters by month, location and machine, totals litres by location and exports CSV. **In Worker CMMS** (`#/app/fuel`, Diesel Usage Record): a phone form for site workers — photo of the pump meter (the number-wheel window is found in the photo and read by Tesseract.js as whole litres; a draft the worker checks), machine, litres, Send; the date is today and the photo is kept with the record (bucket `machinery_fuel_record_photos`). A worker with only Add sees the phone form and their own entries | fuel_record: view add edit delete |
| **Fleet Card Manage** | Fuel cards (balance = reloads − fill-ups, monthly limit), reloads, and the **KPDN diesel subsidy vehicles**: vehicles ticked in Machinery Profile that apply for the subsidised-diesel fleet card, with or without a card yet | Report / Admin |
| **Report** | Per month: totals, by vehicle (cash vs card, km/L, over-tank flags), by driver, CSV | Report / Admin |

**Vehicles are machines.** There is no separate vehicle list: Machinery Manage → Machinery Profile holds machines and
vehicles together (`machinery_machines`, with fuel type, tank size, usual driver, "KPDN diesel subsidy" tick and
active flag). Claims, cards and fill-ups point at that list.

## Access: one permission matrix per user and company

Settings → **Role setup** lists the people with access to the selected company; Edit opens their
access screen: a big title per module, each section with **View / Add / Edit / Delete** and, where it matters, the
important actions (`machinery_user_perms`, checked in the database by `machinery_can(company, section, action)`):

| Module | Section | Actions | Important actions |
| --- | --- | --- | --- |
| Machinery Manage | Maintenance Work Manage (`work`) | view add (send requests from the mobile app) edit delete | solve / close case, send to supplier |
| | Machinery Profile (`machines`) | view add edit delete | |
| | Supplier Workshop List (`suppliers`) | view add edit delete | |
| Fuel Manage | Fuel Claims (`claims`) | view add edit delete (own claims) | see all users' claims, approve / reject, mark paid |
| | Fuel Usage (`usage`) | view add delete | |
| | Fuel Usage Record (`fuel_record`) | view add edit delete | |
| | Fleet Card Manage (`cards`) | view add edit delete | |
| | Report (`report`) | view | |

Super admins can do everything. Who may use CMMS 2 / Fuel Manage at all is decided in MJM Intranet (Module access on
the two Icons); the sync pre-creates those people here (`intranet_cmms` / `intranet_fuel` on `machinery_portal_admins`),
so they appear in Role setup before their first sign-in. An approver can be limited to named people
(`perms.approve_for`, checked by `machinery_claim_reviewable()`); people with "see all users' claims" + "mark paid" are
the account role that prepares payment. Receipts: photos are read with Tesseract.js (after a grayscale / contrast
clean-up); PDFs use their text layer (pdf.js), falling back to reading the rendered page.

Rules (enforced in the database): a reviewer cannot review their own claim (super admins can); the reviewer and time
are recorded automatically; approved claims can no longer be edited by the claimant; the vehicle, card and claim must be
in the same company. Receipts are compressed on the phone (max 1600 px) and kept in the private bucket
`machinery_diesel_receipts/<company>/<user>/…`, opened with 60-second links by the owner, Report users and admins.

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

## Case workflow (Solve window)

The Solve icon on a pending case opens: **1. Open case** (what was reported), **2. Action** (official WhatsApp messages to the supplier from the company number, and internal notes, as one thread) and **3. Close case** (milestones with date/time, closing remark, Close case). Messages are sent by the `case-action` Edge Function (deployed by the same GitHub workflow), which checks the user's edit access and logs every send in `machinery_case_actions`.

WhatsApp only allows free text to people who messaged the business number in the last 24 hours. To reach any supplier, create an approved message template with one body variable `{{1}}` and set the Supabase secret `WHATSAPP_SUPPLIER_TEMPLATE` (template name; optional `WHATSAPP_TEMPLATE_LANG`, default `en`). A failed send is logged with the reason and offers "Open in my WhatsApp".

Hold a case number for 3 seconds to pin it to the top (max 3 per company); hold again to unpin.

## Sign-in: from MJM Intranet only (no login page)

The portal has **no login page**. People log in at **MJM Intranet** (the Intranet) and open the portal from its icon;
anyone who comes to the portal URL directly (no session) is sent to MJM Intranet to log in there first.

How it works (MJM Intranet's "level 2 · Token" hand-off, see `MJM-Intranet/docs/integration.md`):

1. MJM Intranet checks the person may use the portal icon, then opens `https://…/MJM-Machinery-Portal/?gw_token=<60-second token>`.
2. The portal posts the token to its `gw-login` Edge Function, which redeems it at MJM Intranet's `gw-check-access`
   (server to server, with the icon's API key; each token works once).
3. `gw-login` makes sure the person has a login in this Supabase project (created on first visit, no e-mail sent),
   adds / updates them in `machinery_portal_admins` (e-mail and display name from MJM Intranet), and returns a one-time
   magic-link token hash; the browser turns it into a normal Supabase session (`verifyOtp`).
4. From then on the portal works as before: RLS, super admins, per-company access. Log out = sign out + back to MJM Intranet.

Set-up (once):

- MJM Intranet → Master Manage → Module: add the portal as an Icon (kind **Link**, URL = the portal address,
  access **2 · Token**), tag it with the businesses that use it, and **Generate API key** (shown once).
- Supabase (this project) → Edge Functions → Secrets: `GW_API_KEY` = that key. A second Intranet Icon that deep-links
  into this portal (the "Diesel Manage" Icon, code `DIESEL`, URL `…/MJM-Machinery-Portal/#/diesel`) has its own key:
  `GW_API_KEY_DIESEL`. In general `GW_API_KEY_<ICON CODE>` ("-" → "_"). Optional `GW_CHECK_ACCESS_URL` if
  MJM Intranet moves project. Then deploy the functions (GitHub → Actions → Deploy WhatsApp webhook → Run workflow;
  it deploys `gw-login` too).
- MJM Intranet → User & Group Manage → Module access: tick Access on the portal icon for the people who may use it.
  Who is a portal **super admin** is still set in the database (`machinery_portal_admins.is_super_admin`).

Access rules inside the portal:

- The account must be in `machinery_portal_admins` (the Supabase project is shared with other apps, so "any logged-in
  user" is not enough); `gw-login` adds it automatically for people arriving from MJM Intranet.
- RLS: portal admins can read messages and sign photo URLs (10-minute signed URLs). The browser cannot insert/update/delete;
  "Mark Reviewed" goes through the `machinery_set_whatsapp_reviewed` RPC, which records the real reviewer.
- MachTrek operators/site admins (PIN logins) have no access, since they are not Supabase users.
- Development (`npm run dev`) only: `/#/login` shows a developer e-mail/password form so the portal can be worked on
  without MJM Intranet. It is not in the production build.

## Future linking

`company_id`, `machine_id`, `job_id` (uuid, nullable, no foreign keys yet) are on every message row, matching the id type of `workrecords_companies` / `workrecords_machines`.

## Setup / deploy

### 1. Database (once)
Edit the e-mail in section 5 of `supabase/migrations/20260929120000_whatsapp_photo_inbox.sql`, then paste the whole file into **Supabase → SQL Editor** and Run. The final `select` must list your admin. Safe to re-run.

Then do the same, in order, with:
- `supabase/migrations/20261002120000_companies.sql` (companies)
- `supabase/migrations/20261003120000_cases.sql` (cases; also puts earlier messages into cases)
- `supabase/migrations/20261004120000_company_admin.sql` (super admins, company area, blocks).
- `supabase/migrations/20261005120000_cmms_setup.sql` (CMMS user access, machinery profile, suppliers, supplier + sent-out date on cases; case changes go through access-checked functions). The first run makes every existing portal admin a super admin; later admins are added as normal admins (`update machinery_portal_admins set is_super_admin = true where email = '…'` to promote).
- `supabase/migrations/20261006120000_case_workflow.sql` (case timeline: messages to suppliers, notes, closed/reopened milestones; pinned cases).
- `supabase/migrations/20261107120000_businesses.sql` (businesses, business ↔ company links, company code / short name / registration no. / active, Diesel Manage access flag, user display names).
- `supabase/migrations/20261108120000_diesel.sql` (Diesel Manage: members, claims, fleet cards, reloads, card fill-ups, access functions, RLS, receipts bucket).
- `supabase/migrations/20261109120000_vehicles_into_machines.sql` (vehicles live in `machinery_machines`: fuel type, tank, usual driver, KPDN diesel subsidy tick, active flag; drops the old Diesel vehicle table; `machinery_portal_people()` for drop-downs).
- `supabase/migrations/20261110120000_fuel_claims_intranet_sync.sql` (running claim number per company; `intranet_id` on businesses / companies and `machinery_apply_intranet_master()` for the sync from MJM Intranet).
- `supabase/migrations/20261111120000_permissions_matrix.sql` (permission matrix `machinery_user_perms` + `machinery_can()`, finer RLS per section, fuel claims without a vehicle, module access per company from the Intranet's Icon tags).
- `supabase/migrations/20261112120000_fuel_claim_lines.sql` (a fuel claim is a header + receipt lines `machinery_diesel_claim_lines`; totals and payable amount kept by trigger; existing claims become one-line claims).
- `supabase/migrations/20261113120000_claim_approvers_intranet_users.sql` (named approvers `machinery_claim_reviewable()`, Intranet Icon access flags on portal users, `machinery_apply_intranet_users()`).
- `supabase/migrations/20261202120000_repair_maintenance.sql` (case types, cases from the mobile app `machinery_submit_case`, approve / solve with cost, service schedule on machines, bucket `machinery_case_files`).
- `supabase/migrations/20261201120000_fuel_record_mobile.sql` (meter photo on a fuel record, photo bucket, workers read their own entries).
- `supabase/migrations/20261129120000_fuel_usage_records.sql` (Fuel Usage Record: `machinery_fuel_records`, permission section `fuel_record`).
- `supabase/migrations/20261124120000_company_locations.sql` (locations of a company `machinery_company_locations`, and `location_id` on `machinery_machines`).

Then link the portal to MJM Intranet (API key → `GW_API_KEY` secret), see [Sign-in](#sign-in-from-mjm-intranet-only-no-login-page).

All are safe to re-run.

### 2. Edge Function (no terminal)
Deployed by GitHub Actions (`.github/workflows/deploy-webhook.yml`).

1. Supabase → your avatar → **Account preferences → Access Tokens → Generate new token**. Copy it.
2. GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**: name `SUPABASE_ACCESS_TOKEN`, paste the token.
3. GitHub → **Actions → Deploy WhatsApp webhook → Run workflow**. The run summary shows the webhook URL:
   `https://<project-ref>.supabase.co/functions/v1/whatsapp-webhook`
4. Supabase → **Edge Functions → Secrets** → add each (see `supabase/functions/.env.example` for where to find them):
   `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ALLOWED_NUMBERS`,
   and `GW_API_KEY` (sign-in from MJM Intranet).
   `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are provided automatically.

Replace the expiring Meta token: Supabase → Edge Functions → Secrets → edit `WHATSAPP_ACCESS_TOKEN`. No redeploy needed.

Later code changes to `supabase/functions/**` redeploy automatically on push to `main`.

Logs: Supabase → Edge Functions → whatsapp-webhook → Logs.

(Terminal alternative: `npx supabase secrets set --env-file supabase/functions/.env` and `npx supabase functions deploy whatsapp-webhook --no-verify-jwt`.)

### 3. Web portal
```bash
npm install
cp .env.example .env     # public Supabase URL + anon key (same as MachTrek); VITE_INTRANET_URL = MJM Intranet
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
