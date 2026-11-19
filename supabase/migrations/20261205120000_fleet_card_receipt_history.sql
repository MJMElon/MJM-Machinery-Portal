-- =====================================================================
-- >>> RUN THIS IN THE **MACHINERY PORTAL** DATABASE <<<
-- >>> Supabase project qcvbzzdbbqmnrljfnxjp (shared with MachTrek)   <<<
-- Needs 20261126, 20261127 and 20261128 (fleet cards). Safe to run more than once.
-- =====================================================================
-- Fleet card history stays put.
--
-- Before: which fleet card a fleet-card receipt on a fuel claim belongs to
-- was worked out every time from the card's CURRENT vehicle and drivers. So
-- when a driver was removed from a card (or the card got another vehicle),
-- that driver's past receipts dropped off the card: its usage, balance and
-- "subsidy used by driver" history changed.
--
-- Now: the card is written on the receipt (claim line card_id) when it is
-- saved, by the same rule (the card of the receipt's vehicle, else a card the
-- claimant drives on). Later changes to the card's drivers or vehicle do not
-- move old receipts. Editing the claim keeps the card unless the receipt's
-- vehicle or payment changes. Existing receipts get their card now.

create or replace function public.machinery_claim_line_card()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_claimant uuid;
begin
  if new.line_kind <> 'fill' then
    return new; -- reloads carry the card chosen on the claim
  end if;
  if new.payment is distinct from 'fleet_card' then
    new.card_id := null;
    return new;
  end if;
  -- Saved again (the claim edited): keep the card it had, unless the vehicle changed.
  if tg_op = 'UPDATE' and new.card_id is null and old.card_id is not null
     and old.payment = 'fleet_card' and new.vehicle_id is not distinct from old.vehicle_id then
    new.card_id := old.card_id;
  end if;
  if new.card_id is null then
    select claimant_id into v_claimant from public.machinery_diesel_claims where id = new.claim_id;
    new.card_id := public.machinery_card_for_line(new.company_id, new.vehicle_id, v_claimant);
  end if;
  return new;
end $$;

-- Runs after the lines guard (which sets company_id): trigger names fire in alphabetical order.
drop trigger if exists machinery_diesel_claim_lines_zcard on public.machinery_diesel_claim_lines;
create trigger machinery_diesel_claim_lines_zcard
  before insert or update on public.machinery_diesel_claim_lines
  for each row execute function public.machinery_claim_line_card();

-- Existing fleet-card receipts: write their card now (by today's drivers and vehicles).
update public.machinery_diesel_claim_lines l
   set card_id = public.machinery_card_for_line(l.company_id, l.vehicle_id, c.claimant_id)
  from public.machinery_diesel_claims c
 where c.id = l.claim_id
   and l.line_kind = 'fill' and l.payment = 'fleet_card' and l.card_id is null;

-- Card balance: by the card written on the receipt.
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
        select coalesce(l.card_id, public.machinery_card_for_line(p_company, l.vehicle_id, c.claimant_id)) as card_id,
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

-- Receipts of one card (card page): fleet-card receipts by the card written on
-- them; cash receipts (not on any card) by the card of their vehicle / claimant.
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
     and coalesce(case when l.payment = 'fleet_card' then l.card_id end,
                  public.machinery_card_for_line(p_company, l.vehicle_id, c.claimant_id)) = p_card
   order by l.fill_date desc;
$$;
revoke all on function public.machinery_card_claim_lines(uuid, uuid, date, date) from public, anon;
grant execute on function public.machinery_card_claim_lines(uuid, uuid, date, date) to authenticated;

-- Check: fleet-card receipts and how many have their card written
select count(*) as fleet_card_receipts, count(card_id) as with_card
  from public.machinery_diesel_claim_lines
 where line_kind = 'fill' and payment = 'fleet_card';
