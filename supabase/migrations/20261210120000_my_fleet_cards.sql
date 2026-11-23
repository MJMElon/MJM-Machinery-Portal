-- =====================================================================
-- >>> RUN THIS IN THE **MACHINERY PORTAL** DATABASE <<<
-- >>> Supabase project qcvbzzdbbqmnrljfnxjp (shared with MachTrek)   <<<
-- Needs 20261205 (fleet card history). Safe to run more than once.
-- =====================================================================
-- Fuel Manage main page → "My fleet card": for the signed-in person, the
-- fleet cards they are a driver on (Fleet Card Manage → Fleet card drivers)
-- in this company: this month's subsidy quota (litres), litres used on the
-- card this month (fleet-card receipts on fuel claims, not rejected or draft,
-- plus fill-ups typed on the card) and the latest purchases on the card.
-- Only those cards, only those figures: no login passwords, no other cards.

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
    -- fleet-card receipts on fuel claims (the card written on the receipt)
    select l.card_id, l.fill_date, l.litres, l.amount, l.vehicle_id, cl.claimant_id as driver_id, l.created_at
      from public.machinery_diesel_claim_lines l
      join public.machinery_diesel_claims cl on cl.id = l.claim_id
     where l.card_id in (select id from mine)
       and l.payment = 'fleet_card' and l.line_kind = 'fill'
       and cl.status not in ('rejected', 'draft')
    union all
    -- fill-ups typed on the card
    select u.card_id, u.fill_date, u.litres, u.amount, u.vehicle_id, u.driver_id, u.created_at
      from public.machinery_diesel_card_usage u
     where u.card_id in (select id from mine)
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
                                              (select coalesce(a.full_name, a.email) from public.machinery_portal_admins a where a.user_id = f.driver_id) as driver,
                                              (select coalesce(v.reg_no, v.name) from public.machinery_machines v where v.id = f.vehicle_id) as vehicle
                                         from fills f where f.card_id = m.id
                                        order by f.fill_date desc, f.created_at desc
                                        limit 5) r), '[]'::jsonb)
         ) order by m.card_no), '[]'::jsonb)
    from mine m;
$$;
revoke all on function public.machinery_my_fleet_cards(uuid) from public, anon;
grant execute on function public.machinery_my_fleet_cards(uuid) to authenticated;

select 'done' as result;
