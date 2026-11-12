-- =====================================================================
-- >>> RUN THIS IN THE **MACHINERY PORTAL** DATABASE <<<
-- >>> Supabase project qcvbzzdbbqmnrljfnxjp (shared with MachTrek)   <<<
-- >>> NOT the MJM Intranet database (briqzyxfxsvulyizzbiu)            <<<
-- Safe to run more than once.
-- =====================================================================
-- Machine status like the old CMMS: Active / Inactive / Insurance only
-- (not in use, but still insured and tracked under Machinery Renewal).
-- is_active stays in step: true only for Active.
alter table public.machinery_machines
  add column if not exists status text not null default 'active'
    check (status in ('active', 'inactive', 'insurance_only'));
update public.machinery_machines set status = 'inactive' where status = 'active' and is_active = false;

create or replace function public.machinery_machine_status()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and new.status = old.status and new.is_active is distinct from old.is_active then
    new.status := case when new.is_active then 'active' else 'inactive' end;   -- old clients
  end if;
  new.is_active := (new.status = 'active');
  return new;
end $$;
drop trigger if exists machinery_machines_status on public.machinery_machines;
create trigger machinery_machines_status
  before insert or update on public.machinery_machines
  for each row execute function public.machinery_machine_status();

select status, count(*) from public.machinery_machines group by status order by status;
