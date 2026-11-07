-- =====================================================================
-- >>> RUN THIS IN THE **MACHINERY PORTAL** DATABASE <<<
-- >>> Supabase project qcvbzzdbbqmnrljfnxjp (shared with MachTrek)   <<<
-- >>> NOT the MJM Intranet database (briqzyxfxsvulyizzbiu)            <<<
-- Supabase dashboard → (Machinery project) → SQL Editor → paste all → Run.
-- =====================================================================
-- =====================================================================
-- MJM Portal · Businesses and company master data (same structure as
-- MJM Intranet: Business → Company, a company can sit under
-- more than one business), Diesel Manage access flag, user display names.
-- Target: the SAME Supabase project as MachTrek. Safe to run more than once.
--
-- How to run: Supabase dashboard → SQL Editor → paste this whole file → Run.
-- Run the earlier migrations (20260929… to 20261006…) first.
--
-- Mirrors the Intranet's master data so the two systems can use the same
-- names and codes:
--   gw_groups              → machinery_businesses
--   gw_companies           → machinery_companies (+ code, short_name,
--                            registration_no, is_active)
--   gw_business_companies  → machinery_business_companies
-- =====================================================================

-- 1) Businesses (the Intranet calls gw_groups "Business").
create table if not exists public.machinery_businesses (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (char_length(btrim(name)) between 1 and 100),
  description  text check (char_length(description) <= 300),
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create unique index if not exists machinery_businesses_name_key on public.machinery_businesses (lower(name));

drop trigger if exists machinery_businesses_touch on public.machinery_businesses;
create trigger machinery_businesses_touch
  before update on public.machinery_businesses
  for each row execute function public.machinery_touch_updated_at();

-- A company can belong to several businesses (same as the Intranet).
create table if not exists public.machinery_business_companies (
  business_id  uuid not null references public.machinery_businesses (id) on delete cascade,
  company_id   uuid not null references public.machinery_companies (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (business_id, company_id)
);
create index if not exists machinery_business_companies_company_idx
  on public.machinery_business_companies (company_id);

-- 2) Company master data, same fields as the Intranet's Company.
alter table public.machinery_companies
  add column if not exists code            text,
  add column if not exists short_name      text,
  add column if not exists registration_no text,
  add column if not exists is_active       boolean not null default true,
  add column if not exists diesel_enabled  boolean not null default false;  -- access to Diesel Manage

alter table public.machinery_companies drop constraint if exists machinery_companies_code_check;
alter table public.machinery_companies
  add constraint machinery_companies_code_check check (code is null or code ~ '^[A-Z0-9][A-Z0-9_-]{1,19}$');
alter table public.machinery_companies drop constraint if exists machinery_companies_short_name_check;
alter table public.machinery_companies
  add constraint machinery_companies_short_name_check check (short_name is null or char_length(short_name) <= 40);
alter table public.machinery_companies drop constraint if exists machinery_companies_registration_no_check;
alter table public.machinery_companies
  add constraint machinery_companies_registration_no_check
  check (registration_no is null or char_length(registration_no) <= 40);
create unique index if not exists machinery_companies_code_key on public.machinery_companies (code) where code is not null;

-- 3) Display name of a portal user (shown in Diesel Manage lists and reports).
alter table public.machinery_portal_admins
  add column if not exists full_name text;
alter table public.machinery_portal_admins drop constraint if exists machinery_portal_admins_full_name_check;
alter table public.machinery_portal_admins
  add constraint machinery_portal_admins_full_name_check check (full_name is null or char_length(full_name) <= 80);

-- 4) RLS: every portal admin reads businesses; only super admins change them.
alter table public.machinery_businesses enable row level security;
alter table public.machinery_business_companies enable row level security;
revoke all on public.machinery_businesses, public.machinery_business_companies from anon, authenticated;
grant select, insert, update, delete on public.machinery_businesses, public.machinery_business_companies to authenticated;

drop policy if exists "businesses_admin_read" on public.machinery_businesses;
create policy "businesses_admin_read" on public.machinery_businesses
  for select to authenticated using (public.is_machinery_portal_admin());
drop policy if exists "businesses_super_write" on public.machinery_businesses;
create policy "businesses_super_write" on public.machinery_businesses
  for all to authenticated
  using (public.is_machinery_super_admin()) with check (public.is_machinery_super_admin());

drop policy if exists "business_companies_admin_read" on public.machinery_business_companies;
create policy "business_companies_admin_read" on public.machinery_business_companies
  for select to authenticated using (public.is_machinery_portal_admin());
drop policy if exists "business_companies_super_write" on public.machinery_business_companies;
create policy "business_companies_super_write" on public.machinery_business_companies
  for all to authenticated
  using (public.is_machinery_super_admin()) with check (public.is_machinery_super_admin());

-- 5) Only a super admin may change the master data / module access of a
--    company (other portal admins still edit the profile: area, blocks).
create or replace function public.machinery_companies_guard()
returns trigger language plpgsql
set search_path = public
as $$
begin
  -- The Edge Function / SQL editor (no signed-in user) is not restricted.
  if auth.uid() is not null and not public.is_machinery_super_admin() and (
       new.name is distinct from old.name
    or new.code is distinct from old.code
    or new.short_name is distinct from old.short_name
    or new.registration_no is distinct from old.registration_no
    or new.is_active is distinct from old.is_active
    or new.cmms_enabled is distinct from old.cmms_enabled
    or new.diesel_enabled is distinct from old.diesel_enabled
    or new.whatsapp_numbers is distinct from old.whatsapp_numbers) then
    raise exception 'Only a super admin can change the company master data, module access or WhatsApp numbers'
      using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists machinery_companies_guard on public.machinery_companies;
create trigger machinery_companies_guard
  before update on public.machinery_companies
  for each row execute function public.machinery_companies_guard();

-- 6) Display name: a super admin sets anyone's; a user may set their own.
create or replace function public.machinery_set_user_name(p_user uuid, p_name text)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if p_user <> auth.uid() and not public.is_machinery_super_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.machinery_portal_admins
     set full_name = nullif(trim(coalesce(p_name, '')), '')
   where user_id = p_user;
end $$;
revoke all on function public.machinery_set_user_name(uuid, text) from public, anon;
grant execute on function public.machinery_set_user_name(uuid, text) to authenticated;

-- Shows the businesses and their companies.
select b.name as business, c.code, c.name as company
  from public.machinery_businesses b
  left join public.machinery_business_companies bc on bc.business_id = b.id
  left join public.machinery_companies c on c.id = bc.company_id
 order by b.sort_order, b.name, c.name;
