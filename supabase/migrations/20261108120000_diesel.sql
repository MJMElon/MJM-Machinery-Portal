-- =====================================================================
-- >>> RUN THIS IN THE **MACHINERY PORTAL** DATABASE <<<
-- >>> Supabase project qcvbzzdbbqmnrljfnxjp (shared with MachTrek)   <<<
-- >>> NOT the MJM Intranet database (briqzyxfxsvulyizzbiu)            <<<
-- Supabase dashboard → (Machinery project) → SQL Editor → paste all → Run.
-- =====================================================================
-- =====================================================================
-- MJM Portal · Diesel Manage (ported from the Intranet's Diesel Claims
-- module, now per company): vehicles, cash fuel claims with receipt
-- photos, fleet cards (reloads + card fill-ups), reports.
-- Target: the SAME Supabase project as MachTrek. Safe to run more than once.
--
-- How to run: Supabase dashboard → SQL Editor → paste this whole file → Run.
-- Run 20261107120000_businesses.sql first (diesel_enabled on companies).
--
-- Access (checked in the database, per company):
--   super admin                 → everything in every company
--   machinery_diesel_members    → a row = may open Diesel Manage for that company
--     is_admin                  → module admin: vehicles, review claims, fleet
--                                 cards, user access (set by super admins)
--     can_claim                 → Cash Claim: submit own claims (receipt photo)
--     can_report                → Report: all vehicles / drivers / cards, export
--   access but no page          → only the vehicle list
-- Rules: a reviewer cannot review their own claim (super admins can);
-- approved claims can no longer be edited by the claimant.
-- Receipts: private bucket machinery_diesel_receipts/<company>/<user>/<file>.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Tables
-- ---------------------------------------------------------------------
create table if not exists public.machinery_diesel_members (
  company_id  uuid not null references public.machinery_companies (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  is_admin    boolean not null default false,
  can_claim   boolean not null default false,
  can_report  boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (company_id, user_id)
);

create table if not exists public.machinery_diesel_vehicles (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references public.machinery_companies (id) on delete cascade,
  plate_no         text not null check (char_length(btrim(plate_no)) between 1 and 20),
  name             text check (char_length(name) <= 80),
  vehicle_type     text not null default 'pickup'
                   check (vehicle_type in ('car', 'pickup', 'van', 'lorry', 'motorcycle', 'machinery', 'other')),
  fuel_type        text not null default 'diesel' check (fuel_type in ('diesel', 'petrol')),
  tank_capacity_l  numeric(6, 1) check (tank_capacity_l > 0),
  driver_id        uuid references auth.users (id) on delete set null,   -- usual driver
  status           text not null default 'active' check (status in ('active', 'inactive')),
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create unique index if not exists machinery_diesel_vehicles_plate_key
  on public.machinery_diesel_vehicles (company_id, upper(plate_no));

-- Cash claims. vehicle_id is "no action" (not "restrict") so that deleting a
-- company can cascade to vehicles and claims in one statement.
create table if not exists public.machinery_diesel_claims (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.machinery_companies (id) on delete cascade,
  vehicle_id    uuid not null references public.machinery_diesel_vehicles (id) on delete no action,
  claimant_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  fill_date     date not null default current_date,
  odometer_km   integer check (odometer_km >= 0),
  litres        numeric(8, 2) not null check (litres > 0 and litres < 2000),
  amount        numeric(10, 2) not null check (amount >= 0),
  station       text check (char_length(station) <= 120),
  receipt_path  text,
  notes         text check (char_length(notes) <= 500),
  status        text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'paid')),
  reviewed_by   uuid references auth.users (id) on delete set null,
  reviewed_at   timestamptz,
  review_note   text check (char_length(review_note) <= 500),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists machinery_diesel_claims_company_idx on public.machinery_diesel_claims (company_id, fill_date desc);
create index if not exists machinery_diesel_claims_vehicle_idx on public.machinery_diesel_claims (vehicle_id, fill_date);
create index if not exists machinery_diesel_claims_claimant_idx on public.machinery_diesel_claims (claimant_id, created_at desc);

create table if not exists public.machinery_diesel_cards (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.machinery_companies (id) on delete cascade,
  card_no        text not null check (char_length(btrim(card_no)) between 1 and 40),
  provider       text check (char_length(provider) <= 40),
  vehicle_id     uuid references public.machinery_diesel_vehicles (id) on delete set null,
  monthly_limit  numeric(10, 2) check (monthly_limit >= 0),
  status         text not null default 'active' check (status in ('active', 'blocked', 'cancelled')),
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create unique index if not exists machinery_diesel_cards_no_key on public.machinery_diesel_cards (company_id, lower(card_no));

create table if not exists public.machinery_diesel_card_reloads (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.machinery_companies (id) on delete cascade,
  card_id      uuid not null references public.machinery_diesel_cards (id) on delete no action,
  reload_date  date not null default current_date,
  amount       numeric(10, 2) not null check (amount > 0),
  reference    text check (char_length(reference) <= 80),
  notes        text check (char_length(notes) <= 500),
  created_by   uuid default auth.uid() references auth.users (id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists machinery_diesel_card_reloads_card_idx on public.machinery_diesel_card_reloads (card_id, reload_date);

create table if not exists public.machinery_diesel_card_usage (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.machinery_companies (id) on delete cascade,
  card_id      uuid not null references public.machinery_diesel_cards (id) on delete no action,
  vehicle_id   uuid not null references public.machinery_diesel_vehicles (id) on delete no action,
  driver_id    uuid references auth.users (id) on delete set null,
  fill_date    date not null default current_date,
  odometer_km  integer check (odometer_km >= 0),
  litres       numeric(8, 2) not null check (litres > 0 and litres < 2000),
  amount       numeric(10, 2) not null check (amount >= 0),
  station      text check (char_length(station) <= 120),
  notes        text check (char_length(notes) <= 500),
  created_by   uuid default auth.uid() references auth.users (id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists machinery_diesel_card_usage_card_idx on public.machinery_diesel_card_usage (card_id, fill_date);
create index if not exists machinery_diesel_card_usage_vehicle_idx on public.machinery_diesel_card_usage (vehicle_id, fill_date);

do $$
declare t text;
begin
  foreach t in array array['machinery_diesel_members', 'machinery_diesel_vehicles', 'machinery_diesel_claims', 'machinery_diesel_cards'] loop
    execute format('drop trigger if exists %1$s_touch on public.%1$s', t);
    execute format('create trigger %1$s_touch before update on public.%1$s
                    for each row execute function public.machinery_touch_updated_at()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 2) Access functions
-- ---------------------------------------------------------------------
-- What the signed-in user may do in Diesel Manage for a company:
--   use | admin | claim | report
create or replace function public.machinery_diesel_can(p_company uuid, p_action text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.is_machinery_super_admin() or exists (
    select 1 from public.machinery_diesel_members m
     where m.company_id = p_company and m.user_id = auth.uid()
       and case p_action
             when 'use'    then true
             when 'admin'  then m.is_admin
             when 'claim'  then m.is_admin or m.can_claim
             when 'report' then m.is_admin or m.can_report
             else false
           end);
$$;
revoke all on function public.machinery_diesel_can(uuid, text) from public, anon;
grant execute on function public.machinery_diesel_can(uuid, text) to authenticated;

-- People list for a company: module admins see every portal user (to give
-- access); Report users see the members (names in reports and drop-downs).
create or replace function public.machinery_diesel_people(p_company uuid)
returns table (
  user_id uuid, email text, full_name text, is_super_admin boolean,
  has_access boolean, is_admin boolean, can_claim boolean, can_report boolean
)
language sql stable security definer
set search_path = public
as $$
  select a.user_id, a.email, a.full_name, a.is_super_admin,
         (m.user_id is not null) as has_access,
         coalesce(m.is_admin, false), coalesce(m.can_claim, false), coalesce(m.can_report, false)
    from public.machinery_portal_admins a
    left join public.machinery_diesel_members m on m.user_id = a.user_id and m.company_id = p_company
   where public.machinery_diesel_can(p_company, 'admin')
      or (public.machinery_diesel_can(p_company, 'report') and (m.user_id is not null or a.is_super_admin))
   order by coalesce(a.full_name, a.email);
$$;
revoke all on function public.machinery_diesel_people(uuid) from public, anon;
grant execute on function public.machinery_diesel_people(uuid) to authenticated;

-- Members: module admins give / take Cash Claim and Report; only a super admin
-- makes someone a module admin. Nobody changes their own row (super admins can).
create or replace function public.machinery_diesel_members_guard()
returns trigger language plpgsql
set search_path = public
as $$
declare
  v_user uuid := case when tg_op = 'DELETE' then old.user_id else new.user_id end;
begin
  if auth.uid() is not null and not public.is_machinery_super_admin() then
    if v_user = auth.uid() then
      raise exception 'You cannot change your own Diesel access.' using errcode = '42501';
    end if;
    if (tg_op = 'INSERT' and new.is_admin)
       or (tg_op = 'UPDATE' and new.is_admin is distinct from old.is_admin)
       or (tg_op = 'DELETE' and old.is_admin) then
      raise exception 'Only a super admin can set or remove a Diesel module admin.' using errcode = '42501';
    end if;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end $$;
drop trigger if exists machinery_diesel_members_guard on public.machinery_diesel_members;
create trigger machinery_diesel_members_guard
  before insert or update or delete on public.machinery_diesel_members
  for each row execute function public.machinery_diesel_members_guard();

-- Claims: claimant / company never change; only a module admin changes the
-- status (not on their own claim, unless super admin) and the review fields.
create or replace function public.machinery_diesel_claims_guard()
returns trigger language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.company_id <> (select v.company_id from public.machinery_diesel_vehicles v where v.id = new.vehicle_id) then
      raise exception 'The vehicle belongs to another company.' using errcode = '23514';
    end if;
    return new;
  end if;
  if auth.uid() is null then
    return new;
  end if;
  if new.claimant_id <> old.claimant_id or new.company_id <> old.company_id then
    raise exception 'The claimant and company of a claim cannot be changed.' using errcode = '42501';
  end if;
  if new.vehicle_id <> old.vehicle_id
     and new.company_id <> (select v.company_id from public.machinery_diesel_vehicles v where v.id = new.vehicle_id) then
    raise exception 'The vehicle belongs to another company.' using errcode = '23514';
  end if;
  if new.status is distinct from old.status then
    if not public.machinery_diesel_can(old.company_id, 'admin') then
      raise exception 'Only a Diesel admin can review claims.' using errcode = '42501';
    end if;
    if old.claimant_id = auth.uid() and not public.is_machinery_super_admin() then
      raise exception 'You cannot review your own claim.' using errcode = '42501';
    end if;
    new.reviewed_by := auth.uid();
    new.reviewed_at := now();
    return new;
  end if;
  if not public.machinery_diesel_can(old.company_id, 'admin')
     and (new.reviewed_by is distinct from old.reviewed_by
          or new.reviewed_at is distinct from old.reviewed_at
          or new.review_note is distinct from old.review_note) then
    raise exception 'Only a Diesel admin can review claims.' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists machinery_diesel_claims_guard on public.machinery_diesel_claims;
create trigger machinery_diesel_claims_guard
  before insert or update on public.machinery_diesel_claims
  for each row execute function public.machinery_diesel_claims_guard();

-- Card records must stay inside one company.
create or replace function public.machinery_diesel_same_company_guard()
returns trigger language plpgsql
set search_path = public
as $$
begin
  if new.card_id is not null
     and new.company_id <> (select c.company_id from public.machinery_diesel_cards c where c.id = new.card_id) then
    raise exception 'The card belongs to another company.' using errcode = '23514';
  end if;
  if to_jsonb(new) ? 'vehicle_id' and (to_jsonb(new) ->> 'vehicle_id') is not null
     and new.company_id <> (select v.company_id from public.machinery_diesel_vehicles v
                             where v.id = (to_jsonb(new) ->> 'vehicle_id')::uuid) then
    raise exception 'The vehicle belongs to another company.' using errcode = '23514';
  end if;
  return new;
end $$;
drop trigger if exists machinery_diesel_card_reloads_guard on public.machinery_diesel_card_reloads;
create trigger machinery_diesel_card_reloads_guard
  before insert or update on public.machinery_diesel_card_reloads
  for each row execute function public.machinery_diesel_same_company_guard();
drop trigger if exists machinery_diesel_card_usage_guard on public.machinery_diesel_card_usage;
create trigger machinery_diesel_card_usage_guard
  before insert or update on public.machinery_diesel_card_usage
  for each row execute function public.machinery_diesel_same_company_guard();

create or replace function public.machinery_diesel_cards_guard()
returns trigger language plpgsql
set search_path = public
as $$
begin
  if new.vehicle_id is not null
     and new.company_id <> (select v.company_id from public.machinery_diesel_vehicles v where v.id = new.vehicle_id) then
    raise exception 'The vehicle belongs to another company.' using errcode = '23514';
  end if;
  return new;
end $$;
drop trigger if exists machinery_diesel_cards_guard on public.machinery_diesel_cards;
create trigger machinery_diesel_cards_guard
  before insert or update on public.machinery_diesel_cards
  for each row execute function public.machinery_diesel_cards_guard();

-- ---------------------------------------------------------------------
-- 3) RLS
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['machinery_diesel_members', 'machinery_diesel_vehicles', 'machinery_diesel_claims',
                           'machinery_diesel_cards', 'machinery_diesel_card_reloads', 'machinery_diesel_card_usage'] loop
    execute format('alter table public.%s enable row level security', t);
    execute format('revoke all on public.%s from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%s to authenticated', t);
  end loop;
end $$;

-- Members: own row, or admins of the company; admins write (guard above).
drop policy if exists "diesel_members_read" on public.machinery_diesel_members;
create policy "diesel_members_read" on public.machinery_diesel_members
  for select to authenticated
  using (user_id = auth.uid() or public.machinery_diesel_can(company_id, 'admin'));
drop policy if exists "diesel_members_write" on public.machinery_diesel_members;
create policy "diesel_members_write" on public.machinery_diesel_members
  for all to authenticated
  using (public.machinery_diesel_can(company_id, 'admin'))
  with check (public.machinery_diesel_can(company_id, 'admin')
              and exists (select 1 from public.machinery_portal_admins a where a.user_id = machinery_diesel_members.user_id));

-- Vehicles: everyone with access sees them; admins add / edit / delete.
drop policy if exists "diesel_vehicles_read" on public.machinery_diesel_vehicles;
create policy "diesel_vehicles_read" on public.machinery_diesel_vehicles
  for select to authenticated using (public.machinery_diesel_can(company_id, 'use'));
drop policy if exists "diesel_vehicles_write" on public.machinery_diesel_vehicles;
create policy "diesel_vehicles_write" on public.machinery_diesel_vehicles
  for all to authenticated
  using (public.machinery_diesel_can(company_id, 'admin'))
  with check (public.machinery_diesel_can(company_id, 'admin'));

-- Claims: own, or Report / admins see all of the company.
drop policy if exists "diesel_claims_read" on public.machinery_diesel_claims;
create policy "diesel_claims_read" on public.machinery_diesel_claims
  for select to authenticated
  using (claimant_id = auth.uid() or public.machinery_diesel_can(company_id, 'report'));
-- New claim: Cash Claim access, for yourself, pending, on an active vehicle.
drop policy if exists "diesel_claims_insert" on public.machinery_diesel_claims;
create policy "diesel_claims_insert" on public.machinery_diesel_claims
  for insert to authenticated
  with check (
    public.machinery_diesel_can(company_id, 'claim')
    and claimant_id = auth.uid()
    and status = 'pending'
    and reviewed_by is null
    and exists (select 1 from public.machinery_diesel_vehicles v
                 where v.id = vehicle_id and v.company_id = machinery_diesel_claims.company_id and v.status = 'active')
  );
-- Edit: own pending claim, or an admin (review); details checked by the guard.
drop policy if exists "diesel_claims_update" on public.machinery_diesel_claims;
create policy "diesel_claims_update" on public.machinery_diesel_claims
  for update to authenticated
  using ((claimant_id = auth.uid() and status = 'pending') or public.machinery_diesel_can(company_id, 'admin'))
  with check ((claimant_id = auth.uid() and status = 'pending') or public.machinery_diesel_can(company_id, 'admin'));
-- Delete: own pending claim; super admins any claim.
drop policy if exists "diesel_claims_delete" on public.machinery_diesel_claims;
create policy "diesel_claims_delete" on public.machinery_diesel_claims
  for delete to authenticated
  using ((claimant_id = auth.uid() and status = 'pending') or public.is_machinery_super_admin());

-- Fleet cards, reloads, card fill-ups: Report sees; admins record.
do $$
declare t text;
begin
  foreach t in array array['machinery_diesel_cards', 'machinery_diesel_card_reloads', 'machinery_diesel_card_usage'] loop
    execute format('drop policy if exists "%1$s_read" on public.%1$s', t);
    execute format('create policy "%1$s_read" on public.%1$s for select to authenticated
                    using (public.machinery_diesel_can(company_id, ''report''))', t);
    execute format('drop policy if exists "%1$s_write" on public.%1$s', t);
    execute format('create policy "%1$s_write" on public.%1$s for all to authenticated
                    using (public.machinery_diesel_can(company_id, ''admin''))
                    with check (public.machinery_diesel_can(company_id, ''admin''))', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 4) Receipts: private bucket, files under <company id>/<uploader id>/
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('machinery_diesel_receipts', 'machinery_diesel_receipts', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

drop policy if exists "machinery diesel receipts upload" on storage.objects;
create policy "machinery diesel receipts upload" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'machinery_diesel_receipts'
    and (storage.foldername(name))[2] = auth.uid()::text
    and public.machinery_diesel_can(((storage.foldername(name))[1])::uuid, 'claim')
  );
drop policy if exists "machinery diesel receipts read" on storage.objects;
create policy "machinery diesel receipts read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'machinery_diesel_receipts'
    and ((storage.foldername(name))[2] = auth.uid()::text
         or public.machinery_diesel_can(((storage.foldername(name))[1])::uuid, 'report'))
  );
drop policy if exists "machinery diesel receipts delete own" on storage.objects;
create policy "machinery diesel receipts delete own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'machinery_diesel_receipts' and (storage.foldername(name))[2] = auth.uid()::text);

-- Shows which companies have Diesel Manage switched on.
select name, code, diesel_enabled from public.machinery_companies order by name;
