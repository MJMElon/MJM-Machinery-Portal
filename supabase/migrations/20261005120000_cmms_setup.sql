-- =====================================================================
-- MJM Portal · CMMS 2 set-up: user access, machinery profile, suppliers,
-- supplier + sent-out date on cases.
-- Target: the SAME Supabase project as MachTrek. Safe to run more than once.
--
-- How to run: Supabase dashboard → SQL Editor → paste this whole file → Run.
-- Run the earlier migrations (20260929…, 20261002…, 20261003…, 20261004…) first.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Which company a WhatsApp number belongs to (same rule as the portal:
--    the company whose WhatsApp numbers contain it; first by name).
-- ---------------------------------------------------------------------
create or replace function public.machinery_company_of_number(p_wa_from text)
returns uuid
language sql stable security definer
set search_path = public
as $$
  select id from public.machinery_companies
   where p_wa_from = any (whatsapp_numbers)
   order by name
   limit 1;
$$;
revoke all on function public.machinery_company_of_number(text) from public, anon;
grant execute on function public.machinery_company_of_number(text) to authenticated;

-- ---------------------------------------------------------------------
-- 2) CMMS user access per company. Super admins can do everything; other
--    portal users only what is switched on for them here.
-- ---------------------------------------------------------------------
create table if not exists public.machinery_cmms_members (
  company_id  uuid not null references public.machinery_companies (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  can_solve   boolean not null default true,   -- mark cases solved / reopen
  can_edit    boolean not null default true,   -- edit case machine, problem, supplier, sent-out date
  can_delete  boolean not null default false,  -- delete cases
  can_manage  boolean not null default false,  -- edit machinery profile + supplier list
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (company_id, user_id)
);

drop trigger if exists machinery_cmms_members_touch on public.machinery_cmms_members;
create trigger machinery_cmms_members_touch
  before update on public.machinery_cmms_members
  for each row execute function public.machinery_touch_updated_at();

alter table public.machinery_cmms_members enable row level security;
revoke all on public.machinery_cmms_members from anon, authenticated;
grant select, insert, update, delete on public.machinery_cmms_members to authenticated;

drop policy if exists "cmms_members_read" on public.machinery_cmms_members;
create policy "cmms_members_read" on public.machinery_cmms_members
  for select to authenticated
  using (user_id = auth.uid() or public.is_machinery_super_admin());
drop policy if exists "cmms_members_super_write" on public.machinery_cmms_members;
create policy "cmms_members_super_write" on public.machinery_cmms_members
  for all to authenticated
  using (public.is_machinery_super_admin())
  with check (public.is_machinery_super_admin());

create or replace function public.machinery_cmms_can(p_company uuid, p_action text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.is_machinery_super_admin() or exists (
    select 1 from public.machinery_cmms_members m
     where m.company_id = p_company and m.user_id = auth.uid()
       and case p_action
             when 'solve'  then m.can_solve
             when 'edit'   then m.can_edit
             when 'delete' then m.can_delete
             when 'manage' then m.can_manage
             else false
           end);
$$;
revoke all on function public.machinery_cmms_can(uuid, text) from public, anon;
grant execute on function public.machinery_cmms_can(uuid, text) to authenticated;

-- Super admins see every portal user (to set their access) and can add or
-- remove portal users by e-mail. The login itself must already exist
-- (Supabase → Authentication → Users, or the MachTrek HQ admin login).
drop policy if exists "portal_admins_super_read" on public.machinery_portal_admins;
create policy "portal_admins_super_read" on public.machinery_portal_admins
  for select to authenticated using (public.is_machinery_super_admin());

create or replace function public.machinery_add_portal_user(p_email text)
returns public.machinery_portal_admins
language plpgsql security definer
set search_path = public
as $$
declare
  a public.machinery_portal_admins;
begin
  if not public.is_machinery_super_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  insert into public.machinery_portal_admins (user_id, email)
  select id, email from auth.users where lower(email) = lower(trim(p_email))
  on conflict (user_id) do update set email = excluded.email
  returning * into a;
  if a.user_id is null then
    raise exception 'No login with this e-mail yet. Create it first in Supabase → Authentication → Users.'
      using errcode = 'P0002';
  end if;
  return a;
end $$;
revoke all on function public.machinery_add_portal_user(text) from public, anon;
grant execute on function public.machinery_add_portal_user(text) to authenticated;

create or replace function public.machinery_remove_portal_user(p_user uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.is_machinery_super_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_user = auth.uid() then
    raise exception 'You cannot remove yourself.' using errcode = '42501';
  end if;
  delete from public.machinery_cmms_members where user_id = p_user;
  delete from public.machinery_portal_admins where user_id = p_user;
end $$;
revoke all on function public.machinery_remove_portal_user(uuid) from public, anon;
grant execute on function public.machinery_remove_portal_user(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 3) Machinery profile and supplier / workshop list (per company).
-- ---------------------------------------------------------------------
create table if not exists public.machinery_machines (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.machinery_companies (id) on delete cascade,
  name          text not null,          -- code / name used in WhatsApp, e.g. EX-03
  machine_type  text,                   -- excavator, tractor, lorry, …
  brand         text,
  model         text,
  reg_no        text,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index if not exists machinery_machines_name_key on public.machinery_machines (company_id, lower(name));

create table if not exists public.machinery_suppliers (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.machinery_companies (id) on delete cascade,
  name            text not null,
  contact_person  text,
  phone           text,
  services        text,                 -- what they do: hydraulics, tyres, engine, …
  machine_ids     uuid[] not null default '{}',  -- machines they handle (used to propose a supplier)
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create unique index if not exists machinery_suppliers_name_key on public.machinery_suppliers (company_id, lower(name));

do $$
declare t text;
begin
  foreach t in array array['machinery_machines', 'machinery_suppliers'] loop
    execute format('drop trigger if exists %1$s_touch on public.%1$s', t);
    execute format('create trigger %1$s_touch before update on public.%1$s
                    for each row execute function public.machinery_touch_updated_at()', t);
    execute format('alter table public.%s enable row level security', t);
    execute format('revoke all on public.%s from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%s to authenticated', t);
    execute format('drop policy if exists "%1$s_read" on public.%1$s', t);
    execute format('create policy "%1$s_read" on public.%1$s for select to authenticated
                    using (public.is_machinery_portal_admin())', t);
    execute format('drop policy if exists "%1$s_manage" on public.%1$s', t);
    execute format('create policy "%1$s_manage" on public.%1$s for all to authenticated
                    using (public.machinery_cmms_can(company_id, ''manage''))
                    with check (public.machinery_cmms_can(company_id, ''manage''))', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 4) Cases: linked machine, chosen supplier and the date the job was sent out.
--    All case changes now go through RPCs that check the user's access.
-- ---------------------------------------------------------------------
alter table public.machinery_cases
  add column if not exists machine_id  uuid references public.machinery_machines (id) on delete set null,
  add column if not exists supplier_id uuid references public.machinery_suppliers (id) on delete set null,
  add column if not exists sent_at     date;

drop policy if exists "cases_admin_edit" on public.machinery_cases;
revoke update on public.machinery_cases from authenticated;

create or replace function public.machinery_update_case(
  p_id uuid, p_machine_id uuid, p_machine_name text, p_problem text, p_supplier_id uuid, p_sent_at date)
returns public.machinery_cases
language plpgsql security definer
set search_path = public
as $$
declare
  c public.machinery_cases;
begin
  select * into c from public.machinery_cases where id = p_id;
  if c.id is null then
    raise exception 'case not found' using errcode = 'P0002';
  end if;
  if not public.machinery_cmms_can(public.machinery_company_of_number(c.wa_from), 'edit') then
    raise exception 'You do not have edit access for this company.' using errcode = '42501';
  end if;
  update public.machinery_cases
     set machine_id   = p_machine_id,
         machine_name = nullif(trim(coalesce(p_machine_name, '')), ''),
         problem      = nullif(trim(coalesce(p_problem, '')), ''),
         supplier_id  = p_supplier_id,
         sent_at      = p_sent_at
   where id = p_id
  returning * into c;
  return c;
end $$;
revoke all on function public.machinery_update_case(uuid, uuid, text, text, uuid, date) from public, anon;
grant execute on function public.machinery_update_case(uuid, uuid, text, text, uuid, date) to authenticated;

create or replace function public.machinery_set_case_solved(p_id uuid, p_solved boolean)
returns public.machinery_cases
language plpgsql security definer
set search_path = public
as $$
declare
  c public.machinery_cases;
begin
  select * into c from public.machinery_cases where id = p_id;
  if c.id is null then
    raise exception 'case not found' using errcode = 'P0002';
  end if;
  if not public.machinery_cmms_can(public.machinery_company_of_number(c.wa_from), 'solve') then
    raise exception 'You do not have solve access for this company.' using errcode = '42501';
  end if;
  update public.machinery_cases
     set status          = case when p_solved then 'solved' else 'pending' end,
         solved_at       = case when p_solved then now() else null end,
         solved_by       = case when p_solved then auth.uid() else null end,
         solved_by_email = case when p_solved then (select email from auth.users where id = auth.uid()) else null end
   where id = p_id
  returning * into c;
  return c;
end $$;

create or replace function public.machinery_delete_case(p_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  c public.machinery_cases;
begin
  select * into c from public.machinery_cases where id = p_id;
  if c.id is null then
    return;
  end if;
  if not public.machinery_cmms_can(public.machinery_company_of_number(c.wa_from), 'delete') then
    raise exception 'You do not have delete access for this company.' using errcode = '42501';
  end if;
  -- The case's WhatsApp messages go with it (photo files stay in storage).
  delete from public.machinery_whatsapp_messages where case_id = p_id;
  delete from public.machinery_cases where id = p_id;
end $$;
revoke all on function public.machinery_delete_case(uuid) from public, anon;
grant execute on function public.machinery_delete_case(uuid) to authenticated;

-- Shows the portal users and whether they are super admins.
select email, is_super_admin from public.machinery_portal_admins order by email;
