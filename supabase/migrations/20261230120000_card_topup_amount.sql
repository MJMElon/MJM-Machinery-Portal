-- =====================================================================
-- >>> RUN THIS IN THE **MACHINERY PORTAL** DATABASE <<<
-- >>> Supabase project qcvbzzdbbqmnrljfnxjp (shared with MachTrek)   <<<
-- Needs 20261229 (min / max balance). Safe to run more than once.
-- =====================================================================
-- Card balance limits get a third box, "Top-up amount": what an automatic
-- request asks for when the balance falls below the Min. It never takes the
-- card above the Max (then it asks only for the room left). Left empty:
-- the request tops the card up to the Max.
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
      v_room := round(k.auto_topup_max - v_bal - public.machinery_card_topups_on_way(k.id), 2);
      v_amt := least(coalesce(k.auto_topup_amount, v_room), v_room);
      if v_amt > 0 then
        insert into public.machinery_fleet_topup_requests (company_id, card_id, amount, reason, status, requested_by, is_auto)
        values (k.company_id, k.id, v_amt,
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

drop function if exists public.machinery_set_auto_topup(uuid, boolean, numeric, numeric);
drop function if exists public.machinery_set_auto_topup(uuid, boolean, numeric, numeric, uuid);
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
         auto_topup_amount = p_amount,
         auto_topup_by = case when p_on then v_req else auto_topup_by end
   where id = p_card;
  if p_on then perform public.machinery_auto_topup_run(v_company); end if;
end $$;
revoke all on function public.machinery_set_auto_topup(uuid, boolean, numeric, numeric, uuid, numeric) from public, anon;
grant execute on function public.machinery_set_auto_topup(uuid, boolean, numeric, numeric, uuid, numeric) to authenticated;

notify pgrst, 'reload schema';
