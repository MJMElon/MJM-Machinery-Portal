-- =====================================================================
-- >>> RUN THIS IN THE **MACHINERY PORTAL** DATABASE <<<
-- >>> Supabase project qcvbzzdbbqmnrljfnxjp (shared with MachTrek)   <<<
-- >>> NOT the MJM Intranet database (briqzyxfxsvulyizzbiu)            <<<
-- Supabase dashboard → (Machinery project) → SQL Editor → paste all → Run.
-- Run the earlier migrations (… 20261111120000_permissions_matrix.sql) first.
-- Safe to run more than once.
-- =====================================================================
--
-- A fuel claim is now a document with several receipt lines:
--   machinery_diesel_claims        = the claim header (running no., claimant,
--                                    submission date, status, totals)
--   machinery_diesel_claim_lines   = one line per receipt: date, vehicle,
--                                    litres, unit price, amount, receipt no.,
--                                    payment (cash / fleet card), subsidised,
--                                    remark, receipt photo
-- Payable amount = sum of cash lines (fleet-card lines are recorded for litres
-- and cost but nothing is paid back to the person).
-- Existing claims are turned into a header with one line.
-- =====================================================================

-- 1) Header: submission date, totals; the old per-fill columns become optional
alter table public.machinery_diesel_claims
  add column if not exists submitted_on   date not null default current_date,
  add column if not exists total_litres   numeric(10, 2) not null default 0,
  add column if not exists payable_amount numeric(10, 2) not null default 0;
update public.machinery_diesel_claims set submitted_on = fill_date where submitted_on is distinct from fill_date and fill_date is not null;
alter table public.machinery_diesel_claims drop constraint if exists machinery_diesel_claims_litres_check;
alter table public.machinery_diesel_claims alter column litres drop not null;
alter table public.machinery_diesel_claims alter column fill_date set default current_date;

-- 2) Lines
create table if not exists public.machinery_diesel_claim_lines (
  id            uuid primary key default gen_random_uuid(),
  claim_id      uuid not null references public.machinery_diesel_claims (id) on delete cascade,
  company_id    uuid not null references public.machinery_companies (id) on delete cascade,
  line_no       integer not null default 1,
  fill_date     date not null default current_date,
  vehicle_id    uuid references public.machinery_machines (id) on delete set null,
  litres        numeric(8, 2) check (litres is null or (litres > 0 and litres < 5000)),
  unit_price    numeric(8, 3) check (unit_price is null or unit_price >= 0),
  amount        numeric(10, 2) not null default 0 check (amount >= 0),
  payment       text not null default 'cash' check (payment in ('cash', 'fleet_card')),
  subsidised    boolean not null default false,
  receipt_no    text check (char_length(receipt_no) <= 60),
  station       text check (char_length(station) <= 120),
  odometer_km   integer check (odometer_km >= 0),
  remark        text check (char_length(remark) <= 300),
  receipt_path  text,
  created_at    timestamptz not null default now()
);
create index if not exists machinery_diesel_claim_lines_claim_idx on public.machinery_diesel_claim_lines (claim_id, line_no);
create index if not exists machinery_diesel_claim_lines_company_idx on public.machinery_diesel_claim_lines (company_id, fill_date desc);
create index if not exists machinery_diesel_claim_lines_vehicle_idx on public.machinery_diesel_claim_lines (vehicle_id, fill_date);

-- Existing claims → one line each (only once)
insert into public.machinery_diesel_claim_lines
  (claim_id, company_id, line_no, fill_date, vehicle_id, litres, amount, payment, station, odometer_km, remark, receipt_path, created_at)
select c.id, c.company_id, 1, c.fill_date, c.vehicle_id, c.litres, c.amount, 'cash', c.station, c.odometer_km, c.notes, c.receipt_path, c.created_at
  from public.machinery_diesel_claims c
 where not exists (select 1 from public.machinery_diesel_claim_lines l where l.claim_id = c.id);

-- 3) Totals on the header follow the lines
create or replace function public.machinery_diesel_claim_totals()
returns trigger language plpgsql security definer
set search_path = public
as $$
declare
  v_claim uuid := coalesce(new.claim_id, old.claim_id);
