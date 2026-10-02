-- =====================================================================
-- MJM Portal · Super admins, company profile (area) and blocks
-- Target: the SAME Supabase project as MachTrek. Safe to run more than once.
--
-- How to run: Supabase dashboard → SQL Editor → paste this whole file → Run.
-- Run 20260929…, 20261002… and 20261003… first.
--
-- Super admins manage companies (create/delete, rename, CMMS 2 access,
-- WhatsApp numbers). Every portal admin can edit a company's profile (area)
-- and its blocks.
-- =====================================================================

-- 1) Super admin flag. The first time this runs, everyone who is already a
--    portal admin becomes a super admin (they set the portal up).
alter table public.machinery_portal_admins
  add column if not exists is_super_admin boolean not null default false;

update public.machinery_portal_admins
   set is_super_admin = true
 where not exists (select 1 from public.machinery_portal_admins where is_super_admin);

create or replace function public.is_machinery_super_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.machinery_portal_admins where user_id = auth.uid() and is_super_admin);
$$;
revoke all on function public.is_machinery_super_admin() from public, anon;
grant execute on function public.is_machinery_super_admin() to authenticated;

-- 2) Company profile: total planted area.
alter table public.machinery_companies
  add column if not exists area_ha numeric(12, 2);

-- Companies: every portal admin reads and may update the profile; only super
-- admins create/delete or change name, CMMS 2 access and WhatsApp numbers.
drop policy if exists "companies_admin_all" on public.machinery_companies;
drop policy if exists "companies_admin_read" on public.machinery_companies;
drop policy if exists "companies_admin_update" on public.machinery_companies;
drop policy if exists "companies_super_insert" on public.machinery_companies;
drop policy if exists "companies_super_delete" on public.machinery_companies;

create policy "companies_admin_read" on public.machinery_companies
  for select to authenticated using (public.is_machinery_portal_admin());
create policy "companies_admin_update" on public.machinery_companies
  for update to authenticated
  using (public.is_machinery_portal_admin()) with check (public.is_machinery_portal_admin());
create policy "companies_super_insert" on public.machinery_companies
  for insert to authenticated with check (public.is_machinery_super_admin());
create policy "companies_super_delete" on public.machinery_companies
  for delete to authenticated using (public.is_machinery_super_admin());

create or replace function public.machinery_companies_guard()
returns trigger language plpgsql
set search_path = public
as $$
begin
  -- The Edge Function / SQL editor (no signed-in user) is not restricted.
  if auth.uid() is not null and not public.is_machinery_super_admin() and (
       new.name is distinct from old.name
    or new.cmms_enabled is distinct from old.cmms_enabled
    or new.whatsapp_numbers is distinct from old.whatsapp_numbers) then
    raise exception 'Only a super admin can change the company name, CMMS 2 access or WhatsApp numbers'
      using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists machinery_companies_guard on public.machinery_companies;
create trigger machinery_companies_guard
  before update on public.machinery_companies
  for each row execute function public.machinery_companies_guard();

-- 3) Blocks of a company (estate blocks with their area).
create table if not exists public.machinery_company_blocks (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.machinery_companies (id) on delete cascade,
  name        text not null,
  area_ha     numeric(12, 2),
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index if not exists machinery_company_blocks_name_key
  on public.machinery_company_blocks (company_id, lower(name));

drop trigger if exists machinery_company_blocks_touch on public.machinery_company_blocks;
create trigger machinery_company_blocks_touch
  before update on public.machinery_company_blocks
  for each row execute function public.machinery_touch_updated_at();

alter table public.machinery_company_blocks enable row level security;
revoke all on public.machinery_company_blocks from anon, authenticated;
grant select, insert, update, delete on public.machinery_company_blocks to authenticated;

drop policy if exists "blocks_admin_all" on public.machinery_company_blocks;
create policy "blocks_admin_all" on public.machinery_company_blocks
  for all to authenticated
  using (public.is_machinery_portal_admin())
  with check (public.is_machinery_portal_admin());

-- Shows the admins and whether they are super admins.
select email, is_super_admin from public.machinery_portal_admins order by email;
