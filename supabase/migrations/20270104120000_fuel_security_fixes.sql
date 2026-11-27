-- =====================================================================
-- Fuel Claims security fixes before handover. Safe to run more than once.
--  1) Automatic top-up settings can only change through machinery_set_auto_topup
--     (they could be written straight into the card row), and the automatic
--     request only runs for a requester who really has the Procurement role.
--  2) Whoever sets up an automatic top-up cannot approve the requests it makes.
--  3) A top-up claim must stay exactly the approved reload (one row, the approved
--     card and amount) whenever it is not a draft — also when its rows are edited
--     after it was submitted.
--  4) A fleet card reload only counts in the card balance once its claim is
--     approved / paid, or straight away when it is an approved top-up request.
--  5) Only the system links a claim to a top-up request.
--  6) A claim row's fleet card must belong to the claim's company.
--  7) machinery_topup_done is no longer callable from the app (paying the claim
--     marks the request topped up; the function let it skip the claim).
--  8) A fill-up imported from the Fuel Station Portal / statement cannot be
--     changed into a manual one (and then deleted) or have its figures edited.
--  9) A new top-up request cannot set the system-only fields.
-- "From the app" = the request runs as the authenticated / anon role. The
-- system's own functions run as their owner and are not affected.
-- =====================================================================

-- 1) + 2) -------------------------------------------------------------
alter table public.machinery_diesel_cards add column if not exists auto_topup_set_by uuid;

create or replace function public.machinery_cards_auto_topup_lock()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.auto_topup := false;
    new.auto_topup_below := null;
    new.auto_topup_max := null;
    new.auto_topup_amount := null;
    new.auto_topup_by := null;
    new.auto_topup_last_at := null;
    new.auto_topup_set_by := null;
    return new;
  end if;
  if (new.auto_topup, new.auto_topup_below, new.auto_topup_max, new.auto_topup_amount, new.auto_topup_by, new.auto_topup_last_at, new.auto_topup_set_by)
     is distinct from (old.auto_topup, old.auto_topup_below, old.auto_topup_max, old.auto_topup_amount, old.auto_topup_by, old.auto_topup_last_at, old.auto_topup_set_by) then
    raise exception 'The automatic top-up settings can only be changed by Procurement on the card''s balance limits.' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists machinery_diesel_cards_auto_topup_lock on public.machinery_diesel_cards;
create trigger machinery_diesel_cards_auto_topup_lock
  before insert or update on public.machinery_diesel_cards
  for each row execute function public.machinery_cards_auto_topup_lock();

