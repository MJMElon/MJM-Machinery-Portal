-- =====================================================================
-- >>> RUN THIS IN THE **MACHINERY PORTAL** DATABASE <<<
-- >>> Supabase project qcvbzzdbbqmnrljfnxjp (shared with MachTrek)   <<<
-- Needs 20261205 (fleet card history). Safe to run more than once.
-- =====================================================================
-- Fleet Card Manage → a card → "This month's usage": every use of the card in
-- the month, newest first: date, driver, vehicle, litres, amount, and whether
-- it has been claimed (a fleet-card receipt on a fuel claim, with or without
-- the receipt photo) or not yet (a fill-up recorded on the card itself, e.g.
-- from the fuel station's statement, that no claim covers).
-- Who may see it: Fleet Card Manage (cards view), reports, procurement, or a
-- driver of that card.

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
    select l.fill_date, l.litres, l.amount, l.vehicle_id, cl.claimant_id as driver_id, l.created_at,
           'claim'::text as source, cl.id as claim_id, cl.claim_no, cl.status as claim_status,
           (l.receipt_path is not null) as has_receipt, l.receipt_no, l.station
      from public.machinery_diesel_claim_lines l
      join public.machinery_diesel_claims cl on cl.id = l.claim_id
     where l.card_id = p_card and l.payment = 'fleet_card' and l.line_kind = 'fill'
       and cl.status not in ('rejected', 'draft')
       and l.fill_date between (select d1 from span) and (select d2 from span)
    union all
    -- fill-ups recorded on the card (not on a claim)
    select u.fill_date, u.litres, u.amount, u.vehicle_id, u.driver_id, u.created_at,
           'card'::text, null::uuid, null::int, null::text, false, null::text, u.station
      from public.machinery_diesel_card_usage u
     where u.card_id = p_card
       and u.fill_date between (select d1 from span) and (select d2 from span)
  )
  select case when (select yes from ok) then
    coalesce((select jsonb_agg(jsonb_build_object(
              'date', r.fill_date,
              'litres', r.litres,
              'amount', r.amount,
              'driver', (select coalesce(a.full_name, a.email) from public.machinery_portal_admins a where a.user_id = r.driver_id),
              'vehicle', (select coalesce(v.reg_no, v.name) from public.machinery_machines v where v.id = r.vehicle_id),
              'source', r.source,
              'claim_id', r.claim_id,
              'claim_no', r.claim_no,
              'claim_status', r.claim_status,
              'has_receipt', r.has_receipt,
              'receipt_no', r.receipt_no,
              'station', r.station)
            order by r.fill_date desc, r.created_at desc) from rows r), '[]'::jsonb)
  else null end;
$$;
revoke all on function public.machinery_card_month_usage(uuid, uuid, text) from public, anon;
grant execute on function public.machinery_card_month_usage(uuid, uuid, text) to authenticated;

select 'done' as result;
