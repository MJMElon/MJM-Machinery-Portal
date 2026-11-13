-- =====================================================================
-- >>> RUN THIS IN THE **MACHINERY PORTAL** DATABASE <<<
-- >>> Supabase project qcvbzzdbbqmnrljfnxjp (shared with MachTrek)   <<<
-- >>> NOT the MJM Intranet database (briqzyxfxsvulyizzbiu)            <<<
-- Safe to run more than once.
-- =====================================================================
-- Fuel Manage → Fuel Usage Record: the daily log of fuel issued to each
-- machine from the company's own tank / skid tank (date, machine, litres,
-- hour meter or km, who issued it). The location is the machine's location
-- (Machinery Profile). Access is its own row in Role setup: section
-- "fuel_record" with view / add / edit / delete.

create table if not exists public.machinery_fuel_records (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.machinery_companies (id) on delete cascade,
  record_date    date not null default current_date,
  machine_id     uuid not null references public.machinery_machines (id) on delete restrict,
  litres         numeric(10, 2) not null check (litres > 0),
  meter_reading  numeric(12, 1) check (meter_reading is null or meter_reading >= 0),  -- hour meter or km
  issued_by      text check (char_length(issued_by) <= 120),
  remark         text check (char_length(remark) <= 400),
  created_by     uuid default auth.uid() references auth.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists machinery_fuel_records_company_date_idx on public.machinery_fuel_records (company_id, record_date desc);
create index if not exists machinery_fuel_records_machine_idx on public.machinery_fuel_records (machine_id);

drop trigger if exists machinery_fuel_records_touch on public.machinery_fuel_records;
create trigger machinery_fuel_records_touch
  before update on public.machinery_fuel_records
  for each row execute function public.machinery_touch_updated_at();

-- The machine must belong to the record's company; company and creator never change.
create or replace function public.machinery_fuel_record_guard()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' then
    new.company_id := old.company_id;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  if new.company_id is distinct from (select m.company_id from public.machinery_machines m where m.id = new.machine_id) then
    raise exception 'The machine belongs to another company' using errcode = '22023';
  end if;
  return new;
end $$;
drop trigger if exists machinery_fuel_records_guard on public.machinery_fuel_records;
create trigger machinery_fuel_records_guard
  before insert or update on public.machinery_fuel_records
  for each row execute function public.machinery_fuel_record_guard();

alter table public.machinery_fuel_records enable row level security;
revoke all on public.machinery_fuel_records from anon, authenticated;
grant select, insert, update, delete on public.machinery_fuel_records to authenticated;

drop policy if exists "fuel_records_read" on public.machinery_fuel_records;
create policy "fuel_records_read" on public.machinery_fuel_records for select to authenticated
  using (public.machinery_can(company_id, 'fuel_record', 'view'));
drop policy if exists "fuel_records_add" on public.machinery_fuel_records;
create policy "fuel_records_add" on public.machinery_fuel_records for insert to authenticated
  with check (public.machinery_can(company_id, 'fuel_record', 'add'));
drop policy if exists "fuel_records_edit" on public.machinery_fuel_records;
create policy "fuel_records_edit" on public.machinery_fuel_records for update to authenticated
  using (public.machinery_can(company_id, 'fuel_record', 'edit'))
  with check (public.machinery_can(company_id, 'fuel_record', 'edit'));
drop policy if exists "fuel_records_del" on public.machinery_fuel_records;
create policy "fuel_records_del" on public.machinery_fuel_records for delete to authenticated
  using (public.machinery_can(company_id, 'fuel_record', 'delete'));

-- Someone with only Fuel Usage Record rights also counts as a Fuel Manage user.
create or replace function public.machinery_diesel_can(p_company uuid, p_action text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select case p_action
           when 'use'    then public.machinery_can_any(p_company, array['claims', 'usage', 'cards', 'report', 'fuel_record'])
           when 'admin'  then public.machinery_can(p_company, 'claims', 'approve')
           when 'claim'  then public.machinery_can(p_company, 'claims', 'add')
           when 'report' then public.machinery_can(p_company, 'report', 'view') or public.machinery_can(p_company, 'claims', 'view_all')
           else false end;
$$;

select c.name as company, count(r.id) as fuel_records, coalesce(sum(r.litres), 0) as litres
  from public.machinery_companies c left join public.machinery_fuel_records r on r.company_id = c.id
 group by c.name order by c.name;
