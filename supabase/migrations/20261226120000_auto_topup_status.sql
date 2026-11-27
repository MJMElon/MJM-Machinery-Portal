-- =====================================================================
-- >>> RUN THIS IN THE **MACHINERY PORTAL** DATABASE <<<
-- >>> Supabase project qcvbzzdbbqmnrljfnxjp (shared with MachTrek)   <<<
-- Needs 20261220 (automatic top-up). Safe to run more than once.
-- =====================================================================
-- The "Auto top-up request" box says why a request was or was not sent:
-- the balance now, and a request still waiting (pending, or approved and
-- its top-up claim not paid yet).
-- =====================================================================

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
   where r.card_id = p_card and r.status in ('pending', 'approved')
   order by r.requested_at desc limit 1;
  return jsonb_build_object(
    'balance', public.machinery_card_balance_now(p_card),
    'card_status', k.status,
    'waiting', case when w.request_no is null then null else jsonb_build_object(
      'request_no', w.request_no, 'status', w.status, 'amount', w.amount, 'is_auto', w.is_auto, 'claim_status', w.claim_status) end
  );
end $$;
revoke all on function public.machinery_auto_topup_status(uuid) from public, anon;
grant execute on function public.machinery_auto_topup_status(uuid) to authenticated;
