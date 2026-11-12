-- =====================================================================
-- >>> RUN THIS IN THE **MACHINERY PORTAL** DATABASE <<<
-- >>> Supabase project qcvbzzdbbqmnrljfnxjp (shared with MachTrek)   <<<
-- >>> NOT the MJM Intranet database (briqzyxfxsvulyizzbiu)            <<<
-- Safe to run more than once.
-- =====================================================================
-- "Insurance only" machines / vehicles (same as the old CMMS tab):
-- e.g. HQ cars. We do not record SMU or repairs for them, we only help
-- renew their insurance / road tax. They stay active (so renewals and
-- fuel claims still see them) but Machinery Profile lists them under
-- their own "Insurance only" tab instead of "Active".
alter table public.machinery_machines
  add column if not exists insurance_only boolean not null default false;

select c.name as company, m.name, m.is_active, m.insurance_only
  from public.machinery_machines m join public.machinery_companies c on c.id = m.company_id
 where m.insurance_only
 order by c.name, m.name;
