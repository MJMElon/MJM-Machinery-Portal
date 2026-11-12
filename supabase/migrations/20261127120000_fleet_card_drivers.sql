-- =====================================================================
-- Fuel Manage · fleet cards: shared drivers, Inactive status, auto Active
--
-- 1) A fleet card can be shared by several drivers (driver_ids). driver_id
--    stays as the first of them for the older pages.
-- 2) New status "inactive" (taken out of use for now; can be made active
--    again). Inactive cards are not offered on fuel claims.
-- 3) Ticking "Tested fleet card" on the application check list makes an
--    applying card Active.
-- 4) Card balance: a fleet-card receipt on a fuel claim counts against ONE
--    card: the card of the receipt's vehicle if it has one, otherwise the
--    card shared by the claimant (driver). Active cards are preferred, then
--    the newest. Before, a receipt could count twice when a vehicle had an
--    old cancelled card and a new one.
-- Run in the Supabase SQL Editor. Safe to run more than once.
-- =====================================================================

-- 1) Drivers sharing the card
alter table public.machinery_diesel_cards
  add column if not exists driver_ids uuid[] not null default '{}';

update public.machinery_diesel_cards
   set driver_ids = array[driver_id]
 where driver_id is not null and cardinality(driver_ids) = 0;

create index if not exists machinery_diesel_cards_driver_ids_idx
  on public.machinery_diesel_cards using gin (driver_ids);

-- 2) Inactive status
alter table public.machinery_diesel_cards drop constraint if exists machinery_diesel_cards_status_check;
alter table public.machinery_diesel_cards
  add constraint machinery_diesel_cards_status_check
  check (status in ('application', 'active', 'inactive', 'blocked', 'cancelled'));

-- 1 + 3) Keep driver_id = first driver; tested card -> Active
create or replace function public.machinery_card_before_save()
returns trigger
language plpgsql
as $$
begin
  -- no blanks or repeats, first-chosen order kept
  new.driver_ids := coalesce((
    select array_agg(d order by o)
      from (select d, min(o) as o
              from unnest(coalesce(new.driver_ids, '{}')) with ordinality as t(d, o)
             where d is not null
             group by d) x), '{}');
  if tg_op = 'UPDATE' and new.driver_ids is not distinct from old.driver_ids
     and new.driver_id is distinct from old.driver_id then
    -- only driver_id was changed (older page): it becomes the first driver
    new.driver_ids := case when new.driver_id is null then '{}'
                           else array[new.driver_id] || array_remove(new.driver_ids, new.driver_id) end;
  elsif tg_op = 'INSERT' and cardinality(new.driver_ids) = 0 and new.driver_id is not null then
    new.driver_ids := array[new.driver_id];
  end if;
  new.driver_id := case when cardinality(new.driver_ids) > 0 then new.driver_ids[1] else null end;

  if new.status = 'application'
     and coalesce((new.checklist -> 'card_tested' ->> 'done')::boolean, false) then
    new.status := 'active';
  end if;
  return new;
end $$;

drop trigger if exists machinery_diesel_cards_before_save on public.machinery_diesel_cards;
create trigger machinery_diesel_cards_before_save
  before insert or update on public.machinery_diesel_cards
  for each row execute function public.machinery_card_before_save();

-- Cards already tested but still "Applying"
update public.machinery_diesel_cards
   set status = 'active'
 where status = 'application'
   and coalesce((checklist -> 'card_tested' ->> 'done')::boolean, false);

-- Fleet cards offered on fuel claims: in use only (not applying, inactive or cancelled)
create or replace function public.machinery_claim_cards(p_company uuid)
returns table (id uuid, card_no text, provider text, vehicle_id uuid, status text)
language sql security definer stable
set search_path = public
as $$
  select c.id, c.card_no, c.provider, c.vehicle_id, c.status
    from public.machinery_diesel_cards c
   where c.company_id = p_company
     and c.card_no is not null
     and c.status not in ('cancelled', 'application', 'inactive')
     and (public.machinery_can(p_company, 'claims', 'add') or public.machinery_can(p_company, 'claims', 'view')
          or public.machinery_can(p_company, 'claims', 'view_all') or public.machinery_can(p_company, 'cards', 'view')
          or public.machinery_can(p_company, 'report', 'view'))
   order by c.card_no;
$$;
revoke all on function public.machinery_claim_cards(uuid) from public, anon;
grant execute on function public.machinery_claim_cards(uuid) to authenticated;

-- 4) Per card and month: reloads in, fuel taken out (RM and litres)
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
  claim_fills as (
    select l.id, l.fill_date, l.amount, l.litres, l.vehicle_id, c.claimant_id
      from public.machinery_diesel_claim_lines l
      join public.machinery_diesel_claims c on c.id = l.claim_id
     where l.company_id = p_company and l.payment = 'fleet_card' and l.line_kind = 'fill'
       and c.status <> 'rejected'
  ),
  usage_rows as (
    select u.card_id, u.fill_date, u.amount, u.litres
      from public.machinery_diesel_card_usage u
     where u.company_id = p_company
    union all
    select pick.id, f.fill_date, f.amount, f.litres
      from claim_fills f
      cross join lateral (
        select cd.id
          from public.machinery_diesel_cards cd
         where cd.company_id = p_company
           and ((f.vehicle_id is not null and cd.vehicle_id = f.vehicle_id)
                or (f.claimant_id is not null and f.claimant_id = any (cd.driver_ids)))
         order by (f.vehicle_id is not null and cd.vehicle_id = f.vehicle_id) desc,
                  (cd.status = 'active') desc,
                  (cd.status not in ('cancelled', 'application')) desc,
                  cd.created_at desc
         limit 1
      ) pick
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

-- Check: cards with their drivers and status
select cd.card_no, cd.status, cardinality(cd.driver_ids) as drivers
  from public.machinery_diesel_cards cd
 order by cd.card_no;