create or replace function public.machinery_set_auto_topup(p_card uuid, p_on boolean, p_min numeric, p_max numeric, p_requester uuid default null, p_amount numeric default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid;
  v_req uuid := coalesce(p_requester, auth.uid());
begin
  select company_id into v_company from public.machinery_diesel_cards where id = p_card;
  if v_company is null then raise exception 'Fleet card not found' using errcode = 'P0002'; end if;
  if not coalesce(public.machinery_is_procurement(v_company), false) then
    raise exception 'Only the Procurement role can set the card balance limits.' using errcode = '42501';
  end if;
  if p_min is not null and p_min < 0 then raise exception 'The min balance cannot be below 0.' using errcode = '23514'; end if;
  if p_max is not null and p_max <= 0 then raise exception 'The max balance must be more than 0.' using errcode = '23514'; end if;
  if p_amount is not null and p_amount <= 0 then raise exception 'The top-up amount must be more than 0.' using errcode = '23514'; end if;
  if p_min is not null and p_max is not null and p_max <= p_min then
    raise exception 'The max balance must be more than the min balance.' using errcode = '23514';
  end if;
  if p_amount is not null and p_max is not null and p_amount > p_max then
    raise exception 'The top-up amount cannot be more than the max balance.' using errcode = '23514';
  end if;
  if p_on and (p_min is null or p_max is null or p_amount is null) then
    raise exception 'Fill in the min balance, the max balance and the top-up amount to switch the automatic request on.' using errcode = '23514';
  end if;
  if p_on and v_req <> auth.uid() and not public.machinery_user_is_procurement(v_company, v_req) then
    raise exception 'The requestor must have the Procurement role in this company.' using errcode = '42501';
  end if;
  update public.machinery_diesel_cards
     set auto_topup = p_on,
         auto_topup_below = p_min,
         auto_topup_max = p_max,
         auto_topup_amount = p_amount,
         auto_topup_by = case when p_on then v_req else auto_topup_by end,
         auto_topup_set_by = case when p_on then auth.uid() else auto_topup_set_by end
   where id = p_card;
  if p_on then perform public.machinery_auto_topup_run(v_company); end if;
end $$;

create or replace function public.machinery_auto_topup_run(p_company uuid default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  k record;
  v_bal numeric;
  v_room numeric;
  n integer := 0;
begin
  for k in
    select c.* from public.machinery_diesel_cards c
     where c.auto_topup
       and (p_company is null or c.company_id = p_company)
       and c.card_no is not null
       and c.status = 'active'
       and c.auto_topup_below is not null and c.auto_topup_max is not null
       and c.auto_topup_amount is not null and c.auto_topup_by is not null
       and public.machinery_user_is_procurement(c.company_id, c.auto_topup_by) -- the requester must still be Procurement there
       and public.machinery_auto_topup_waiting(c.id) is null
  loop
    v_bal := public.machinery_card_balance_now(k.id);
    if v_bal < k.auto_topup_below then
      v_room := k.auto_topup_max - v_bal - public.machinery_card_topups_on_way(k.id);
      if k.auto_topup_amount <= v_room then
        insert into public.machinery_fleet_topup_requests (company_id, card_id, amount, reason, status, requested_by, is_auto)
        values (k.company_id, k.id, k.auto_topup_amount,
                'Automatic: card balance RM ' || to_char(v_bal, 'FM999,999,990.00') || ' is below the min RM ' || to_char(k.auto_topup_below, 'FM999,999,990.00'),
                'pending', k.auto_topup_by, true);
        update public.machinery_diesel_cards set auto_topup_last_at = now() where id = k.id;
        n := n + 1;
      end if;
    end if;
  end loop;
  return n;
end $$;

create or replace function public.machinery_topup_decide(p_id uuid, p_approve boolean, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_claim uuid;
  v_sub text := current_setting('request.jwt.claim.sub', true);
  v_claims text := current_setting('request.jwt.claims', true);
  v_today date := (now() at time zone 'Asia/Kuala_Lumpur')::date;
begin
  select * into r from public.machinery_fleet_topup_requests where id = p_id for update;
  if not found then raise exception 'Request not found' using errcode = 'P0002'; end if;
  if r.status <> 'pending' then raise exception 'This request is already %.', r.status using errcode = '23514'; end if;
  if not public.machinery_topup_approver(r.company_id, r.requested_by) then
    raise exception 'You are not an approver of this person''s top-up requests.' using errcode = '42501';
  end if;
  if r.requested_by = auth.uid() and not public.is_machinery_super_admin() then
    raise exception 'You cannot approve your own request.' using errcode = '42501';
  end if;
  -- an automatic request: whoever set up the automatic top-up cannot approve it either
  if r.is_auto and not public.is_machinery_super_admin()
     and exists (select 1 from public.machinery_diesel_cards c where c.id = r.card_id and c.auto_topup_set_by = auth.uid()) then
    raise exception 'You set up the automatic top-up for this card, so someone else must decide its requests.' using errcode = '42501';
  end if;
  update public.machinery_fleet_topup_requests
     set status = case when p_approve then 'approved' else 'rejected' end,
         decided_by = auth.uid(), decided_at = now(),
         decision_note = nullif(btrim(coalesce(p_note, '')), '')
   where id = p_id;

  if p_approve and not exists (select 1 from public.machinery_diesel_claims where topup_request_id = p_id) then
    -- The draft claim is made by the system for the requester (not as the
    -- approver, who may not write other people's claims).
    perform set_config('request.jwt.claim.sub', '', true);
    perform set_config('request.jwt.claims', '', true);
    insert into public.machinery_diesel_claims
      (company_id, claimant_id, submitted_on, fill_date, status, notes, amount, topup_request_id)
    values
      (r.company_id, r.requested_by, v_today, v_today, 'draft',
       'Fleet card top-up request TU-' || lpad(coalesce(r.request_no, 0)::text, 4, '0'), 0, p_id)
    returning id into v_claim;
    insert into public.machinery_diesel_claim_lines
      (claim_id, company_id, line_no, fill_date, line_kind, card_id, amount, payment, subsidised, remark)
    values
      (v_claim, r.company_id, 1, v_today, 'reload', r.card_id, r.amount, 'cash', false,
       'Top-up request TU-' || lpad(coalesce(r.request_no, 0)::text, 4, '0') || coalesce(': ' || nullif(btrim(r.reason), ''), ''));
    perform set_config('request.jwt.claim.sub', coalesce(v_sub, ''), true);
    perform set_config('request.jwt.claims', coalesce(v_claims, ''), true);
  end if;
end $$;

-- 3) ------------------------------------------------------------------
-- Is this top-up claim still exactly the approved reload? (raises if not)
drop function if exists public.machinery_topup_claim_assert(uuid);
-- p_status: the status it is moving to (null = as saved)
create or replace function public.machinery_topup_claim_assert(p_claim uuid, p_status text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare c record; r record; n integer; ok integer;
begin
  select * into c from public.machinery_diesel_claims where id = p_claim;
  if not found or c.topup_request_id is null or coalesce(p_status, c.status) in ('draft', 'rejected') then
    return;
  end if;
  select * into r from public.machinery_fleet_topup_requests where id = c.topup_request_id;
  if not found then return; end if;
  select count(*), count(*) filter (where l.line_kind = 'reload' and l.card_id = r.card_id and l.amount = r.amount)
    into n, ok
    from public.machinery_diesel_claim_lines l where l.claim_id = p_claim;
  if n <> 1 or ok <> 1 then
    raise exception 'A top-up claim has one row: the fleet card reload of RM % (the approved top-up request TU-%). Take it back to Draft to change it; other receipts go on their own claim.',
      to_char(r.amount, 'FM999,999,990.00'), lpad(coalesce(r.request_no, 0)::text, 4, '0') using errcode = '23514';
  end if;
end $$;
revoke all on function public.machinery_topup_claim_assert(uuid, text) from public, anon, authenticated;

-- checked whenever the claim moves to a non-draft status
create or replace function public.machinery_topup_claim_check()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.topup_request_id is not null and new.status not in ('draft', 'rejected')
     and new.status is distinct from old.status then
    -- the rows are already saved: check them as they are
    perform public.machinery_topup_claim_assert(new.id, new.status);
  end if;
  return new;
end $$;

-- ... and whenever its rows change while it is not a draft (checked after the whole save)
create or replace function public.machinery_topup_claim_lines_check()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.machinery_topup_claim_assert(coalesce(new.claim_id, old.claim_id));
  return null;
end $$;
drop trigger if exists machinery_diesel_claim_lines_topup_check on public.machinery_diesel_claim_lines;
create trigger machinery_diesel_claim_lines_topup_check
  after insert or update or delete on public.machinery_diesel_claim_lines
  for each row execute function public.machinery_topup_claim_lines_check();

-- 4) ------------------------------------------------------------------
create or replace function public.machinery_mirror_claim_reload(p_line uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  l record;
begin
  select ln.*, c.status as claim_status, c.claim_no, c.claimant_id, c.topup_request_id
    into l
    from public.machinery_diesel_claim_lines ln
    join public.machinery_diesel_claims c on c.id = ln.claim_id
   where ln.id = p_line;
  -- counts once approved / paid; a top-up request's claim (already approved as a request) counts from Pending
  if not found or l.line_kind <> 'reload' or l.card_id is null or l.amount <= 0
     or not (l.claim_status in ('approved', 'paid') or (l.claim_status = 'pending' and l.topup_request_id is not null)) then
    delete from public.machinery_diesel_card_reloads where claim_line_id = p_line;
    return;
  end if;
  insert into public.machinery_diesel_card_reloads (company_id, card_id, reload_date, amount, reference, notes, created_by, claim_line_id)
  values (l.company_id, l.card_id, l.fill_date, l.amount,
          'Fuel claim ' || lpad(coalesce(l.claim_no, 0)::text, 3, '0') || coalesce(' · ' || l.receipt_no, ''),
          l.remark, l.claimant_id, p_line)
  on conflict (claim_line_id) do update
     set company_id = excluded.company_id, card_id = excluded.card_id, reload_date = excluded.reload_date,
         amount = excluded.amount, reference = excluded.reference, notes = excluded.notes;
end $$;
revoke all on function public.machinery_mirror_claim_reload(uuid) from public, anon, authenticated;

-- reloads already counted from claims that are only Pending (not a top-up request): take them out again
do $$
declare v uuid;
begin
  for v in select l.id from public.machinery_diesel_claim_lines l
             join public.machinery_diesel_claims c on c.id = l.claim_id
            where l.line_kind = 'reload' and c.status not in ('approved', 'paid') and c.topup_request_id is null loop
    perform public.machinery_mirror_claim_reload(v);
  end loop;
end $$;

-- 5) ------------------------------------------------------------------
create or replace function public.machinery_claims_topup_link_lock()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.topup_request_id := null; -- only the system makes top-up claims
  elsif new.topup_request_id is distinct from old.topup_request_id then
    raise exception 'The top-up request of a claim cannot be changed.' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists machinery_diesel_claims_topup_link_lock on public.machinery_diesel_claims;
create trigger machinery_diesel_claims_topup_link_lock
  before insert or update on public.machinery_diesel_claims
  for each row execute function public.machinery_claims_topup_link_lock();

-- 6) ------------------------------------------------------------------
-- (named so it runs after the other BEFORE triggers that fill in company_id and the card)
create or replace function public.machinery_claim_line_card_company()
returns trigger
language plpgsql
security definer -- reads the card even when the claimant cannot see Fleet Card Manage
set search_path = public
as $$
begin
  if new.card_id is not null
     and new.company_id is distinct from (select c.company_id from public.machinery_diesel_cards c where c.id = new.card_id) then
    raise exception 'The fleet card belongs to another company.' using errcode = '23514';
  end if;
  return new;
end $$;
drop trigger if exists machinery_diesel_claim_lines_zzcard_company on public.machinery_diesel_claim_lines;
create trigger machinery_diesel_claim_lines_zzcard_company
  before insert or update on public.machinery_diesel_claim_lines
  for each row execute function public.machinery_claim_line_card_company();

-- 7) ------------------------------------------------------------------
revoke execute on function public.machinery_topup_done(uuid, date) from public, anon, authenticated;

-- 8) ------------------------------------------------------------------
create or replace function public.machinery_card_usage_import_lock()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('authenticated', 'anon') or public.is_machinery_super_admin() then
    return new;
  end if;
  -- pairing with a claim row is done by the system only
  if new.claim_line_id is distinct from old.claim_line_id then
    raise exception 'The matching claim row is set by the system.' using errcode = '42501';
  end if;
  if old.source <> 'manual'
     and (new.source, new.external_ref, new.import_id, new.card_id, new.amount, new.litres, new.fill_date, new.fill_at, new.receipt_no)
         is distinct from (old.source, old.external_ref, old.import_id, old.card_id, old.amount, old.litres, old.fill_date, old.fill_at, old.receipt_no) then
    raise exception 'This fill-up came from the Fuel Station Portal or the card statement, so its card, date, amount and receipt cannot be changed.' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists machinery_diesel_card_usage_import_lock on public.machinery_diesel_card_usage;
create trigger machinery_diesel_card_usage_import_lock
  before update on public.machinery_diesel_card_usage
  for each row execute function public.machinery_card_usage_import_lock();

-- 9) ------------------------------------------------------------------
create or replace function public.machinery_topup_insert_clean()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.is_auto := false;
    new.topped_up_by := null;
    new.topped_up_on := null;
    new.decided_by := null;
    new.decided_at := null;
    new.decision_note := null;
  end if;
  return new;
end $$;
drop trigger if exists machinery_fleet_topup_requests_insert_clean on public.machinery_fleet_topup_requests;
create trigger machinery_fleet_topup_requests_insert_clean
  before insert on public.machinery_fleet_topup_requests
  for each row execute function public.machinery_topup_insert_clean();

notify pgrst, 'reload schema';
