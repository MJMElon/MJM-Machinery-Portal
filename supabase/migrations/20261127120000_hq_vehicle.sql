-- =====================================================================
-- >>> RUN THIS IN THE **MACHINERY PORTAL** DATABASE <<<
-- >>> Supabase project qcvbzzdbbqmnrljfnxjp (shared with MachTrek)   <<<
-- >>> NOT the MJM Intranet database (briqzyxfxsvulyizzbiu)            <<<
-- Safe to run more than once.
-- =====================================================================
-- "HQ vehicle" tick in Machinery Profile. Ticked machines show under the
-- HQ vehicle tab of the Fuel Usage Report; the rest under Estate machine.
-- First run: machines in the Insurance only tab start ticked.
do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'machinery_machines' and column_name = 'hq_vehicle') then
    alter table public.machinery_machines add column hq_vehicle boolean not null default false;
    update public.machinery_machines set hq_vehicle = true where status = 'insurance_only';
  end if;
end $$;

select hq_vehicle, status, count(*) from public.machinery_machines group by hq_vehicle, status order by 1, 2;
