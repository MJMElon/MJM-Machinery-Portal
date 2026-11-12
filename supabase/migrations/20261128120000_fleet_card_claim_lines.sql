-- =====================================================================
-- Fuel Manage · fleet card page: the fuel-claim receipts that belong to a card
--
-- machinery_card_for_line(company, vehicle, claimant): the ONE fleet card a
--   fuel-claim receipt belongs to: the card of the receipt's vehicle if it has
--   one, otherwise a card shared by the claimant (driver). Active cards first,
--   then the newest. Used by the card balance and the card page.
-- machinery_card_claim_lines(company, card, from, to): the fill-up receipts
--   (fleet card AND cash) on fuel claims that belong to the card, for the
--   card page: yearly litres chart (fleet card vs cash) and this month's list.
-- machinery_card_ledger: same as 20261127, now through the shared helper.
-- Needs 20261126 and 20261127. Safe to run more than once.
-- =====================================================================

create or replace function public.machinery_card_for_line(p_company uuid, p_vehicle uuid, p_claimant uuid)
returns uuid
language sql stable security definer
set search_path = public
as $$
  select cd.id
    from public.machinery_diesel_cards cd
   where cd.company_id = p_company
     and ((p_vehicle is not null and cd.vehicle_id = p_vehicle)
          or (p_claimant is not null and p_claimant = any (cd.driver_ids)))
   order by (p_vehicle is not null and cd.vehicle_id = p_vehicle) desc,
            (cd.status = 'active') desc,
            (cd.status not in ('cancelled', 'application')) desc,
            cd.created_at desc
   limit 1;
$$;
revoke all on function public.machinery_card_for_line(uuid, uuid, uuid) from public, anon, authenticated;

create or replace function public.machinery_card_claim_lines(p_company uuid, p_card uuid, p_from date, p_to date)
returns table (
  id uuid, claim_id uuid, claim_no integer, claim_status text, claimant_id uuid,
  fill_date date, payment text, litres numeric, amount numeric,
  vehicle_id uuid, receipt_no text, station text
)
language sql stable security definer
set search_path = public
as $$
  select l.id, l.claim_id, c.claim_no::int, c.status, c.claimant_id,
         l.fill_date, l.payment, l.litres, l.amount,
         l.vehicle_id, l.receipt_no, l.station
    from public.machinery_diesel_claim_lines l
    join public.machinery_diesel_claims c on c.id = l.claim_id
   where l.company_id = p_company
     and l.line_kind = 'fill'
     and c.status <> 'rejected'
     and l.fill_date between p_from and p_to
     and (public.machinery_can(p_company, 'cards', 'view') or public.machinery_can(p_company, 'report', 'view'))
     and public.machinery_card_for_line(p_company, l.vehicle_id, c.claimant_id) = p_card
   order by l.fill_date desc;
$$;
revoke all on function public.machinery_card_claim_lines(uuid, uuid, date, date) from public, anon;
grant execute on function public.machinery_card_claim_lines(uuid, uuid, date, date) to authenticated;

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
     where u.company_id = p_company
    union all
    select x.card_id, x.fill_date, x.amount, x.litres
      from (
        select public.machinery_card_for_line(p_company, l.vehicle_id, c.claimant_id) as card_id,
               l.fill_date, l.amount, l.litres
          from public.machinery_diesel_claim_lines l
          join public.machinery_diesel_claims c on c.id = l.claim_id
         where l.company_id = p_company and l.payment = 'fleet_card' and l.line_kind = 'fill'
           and c.status <> 'rejected'
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

-- Check: should say done
select 'done' as result, count(*) as fleet_cards from public.machinery_diesel_cards;
