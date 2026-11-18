-- =====================================================================
-- >>> RUN THIS IN THE **MACHINERY PORTAL** DATABASE <<<
-- >>> Supabase project qcvbzzdbbqmnrljfnxjp (shared with MachTrek)   <<<
-- >>> NOT the MJM Intranet database (briqzyxfxsvulyizzbiu)            <<<
-- Run 20261201120000_fuel_record_mobile.sql first. Safe to run more than once.
-- =====================================================================
-- Fuel Usage is one module now: Diesel record (the fuel usage records) and
-- Diesel report. The report's Estate machine tab is built from the records,
-- so people who may see the report may read the records too.
drop policy if exists "fuel_records_read" on public.machinery_fuel_records;
create policy "fuel_records_read" on public.machinery_fuel_records for select to authenticated
  using (public.machinery_can(company_id, 'fuel_record', 'view')
         or public.machinery_can(company_id, 'usage', 'view')
         or public.machinery_can(company_id, 'report', 'view')
         or (created_by = auth.uid() and public.machinery_can(company_id, 'fuel_record', 'add')));

select policyname from pg_policies where tablename = 'machinery_fuel_records' order by policyname;
