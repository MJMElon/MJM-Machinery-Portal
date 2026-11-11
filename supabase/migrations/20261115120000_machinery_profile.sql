-- =====================================================================
-- >>> RUN THIS IN THE **MACHINERY PORTAL** DATABASE <<<
-- >>> Supabase project qcvbzzdbbqmnrljfnxjp (shared with MachTrek)   <<<
-- >>> NOT the MJM Intranet database (briqzyxfxsvulyizzbiu)            <<<
-- Supabase dashboard → (Machinery project) → SQL Editor → paste all → Run.
-- Safe to run more than once.
-- =====================================================================
-- Machinery Profile, full version (same particulars as the old CMMS):
--   ACC code, year made, purchase date / price, market value, serial /
--   chassis / engine no., ideal fuel consumption, possible working units,
--   service unit, insurance / road tax / Puspakom periods, up to 4 photos,
--   reg card and director's circular resolution files.
-- Plus for fuel claims:
--   driver_ids  – the CMMS 2 users who drive this vehicle (their claims
--                 offer it in the vehicle list, and it is pre-selected)
--   general_use – tick for a light vehicle anyone may use: it shows in the
--                 vehicle list of everyone in the company.
-- =====================================================================

alter table public.machinery_machines
  add column if not exists acc_code               text,
  add column if not exists year_made              integer check (year_made is null or year_made between 1950 and 2100),
  add column if not exists purchase_date          date,
  add column if not exists purchase_price         numeric(14, 2) check (purchase_price is null or purchase_price >= 0),
  add column if not exists market_value           numeric(14, 2) check (market_value is null or market_value >= 0),
  add column if not exists serial_no              text,
  add column if not exists chassis_no             text,
  add column if not exists engine_no              text,
  add column if not exists ideal_fuel_consumption numeric(10, 3) check (ideal_fuel_consumption is null or ideal_fuel_consumption >= 0),
  add column if not exists possible_working_units numeric(12, 2) check (possible_working_units is null or possible_working_units >= 0),
  add column if not exists service_unit           text,
  add column if not exists insurance_from         date,
  add column if not exists insurance_to           date,
  add column if not exists road_tax_from          date,
  add column if not exists road_tax_to            date,
  add column if not exists puspakom_from          date,
  add column if not exists puspakom_to            date,
  add column if not exists photos                 text[] not null default '{}',
  add column if not exists reg_card_path          text,
  add column if not exists resolution_path        text,
  add column if not exists general_use            boolean not null default false,
  add column if not exists driver_ids             uuid[] not null default '{}';

-- The single "usual driver" kept so far becomes the first driver.
update public.machinery_machines
   set driver_ids = array[driver_id]
 where driver_id is not null and cardinality(driver_ids) = 0;

-- Keep driver_id (used by the fleet-card pages) equal to the first driver.
create or replace function public.machinery_machine_sync_driver()
returns trigger
language plpgsql
as $$
begin
  new.driver_id := case when cardinality(new.driver_ids) > 0 then new.driver_ids[1] else null end;
  if new.photos is null then new.photos := '{}'; end if;
  if cardinality(new.photos) > 4 then
    raise exception 'A machine can have at most 4 photos';
  end if;
  return new;
end $$;
drop trigger if exists machinery_machines_sync_driver on public.machinery_machines;
create trigger machinery_machines_sync_driver
  before insert or update on public.machinery_machines
  for each row execute function public.machinery_machine_sync_driver();

-- ---------------------------------------------------------------------
-- Files (photos, reg card, resolution): private bucket, path <company id>/<file>
-- Read: anyone who may view the company's Machinery Profile.
-- Upload / delete: anyone who may add or edit machines there.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('machinery_machine_files', 'machinery_machine_files', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

drop policy if exists "machinery machine files read" on storage.objects;
create policy "machinery machine files read" on storage.objects
  for select to authenticated
  using (bucket_id = 'machinery_machine_files'
         and public.machinery_can(((storage.foldername(name))[1])::uuid, 'machines', 'view'));

drop policy if exists "machinery machine files upload" on storage.objects;
create policy "machinery machine files upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'machinery_machine_files'
              and (public.machinery_can(((storage.foldername(name))[1])::uuid, 'machines', 'edit')
                   or public.machinery_can(((storage.foldername(name))[1])::uuid, 'machines', 'add')));

drop policy if exists "machinery machine files delete" on storage.objects;
create policy "machinery machine files delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'machinery_machine_files'
         and (public.machinery_can(((storage.foldername(name))[1])::uuid, 'machines', 'edit')
              or public.machinery_can(((storage.foldername(name))[1])::uuid, 'machines', 'delete')));

-- Shows the machines with their drivers and general-use tick.
select c.name as company, m.name, m.machine_type, m.reg_no, m.general_use, m.driver_ids, m.is_active
  from public.machinery_machines m join public.machinery_companies c on c.id = m.company_id
 order by c.name, m.name;
