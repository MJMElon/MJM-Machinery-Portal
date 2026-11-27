-- =====================================================================
-- >>> RUN THIS IN THE **MACHINERY PORTAL** DATABASE <<<
-- >>> Supabase project qcvbzzdbbqmnrljfnxjp (shared with MachTrek)   <<<
-- Needs 20261220 and 20261226. Safe to run more than once.
-- =====================================================================
-- Automatic top-up: when is a card "waiting" (no new automatic request)?
--   * any request for the card still waiting for approval (Pending), or
--   * an approved AUTOMATIC request whose top-up claim is not submitted yet
--     (otherwise a new one would go out every hour until it is).
-- An approved request made by hand no longer stops the automatic one.
-- =====================================================================

create or replace function public.machinery_auto_topup_waiting(p_card uuid)
returns uuid
language sql stable security definer
set search_path = public
as $$
  select r.id
    from public.machinery_fleet_topup_requests r
   where r.card_id = p_card
     and (r.status = 'pending'
          or (r.status = 'approved' and r.is_auto
              and coalesce((select c.status from public.machinery_diesel_claims c where c.topup_request_id = r.id), 'draft') = 'draft'))
   order by r.requested_at desc
   limit 1;
$$;
revoke all on function public.machinery_auto_topup_waiting(uuid) from public, anon, authenticated;

create or replace function public.machinery_auto_topup_run(p_company uuid default null)
returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  k record;
  v_bal numeric;
  n integer := 0;
begin
  for k in
    select c.* from public.machinery_diesel_cards c
     where c.auto_topup
       and (p_company is null or c.company_id = p_company)
       and c.card_no is not null
       and c.status = 'active'
       and c.auto_topup_below is not null and c.auto_topup_amount is not null and c.auto_topup_by is not null
       and public.machinery_auto_topup_waiting(c.id) is null
  loop
    v_bal := public.machinery_card_balance_now(k.id);
    if v_bal < k.auto_topup_below then
      insert into public.machinery_fleet_topup_requests (company_id, card_id, amount, reason, status, requested_by, is_auto)
      values (k.company_id, k.id, k.auto_topup_amount,
              'Automatic: card balance RM ' || to_char(v_bal, 'FM999,999,990.00') || ' is below RM ' || to_char(k.auto_topup_below, 'FM999,999,990.00'),
              'pending', k.auto_topup_by, true);
      update public.machinery_diesel_cards set auto_topup_last_at = now() where id = k.id;
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;
revoke all on function public.machinery_auto_topup_run(uuid) from public, anon, authenticated;

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
    'card_status', k.status,
    'waiting', case when w.request_no is null then null else jsonb_build_object(
      'request_no', w.request_no, 'status', w.status, 'amount', w.amount, 'is_auto', w.is_auto, 'claim_status', w.claim_status) end
  );
end $$;
revoke all on function public.machinery_auto_topup_status(uuid) from public, anon;
grant execute on function public.machinery_auto_topup_status(uuid) to authenticated;

-- Send the ones that are due now
select public.machinery_auto_topup_run(null) as automatic_requests_sent;
