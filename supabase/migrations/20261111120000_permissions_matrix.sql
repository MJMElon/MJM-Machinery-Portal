-- =====================================================================
-- >>> RUN THIS IN THE **MACHINERY PORTAL** DATABASE <<<
-- >>> Supabase project qcvbzzdbbqmnrljfnxjp (shared with MachTrek)   <<<
-- >>> NOT the MJM Intranet database (briqzyxfxsvulyizzbiu)            <<<
-- Supabase dashboard → (Machinery project) → SQL Editor → paste all → Run.
-- Run the earlier migrations (… 20261110120000_fuel_claims_intranet_sync.sql) first.
-- Safe to run more than once.
-- =====================================================================
--
-- One permission matrix per user and company (CMMS User Setting):
--   module section → actions
--   Machinery Manage: work (Maintenance Work Manage): view edit delete solve send
--                     machines (Machinery Profile):   view add edit delete
--                     suppliers (Supplier Workshop):  view add edit delete
--   Fuel Manage:      claims (Fuel Claims):  view add edit delete view_all approve pay
--                     usage (Fuel Usage):    view add delete
--                     cards (Fleet Card):    view add edit delete
--                     report (Report):       view
-- Super admins can do everything. The old per-module tables
-- (machinery_cmms_members, machinery_diesel_members) are copied into the
-- matrix once and no longer used.
-- Also: a fuel claim may be made without a vehicle; module access per
-- company (Machinery Manage / Fuel Manage) follows the Intranet's Icon tags.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) The matrix
-- ---------------------------------------------------------------------
create table if not exists public.machinery_user_perms (
  company_id  uuid not null references public.machinery_companies (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  perms       jsonb not null default '{}'::jsonb,   -- {"work":["view","edit"], "claims":["view","add"], …}
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (company_id, user_id)
);
drop trigger if exists machinery_user_perms_touch on public.machinery_user_perms;
create trigger machinery_user_perms_touch
  before update on public.machinery_user_perms
  for each row execute function public.machinery_touch_updated_at();

alter table public.machinery_user_perms enable row level security;
revoke all on public.machinery_user_perms from anon, authenticated;
grant select, insert, update, delete on public.machinery_user_perms to authenticated;
drop policy if exists "user_perms_read" on public.machinery_user_perms;
create policy "user_perms_read" on public.machinery_user_perms
  for select to authenticated using (user_id = auth.uid() or public.is_machinery_super_admin());
drop policy if exists "user_perms_super_write" on public.machinery_user_perms;
create policy "user_perms_super_write" on public.machinery_user_perms
  for all to authenticated
  using (public.is_machinery_super_admin()) with check (public.is_machinery_super_admin());

-- May the signed-in user do <action> in <section> of this company?
create or replace function public.machinery_can(p_company uuid, p_section text, p_action text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.is_machinery_super_admin() or exists (
    select 1 from public.machinery_user_perms up
     where up.company_id = p_company and up.user_id = auth.uid()
       and (up.perms -> p_section) ? p_action);
$$;
revoke all on function public.machinery_can(uuid, text, text) from public, anon;
grant execute on function public.machinery_can(uuid, text, text) to authenticated;

-- Does the user have anything at all in a module (opens its tile)?
create or replace function public.machinery_can_any(p_company uuid, p_sections text[])
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.is_machinery_super_admin() or exists (
    select 1 from public.machinery_user_perms up, unnest(p_sections) s
     where up.company_id = p_company and up.user_id = auth.uid()
       and jsonb_array_length(coalesce(up.perms -> s, '[]'::jsonb)) > 0);
$$;
revoke all on function public.machinery_can_any(uuid, text[]) from public, anon;
grant execute on function public.machinery_can_any(uuid, text[]) to authenticated;

-- ---------------------------------------------------------------------
-- 2) Copy the old per-module rights into the matrix (once)
-- ---------------------------------------------------------------------
insert into public.machinery_user_perms (company_id, user_id, perms)
select m.company_id, m.user_id,
       jsonb_strip_nulls(jsonb_build_object(
         'work', (select jsonb_agg(a) from unnest(array_remove(array[
                    case when m.can_solve or m.can_edit or m.can_delete then 'view' end,
                    case when m.can_edit then 'edit' end, case when m.can_edit then 'send' end,
                    case when m.can_delete then 'delete' end, case when m.can_solve then 'solve' end], null)) a),
         'machines', case when m.can_manage then '["view","add","edit","delete"]'::jsonb end,
         'suppliers', case when m.can_manage then '["view","add","edit","delete"]'::jsonb end))
  from public.machinery_cmms_members m
on conflict (company_id, user_id) do nothing;

insert into public.machinery_user_perms (company_id, user_id, perms)
select d.company_id, d.user_id, '{}'::jsonb from public.machinery_diesel_members d
on conflict do nothing;

update public.machinery_user_perms up
   set perms = up.perms || jsonb_strip_nulls(jsonb_build_object(
         'claims', case when d.is_admin then '["view","add","edit","delete","view_all","approve","pay"]'::jsonb
                        when d.can_claim and d.can_report then '["view","add","edit","delete","view_all"]'::jsonb
                        when d.can_claim then '["view","add","edit","delete"]'::jsonb
                        when d.can_report then '["view","view_all"]'::jsonb end,
         'usage',  case when d.is_admin then '["view","add","delete"]'::jsonb when d.can_report then '["view"]'::jsonb end,
         'cards',  case when d.is_admin then '["view","add","edit","delete"]'::jsonb when d.can_report then '["view"]'::jsonb end,
         'report', case when d.is_admin or d.can_report then '["view"]'::jsonb end))
  from public.machinery_diesel_members d
 where d.company_id = up.company_id and d.user_id = up.user_id
   and not (up.perms ? 'claims');

-- ---------------------------------------------------------------------
-- 3) Old permission functions now read the matrix (existing RLS keeps working)
-- ---------------------------------------------------------------------
create or replace function public.machinery_cmms_can(p_company uuid, p_action text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select case p_action
           when 'solve'  then public.machinery_can(p_company, 'work', 'solve')
           when 'edit'   then public.machinery_can(p_company, 'work', 'edit')
           when 'send'   then public.machinery_can(p_company, 'work', 'send')
           when 'delete' then public.machinery_can(p_company, 'work', 'delete')
           when 'manage' then public.machinery_can(p_company, 'machines', 'edit') or public.machinery_can(p_company, 'suppliers', 'edit')
           else false end;
$$;

create or replace function public.machinery_diesel_can(p_company uuid, p_action text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select case p_action
           when 'use'    then public.machinery_can_any(p_company, array['claims', 'usage', 'cards', 'report'])
           when 'admin'  then public.machinery_can(p_company, 'claims', 'approve')
           when 'claim'  then public.machinery_can(p_company, 'claims', 'add')
           when 'report' then public.machinery_can(p_company, 'report', 'view') or public.machinery_can(p_company, 'claims', 'view_all')
           else false end;
$$;

-- People list: anyone who may see other people's claims / records.
create or replace function public.machinery_diesel_people(p_company uuid)
returns table (
  user_id uuid, email text, full_name text, is_super_admin boolean,
  has_access boolean, is_admin boolean, can_claim boolean, can_report boolean
)
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
   where public.machinery_diesel_can(p_company, 'report') or public.machinery_diesel_can(p_company, 'admin')
      or public.machinery_can(p_company, 'usage', 'view') or public.machinery_can(p_company, 'cards', 'view')
   order by coalesce(a.full_name, a.email);
$$;

-- ---------------------------------------------------------------------
-- 4) Finer policies per section
-- ---------------------------------------------------------------------
do $$
declare t text; s text;
begin
  foreach t in array array['machinery_machines', 'machinery_suppliers'] loop
    s := case t when 'machinery_machines' then 'machines' else 'suppliers' end;
    execute format('drop policy if exists "%1$s_manage" on public.%1$s', t);
    execute format('drop policy if exists "%1$s_add" on public.%1$s', t);
    execute format('drop policy if exists "%1$s_edit" on public.%1$s', t);
    execute format('drop policy if exists "%1$s_del" on public.%1$s', t);
    execute format('create policy "%1$s_add" on public.%1$s for insert to authenticated
                    with check (public.machinery_can(company_id, %2$L, ''add''))', t, s);
    execute format('create policy "%1$s_edit" on public.%1$s for update to authenticated
                    using (public.machinery_can(company_id, %2$L, ''edit'')) with check (public.machinery_can(company_id, %2$L, ''edit''))', t, s);
    execute format('create policy "%1$s_del" on public.%1$s for delete to authenticated
                    using (public.machinery_can(company_id, %2$L, ''delete''))', t, s);
  end loop;

  -- Fleet cards + reloads: section "cards"; fill-ups: section "usage"
  foreach t in array array['machinery_diesel_cards', 'machinery_diesel_card_reloads', 'machinery_diesel_card_usage'] loop
    s := case t when 'machinery_diesel_card_usage' then 'usage' else 'cards' end;
    execute format('drop policy if exists "%1$s_read" on public.%1$s', t);
    execute format('drop policy if exists "%1$s_write" on public.%1$s', t);
    execute format('drop policy if exists "%1$s_add" on public.%1$s', t);
    execute format('drop policy if exists "%1$s_edit" on public.%1$s', t);
    execute format('drop policy if exists "%1$s_del" on public.%1$s', t);
    execute format('create policy "%1$s_read" on public.%1$s for select to authenticated
                    using (public.machinery_can(company_id, %2$L, ''view'') or public.machinery_can(company_id, ''report'', ''view''))', t, s);
    execute format('create policy "%1$s_add" on public.%1$s for insert to authenticated
                    with check (public.machinery_can(company_id, %2$L, ''add''))', t, s);
    execute format('create policy "%1$s_edit" on public.%1$s for update to authenticated
                    using (public.machinery_can(company_id, %2$L, ''edit'') or public.machinery_can(company_id, %2$L, ''add''))
                    with check (public.machinery_can(company_id, %2$L, ''edit'') or public.machinery_can(company_id, %2$L, ''add''))', t, s);
    execute format('create policy "%1$s_del" on public.%1$s for delete to authenticated
                    using (public.machinery_can(company_id, %2$L, ''delete''))', t, s);
  end loop;
end $$;

-- Claims: a vehicle is optional now
alter table public.machinery_diesel_claims alter column vehicle_id drop not null;

drop policy if exists "diesel_claims_read" on public.machinery_diesel_claims;
create policy "diesel_claims_read" on public.machinery_diesel_claims
  for select to authenticated
  using ((claimant_id = auth.uid() and public.machinery_can(company_id, 'claims', 'view'))
         or public.machinery_can(company_id, 'claims', 'view_all') or public.machinery_can(company_id, 'report', 'view'));
drop policy if exists "diesel_claims_insert" on public.machinery_diesel_claims;
create policy "diesel_claims_insert" on public.machinery_diesel_claims
  for insert to authenticated
  with check (
    public.machinery_can(company_id, 'claims', 'add')
    and claimant_id = auth.uid()
    and status = 'pending'
    and reviewed_by is null
    and (vehicle_id is null or exists (select 1 from public.machinery_machines v
                 where v.id = vehicle_id and v.company_id = machinery_diesel_claims.company_id and v.is_active))
  );
drop policy if exists "diesel_claims_update" on public.machinery_diesel_claims;
create policy "diesel_claims_update" on public.machinery_diesel_claims
  for update to authenticated
  using ((claimant_id = auth.uid() and status = 'pending' and public.machinery_can(company_id, 'claims', 'edit'))
         or public.machinery_can(company_id, 'claims', 'approve') or public.machinery_can(company_id, 'claims', 'pay'))
  with check ((claimant_id = auth.uid() and status = 'pending' and public.machinery_can(company_id, 'claims', 'edit'))
         or public.machinery_can(company_id, 'claims', 'approve') or public.machinery_can(company_id, 'claims', 'pay'));
drop policy if exists "diesel_claims_delete" on public.machinery_diesel_claims;
create policy "diesel_claims_delete" on public.machinery_diesel_claims
  for delete to authenticated
  using ((claimant_id = auth.uid() and status = 'pending' and public.machinery_can(company_id, 'claims', 'delete'))
         or public.is_machinery_super_admin());

create or replace function public.machinery_diesel_claims_guard()
returns trigger language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.vehicle_id is not null
       and new.company_id <> (select v.company_id from public.machinery_machines v where v.id = new.vehicle_id) then
      raise exception 'The vehicle belongs to another company.' using errcode = '23514';
    end if;
    return new;
  end if;
  if auth.uid() is null then
    return new;
  end if;
  if new.claimant_id <> old.claimant_id or new.company_id <> old.company_id then
    raise exception 'The claimant and company of a claim cannot be changed.' using errcode = '42501';
  end if;
  if new.vehicle_id is distinct from old.vehicle_id and new.vehicle_id is not null
     and new.company_id <> (select v.company_id from public.machinery_machines v where v.id = new.vehicle_id) then
    raise exception 'The vehicle belongs to another company.' using errcode = '23514';
  end if;
  if new.status is distinct from old.status then
    if new.status = 'paid' or old.status = 'paid' then
      if not public.machinery_can(old.company_id, 'claims', 'pay') then
        raise exception 'You do not have the "pay" right for fuel claims.' using errcode = '42501';
      end if;
    elsif not public.machinery_can(old.company_id, 'claims', 'approve') then
      raise exception 'You do not have the "approve" right for fuel claims.' using errcode = '42501';
    end if;
    if old.claimant_id = auth.uid() and not public.is_machinery_super_admin() then
      raise exception 'You cannot review your own claim.' using errcode = '42501';
    end if;
    new.reviewed_by := auth.uid();
    new.reviewed_at := now();
    return new;
  end if;
  if not (public.machinery_can(old.company_id, 'claims', 'approve') or public.machinery_can(old.company_id, 'claims', 'pay'))
     and (new.reviewed_by is distinct from old.reviewed_by
          or new.reviewed_at is distinct from old.reviewed_at
          or new.review_note is distinct from old.review_note) then
    raise exception 'Only a reviewer can change the review fields.' using errcode = '42501';
  end if;
  return new;
end $$;

-- Removing a portal user also clears the matrix
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
  delete from public.machinery_user_perms where user_id = p_user;
  delete from public.machinery_cmms_members where user_id = p_user;
  delete from public.machinery_diesel_members where user_id = p_user;
  delete from public.machinery_portal_admins where user_id = p_user;
end $$;

-- ---------------------------------------------------------------------
-- 5) Module access per company follows the Intranet's Icon tags.
--    p.cmms_company_ids / p.diesel_company_ids = Intranet company ids that
--    have the CMMS 2 / Fuel Manage Icon; null = leave the flags alone.
-- ---------------------------------------------------------------------
create or replace function public.machinery_apply_intranet_master(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  b jsonb;
  c jsonb;
  l jsonb;
  v_biz uuid;
  v_co uuid;
  n_biz int := 0;
  n_co int := 0;
  n_links int := 0;
  n_inactive int := 0;
begin
  if auth.uid() is not null and not public.is_machinery_super_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  for b in select * from jsonb_array_elements(coalesce(p -> 'businesses', '[]'::jsonb)) loop
    select id into v_biz from public.machinery_businesses where intranet_id = (b ->> 'id')::uuid;
    if v_biz is null then
      select id into v_biz from public.machinery_businesses
       where intranet_id is null and lower(name) = lower(b ->> 'name') limit 1;
    end if;
    if v_biz is null then
      insert into public.machinery_businesses (name, description, sort_order, intranet_id)
      values (b ->> 'name', b ->> 'description', coalesce((b ->> 'sort_order')::int, 0), (b ->> 'id')::uuid)
      returning id into v_biz;
    else
      update public.machinery_businesses
         set name = b ->> 'name', description = b ->> 'description',
             sort_order = coalesce((b ->> 'sort_order')::int, sort_order), intranet_id = (b ->> 'id')::uuid
       where id = v_biz;
    end if;
    n_biz := n_biz + 1;
  end loop;

  for c in select * from jsonb_array_elements(coalesce(p -> 'companies', '[]'::jsonb)) loop
    select id into v_co from public.machinery_companies where intranet_id = (c ->> 'id')::uuid;
    if v_co is null and nullif(c ->> 'code', '') is not null then
      select id into v_co from public.machinery_companies where intranet_id is null and code = c ->> 'code' limit 1;
    end if;
    if v_co is null then
      select id into v_co from public.machinery_companies
       where intranet_id is null and lower(name) = lower(c ->> 'name') limit 1;
    end if;
    if v_co is null then
      insert into public.machinery_companies (name, code, short_name, registration_no, is_active, intranet_id)
      values (c ->> 'name', nullif(c ->> 'code', ''), nullif(c ->> 'short_name', ''), nullif(c ->> 'registration_no', ''),
              coalesce((c ->> 'is_active')::boolean, true), (c ->> 'id')::uuid)
      returning id into v_co;
    else
      update public.machinery_companies
         set name = c ->> 'name', code = nullif(c ->> 'code', ''), short_name = nullif(c ->> 'short_name', ''),
             registration_no = nullif(c ->> 'registration_no', ''),
             is_active = coalesce((c ->> 'is_active')::boolean, true), intranet_id = (c ->> 'id')::uuid
       where id = v_co;
    end if;
    n_co := n_co + 1;
  end loop;

  delete from public.machinery_business_companies bc
   using public.machinery_companies co
   where co.id = bc.company_id and co.intranet_id is not null;
  for l in select * from jsonb_array_elements(coalesce(p -> 'links', '[]'::jsonb)) loop
    insert into public.machinery_business_companies (business_id, company_id)
    select bz.id, co.id
      from public.machinery_businesses bz, public.machinery_companies co
     where bz.intranet_id = (l ->> 'group_id')::uuid and co.intranet_id = (l ->> 'company_id')::uuid
    on conflict do nothing;
    n_links := n_links + 1;
  end loop;

  update public.machinery_companies co
     set is_active = false
   where co.intranet_id is not null and co.is_active
     and not exists (select 1 from jsonb_array_elements(coalesce(p -> 'companies', '[]'::jsonb)) x
                      where (x ->> 'id')::uuid = co.intranet_id);
  get diagnostics n_inactive = row_count;

  -- Module access from the Intranet's Icon tags
  if p ? 'cmms_company_ids' and jsonb_typeof(p -> 'cmms_company_ids') = 'array' then
    update public.machinery_companies co
       set cmms_enabled = exists (select 1 from jsonb_array_elements_text(p -> 'cmms_company_ids') x where x::uuid = co.intranet_id)
     where co.intranet_id is not null;
  end if;
  if p ? 'diesel_company_ids' and jsonb_typeof(p -> 'diesel_company_ids') = 'array' then
    update public.machinery_companies co
       set diesel_enabled = exists (select 1 from jsonb_array_elements_text(p -> 'diesel_company_ids') x where x::uuid = co.intranet_id)
     where co.intranet_id is not null;
  end if;

  return jsonb_build_object('businesses', n_biz, 'companies', n_co, 'links', n_links, 'made_inactive', n_inactive);
end $$;
revoke all on function public.machinery_apply_intranet_master(jsonb) from public, anon, authenticated;

-- Shows who has what, per company.
select c.name as company, a.email, up.perms
  from public.machinery_user_perms up
  join public.machinery_companies c on c.id = up.company_id
  join public.machinery_portal_admins a on a.user_id = up.user_id
 order by c.name, a.email;
