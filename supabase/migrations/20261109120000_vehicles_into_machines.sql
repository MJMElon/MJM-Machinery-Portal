-- =====================================================================
-- >>> RUN THIS IN THE **MACHINERY PORTAL** DATABASE <<<
-- >>> Supabase project qcvbzzdbbqmnrljfnxjp (shared with MachTrek)   <<<
-- >>> NOT the MJM Intranet database (briqzyxfxsvulyizzbiu)            <<<
-- Supabase dashboard → (Machinery project) → SQL Editor → paste all → Run.
-- Run 20261107120000_businesses.sql and 20261108120000_diesel.sql first.
-- Safe to run more than once.
-- =====================================================================
--
-- One list of machines AND vehicles, kept in Machinery Manage → Machinery
-- Profile (machinery_machines). Diesel Manage no longer has its own vehicle
-- list: claims, fleet cards and fill-ups point at machinery_machines.
--  - new columns: fuel_type, tank_capacity_l, driver_id (usual driver),
--    kpdn_subsidy (tick = this vehicle applies for the KPDN subsidised-diesel
--    fleet card; shown in Diesel Manage → Fleet Card Manage), is_active
--  - rows of the old machinery_diesel_vehicles are copied over (same ids),
--    then that table is dropped.
-- =====================================================================

-- 1) Vehicle details on machines
alter table public.machinery_machines
  add column if not exists fuel_type        text not null default 'diesel',
  add column if not exists tank_capacity_l  numeric(6, 1),
  add column if not exists driver_id        uuid references auth.users (id) on delete set null,
  add column if not exists kpdn_subsidy     boolean not null default false,
  add column if not exists is_active        boolean not null default true;
alter table public.machinery_machines drop constraint if exists machinery_machines_fuel_type_check;
alter table public.machinery_machines
  add constraint machinery_machines_fuel_type_check check (fuel_type in ('diesel', 'petrol', 'none'));
alter table public.machinery_machines drop constraint if exists machinery_machines_tank_check;
alter table public.machinery_machines
  add constraint machinery_machines_tank_check check (tank_capacity_l is null or tank_capacity_l > 0);

-- 2) Copy the old Diesel vehicles (if that table still exists)
do $$
begin
  if to_regclass('public.machinery_diesel_vehicles') is not null then
    insert into public.machinery_machines
      (id, company_id, name, machine_type, reg_no, notes, fuel_type, tank_capacity_l, driver_id, is_active, created_at, updated_at)
    select v.id, v.company_id,
           coalesce(nullif(v.name, ''), v.plate_no), v.vehicle_type, v.plate_no, v.notes,
           v.fuel_type, v.tank_capacity_l, v.driver_id, v.status = 'active', v.created_at, v.updated_at
      from public.machinery_diesel_vehicles v
     where not exists (select 1 from public.machinery_machines m where m.id = v.id)
    on conflict do nothing;
  end if;
end $$;

-- 3) Point claims / cards / fill-ups at machinery_machines
alter table public.machinery_diesel_claims drop constraint if exists machinery_diesel_claims_vehicle_id_fkey;
alter table public.machinery_diesel_claims
  add constraint machinery_diesel_claims_vehicle_id_fkey
  foreign key (vehicle_id) references public.machinery_machines (id) on delete no action;

alter table public.machinery_diesel_cards drop constraint if exists machinery_diesel_cards_vehicle_id_fkey;
alter table public.machinery_diesel_cards
  add constraint machinery_diesel_cards_vehicle_id_fkey
  foreign key (vehicle_id) references public.machinery_machines (id) on delete set null;

alter table public.machinery_diesel_card_usage drop constraint if exists machinery_diesel_card_usage_vehicle_id_fkey;
alter table public.machinery_diesel_card_usage
  add constraint machinery_diesel_card_usage_vehicle_id_fkey
  foreign key (vehicle_id) references public.machinery_machines (id) on delete no action;

