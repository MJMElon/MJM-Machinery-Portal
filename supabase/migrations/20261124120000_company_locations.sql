-- =====================================================================
-- >>> RUN THIS IN THE **MACHINERY PORTAL** DATABASE <<<
-- >>> Supabase project qcvbzzdbbqmnrljfnxjp (shared with MachTrek)   <<<
-- >>> NOT the MJM Intranet database (briqzyxfxsvulyizzbiu)            <<<
-- Safe to run more than once.
-- =====================================================================
-- Locations of a company (e.g. several plantations / estates under one
-- company), kept in Settings → Company profile. Each machine / vehicle in
-- Machinery Profile can be put under one of its company's locations.

-- 1) Locations
create table if not exists public.machinery_company_locations (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.machinery_companies (id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 120),
  notes       text check (char_length(notes) <= 400),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index if not exists machinery_company_locations_name_key
  on public.machinery_company_locations (company_id, lower(name));

drop trigger if exists machinery_company_locations_touch on public.machinery_company_locations;
create trigger machinery_company_locations_touch
  before update on public.machinery_company_locations
  for each row execute function public.machinery_touch_updated_at();

-- Same access as blocks: portal users read and edit them.
alter table public.machinery_company_locations enable row level security;
revoke all on public.machinery_company_locations from anon, authenticated;
grant select, insert, update, delete on public.machinery_company_locations to authenticated;

drop policy if exists "locations_admin_all" on public.machinery_company_locations;
create policy "locations_admin_all" on public.machinery_company_locations
  for all to authenticated
  using (public.is_machinery_portal_admin())
  with check (public.is_machinery_portal_admin());

-- 2) Location of a machine / vehicle (empty = not set). Deleting a location
--    leaves its machines without one.
alter table public.machinery_machines
  add column if not exists location_id uuid references public.machinery_company_locations (id) on delete set null;
create index if not exists machinery_machines_location_idx on public.machinery_machines (location_id);

-- The location must belong to the machine's own company.
create or replace function public.machinery_machine_location_guard()
returns trigger
language plpgsql
as $$
begin
  if new.location_id is not null
     and new.company_id is distinct from (select l.company_id from public.machinery_company_locations l where l.id = new.location_id) then
    raise exception 'The location belongs to another company' using errcode = '22023';
  end if;
  return new;
end $$;
drop trigger if exists machinery_machines_location_guard on public.machinery_machines;
create trigger machinery_machines_location_guard
  before insert or update of location_id, company_id on public.machinery_machines
  for each row execute function public.machinery_machine_location_guard();

select c.name as company, l.name as location,
       (select count(*) from public.machinery_machines m where m.location_id = l.id) as machines
  from public.machinery_company_locations l join public.machinery_companies c on c.id = l.company_id
 order by c.name, l.name;
