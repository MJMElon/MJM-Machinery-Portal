-- =====================================================================
-- >>> RUN THIS IN THE **MACHINERY PORTAL** DATABASE <<<
-- >>> Supabase project qcvbzzdbbqmnrljfnxjp (shared with MachTrek)   <<<
-- >>> NOT the MJM Intranet database (briqzyxfxsvulyizzbiu)            <<<
-- Needs all earlier migrations. Safe to run more than once.
-- =====================================================================
-- Company access comes from MJM Intranet.
--
--   MJM Intranet decides WHICH company and WHICH module a person gets: the
--   Companies HR allocated them to, in the Businesses where the module's Icon
--   is opened for them (in a Business but no Company yet = no company).
--   CMMS 2 User Access / User setting only decides WHAT they may do there.
--
-- So, for everyone but super admins:
--   * a right (claims, work, machines, cards, …) only works in a company the
--     Intranet gives them for that module (Machinery Manage: work / machines /
--     suppliers; Fuel Manage: claims / usage / cards / report / fuel_record /
--     topup); rights set for any other company do nothing;
--   * they only see those companies (switcher, machines, suppliers, cases,
--     WhatsApp photos, people lists, businesses, blocks, locations);
--   * changing company details, blocks and locations needs a module admin of
--     that company.
--
-- The per-person company list is filled by the Intranet sync (gw-login /
-- sync-intranet) into machinery_user_companies. Until the first sync with
-- company lists has run for a module, that module keeps working as before.
-- Also: machinery_apply_renewal can no longer be called from outside.

-- ---------------------------------------------------------------------
-- 1) Who may use which company, per module (written only by the sync)
-- ---------------------------------------------------------------------
create table if not exists public.machinery_user_companies (
  user_id    uuid not null references auth.users (id) on delete cascade,
  company_id uuid not null references public.machinery_companies (id) on delete cascade,
  module     text not null check (module in ('cmms', 'fuel')),
  synced_at  timestamptz not null default now(),
  primary key (user_id, company_id, module)
);
create index if not exists machinery_user_companies_company_idx on public.machinery_user_companies (company_id, module);
alter table public.machinery_user_companies enable row level security;
revoke all on public.machinery_user_companies from anon, authenticated;
grant select on public.machinery_user_companies to authenticated;
drop policy if exists "user_companies_read" on public.machinery_user_companies;
create policy "user_companies_read" on public.machinery_user_companies for select to authenticated
  using (user_id = auth.uid() or public.is_machinery_super_admin());

-- A module is "scoped" once the sync has delivered its company lists.
create table if not exists public.machinery_company_scope (
  module    text primary key check (module in ('cmms', 'fuel')),
  synced_at timestamptz not null default now()
);
alter table public.machinery_company_scope enable row level security;
revoke all on public.machinery_company_scope from anon, authenticated;

create or replace function public.machinery_scope_on(p_module text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.machinery_company_scope where module = p_module);
$$;
revoke all on function public.machinery_scope_on(text) from public, anon;
grant execute on function public.machinery_scope_on(text) to authenticated;

-- Which module a section belongs to (null = not module-bound)
create or replace function public.machinery_section_module(p_section text)
returns text
language sql immutable
as $$
  select case
    when p_section in ('work', 'machines', 'suppliers') then 'cmms'
    when p_section in ('claims', 'usage', 'cards', 'report', 'fuel_record', 'topup') then 'fuel'
    else null end;
$$;

-- May the signed-in user use p_company in p_module (null = in any module)?
create or replace function public.machinery_in_company(p_company uuid, p_module text default null)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.is_machinery_super_admin()
      or case
           when p_module is null then
             exists (select 1 from public.machinery_user_companies uc where uc.user_id = auth.uid() and uc.company_id = p_company)
             or (public.is_machinery_portal_admin()
                 and not (public.machinery_scope_on('cmms') and public.machinery_scope_on('fuel')))
           when not public.machinery_scope_on(p_module) then true
           else exists (select 1 from public.machinery_user_companies uc
                         where uc.user_id = auth.uid() and uc.company_id = p_company and uc.module = p_module)
         end;
