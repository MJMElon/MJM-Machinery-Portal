-- =====================================================================
-- Go-live: clear ALL CMMS + Fuel Manage data (MACHINERY PORTAL database, qcvbzzdbbqmnrljfnxjp)
-- Supabase → SQL Editor → paste all → Run. Cannot be undone.
--
-- Deleted: machinery (Machinery Profile), cases / repairs and their actions, renewals,
--          suppliers, WhatsApp photo inbox, fleet cards (+ login passwords), fuel claims,
--          card fill-ups, top-ups, top-up requests, statement imports, fuel usage records.
-- Kept:    companies, businesses, blocks, locations, people, permissions / roles, diesel prices.
-- Running numbers (machine no., case no., claim no., request no.) start again from 1.
-- Uploaded files are not inside these tables: empty the storage buckets by hand
-- (Storage → bucket → select all → delete): machinery_machine_files, machinery_case_files,
-- machinery_whatsapp_photos, machinery_diesel_receipts, machinery_claim_payment_docs,
-- machinery_fuel_record_photos.
-- =====================================================================

drop table if exists public.machinery_auto_topup_paused;

truncate table
  -- Fuel Manage
  public.machinery_claim_notifications,
  public.machinery_claim_payment_docs,
  public.machinery_diesel_card_usage,
  public.machinery_diesel_card_reloads,
  public.machinery_diesel_claim_lines,
  public.machinery_diesel_claims,
  public.machinery_fleet_topup_requests,
  public.machinery_card_imports,
  public.machinery_fuel_records,
  public.machinery_diesel_card_secrets,
  public.machinery_diesel_cards,
  -- CMMS
  public.machinery_whatsapp_messages,
  public.machinery_case_actions,
  public.machinery_cases,
  public.machinery_renewals,
  public.machinery_suppliers,
  public.machinery_machines
restart identity;

-- check: all 0
select
  (select count(*) from public.machinery_machines)       as machinery,
  (select count(*) from public.machinery_cases)          as cases,
  (select count(*) from public.machinery_renewals)       as renewals,
  (select count(*) from public.machinery_suppliers)      as suppliers,
  (select count(*) from public.machinery_diesel_cards)   as fleet_cards,
  (select count(*) from public.machinery_diesel_claims)  as fuel_claims,
  (select count(*) from public.machinery_fuel_records)   as fuel_records;
