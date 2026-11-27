-- =====================================================================
-- Fuel Manage go-live, step 2: turn auto top-up back on (MACHINERY PORTAL database)
-- Run AFTER every fleet card has its opening balance (Fleet Card → Opening balance).
-- =====================================================================
update public.machinery_diesel_cards c set auto_topup = true
 where c.id in (select card_id from public.machinery_auto_topup_paused);
select count(*) as cards_auto_topup_on_again from public.machinery_diesel_cards where auto_topup;
drop table if exists public.machinery_auto_topup_paused;
