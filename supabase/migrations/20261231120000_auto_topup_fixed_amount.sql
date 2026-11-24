-- =====================================================================
-- >>> RUN THIS IN THE **MACHINERY PORTAL** DATABASE <<<
-- >>> Supabase project qcvbzzdbbqmnrljfnxjp (shared with MachTrek)   <<<
-- Needs 20261230 (top-up amount). Safe to run more than once.
-- =====================================================================
-- Automatic top-up asks for exactly the preset Top-up amount:
--   * the Top-up amount is required to switch Auto request on, and it can
--     not be more than the Max balance;
--   * below the Min, the request is for that amount, but only when it fits
--     under the Max (counting top-ups on their way); otherwise no automatic
--     request (a different amount is asked by hand, up to the Max).
-- The status (Check now) also gives the top-ups on their way.
-- =====================================================================

create or replace function public.machinery_auto_topup_run(p_company uuid default null)
returns integer
language plpgsql security definer
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
revoke all on function public.machinery_auto_topup_run(uuid) from public, anon, authenticated;

drop function if exists public.machinery_set_auto_topup(uuid, boolean, numeric, numeric, uuid, numeric);
create or replace function public.machinery_set_auto_topup(p_card uuid, p_on boolean, p_min numeric, p_max numeric, p_requester uuid default null, p_amount numeric default null)
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
         auto_topup_by = case when p_on then v_req else auto_topup_by end
   where id = p_card;
  if p_on then perform public.machinery_auto_topup_run(v_company); end if;
end $$;
revoke all on function public.machinery_set_auto_topup(uuid, boolean, numeric, numeric, uuid, numeric) from public, anon;
grant execute on function public.machinery_set_auto_topup(uuid, boolean, numeric, numeric, uuid, numeric) to authenticated;

create or replace function public.machinery_auto_topup_status(p_card uuid)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  k record;
  w record;
begin
  select * into k from public.machinery_diesel_cards where id = p_card;
  if not found or not coalesce(public.machinery_can(k.company_id, 'cards', 'view'), false) then
    return null;
  end if;
  select r.request_no, r.status, r.amount, r.is_auto,
         (select c.status from public.machinery_diesel_claims c where c.topup_request_id = r.id) as claim_status
    into w
    from public.machinery_fleet_topup_requests r
   where r.id = public.machinery_auto_topup_waiting(p_card);
  return jsonb_build_object(
    'balance', public.machinery_card_balance_now(p_card),
    'on_way', public.machinery_card_topups_on_way(p_card),
    'card_status', k.status,
    'waiting', case when w.request_no is null then null else jsonb_build_object(
      'request_no', w.request_no, 'status', w.status, 'amount', w.amount, 'is_auto', w.is_auto, 'claim_status', w.claim_status) end
  );
end $$;
revoke all on function public.machinery_auto_topup_status(uuid) from public, anon;
grant execute on function public.machinery_auto_topup_status(uuid) to authenticated;

notify pgrst, 'reload schema';
