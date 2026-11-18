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

-- Diesel price per litre, by date: a fuel usage record has litres only, so the
-- report's RM chart for estate machines is litres x the price in force on the
-- record's date (the newest price dated on or before it).
create table if not exists public.machinery_diesel_prices (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.machinery_companies (id) on delete cascade,
  effective_from  date not null,
  price           numeric(8, 3) not null check (price > 0),
  created_by      uuid default auth.uid() references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  unique (company_id, effective_from)
);
alter table public.machinery_diesel_prices enable row level security;
revoke all on public.machinery_diesel_prices from anon, authenticated;
grant select, insert, update, delete on public.machinery_diesel_prices to authenticated;

drop policy if exists "diesel_prices_read" on public.machinery_diesel_prices;
create policy "diesel_prices_read" on public.machinery_diesel_prices for select to authenticated
  using (public.machinery_can(company_id, 'fuel_record', 'view')
         or public.machinery_can(company_id, 'usage', 'view')
         or public.machinery_can(company_id, 'report', 'view'));
-- Set by the people who may edit fuel usage records.
drop policy if exists "diesel_prices_write" on public.machinery_diesel_prices;
create policy "diesel_prices_write" on public.machinery_diesel_prices for all to authenticated
  using (public.machinery_can(company_id, 'fuel_record', 'edit'))
  with check (public.machinery_can(company_id, 'fuel_record', 'edit'));

select tablename, policyname from pg_policies
 where tablename in ('machinery_fuel_records', 'machinery_diesel_prices') order by 1, 2;
