-- =====================================================================
-- >>> RUN THIS IN THE **MACHINERY PORTAL** DATABASE <<<
-- >>> Supabase project qcvbzzdbbqmnrljfnxjp (shared with MachTrek)   <<<
-- >>> NOT the MJM Intranet database (briqzyxfxsvulyizzbiu)            <<<
-- Supabase dashboard → (Machinery project) → SQL Editor → paste all → Run.
-- Run the earlier migrations (… 20261109120000_vehicles_into_machines.sql) first.
-- Safe to run more than once.
-- =====================================================================
--
-- 1) Fuel claims get a running number per company (claim_no: 1, 2, 3 …).
-- 2) Businesses and companies are synced from MJM Intranet: intranet_id
--    remembers which Intranet row a business / company came from, and
--    machinery_apply_intranet_master(jsonb) applies one export from the
--    Intranet's gw-master-data function (called by the gw-login and
--    sync-intranet Edge Functions with the service role).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Running claim number per company
-- ---------------------------------------------------------------------
alter table public.machinery_diesel_claims add column if not exists claim_no integer;

create or replace function public.machinery_diesel_claim_no()
returns trigger language plpgsql
set search_path = public
as $$
begin
  if new.claim_no is null then
    select coalesce(max(claim_no), 0) + 1 into new.claim_no
      from public.machinery_diesel_claims where company_id = new.company_id;
  end if;
  return new;
end $$;
drop trigger if exists machinery_diesel_claim_no on public.machinery_diesel_claims;
create trigger machinery_diesel_claim_no
  before insert on public.machinery_diesel_claims
  for each row execute function public.machinery_diesel_claim_no();

-- Existing claims: number them in the order they were made.
with numbered as (
  select id, row_number() over (partition by company_id order by created_at, id) as n
    from public.machinery_diesel_claims where claim_no is null
)
update public.machinery_diesel_claims c set claim_no = n.n from numbered n where n.id = c.id;

create unique index if not exists machinery_diesel_claims_no_key
  on public.machinery_diesel_claims (company_id, claim_no);

-- ---------------------------------------------------------------------
-- 2) Synced from MJM Intranet
-- ---------------------------------------------------------------------
alter table public.machinery_businesses add column if not exists intranet_id uuid;
alter table public.machinery_companies  add column if not exists intranet_id uuid;
create unique index if not exists machinery_businesses_intranet_key on public.machinery_businesses (intranet_id) where intranet_id is not null;
create unique index if not exists machinery_companies_intranet_key  on public.machinery_companies  (intranet_id) where intranet_id is not null;

-- Apply one export of the Intranet's master data:
--   p = { businesses: [{id, name, description, sort_order}],
--         companies:  [{id, code, name, short_name, registration_no, is_active, sort_order}],
--         links:      [{group_id, company_id}] }
-- Matching: by intranet_id; a row entered by hand earlier is adopted by code
-- (companies) or by name. Names/codes follow the Intranet; module access
-- (cmms_enabled, diesel_enabled), WhatsApp numbers and area stay as set here.
-- Rows that came from the Intranet but are no longer in the export are made
-- inactive (never deleted, their data stays).
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
  -- Service role (Edge Functions) or the SQL editor only.
  if auth.uid() is not null and not public.is_machinery_super_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  -- Businesses
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

  -- Companies
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

  -- Links: replaced for every synced company
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

  -- Gone from the Intranet → inactive here
  update public.machinery_companies co
     set is_active = false
   where co.intranet_id is not null and co.is_active
     and not exists (select 1 from jsonb_array_elements(coalesce(p -> 'companies', '[]'::jsonb)) x
                      where (x ->> 'id')::uuid = co.intranet_id);
  get diagnostics n_inactive = row_count;

  return jsonb_build_object('businesses', n_biz, 'companies', n_co, 'links', n_links, 'made_inactive', n_inactive);
end $$;
revoke all on function public.machinery_apply_intranet_master(jsonb) from public, anon, authenticated;

-- Shows the companies and where they come from.
select name, code, is_active, intranet_id is not null as from_intranet from public.machinery_companies order by name;