$$;
revoke all on function public.machinery_in_company(uuid, text) from public, anon;
grant execute on function public.machinery_in_company(uuid, text) to authenticated;

-- The sync writes the lists: { "cmms": [{user_id, company_ids:[Intranet company ids]}], "fuel": [...] }
create or replace function public.machinery_apply_intranet_user_companies(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  m text;
  n int;
  out jsonb := '{}'::jsonb;
begin
  foreach m in array array['cmms', 'fuel'] loop
    continue when jsonb_typeof(p -> m) is distinct from 'array';
    delete from public.machinery_user_companies where module = m;
    insert into public.machinery_user_companies (user_id, company_id, module)
    select distinct (u ->> 'user_id')::uuid, c.id, m
      from jsonb_array_elements(p -> m) u
      cross join lateral jsonb_array_elements_text(coalesce(u -> 'company_ids', '[]'::jsonb)) cid
      join public.machinery_companies c on c.intranet_id::text = cid
     where (u ->> 'user_id') is not null
       and exists (select 1 from auth.users au where au.id = (u ->> 'user_id')::uuid);
    get diagnostics n = row_count;
    insert into public.machinery_company_scope (module, synced_at) values (m, now())
    on conflict (module) do update set synced_at = excluded.synced_at;
    out := out || jsonb_build_object(m, n);
  end loop;
  return out;
end $$;
revoke all on function public.machinery_apply_intranet_user_companies(jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 2) Rights only inside the person's companies
-- ---------------------------------------------------------------------
create or replace function public.machinery_can(p_company uuid, p_section text, p_action text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.is_machinery_super_admin()
      or (public.machinery_in_company(p_company, public.machinery_section_module(p_section))
          and (exists (select 1 from public.machinery_user_perms up
                        where up.company_id = p_company and up.user_id = auth.uid() and (up.perms -> p_section) ? p_action)
               or (public.machinery_icon_perms(p_company, auth.uid()) -> p_section) ? p_action));
$$;
revoke all on function public.machinery_can(uuid, text, text) from public, anon;
grant execute on function public.machinery_can(uuid, text, text) to authenticated;

-- The signed-in user's matrix for a company (what the pages use): sections of
-- a module the person may not use in this company are left out.
create or replace function public.machinery_my_perms(p_company uuid)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare v jsonb := '{}'::jsonb; k text; icon jsonb; cmms_ok boolean; fuel_ok boolean;
begin
  select up.perms into v from public.machinery_user_perms up where up.company_id = p_company and up.user_id = auth.uid();
  v := coalesce(v, '{}'::jsonb);
  icon := public.machinery_icon_perms(p_company, auth.uid());
  for k in select jsonb_object_keys(icon) loop
    v := jsonb_set(v, array[k], (select coalesce(jsonb_agg(distinct x), '[]'::jsonb)
                                   from (select jsonb_array_elements(coalesce(v -> k, '[]'::jsonb) || (icon -> k)) x) s));
  end loop;
  if public.is_machinery_super_admin() then
    return v;
  end if;
  cmms_ok := public.machinery_in_company(p_company, 'cmms');
  fuel_ok := public.machinery_in_company(p_company, 'fuel');
  if not cmms_ok then
    v := v - 'work' - 'machines' - 'suppliers';
    v := jsonb_set(v, '{admin}', coalesce((select jsonb_agg(x) from jsonb_array_elements_text(coalesce(v -> 'admin', '[]'::jsonb)) x where x <> 'machinery'), '[]'::jsonb));
  end if;
  if not fuel_ok then
    v := v - 'claims' - 'usage' - 'cards' - 'report' - 'fuel_record' - 'topup' - 'approve_for' - 'topup_approve_for';
    v := jsonb_set(v, '{admin}', coalesce((select jsonb_agg(x) from jsonb_array_elements_text(coalesce(v -> 'admin', '[]'::jsonb)) x where x <> 'fuel'), '[]'::jsonb));
  end if;
  if jsonb_array_length(coalesce(v -> 'admin', '[]'::jsonb)) = 0 then
    v := v - 'admin';
  end if;
  return v;
end $$;
revoke all on function public.machinery_my_perms(uuid) from public, anon;
grant execute on function public.machinery_my_perms(uuid) to authenticated;

-- Module admin only in companies of that module
create or replace function public.machinery_module_admin(p_company uuid, p_module text default null)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.is_machinery_super_admin() or exists (
    select 1 from public.machinery_user_perms up
     where up.company_id = p_company and up.user_id = auth.uid()
       and jsonb_typeof(up.perms -> 'admin') = 'array'
       and (case when p_module is null then
                   ((up.perms -> 'admin') ? 'machinery' and public.machinery_in_company(p_company, 'cmms'))
                   or ((up.perms -> 'admin') ? 'fuel' and public.machinery_in_company(p_company, 'fuel'))
                 else (up.perms -> 'admin') ? p_module
                      and public.machinery_in_company(p_company, case p_module when 'machinery' then 'cmms' else p_module end)
            end));
$$;
revoke all on function public.machinery_module_admin(uuid, text) from public, anon;
grant execute on function public.machinery_module_admin(uuid, text) to authenticated;

-- Approvers of claims / top-up requests only in their Fuel Manage companies
create or replace function public.machinery_claim_approver(p_company uuid, p_claimant uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.is_machinery_super_admin() or (public.machinery_in_company(p_company, 'fuel') and exists (
    select 1 from public.machinery_user_perms up
     where up.company_id = p_company and up.user_id = auth.uid()
       and (up.perms -> 'claims') ? 'approve'
       and (jsonb_typeof(up.perms -> 'approve_for') is distinct from 'array'
            or jsonb_array_length(up.perms -> 'approve_for') = 0
            or (up.perms -> 'approve_for') ? p_claimant::text)));
$$;
revoke all on function public.machinery_claim_approver(uuid, uuid) from public, anon;
grant execute on function public.machinery_claim_approver(uuid, uuid) to authenticated;

create or replace function public.machinery_topup_approver(p_company uuid, p_requester uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.is_machinery_super_admin() or (public.machinery_in_company(p_company, 'fuel') and exists (
    select 1 from public.machinery_user_perms up
     where up.company_id = p_company and up.user_id = auth.uid()
       and (up.perms -> 'topup') ? 'approve'
       and (jsonb_typeof(up.perms -> 'topup_approve_for') is distinct from 'array'
            or jsonb_array_length(up.perms -> 'topup_approve_for') = 0
            or (up.perms -> 'topup_approve_for') ? p_requester::text)));
$$;
revoke all on function public.machinery_topup_approver(uuid, uuid) from public, anon;
grant execute on function public.machinery_topup_approver(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 3) Only see your own companies (these rules let every portal user see
--    every company before)
-- ---------------------------------------------------------------------
-- Companies (switcher); details changed by a module admin of that company
drop policy if exists "companies_admin_read" on public.machinery_companies;
create policy "companies_admin_read" on public.machinery_companies for select to authenticated
  using (public.machinery_in_company(id));
drop policy if exists "companies_admin_update" on public.machinery_companies;
create policy "companies_admin_update" on public.machinery_companies for update to authenticated
  using (public.machinery_module_admin(id)) with check (public.machinery_module_admin(id));

-- Businesses: only those with one of your companies
drop policy if exists "businesses_admin_read" on public.machinery_businesses;
create policy "businesses_admin_read" on public.machinery_businesses for select to authenticated
  using (public.is_machinery_super_admin() or exists (
    select 1 from public.machinery_business_companies bc
     where bc.business_id = machinery_businesses.id and public.machinery_in_company(bc.company_id)));
drop policy if exists "business_companies_admin_read" on public.machinery_business_companies;
create policy "business_companies_admin_read" on public.machinery_business_companies for select to authenticated
  using (public.machinery_in_company(company_id));

-- Blocks and locations: read in your companies, change as module admin
drop policy if exists "blocks_admin_all" on public.machinery_company_blocks;
drop policy if exists "blocks_read" on public.machinery_company_blocks;
create policy "blocks_read" on public.machinery_company_blocks for select to authenticated
  using (public.machinery_in_company(company_id));
drop policy if exists "blocks_write" on public.machinery_company_blocks;
create policy "blocks_write" on public.machinery_company_blocks for all to authenticated
  using (public.machinery_module_admin(company_id)) with check (public.machinery_module_admin(company_id));

drop policy if exists "locations_admin_all" on public.machinery_company_locations;
drop policy if exists "locations_read" on public.machinery_company_locations;
create policy "locations_read" on public.machinery_company_locations for select to authenticated
  using (public.machinery_in_company(company_id));
drop policy if exists "locations_write" on public.machinery_company_locations;
create policy "locations_write" on public.machinery_company_locations for all to authenticated
  using (public.machinery_module_admin(company_id)) with check (public.machinery_module_admin(company_id));

-- Machines and suppliers: your companies (Fuel Manage users need the
-- vehicles of their companies too)
drop policy if exists "machinery_machines_read" on public.machinery_machines;
create policy "machinery_machines_read" on public.machinery_machines for select to authenticated
  using (public.machinery_in_company(company_id));
drop policy if exists "machinery_suppliers_read" on public.machinery_suppliers;
create policy "machinery_suppliers_read" on public.machinery_suppliers for select to authenticated
  using (public.machinery_in_company(company_id, 'cmms'));

-- Repair cases, their history, WhatsApp messages and photos: Maintenance
-- Work Manage of that company (and people see their own app requests)
drop policy if exists "cases_admin_read" on public.machinery_cases;
create policy "cases_admin_read" on public.machinery_cases for select to authenticated
  using (public.machinery_can(public.machinery_company_of_number(wa_from), 'work', 'view')
         or created_by = auth.uid());
drop policy if exists "case_actions_admin_read" on public.machinery_case_actions;
create policy "case_actions_admin_read" on public.machinery_case_actions for select to authenticated
  using (exists (select 1 from public.machinery_cases c where c.id = case_id));
drop policy if exists "wa_msg_admin_read" on public.machinery_whatsapp_messages;
create policy "wa_msg_admin_read" on public.machinery_whatsapp_messages for select to authenticated
  using (public.machinery_can(coalesce(company_id, public.machinery_company_of_number(wa_from)), 'work', 'view'));
drop policy if exists "machinery_wa_photos_admin_read" on storage.objects;
create policy "machinery_wa_photos_admin_read" on storage.objects for select to authenticated
  using (bucket_id = 'machinery_whatsapp_photos'
         and exists (select 1 from public.machinery_whatsapp_messages m where m.storage_path = storage.objects.name));

create or replace function public.machinery_set_whatsapp_reviewed(p_id uuid, p_reviewed boolean)
returns public.machinery_whatsapp_messages
language plpgsql security definer
set search_path = public
as $$
declare
  r public.machinery_whatsapp_messages;
begin
  select * into r from public.machinery_whatsapp_messages where id = p_id;
  if r.id is null then
    raise exception 'record not found' using errcode = 'P0002';
  end if;
  if not public.machinery_can(coalesce(r.company_id, public.machinery_company_of_number(r.wa_from)), 'work', 'view') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.machinery_whatsapp_messages
     set reviewed_at       = case when p_reviewed then now() else null end,
         reviewed_by       = case when p_reviewed then auth.uid() else null end,
         reviewed_by_email = case when p_reviewed then (select email from auth.users where id = auth.uid()) else null end
   where id = p_id
  returning * into r;
  return r;
end $$;
revoke all on function public.machinery_set_whatsapp_reviewed(uuid, boolean) from public, anon;
grant execute on function public.machinery_set_whatsapp_reviewed(uuid, boolean) to authenticated;

-- People: yourself, super admins see everyone, others only the people who
-- share one of their companies
create or replace function public.machinery_shares_company(p_user uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select p_user = auth.uid()
      or public.is_machinery_super_admin()
      or exists (select 1 from public.machinery_user_companies a
                   join public.machinery_user_companies b on b.company_id = a.company_id
                  where a.user_id = auth.uid() and b.user_id = p_user)
      or (public.is_machinery_portal_admin()
          and not (public.machinery_scope_on('cmms') and public.machinery_scope_on('fuel')));
$$;
revoke all on function public.machinery_shares_company(uuid) from public, anon;
grant execute on function public.machinery_shares_company(uuid) to authenticated;

drop policy if exists "portal_admins_read" on public.machinery_portal_admins;
create policy "portal_admins_read" on public.machinery_portal_admins for select to authenticated
  using (public.machinery_shares_company(user_id));

create or replace function public.machinery_portal_people()
returns table (user_id uuid, email text, full_name text, is_super_admin boolean, intranet_cmms boolean, intranet_fuel boolean)
language sql stable security definer
set search_path = public
as $$
  select a.user_id, a.email, a.full_name, a.is_super_admin, a.intranet_cmms, a.intranet_fuel
    from public.machinery_portal_admins a
   where public.is_machinery_portal_admin() and public.machinery_shares_company(a.user_id)
   order by coalesce(a.full_name, a.email);
$$;
revoke all on function public.machinery_portal_people() from public, anon;
grant execute on function public.machinery_portal_people() to authenticated;

-- Fuel Manage people lists (drivers, approvers): only people of that company
create or replace function public.machinery_diesel_people(p_company uuid)
returns table (user_id uuid, email text, full_name text, is_super_admin boolean, has_access boolean, is_admin boolean, can_claim boolean, can_report boolean)
language sql stable security definer
set search_path = public
as $$
  select a.user_id, a.email, a.full_name, a.is_super_admin,
         (up.user_id is not null and jsonb_array_length(coalesce(up.perms -> 'claims', '[]'::jsonb)) > 0) as has_access,
         coalesce((up.perms -> 'claims') ? 'approve', false),
         coalesce((up.perms -> 'claims') ? 'add', false),
         coalesce((up.perms -> 'report') ? 'view', false)
    from public.machinery_portal_admins a
    left join public.machinery_user_perms up on up.user_id = a.user_id and up.company_id = p_company
   where (public.machinery_diesel_can(p_company, 'report') or public.machinery_diesel_can(p_company, 'admin')
          or public.machinery_can(p_company, 'usage', 'view') or public.machinery_can(p_company, 'cards', 'view'))
     and (not public.machinery_scope_on('fuel')
          or exists (select 1 from public.machinery_user_companies uc
                      where uc.user_id = a.user_id and uc.company_id = p_company and uc.module = 'fuel'))
   order by coalesce(a.full_name, a.email);
$$;
revoke all on function public.machinery_diesel_people(uuid) from public, anon;
grant execute on function public.machinery_diesel_people(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 4) Renewal helper: only through its triggers, not from outside
-- ---------------------------------------------------------------------
revoke all on function public.machinery_apply_renewal(uuid, text) from public, anon, authenticated;

-- Check: companies per module after the next sync (empty until the Intranet sends company lists)
select module, count(distinct user_id) as people, count(*) as person_company_pairs
  from public.machinery_user_companies group by module;
