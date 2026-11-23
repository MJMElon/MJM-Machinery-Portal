-- =====================================================================
-- >>> RUN THIS IN THE **MACHINERY PORTAL** DATABASE <<<
-- >>> Supabase project qcvbzzdbbqmnrljfnxjp (shared with MachTrek)   <<<
-- Needs 20261211 (card month usage). Safe to run more than once.
-- =====================================================================
-- Daily fleet card statement import (Setel or another station portal):
-- an AI agent (or a person, with a CSV in Fleet Card Manage) sends each
-- day's card transactions. Each transaction is kept once, put on the card
-- it was made with, and paired with the driver's fuel claim receipt for the
-- same fill when there is one, so a fill is never counted twice:
--   statement row + its claim receipt  = 1 fill (shown as "Claimed ✓ statement")
--   statement row with no claim yet    = 1 fill (shown as "Not claimed yet")
--   claim receipt with no statement    = 1 fill (as before)

-- 1) Fill-ups on a card: where they came from, the statement's own id, and
--    the claim receipt they were paired with.
alter table public.machinery_diesel_card_usage
  add column if not exists source text not null default 'manual',
  add column if not exists external_ref text,
  add column if not exists fill_at timestamptz,
  add column if not exists receipt_no text,
  add column if not exists product text,
  add column if not exists driver_name text,
  add column if not exists vehicle_text text,
  add column if not exists claim_line_id uuid references public.machinery_diesel_claim_lines(id) on delete set null,
  add column if not exists import_id uuid,
  add column if not exists imported_at timestamptz;

-- a statement row may not know the vehicle (card with no vehicle, unknown plate)
alter table public.machinery_diesel_card_usage alter column vehicle_id drop not null;

do $$ begin
  alter table public.machinery_diesel_card_usage
    add constraint machinery_diesel_card_usage_source_chk check (source in ('manual', 'setel', 'statement'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.machinery_diesel_card_usage
    add constraint machinery_diesel_card_usage_text_chk check (
      char_length(coalesce(external_ref, '')) <= 120 and char_length(coalesce(receipt_no, '')) <= 60 and
      char_length(coalesce(product, '')) <= 60 and char_length(coalesce(driver_name, '')) <= 120 and
      char_length(coalesce(vehicle_text, '')) <= 40);
exception when duplicate_object then null; end $$;

-- one row per statement transaction; one statement row per claim receipt
create unique index if not exists machinery_diesel_card_usage_ref_key
  on public.machinery_diesel_card_usage (company_id, source, external_ref) where external_ref is not null;
create unique index if not exists machinery_diesel_card_usage_line_key
  on public.machinery_diesel_card_usage (claim_line_id) where claim_line_id is not null;
create index if not exists machinery_diesel_card_usage_card_date
  on public.machinery_diesel_card_usage (card_id, fill_date);

-- 2) Import log: what each daily run brought in, and what it could not place.
create table if not exists public.machinery_card_imports (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'setel',
  company_ids uuid[] not null default '{}',
  by_user uuid references auth.users(id) on delete set null,   -- null = the AI agent (API key)
  received integer not null default 0,
  added integer not null default 0,
  duplicates integer not null default 0,
  paired integer not null default 0,
  problems jsonb not null default '[]',
  created_at timestamptz not null default now()
);
alter table public.machinery_card_imports enable row level security;
drop policy if exists machinery_card_imports_read on public.machinery_card_imports;
create policy machinery_card_imports_read on public.machinery_card_imports for select to authenticated
  using (public.is_machinery_super_admin()
         or exists (select 1 from unnest(company_ids) c where public.machinery_can(c, 'cards', 'view')));
revoke insert, update, delete on public.machinery_card_imports from anon, authenticated;
grant select on public.machinery_card_imports to authenticated;

-- 3) Pairing a statement row with a claim receipt: same card, same day (or a
--    day either side), amount within RM 0.10, or the same receipt number.
--    Rejected claims are never paired (the driver may claim again).
create or replace function public.machinery_pair_usage(p_usage uuid)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare u record; v_line uuid;
begin
  select * into u from public.machinery_diesel_card_usage where id = p_usage;
  if not found or u.claim_line_id is not null or u.source = 'manual' then return u.claim_line_id; end if;
  select l.id into v_line
    from public.machinery_diesel_claim_lines l
    join public.machinery_diesel_claims c on c.id = l.claim_id
   where l.card_id = u.card_id and l.payment = 'fleet_card' and l.line_kind = 'fill'
     and c.status <> 'rejected'
     and l.fill_date between u.fill_date - 1 and u.fill_date + 1
     and (abs(l.amount - u.amount) <= 0.10
          or (u.receipt_no is not null and l.receipt_no is not null
              and regexp_replace(lower(l.receipt_no), '[^a-z0-9]', '', 'g') = regexp_replace(lower(u.receipt_no), '[^a-z0-9]', '', 'g')))
     and not exists (select 1 from public.machinery_diesel_card_usage x where x.claim_line_id = l.id)
   order by (l.fill_date = u.fill_date) desc, abs(l.amount - u.amount), abs(coalesce(l.litres, 0) - coalesce(u.litres, 0)), l.created_at
   limit 1;
  if v_line is not null then
    update public.machinery_diesel_card_usage set claim_line_id = v_line where id = p_usage and claim_line_id is null;
  end if;
  return v_line;
