-- =====================================================================
-- >>> RUN THIS IN THE **MACHINERY PORTAL** DATABASE <<<
-- >>> Supabase project qcvbzzdbbqmnrljfnxjp (shared with MachTrek)   <<<
-- >>> NOT the MJM Intranet database (briqzyxfxsvulyizzbiu)            <<<
-- Safe to run more than once.
-- =====================================================================
-- When a fleet card (Fuel Manage → Fleet Card Manage) is given to a vehicle,
-- that vehicle's "KPDN diesel subsidy" tick in Machinery Profile is set
-- automatically.
create or replace function public.machinery_card_marks_kpdn()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.vehicle_id is not null then
    update public.machinery_machines set kpdn_subsidy = true
     where id = new.vehicle_id and kpdn_subsidy = false;
  end if;
  return new;
end $$;
drop trigger if exists machinery_diesel_cards_kpdn on public.machinery_diesel_cards;
create trigger machinery_diesel_cards_kpdn
  after insert or update of vehicle_id on public.machinery_diesel_cards
  for each row execute function public.machinery_card_marks_kpdn();

-- Vehicles that already have a card get the tick now.
update public.machinery_machines m set kpdn_subsidy = true
 where kpdn_subsidy = false
   and exists (select 1 from public.machinery_diesel_cards c where c.vehicle_id = m.id);

select m.name, m.kpdn_subsidy from public.machinery_machines m order by m.name;
