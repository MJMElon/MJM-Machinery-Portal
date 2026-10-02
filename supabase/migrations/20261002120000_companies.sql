-- =====================================================================
-- MJM Portal · Companies (CMMS 2 access + WhatsApp numbers)
-- Target: the SAME Supabase project as MachTrek. New objects only
-- (machinery_ prefix). Safe to run more than once.
--
-- How to run: Supabase dashboard → SQL Editor → paste this whole file → Run.
-- Run 20260929120000_whatsapp_photo_inbox.sql first (it creates
-- is_machinery_portal_admin()).
-- =====================================================================

-- A company that can use the portal's modules. A WhatsApp message belongs to
-- the company whose `whatsapp_numbers` contains the sender's number.
create table if not exists public.machinery_companies (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  cmms_enabled     boolean not null default false,   -- access to the CMMS 2 module
  whatsapp_numbers text[] not null default '{}',     -- staff numbers, digits incl. country code
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create unique index if not exists machinery_companies_name_key on public.machinery_companies (lower(name));

drop trigger if exists machinery_companies_touch on public.machinery_companies;
create trigger machinery_companies_touch
  before update on public.machinery_companies
  for each row execute function public.machinery_touch_updated_at();

-- Portal admins manage companies from the browser. No anon access.
alter table public.machinery_companies enable row level security;
revoke all on public.machinery_companies from anon, authenticated;
grant select, insert, update, delete on public.machinery_companies to authenticated;

drop policy if exists "companies_admin_all" on public.machinery_companies;
create policy "companies_admin_all" on public.machinery_companies
  for all to authenticated
  using (public.is_machinery_portal_admin())
  with check (public.is_machinery_portal_admin());

-- Shows the companies (empty the first time).
select id, name, cmms_enabled, whatsapp_numbers from public.machinery_companies order by name;
