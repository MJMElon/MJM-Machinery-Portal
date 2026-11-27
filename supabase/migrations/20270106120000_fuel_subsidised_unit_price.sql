-- =====================================================================
-- Fleet card (KPDN subsidised) claim rows: the receipt prints the pump price,
-- but the card is charged the subsidised amount, so litres × pump price ≠ amount.
--  - Litres and Amount are what the receipt says; the row's unit price is
--    Amount ÷ Litres (the subsidised RM/L), worked out here for every save.
--  - pump_price: the printed pump price, for reference only (no sum uses it).
--  - Cash rows: unchanged (litres × unit price = amount in the form).
-- Saved rows keep their Amount and Litres; only the unit price of subsidised
-- fleet-card rows is recalculated (the old one is kept as the pump price).
-- Safe to run more than once.
-- =====================================================================

alter table public.machinery_diesel_claim_lines add column if not exists pump_price numeric(10, 3);
alter table public.machinery_diesel_claim_lines drop constraint if exists machinery_diesel_claim_lines_pump_price_check;
alter table public.machinery_diesel_claim_lines
  add constraint machinery_diesel_claim_lines_pump_price_check check (pump_price is null or (pump_price >= 0 and pump_price < 100));

create or replace function public.machinery_claim_line_subsidy_price()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.line_kind = 'fill' and new.payment = 'fleet_card' and new.subsidised then
    new.unit_price := case when coalesce(new.litres, 0) > 0 then round(new.amount / new.litres, 3) end;
  else
    new.pump_price := null; -- only a subsidised fleet-card fill has a separate pump price
  end if;
  return new;
end $$;
drop trigger if exists machinery_diesel_claim_lines_subsidy_price on public.machinery_diesel_claim_lines;
create trigger machinery_diesel_claim_lines_subsidy_price
  before insert or update on public.machinery_diesel_claim_lines
  for each row execute function public.machinery_claim_line_subsidy_price();

-- Rows saved before: keep Amount and Litres; the printed price moves to pump_price
update public.machinery_diesel_claim_lines
   set pump_price = coalesce(pump_price, case when unit_price is not null and unit_price <> round(amount / litres, 3) then unit_price end),
       unit_price = round(amount / litres, 3)
 where line_kind = 'fill' and payment = 'fleet_card' and subsidised
   and litres > 0
   and unit_price is distinct from round(amount / litres, 3);

notify pgrst, 'reload schema';