end $$;
revoke all on function public.machinery_pair_usage(uuid) from public, anon, authenticated;

create or replace function public.machinery_pair_line(p_line uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare l record; v_usage uuid;
begin
  select ln.*, c.status as claim_status into l
    from public.machinery_diesel_claim_lines ln join public.machinery_diesel_claims c on c.id = ln.claim_id
   where ln.id = p_line;
  if not found or l.card_id is null or l.payment <> 'fleet_card' or l.line_kind <> 'fill' or l.claim_status = 'rejected' then return; end if;
  if exists (select 1 from public.machinery_diesel_card_usage x where x.claim_line_id = p_line) then return; end if;
  select u.id into v_usage
    from public.machinery_diesel_card_usage u
   where u.card_id = l.card_id and u.claim_line_id is null and u.source <> 'manual'
     and u.fill_date between l.fill_date - 1 and l.fill_date + 1
     and (abs(l.amount - u.amount) <= 0.10
          or (u.receipt_no is not null and l.receipt_no is not null
              and regexp_replace(lower(l.receipt_no), '[^a-z0-9]', '', 'g') = regexp_replace(lower(u.receipt_no), '[^a-z0-9]', '', 'g')))
   order by (u.fill_date = l.fill_date) desc, abs(l.amount - u.amount), abs(coalesce(l.litres, 0) - coalesce(u.litres, 0)), u.fill_at nulls last
   limit 1;
  if v_usage is not null then
    update public.machinery_diesel_card_usage set claim_line_id = p_line where id = v_usage and claim_line_id is null;
  end if;
end $$;
revoke all on function public.machinery_pair_line(uuid) from public, anon, authenticated;

-- a statement row arrives → look for its claim receipt
create or replace function public.machinery_card_usage_pair_trg()
returns trigger language plpgsql security definer set search_path = public
as $$ begin
  perform public.machinery_pair_usage(new.id);
  return null;
end $$;
drop trigger if exists machinery_diesel_card_usage_pair on public.machinery_diesel_card_usage;
create trigger machinery_diesel_card_usage_pair after insert on public.machinery_diesel_card_usage
  for each row when (new.source <> 'manual' and new.claim_line_id is null)
  execute function public.machinery_card_usage_pair_trg();

-- a claim receipt is saved or changed → (re)pair it
create or replace function public.machinery_claim_line_pair_trg()
returns trigger language plpgsql security definer set search_path = public
as $$
declare v_old uuid;
begin
  if tg_op = 'UPDATE' then
    if (new.card_id, new.payment, new.line_kind, new.fill_date, new.amount, coalesce(new.receipt_no, ''))
       is not distinct from (old.card_id, old.payment, old.line_kind, old.fill_date, old.amount, coalesce(old.receipt_no, '')) then
      return null;
    end if;
    -- the receipt changed: let go of its statement row, then pair again
    update public.machinery_diesel_card_usage set claim_line_id = null where claim_line_id = new.id returning id into v_old;
  end if;
  perform public.machinery_pair_line(new.id);
  if v_old is not null then perform public.machinery_pair_usage(v_old); end if;
  return null;
end $$;
drop trigger if exists machinery_diesel_claim_lines_pair on public.machinery_diesel_claim_lines;
create trigger machinery_diesel_claim_lines_pair after insert or update on public.machinery_diesel_claim_lines
  for each row execute function public.machinery_claim_line_pair_trg();

-- a claim is rejected → its statement rows are free again (not claimed yet);
-- a rejected claim is sent again → pair its receipts again
create or replace function public.machinery_claim_status_pair_trg()
returns trigger language plpgsql security definer set search_path = public
as $$
declare r record;
begin
  if new.status = 'rejected' and old.status <> 'rejected' then
    for r in update public.machinery_diesel_card_usage u set claim_line_id = null
              where u.claim_line_id in (select l.id from public.machinery_diesel_claim_lines l where l.claim_id = new.id)
             returning u.id loop
      perform public.machinery_pair_usage(r.id);
    end loop;
  elsif old.status = 'rejected' and new.status <> 'rejected' then
    for r in select l.id from public.machinery_diesel_claim_lines l where l.claim_id = new.id loop
      perform public.machinery_pair_line(r.id);
    end loop;
  end if;
  return null;
end $$;
drop trigger if exists machinery_diesel_claims_pair on public.machinery_diesel_claims;
create trigger machinery_diesel_claims_pair after update of status on public.machinery_diesel_claims
  for each row execute function public.machinery_claim_status_pair_trg();

-- 4) The import itself. p_rows: [{ card_no, txn_id, date ('YYYY-MM-DD'),
--    time ('HH:MM', optional), litres, amount, station, product, vehicle,
--    driver, receipt_no, company (code, optional) }], dates in Malaysia time.
--    The AI agent calls it through the fleet-card-import function (API key);
--    a person with Fleet Card Manage edit rights can call it for one company
--    (CSV upload in Fleet Card Manage).
--    Card numbers may be masked ("7083 **** **** 1234"): known digits must
--    match and only one card may fit, else the row is reported, not saved.
create or replace function public.machinery_import_card_transactions(p_rows jsonb, p_source text default 'setel', p_company uuid default null)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_role text := coalesce(nullif(current_setting('request.jwt.claim.role', true), ''),
                          nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '');
  v_agent boolean := v_role = 'service_role';
  v_import uuid := gen_random_uuid();
  r jsonb; i int := 0;
  v_card record; v_cards int; v_pat text; v_digits text; v_known int;
  v_ref text; v_date date; v_at timestamptz; v_litres numeric; v_amount numeric;
  v_vehicle uuid; v_driver uuid; v_company uuid; v_id uuid; v_line uuid;
  n_added int := 0; n_dup int := 0; n_paired int := 0;
  v_problems jsonb := '[]'; v_companies uuid[] := '{}';
  v_reason text;