begin
  update public.machinery_diesel_claims c
     set amount         = coalesce((select sum(l.amount) from public.machinery_diesel_claim_lines l where l.claim_id = v_claim), 0),
         total_litres   = coalesce((select sum(l.litres) from public.machinery_diesel_claim_lines l where l.claim_id = v_claim), 0),
         litres         = coalesce((select sum(l.litres) from public.machinery_diesel_claim_lines l where l.claim_id = v_claim), 0),
         payable_amount = coalesce((select sum(l.amount) from public.machinery_diesel_claim_lines l where l.claim_id = v_claim and l.payment = 'cash'), 0),
         fill_date      = coalesce((select min(l.fill_date) from public.machinery_diesel_claim_lines l where l.claim_id = v_claim), c.submitted_on),
         vehicle_id     = (select l.vehicle_id from public.machinery_diesel_claim_lines l where l.claim_id = v_claim order by l.line_no limit 1),
         receipt_path   = (select l.receipt_path from public.machinery_diesel_claim_lines l where l.claim_id = v_claim and l.receipt_path is not null order by l.line_no limit 1)
   where c.id = v_claim;
  return null;
end $$;
drop trigger if exists machinery_diesel_claim_totals on public.machinery_diesel_claim_lines;
create trigger machinery_diesel_claim_totals
  after insert or update or delete on public.machinery_diesel_claim_lines
  for each row execute function public.machinery_diesel_claim_totals();

-- Recompute once for the migrated rows
update public.machinery_diesel_claims c
   set total_litres   = coalesce((select sum(l.litres) from public.machinery_diesel_claim_lines l where l.claim_id = c.id), 0),
       payable_amount = coalesce((select sum(l.amount) from public.machinery_diesel_claim_lines l where l.claim_id = c.id and l.payment = 'cash'), 0);

-- The header guard: the sums are set by the trigger (service definer), fine.
-- Lines must stay in the claim's company and with a vehicle of that company.
create or replace function public.machinery_diesel_claim_lines_guard()
returns trigger language plpgsql
set search_path = public
as $$
declare v_company uuid;
begin
  select company_id into v_company from public.machinery_diesel_claims where id = new.claim_id;
  if v_company is null then
    raise exception 'claim not found' using errcode = 'P0002';
  end if;
  new.company_id := v_company;
  if new.vehicle_id is not null
     and v_company <> (select v.company_id from public.machinery_machines v where v.id = new.vehicle_id) then
    raise exception 'The vehicle belongs to another company.' using errcode = '23514';
  end if;
  if new.payment = 'fleet_card' and new.vehicle_id is not null and tg_op = 'INSERT' and new.subsidised = false then
    -- default: a fleet-card fill-up on a KPDN subsidy vehicle is subsidised fuel
    select coalesce(m.kpdn_subsidy, false) into new.subsidised from public.machinery_machines m where m.id = new.vehicle_id;
  end if;
  return new;
end $$;
drop trigger if exists machinery_diesel_claim_lines_guard on public.machinery_diesel_claim_lines;
create trigger machinery_diesel_claim_lines_guard
  before insert or update on public.machinery_diesel_claim_lines
  for each row execute function public.machinery_diesel_claim_lines_guard();

-- 4) RLS: a line is visible / editable exactly like its claim
alter table public.machinery_diesel_claim_lines enable row level security;
revoke all on public.machinery_diesel_claim_lines from anon, authenticated;
grant select, insert, update, delete on public.machinery_diesel_claim_lines to authenticated;

drop policy if exists "claim_lines_read" on public.machinery_diesel_claim_lines;
create policy "claim_lines_read" on public.machinery_diesel_claim_lines
  for select to authenticated
  using (exists (select 1 from public.machinery_diesel_claims c where c.id = claim_id
                   and ((c.claimant_id = auth.uid() and public.machinery_can(c.company_id, 'claims', 'view'))
                        or public.machinery_can(c.company_id, 'claims', 'view_all')
                        or public.machinery_can(c.company_id, 'report', 'view')
                        or public.machinery_can(c.company_id, 'usage', 'view'))));
drop policy if exists "claim_lines_write" on public.machinery_diesel_claim_lines;
create policy "claim_lines_write" on public.machinery_diesel_claim_lines
  for all to authenticated
  using (public.is_machinery_super_admin() or exists (select 1 from public.machinery_diesel_claims c where c.id = claim_id
                   and c.claimant_id = auth.uid() and c.status = 'pending'
                   and (public.machinery_can(c.company_id, 'claims', 'add') or public.machinery_can(c.company_id, 'claims', 'edit'))))
  with check (public.is_machinery_super_admin() or exists (select 1 from public.machinery_diesel_claims c where c.id = claim_id
                   and c.claimant_id = auth.uid() and c.status = 'pending'
                   and (public.machinery_can(c.company_id, 'claims', 'add') or public.machinery_can(c.company_id, 'claims', 'edit'))));

-- Shows claims with their line counts and totals.
select c.claim_no, c.submitted_on, c.status, c.total_litres, c.amount as total_amount, c.payable_amount,
       (select count(*) from public.machinery_diesel_claim_lines l where l.claim_id = c.id) as lines
  from public.machinery_diesel_claims c order by c.company_id, c.claim_no;
