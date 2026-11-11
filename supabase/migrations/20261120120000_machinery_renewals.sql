-- =====================================================================
-- >>> RUN THIS IN THE **MACHINERY PORTAL** DATABASE <<<
-- >>> Supabase project qcvbzzdbbqmnrljfnxjp (shared with MachTrek)   <<<
-- >>> NOT the MJM Intranet database (briqzyxfxsvulyizzbiu)            <<<
-- Safe to run more than once.
-- =====================================================================
-- Machinery Renewal: insurance, road tax and Puspakom renewals of every
-- machine, with history. Each renewal is one row here; the newest one is
-- copied onto the machine (machinery_machines.insurance_from / _to, …,
-- plus the reference no., routine months, amounts and document), so the
-- Machinery Profile always shows the current cover.
create table if not exists public.machinery_renewals (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.machinery_companies (id) on delete cascade,
  machine_id      uuid not null references public.machinery_machines (id) on delete cascade,
  kind            text not null check (kind in ('insurance', 'road_tax', 'puspakom')),
  ref_no          text check (char_length(ref_no) <= 80),         -- policy / road tax / Puspakom no.
  months          integer not null default 12 check (months between 1 and 60),
  insured_amount  numeric(14, 2) check (insured_amount is null or insured_amount >= 0),
  premium         numeric(14, 2) check (premium is null or premium >= 0),
  last_date       date not null,                                   -- last renewal
  expiry_date     date not null,                                   -- = last_date + months − 1 day
  doc_path        text,                                            -- file in machinery_machine_files
  notes           text check (char_length(notes) <= 500),
  created_by      uuid default auth.uid() references auth.users (id) on delete set null,
  created_at      timestamptz not null default now()
);
create index if not exists machinery_renewals_machine_idx on public.machinery_renewals (machine_id, kind, last_date desc);

alter table public.machinery_renewals enable row level security;
revoke all on public.machinery_renewals from anon, authenticated;
grant select, insert, update, delete on public.machinery_renewals to authenticated;
drop policy if exists "machinery_renewals_read" on public.machinery_renewals;
create policy "machinery_renewals_read" on public.machinery_renewals
  for select to authenticated using (public.machinery_can(company_id, 'machines', 'view'));
drop policy if exists "machinery_renewals_write" on public.machinery_renewals;
create policy "machinery_renewals_write" on public.machinery_renewals
  for all to authenticated
  using (public.machinery_can(company_id, 'machines', 'edit') or public.machinery_can(company_id, 'machines', 'add'))
  with check (public.machinery_can(company_id, 'machines', 'edit') or public.machinery_can(company_id, 'machines', 'add'));

-- The machine keeps the newest renewal of each kind
alter table public.machinery_machines
  add column if not exists insurance_no       text,
  add column if not exists insurance_months   integer,
  add column if not exists insurance_amount   numeric(14, 2),
  add column if not exists insurance_premium  numeric(14, 2),
  add column if not exists insurance_doc      text,
  add column if not exists road_tax_no        text,
  add column if not exists road_tax_months    integer,
  add column if not exists road_tax_doc       text,
  add column if not exists puspakom_no        text,
  add column if not exists puspakom_months    integer,
  add column if not exists puspakom_doc       text;

create or replace function public.machinery_apply_renewal(p_machine uuid, p_kind text)
returns void
language plpgsql security definer
set search_path = public
as $$
declare r record;
begin
  select * into r from public.machinery_renewals
   where machine_id = p_machine and kind = p_kind
   order by last_date desc, created_at desc limit 1;
  if p_kind = 'insurance' then
    update public.machinery_machines
       set insurance_from = r.last_date, insurance_to = r.expiry_date, insurance_no = r.ref_no,
           insurance_months = r.months, insurance_amount = r.insured_amount, insurance_premium = r.premium, insurance_doc = r.doc_path
     where id = p_machine;
  elsif p_kind = 'road_tax' then
    update public.machinery_machines
       set road_tax_from = r.last_date, road_tax_to = r.expiry_date, road_tax_no = r.ref_no,
           road_tax_months = r.months, road_tax_doc = r.doc_path
     where id = p_machine;
  else
    update public.machinery_machines
       set puspakom_from = r.last_date, puspakom_to = r.expiry_date, puspakom_no = r.ref_no,
           puspakom_months = r.months, puspakom_doc = r.doc_path
     where id = p_machine;
  end if;
end $$;

create or replace function public.machinery_renewal_changed()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    perform public.machinery_apply_renewal(old.machine_id, old.kind);
    return old;
  end if;
  new.expiry_date := coalesce(new.expiry_date, (new.last_date + (new.months || ' months')::interval - interval '1 day')::date);
  return new;
end $$;
create or replace function public.machinery_renewal_after()
returns trigger
language plpgsql
as $$
begin
  perform public.machinery_apply_renewal(new.machine_id, new.kind);
  return new;
end $$;
drop trigger if exists machinery_renewals_before on public.machinery_renewals;
create trigger machinery_renewals_before
  before insert or update or delete on public.machinery_renewals
  for each row execute function public.machinery_renewal_changed();
drop trigger if exists machinery_renewals_after on public.machinery_renewals;
create trigger machinery_renewals_after
  after insert or update on public.machinery_renewals
  for each row execute function public.machinery_renewal_after();

-- Periods already typed on the Machinery Profile become the first renewal rows
insert into public.machinery_renewals (company_id, machine_id, kind, months, last_date, expiry_date)
select m.company_id, m.id, k.kind,
       greatest(1, least(60, round(((k.to_d - k.from_d) + 1) / 30.4)::int)),
       k.from_d, k.to_d
  from public.machinery_machines m
  cross join lateral (values ('insurance', m.insurance_from, m.insurance_to),
                             ('road_tax', m.road_tax_from, m.road_tax_to),
                             ('puspakom', m.puspakom_from, m.puspakom_to)) as k(kind, from_d, to_d)
 where k.from_d is not null and k.to_d is not null and k.to_d >= k.from_d
   and not exists (select 1 from public.machinery_renewals r where r.machine_id = m.id and r.kind = k.kind);

select c.name as company, m.name, m.insurance_to, m.road_tax_to, m.puspakom_to
  from public.machinery_machines m join public.machinery_companies c on c.id = m.company_id
 order by c.name, m.name;
