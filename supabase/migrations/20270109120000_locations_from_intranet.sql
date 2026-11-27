-- =====================================================================
-- >>> RUN THIS IN THE **MACHINERY PORTAL** DATABASE <<<
-- >>> Supabase project qcvbzzdbbqmnrljfnxjp (shared with MachTrek)   <<<
-- >>> NOT the MJM Intranet database (briqzyxfxsvulyizzbiu)            <<<
-- Safe to run more than once.
-- =====================================================================
-- Locations come from MJM Intranet now: Master Manage → Company → Locations
-- (per company and business, e.g. Mega Jutamas · Plantation: Suai, Sungai
-- Rait, Ulu Niah Estate; · Nursery: Ulu Niah Nursery No.1 …). "Sync from MJM
-- Intranet" and the sign-in sync copy them into machinery_company_locations;
-- Settings → Locations shows them read-only. Locations typed here before
-- (no Intranet id) are taken over when the name matches, otherwise removed
-- when no machine uses them.

-- 1) What a location carries from the Intranet
alter table public.machinery_company_locations
  add column if not exists intranet_id uuid,
  add column if not exists business_id uuid references public.machinery_businesses (id) on delete set null,
  add column if not exists short_name  text check (char_length(short_name) <= 20),
  add column if not exists area_ha     numeric(12, 2) check (area_ha is null or area_ha >= 0),
  add column if not exists sort_order  int not null default 0,
  add column if not exists is_active   boolean not null default true;
create unique index if not exists machinery_company_locations_intranet_key
  on public.machinery_company_locations (intranet_id) where intranet_id is not null;
-- The Intranet allows the same name in two businesses of one company.
drop index if exists public.machinery_company_locations_name_key;
create unique index if not exists machinery_company_locations_name_biz_key
  on public.machinery_company_locations (company_id, coalesce(business_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));

-- 2) Locations from the Intranet are read-only here (the sync runs as the service role)
drop policy if exists "locations_admin_all" on public.machinery_company_locations;
drop policy if exists "locations_read" on public.machinery_company_locations;
create policy "locations_read" on public.machinery_company_locations
  for select to authenticated using (public.is_machinery_portal_admin());
drop policy if exists "locations_write_local" on public.machinery_company_locations;
create policy "locations_write_local" on public.machinery_company_locations
  for all to authenticated
  using (public.is_machinery_portal_admin() and intranet_id is null)
  with check (public.is_machinery_portal_admin() and intranet_id is null);

-- 3) Apply the Intranet's locations (gw-master-data → locations[]):
--    { id, company_id, group_id, name, short_name, area, sort_order, is_active, … }
create or replace function public.machinery_apply_intranet_locations(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  x jsonb;
  v_co uuid;
  v_biz uuid;
  v_id uuid;
  n_set int := 0;
  n_gone int := 0;
  n_local int := 0;
begin
  if auth.uid() is not null and not public.is_machinery_super_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if jsonb_typeof(p) is distinct from 'array' then
    return jsonb_build_object('locations', null);
  end if;

  for x in select * from jsonb_array_elements(p) loop
    select id into v_co from public.machinery_companies where intranet_id = (x ->> 'company_id')::uuid;
    continue when v_co is null;
    select id into v_biz from public.machinery_businesses where intranet_id = nullif(x ->> 'group_id', '')::uuid;
    select id into v_id from public.machinery_company_locations where intranet_id = (x ->> 'id')::uuid;
    -- A location typed here before with the same name: take it over (its machines stay on it).
    if v_id is null then
      select id into v_id from public.machinery_company_locations
       where company_id = v_co and intranet_id is null and lower(btrim(name)) = lower(btrim(x ->> 'name'))
       limit 1;
    end if;
    -- Free the name if another row of this company and business holds it.
    update public.machinery_company_locations
       set name = name || ' (old)'
     where company_id = v_co and id is distinct from v_id
       and coalesce(business_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(v_biz, '00000000-0000-0000-0000-000000000000'::uuid)
       and lower(name) = lower(btrim(x ->> 'name'));
    if v_id is null then
      insert into public.machinery_company_locations (company_id, name, intranet_id, business_id, short_name, area_ha, sort_order, is_active)
      values (v_co, btrim(x ->> 'name'), (x ->> 'id')::uuid, v_biz, nullif(btrim(coalesce(x ->> 'short_name', '')), ''),
              nullif(x ->> 'area', '')::numeric, coalesce((x ->> 'sort_order')::int, 0), coalesce((x ->> 'is_active')::boolean, true));
    else
      update public.machinery_company_locations
         set company_id = v_co, name = btrim(x ->> 'name'), intranet_id = (x ->> 'id')::uuid, business_id = v_biz,
             short_name = nullif(btrim(coalesce(x ->> 'short_name', '')), ''), area_ha = nullif(x ->> 'area', '')::numeric,
             sort_order = coalesce((x ->> 'sort_order')::int, 0), is_active = coalesce((x ->> 'is_active')::boolean, true)
       where id = v_id;
    end if;
    n_set := n_set + 1;
  end loop;

  -- Gone from the Intranet: kept (machines may point at it) but no longer offered.
  update public.machinery_company_locations l
     set is_active = false
   where l.intranet_id is not null and l.is_active
     and not exists (select 1 from jsonb_array_elements(p) y where (y ->> 'id')::uuid = l.intranet_id);
  get diagnostics n_gone = row_count;

  -- Locations typed here for a company that comes from the Intranet: removed
  -- when no machine uses them, otherwise no longer offered.
  delete from public.machinery_company_locations l
   using public.machinery_companies c
   where c.id = l.company_id and c.intranet_id is not null and l.intranet_id is null
     and not exists (select 1 from public.machinery_machines m where m.location_id = l.id);
  get diagnostics n_local = row_count;
  update public.machinery_company_locations l
     set is_active = false
    from public.machinery_companies c
   where c.id = l.company_id and c.intranet_id is not null and l.intranet_id is null and l.is_active;

  return jsonb_build_object('locations', n_set, 'locations_gone', n_gone, 'local_locations_removed', n_local);
end $$;
revoke all on function public.machinery_apply_intranet_locations(jsonb) from public, anon, authenticated;

select c.name as company, b.name as business, l.name as location, l.short_name, l.is_active, l.intranet_id is not null as from_intranet
  from public.machinery_company_locations l
  join public.machinery_companies c on c.id = l.company_id
  left join public.machinery_businesses b on b.id = l.business_id
 order by c.name, b.name, l.sort_order, l.name;