-- 4) Guards and policies that looked up the old table
create or replace function public.machinery_diesel_claims_guard()
returns trigger language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.company_id <> (select v.company_id from public.machinery_machines v where v.id = new.vehicle_id) then
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
  if new.vehicle_id <> old.vehicle_id
     and new.company_id <> (select v.company_id from public.machinery_machines v where v.id = new.vehicle_id) then
    raise exception 'The vehicle belongs to another company.' using errcode = '23514';
  end if;
  if new.status is distinct from old.status then
    if not public.machinery_diesel_can(old.company_id, 'admin') then
      raise exception 'Only a Diesel admin can review claims.' using errcode = '42501';
    end if;
    if old.claimant_id = auth.uid() and not public.is_machinery_super_admin() then
      raise exception 'You cannot review your own claim.' using errcode = '42501';
    end if;
    new.reviewed_by := auth.uid();
    new.reviewed_at := now();
    return new;
  end if;
  if not public.machinery_diesel_can(old.company_id, 'admin')
     and (new.reviewed_by is distinct from old.reviewed_by
          or new.reviewed_at is distinct from old.reviewed_at
          or new.review_note is distinct from old.review_note) then
    raise exception 'Only a Diesel admin can review claims.' using errcode = '42501';
  end if;
  return new;
end $$;

create or replace function public.machinery_diesel_same_company_guard()
returns trigger language plpgsql
set search_path = public
as $$
begin
  if new.card_id is not null
     and new.company_id <> (select c.company_id from public.machinery_diesel_cards c where c.id = new.card_id) then
    raise exception 'The card belongs to another company.' using errcode = '23514';
  end if;
  if to_jsonb(new) ? 'vehicle_id' and (to_jsonb(new) ->> 'vehicle_id') is not null
     and new.company_id <> (select v.company_id from public.machinery_machines v
                             where v.id = (to_jsonb(new) ->> 'vehicle_id')::uuid) then
    raise exception 'The vehicle belongs to another company.' using errcode = '23514';
  end if;
  return new;
end $$;

create or replace function public.machinery_diesel_cards_guard()
returns trigger language plpgsql
set search_path = public
as $$
begin
  if new.vehicle_id is not null
     and new.company_id <> (select v.company_id from public.machinery_machines v where v.id = new.vehicle_id) then
    raise exception 'The vehicle belongs to another company.' using errcode = '23514';
  end if;
  return new;
end $$;

drop policy if exists "diesel_claims_insert" on public.machinery_diesel_claims;
create policy "diesel_claims_insert" on public.machinery_diesel_claims
  for insert to authenticated
  with check (
    public.machinery_diesel_can(company_id, 'claim')
    and claimant_id = auth.uid()
    and status = 'pending'
    and reviewed_by is null
    and exists (select 1 from public.machinery_machines v
                 where v.id = vehicle_id and v.company_id = machinery_diesel_claims.company_id and v.is_active)
  );

-- 5) People list for drop-downs (usual driver in Machinery Profile): every
--    portal user may see the names/e-mails of the portal users.
create or replace function public.machinery_portal_people()
returns table (user_id uuid, email text, full_name text, is_super_admin boolean)
language sql stable security definer
set search_path = public
as $$
  select a.user_id, a.email, a.full_name, a.is_super_admin
    from public.machinery_portal_admins a
   where public.is_machinery_portal_admin()
   order by coalesce(a.full_name, a.email);
$$;
revoke all on function public.machinery_portal_people() from public, anon;
grant execute on function public.machinery_portal_people() to authenticated;

-- 6) The old table is no longer used
drop table if exists public.machinery_diesel_vehicles;

-- Shows machines/vehicles with their fuel details and KPDN tick.
select c.name as company, m.name, m.machine_type, m.reg_no, m.fuel_type, m.tank_capacity_l, m.kpdn_subsidy, m.is_active
  from public.machinery_machines m join public.machinery_companies c on c.id = m.company_id
 order by c.name, m.name;
