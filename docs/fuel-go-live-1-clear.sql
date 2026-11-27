-- =====================================================================
-- Fuel Manage go-live: clear all test data (MACHINERY PORTAL database, qcvbzzdbbqmnrljfnxjp)
-- Supabase → SQL Editor → paste all → Run. Cannot be undone.
-- Clears: fuel claims + lines, fleet card fill-ups, top-ups / reloads, top-up requests,
--         statement imports, claim e-mails / payment documents, fuel usage records.
-- Keeps:  vehicles (CMMS), fleet cards and their settings, diesel prices, people and permissions.
-- Auto top-up is paused (every card would be RM 0 and ask for a top-up); turn it back on with
-- fuel-go-live-2-resume-auto-topup.sql after the opening balances are entered.
-- =====================================================================

-- remember which cards had auto top-up on, then pause them
create table if not exists public.machinery_auto_topup_paused (
  card_id   uuid primary key references public.machinery_diesel_cards (id) on delete cascade,
  paused_at timestamptz not null default now()
);
alter table public.machinery_auto_topup_paused enable row level security;
insert into public.machinery_auto_topup_paused (card_id)
select id from public.machinery_diesel_cards where auto_topup
on conflict (card_id) do nothing;
update public.machinery_diesel_cards set auto_topup = false where auto_topup;

-- clear (claim numbers and request numbers start again from 1)
truncate table
  public.machinery_claim_notifications,
  public.machinery_claim_payment_docs,
  public.machinery_diesel_card_usage,
  public.machinery_diesel_card_reloads,
  public.machinery_diesel_claim_lines,
  public.machinery_diesel_claims,
  public.machinery_fleet_topup_requests,
  public.machinery_card_imports,
  public.machinery_fuel_records
restart identity;

-- check: all 0
select
  (select count(*) from public.machinery_diesel_claims)        as claims,
  (select count(*) from public.machinery_diesel_card_usage)    as card_fill_ups,
  (select count(*) from public.machinery_diesel_card_reloads)  as top_ups,
  (select count(*) from public.machinery_fleet_topup_requests) as topup_requests,
  (select count(*) from public.machinery_fuel_records)         as fuel_records,
  (select count(*) from public.machinery_auto_topup_paused)    as cards_auto_topup_paused;