begin
  if p_source not in ('setel', 'statement') then raise exception 'Unknown source.' using errcode = '22023'; end if;
  if not v_agent then
    if auth.uid() is null or p_company is null or not coalesce(public.machinery_can(p_company, 'cards', 'edit'), false) then
      raise exception 'Not allowed.' using errcode = '42501';
    end if;
  end if;
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'Rows must be a list.' using errcode = '22023'; end if;
  if jsonb_array_length(p_rows) > 3000 then raise exception 'At most 3000 rows per import.' using errcode = '22023'; end if;

  for r in select * from jsonb_array_elements(p_rows) loop
    i := i + 1;
    v_reason := null;
    begin
      -- the values
      v_ref := nullif(btrim(r ->> 'txn_id'), '');
      v_date := (r ->> 'date')::date;
      v_litres := round((r ->> 'litres')::numeric, 3);
      v_amount := round((r ->> 'amount')::numeric, 2);
      v_at := case when nullif(r ->> 'time', '') is not null
                   then ((r ->> 'date') || ' ' || (r ->> 'time'))::timestamp at time zone 'Asia/Kuala_Lumpur' end;
      if v_ref is null then v_reason := 'No transaction id';
      elsif char_length(v_ref) > 120 then v_reason := 'Transaction id too long';
      elsif v_date is null or v_date < date '2020-01-01' or v_date > (now() at time zone 'Asia/Kuala_Lumpur')::date + 1 then v_reason := 'Bad date';
      elsif v_litres is null or v_litres <= 0 or v_litres >= 2000 then v_reason := 'Bad litres';
      elsif v_amount is null or v_amount < 0 or v_amount > 100000 then v_reason := 'Bad amount';
      end if;
    exception when others then
      v_reason := 'Bad date, time or number';
    end;

    -- the card
    if v_reason is null then
      v_pat := regexp_replace(upper(coalesce(r ->> 'card_no', '')), '[^0-9*X•]', '', 'g');
      v_digits := regexp_replace(v_pat, '[^0-9]', '', 'g');
      v_known := char_length(v_digits);
      v_pat := regexp_replace(v_pat, '^[*X•]+', '%');            -- "****1234" → "%1234"
      v_pat := translate(v_pat, '*X•', '___');                    -- inner masks → one digit each
      if v_known < 4 then
        v_reason := 'Card number missing';
      else
        select count(*) into v_cards
          from public.machinery_diesel_cards c
          left join public.machinery_companies co on co.id = c.company_id
         where c.card_no is not null
           and regexp_replace(c.card_no, '[^0-9]', '', 'g') like v_pat
           and (p_company is null or c.company_id = p_company)
           and (nullif(btrim(r ->> 'company'), '') is null
                or lower(co.code) = lower(btrim(r ->> 'company')) or lower(co.short_name) = lower(btrim(r ->> 'company')));
        if v_cards = 0 then v_reason := 'Card not in Fleet Card Manage';
        elsif v_cards > 1 then v_reason := 'Card number fits more than one card';
        else
          select c.* into v_card
            from public.machinery_diesel_cards c
            left join public.machinery_companies co on co.id = c.company_id
           where c.card_no is not null
             and regexp_replace(c.card_no, '[^0-9]', '', 'g') like v_pat
             and (p_company is null or c.company_id = p_company)
             and (nullif(btrim(r ->> 'company'), '') is null
                  or lower(co.code) = lower(btrim(r ->> 'company')) or lower(co.short_name) = lower(btrim(r ->> 'company')));
        end if;
      end if;
    end if;

    if v_reason is not null then
      v_problems := v_problems || jsonb_build_object('row', i, 'txn_id', left(r ->> 'txn_id', 120),
                      'card_no', left(r ->> 'card_no', 40), 'date', left(r ->> 'date', 20), 'amount', left(r ->> 'amount', 20), 'reason', v_reason);
      continue;
    end if;
    v_company := v_card.company_id;

    -- the vehicle: the plate on the statement if we know it, else the card's vehicle
    v_vehicle := null;
    if nullif(btrim(r ->> 'vehicle'), '') is not null then
      select m.id into v_vehicle from public.machinery_machines m
       where m.company_id = v_company
         and regexp_replace(upper(coalesce(m.reg_no, '')), '[^A-Z0-9]', '', 'g') = regexp_replace(upper(r ->> 'vehicle'), '[^A-Z0-9]', '', 'g')
       limit 1;
    end if;
    v_vehicle := coalesce(v_vehicle, v_card.vehicle_id);

    -- the driver: a card driver whose name is on the statement
    v_driver := null;
    if nullif(btrim(r ->> 'driver'), '') is not null then
      select a.user_id into v_driver from public.machinery_portal_admins a
       where a.user_id = any (coalesce(v_card.driver_ids, '{}'))
         and lower(btrim(a.full_name)) = lower(btrim(r ->> 'driver'))
       limit 1;
    end if;

    insert into public.machinery_diesel_card_usage
      (company_id, card_id, vehicle_id, driver_id, fill_date, fill_at, litres, amount, station, product,
       receipt_no, driver_name, vehicle_text, source, external_ref, import_id, imported_at, created_by, notes)
    values
      (v_company, v_card.id, v_vehicle, v_driver, v_date, v_at, v_litres, v_amount,
       left(nullif(btrim(r ->> 'station'), ''), 120), left(nullif(btrim(r ->> 'product'), ''), 60),
       left(nullif(btrim(r ->> 'receipt_no'), ''), 60), left(nullif(btrim(r ->> 'driver'), ''), 120),
       left(nullif(btrim(r ->> 'vehicle'), ''), 40), p_source, v_ref, v_import, now(), auth.uid(),
       case when v_agent then 'Imported by the AI agent' else 'Imported from a statement file' end)
    on conflict (company_id, source, external_ref) where external_ref is not null do nothing
    returning id, claim_line_id into v_id, v_line;

    if v_id is null then
      n_dup := n_dup + 1;
    else
      n_added := n_added + 1;
      if v_line is null then select claim_line_id into v_line from public.machinery_diesel_card_usage where id = v_id; end if;
      if v_line is not null then n_paired := n_paired + 1; end if;
      if not v_company = any (v_companies) then v_companies := v_companies || v_company; end if;
    end if;
  end loop;

  insert into public.machinery_card_imports (id, source, company_ids, by_user, received, added, duplicates, paired, problems)
  values (v_import, p_source, case when p_company is not null and cardinality(v_companies) = 0 then array[p_company] else v_companies end,
          auth.uid(), i, n_added, n_dup, n_paired, v_problems);

  return jsonb_build_object('import_id', v_import, 'received', i, 'added', n_added, 'duplicates', n_dup,
                            'paired_with_claims', n_paired, 'not_saved', jsonb_array_length(v_problems), 'problems', v_problems);
