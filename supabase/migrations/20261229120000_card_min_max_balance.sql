-- =====================================================================
-- >>> RUN THIS IN THE **MACHINERY PORTAL** DATABASE <<<
-- >>> Supabase project qcvbzzdbbqmnrljfnxjp (shared with MachTrek)   <<<
-- Needs 20261220, 20261226, 20261227 and 20261228 (requestor). Safe to run more than once.
-- =====================================================================
-- Fleet card balance limits (Fleet Card Manage → the card → "Auto top-up"):
--   Min balance  with Auto request on: when the balance falls below it, a
--                top-up request is sent by itself for the amount that brings
--                the card up to the Max balance.
--   Max balance  a new top-up request (by hand or automatic) that would take
--                the card above it is refused. Requests still on their way
--                (pending, or approved with the top-up claim not submitted)
--                count as already on the card.
-- Only Procurement sets them. (auto_topup_below = Min; auto_topup_max = Max.)
-- =====================================================================

alter table public.machinery_diesel_cards
  add column if not exists auto_topup_max numeric(12, 2) check (auto_topup_max is null or auto_topup_max > 0);

-- Top-ups still on their way to a card: pending, or approved with the top-up claim not submitted
create or replace function public.machinery_card_topups_on_way(p_card uuid, p_except uuid default null)
returns numeric
language sql stable security definer
set search_path = public
as $$
  select coalesce(sum(r.amount), 0)
    from public.machinery_fleet_topup_requests r
   where r.card_id = p_card
     and (p_except is null or r.id <> p_except)
     and (r.status = 'pending'
          or (r.status = 'approved'
              and coalesce((select c.status from public.machinery_diesel_claims c where c.topup_request_id = r.id), 'draft') = 'draft'));
$$;
revoke all on function public.machinery_card_topups_on_way(uuid, uuid) from public, anon, authenticated;

-- Max balance: refuse a request that would take the card above it
create or replace function public.machinery_topup_max_check()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_max numeric;
  v_room numeric;
begin
  select auto_topup_max into v_max from public.machinery_diesel_cards where id = new.card_id;
  if v_max is null then return new; end if;
  v_room := v_max - public.machinery_card_balance_now(new.card_id) - public.machinery_card_topups_on_way(new.card_id, new.id);
  if new.amount > v_room then
    raise exception '%', case when v_room <= 0
      then 'This card is already at its max balance RM ' || to_char(v_max, 'FM999,999,990.00') || ' (counting top-ups on their way), so no top-up can be requested now.'
      else 'This top-up would take the card above its max balance RM ' || to_char(v_max, 'FM999,999,990.00') || '. The most you can request now is RM ' || to_char(v_room, 'FM999,999,990.00') || '.' end;
  end if;
  return new;
end $$;
drop trigger if exists machinery_topup_max_check on public.machinery_fleet_topup_requests;
create trigger machinery_topup_max_check
  before insert on public.machinery_fleet_topup_requests
  for each row execute function public.machinery_topup_max_check();

-- Automatic request: below Min → request up to Max
create or replace function public.machinery_auto_topup_run(p_company uuid default null)
returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  k record;
  v_bal numeric;
  v_amt numeric;
  n integer := 0;
begin
  for k in
    select c.* from public.machinery_diesel_cards c
     where c.auto_topup
       and (p_company is null or c.company_id = p_company)
       and c.card_no is not null
       and c.status = 'active'
       and c.auto_topup_below is not null and c.auto_topup_max is not null and c.auto_topup_by is not null
       and public.machinery_auto_topup_waiting(c.id) is null
  loop
    v_bal := public.machinery_card_balance_now(k.id);
    if v_bal < k.auto_topup_below then
      v_amt := round(k.auto_topup_max - v_bal - public.machinery_card_topups_on_way(k.id), 2);
      if v_amt > 0 then
        insert into public.machinery_fleet_topup_requests (company_id, card_id, amount, reason, status, requested_by, is_auto)
        values (k.company_id, k.id, v_amt,
                'Automatic: card balance RM ' || to_char(v_bal, 'FM999,999,990.00') || ' is below the min RM ' || to_char(k.auto_topup_below, 'FM999,999,990.00')
                  || '; top up to the max RM ' || to_char(k.auto_topup_max, 'FM999,999,990.00'),
                'pending', k.auto_topup_by, true);
        update public.machinery_diesel_cards set auto_topup_last_at = now() where id = k.id;
        n := n + 1;
      end if;
    end if;
  end loop;
  return n;
end $$;
revoke all on function public.machinery_auto_topup_run(uuid) from public, anon, authenticated;

-- Procurement sets Auto request on / off, the Min / Max balance and the requestor (default: me)
drop function if exists public.machinery_set_auto_topup(uuid, boolean, numeric, numeric);
drop function if exists public.machinery_set_auto_topup(uuid, boolean, numeric, numeric, uuid);
create or replace function public.machinery_set_auto_topup(p_card uuid, p_on boolean, p_min numeric, p_max numeric, p_requester uuid default null)
returns void
language plpgsql security definer
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
  if p_min is not null and p_max is not null and p_max <= p_min then
    raise exception 'The max balance must be more than the min balance.' using errcode = '23514';
  end if;
  if p_on and (p_min is null or p_max is null) then
    raise exception 'Fill in the min and the max balance to switch the automatic request on.' using errcode = '23514';
  end if;
  if p_on and v_req <> auth.uid() and not public.machinery_user_is_procurement(v_company, v_req) then
    raise exception 'The requestor must have the Procurement role in this company.' using errcode = '42501';
  end if;
  update public.machinery_diesel_cards
     set auto_topup = p_on,
         auto_topup_below = p_min,
         auto_topup_max = p_max,
         auto_topup_amount = null,
         auto_topup_by = case when p_on then v_req else auto_topup_by end
   where id = p_card;
  if p_on then perform public.machinery_auto_topup_run(v_company); end if;
end $$;
revoke all on function public.machinery_set_auto_topup(uuid, boolean, numeric, numeric, uuid) from public, anon;
grant execute on function public.machinery_set_auto_topup(uuid, boolean, numeric, numeric, uuid) to authenticated;

notify pgrst, 'reload schema';