end $$;
revoke all on function public.machinery_import_card_transactions(jsonb, text, uuid) from public, anon;
grant execute on function public.machinery_import_card_transactions(jsonb, text, uuid) to authenticated, service_role;

-- 5) Counting: a statement row paired with a counted claim receipt is that
--    receipt (counted once, on the claim side).
create or replace function public.machinery_usage_counted(p_line uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select p_line is null or not exists (
    select 1 from public.machinery_diesel_claim_lines l
      join public.machinery_diesel_claims c on c.id = l.claim_id
     where l.id = p_line and c.status not in ('rejected', 'draft'));
$$;
revoke all on function public.machinery_usage_counted(uuid) from public, anon;
grant execute on function public.machinery_usage_counted(uuid) to authenticated;

create or replace function public.machinery_card_ledger(p_company uuid)
returns table (card_id uuid, month text, kind text, amount numeric, litres numeric, entries integer)
language sql security definer stable
set search_path = public
as $$
  with ok as (
    select public.machinery_can(p_company, 'cards', 'view') or public.machinery_can(p_company, 'report', 'view') as yes
  ),
  reloads as (
    select r.card_id, to_char(r.reload_date, 'YYYY-MM') as month, 'reload'::text as kind,
           sum(r.amount) as amount, 0::numeric as litres, count(*)::int as entries
      from public.machinery_diesel_card_reloads r
     where r.company_id = p_company
     group by r.card_id, to_char(r.reload_date, 'YYYY-MM')
  ),
  usage_rows as (
    select u.card_id, u.fill_date, u.amount, u.litres
      from public.machinery_diesel_card_usage u
     where u.company_id = p_company and public.machinery_usage_counted(u.claim_line_id)
    union all
    select x.card_id, x.fill_date, x.amount, x.litres
      from (
        select coalesce(l.card_id, public.machinery_card_for_line(p_company, l.vehicle_id, c.claimant_id)) as card_id,
               l.fill_date, l.amount, l.litres
          from public.machinery_diesel_claim_lines l
          join public.machinery_diesel_claims c on c.id = l.claim_id
         where l.company_id = p_company and l.payment = 'fleet_card' and l.line_kind = 'fill'
           and c.status not in ('rejected', 'draft')
      ) x
     where x.card_id is not null
  ),
  used as (
    select u.card_id, to_char(u.fill_date, 'YYYY-MM') as month, 'usage'::text as kind,
           sum(u.amount) as amount, sum(coalesce(u.litres, 0)) as litres, count(*)::int as entries
      from usage_rows u
     group by u.card_id, to_char(u.fill_date, 'YYYY-MM')
  )
  select * from reloads where (select yes from ok)
  union all
  select * from used where (select yes from ok);
$$;
revoke all on function public.machinery_card_ledger(uuid) from public, anon;
grant execute on function public.machinery_card_ledger(uuid) to authenticated;

create or replace function public.machinery_my_fleet_cards(p_company uuid)
returns jsonb
language sql stable security definer
set search_path = public
as $$
  with today as (
    select (now() at time zone 'Asia/Kuala_Lumpur')::date as d
  ), mine as (
    select c.id, c.card_no, c.provider, c.status, c.subsidy_litres, c.vehicle_id
      from public.machinery_diesel_cards c
     where c.company_id = p_company
       and auth.uid() = any (c.driver_ids)
       and c.card_no is not null
       and c.status not in ('cancelled', 'application')
  ), fills as (
    select l.card_id, l.fill_date, l.litres, l.amount, l.vehicle_id, cl.claimant_id as driver_id, null::text as driver_name, l.created_at
      from public.machinery_diesel_claim_lines l
      join public.machinery_diesel_claims cl on cl.id = l.claim_id
     where l.card_id in (select id from mine)
       and l.payment = 'fleet_card' and l.line_kind = 'fill'
       and cl.status not in ('rejected', 'draft')
    union all
    select u.card_id, u.fill_date, u.litres, u.amount, u.vehicle_id, u.driver_id, u.driver_name, coalesce(u.fill_at, u.created_at)
      from public.machinery_diesel_card_usage u
     where u.card_id in (select id from mine) and public.machinery_usage_counted(u.claim_line_id)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', m.id,
           'card_no', m.card_no,
           'provider', m.provider,
           'status', m.status,
           'vehicle', (select coalesce(v.reg_no, v.name) from public.machinery_machines v where v.id = m.vehicle_id),
           'quota_litres', m.subsidy_litres,
           'month', to_char((select d from today), 'YYYY-MM'),
           'used_litres', coalesce((select sum(f.litres) from fills f
                                     where f.card_id = m.id
                                       and f.fill_date >= date_trunc('month', (select d from today))::date
                                       and f.fill_date <= (select d from today)), 0),
           'recent', coalesce((select jsonb_agg(r order by r.fill_date desc, r.created_at desc)
                                 from (select f.fill_date, f.litres, f.amount, f.created_at,
                                              coalesce((select coalesce(a.full_name, a.email) from public.machinery_portal_admins a where a.user_id = f.driver_id), f.driver_name) as driver,
                                              (select coalesce(v.reg_no, v.name) from public.machinery_machines v where v.id = f.vehicle_id) as vehicle
                                         from fills f where f.card_id = m.id
                                        order by f.fill_date desc, f.created_at desc
                                        limit 5) r), '[]'::jsonb)
         ) order by m.card_no), '[]'::jsonb)
    from mine m;
$$;
revoke all on function public.machinery_my_fleet_cards(uuid) from public, anon;
grant execute on function public.machinery_my_fleet_cards(uuid) to authenticated;

-- Fleet Card Manage → a card → this month's usage. Claim receipts show
-- "statement ✓" when the station's statement has the same fill; statement
-- rows nobody has claimed show "Not claimed yet" (or "Draft claim").
create or replace function public.machinery_card_month_usage(p_company uuid, p_card uuid, p_month text)
returns jsonb
language sql stable security definer
set search_path = public
as $$
  with ok as (
    select exists (
      select 1 from public.machinery_diesel_cards c
       where c.id = p_card and c.company_id = p_company
         and (public.machinery_can(p_company, 'cards', 'view')
              or public.machinery_can(p_company, 'report', 'view')
              or public.machinery_can(p_company, 'topup', 'process')
              or auth.uid() = any (c.driver_ids))) as yes
  ), span as (
    select to_date(p_month || '-01', 'YYYY-MM-DD') as d1,
           (to_date(p_month || '-01', 'YYYY-MM-DD') + interval '1 month - 1 day')::date as d2
  ), rows as (
    -- fleet-card receipts on fuel claims (claimed)
    select l.fill_date, l.litres, l.amount, l.vehicle_id, cl.claimant_id as driver_id, null::text as driver_name,
           coalesce(s.fill_at, l.created_at) as at_time, s.fill_at,
           'claim'::text as source, cl.id as claim_id, cl.claim_no, cl.status as claim_status,
           (l.receipt_path is not null) as has_receipt, l.receipt_no, coalesce(l.station, s.station) as station,
           (s.id is not null) as on_statement, s.amount as statement_amount
      from public.machinery_diesel_claim_lines l
      join public.machinery_diesel_claims cl on cl.id = l.claim_id
      left join public.machinery_diesel_card_usage s on s.claim_line_id = l.id
     where l.card_id = p_card and l.payment = 'fleet_card' and l.line_kind = 'fill'
       and cl.status not in ('rejected', 'draft')
       and l.fill_date between (select d1 from span) and (select d2 from span)
    union all
    -- fill-ups on the card (statement / typed) that no counted claim covers
    select u.fill_date, u.litres, u.amount, u.vehicle_id, coalesce(u.driver_id, dl.claimant_id), u.driver_name,
           coalesce(u.fill_at, u.created_at), u.fill_at,
           'card'::text, dl.claim_id, dl.claim_no, dl.status, false, u.receipt_no, u.station,
           (u.source <> 'manual'), u.amount
      from public.machinery_diesel_card_usage u
      left join lateral (select c.id as claim_id, c.claim_no, c.status, c.claimant_id
                           from public.machinery_diesel_claim_lines l
                           join public.machinery_diesel_claims c on c.id = l.claim_id
                          where l.id = u.claim_line_id) dl on true
     where u.card_id = p_card
       and public.machinery_usage_counted(u.claim_line_id)
       and u.fill_date between (select d1 from span) and (select d2 from span)
  )
  select case when (select yes from ok) then
    coalesce((select jsonb_agg(jsonb_build_object(
              'date', r.fill_date,
              'time', to_char(r.fill_at at time zone 'Asia/Kuala_Lumpur', 'HH24:MI'),
              'litres', r.litres,
              'amount', r.amount,
              'driver', coalesce((select coalesce(a.full_name, a.email) from public.machinery_portal_admins a where a.user_id = r.driver_id), r.driver_name),
              'vehicle', (select coalesce(v.reg_no, v.name) from public.machinery_machines v where v.id = r.vehicle_id),
              'source', r.source,
              'claim_id', r.claim_id,
              'claim_no', r.claim_no,
              'claim_status', r.claim_status,
              'has_receipt', r.has_receipt,
              'receipt_no', r.receipt_no,
              'station', r.station,
              'on_statement', r.on_statement,
              'statement_amount', r.statement_amount)
            order by r.fill_date desc, r.at_time desc) from rows r), '[]'::jsonb)
  else null end;
$$;
revoke all on function public.machinery_card_month_usage(uuid, uuid, text) from public, anon;
grant execute on function public.machinery_card_month_usage(uuid, uuid, text) to authenticated;

-- 6) Statement rows already in the table: pair them now
do $$ declare r record; begin
  for r in select id from public.machinery_diesel_card_usage where source <> 'manual' and claim_line_id is null loop
    perform public.machinery_pair_usage(r.id);
  end loop;
end $$;

select 'done' as result;
