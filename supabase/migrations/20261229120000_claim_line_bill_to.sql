-- =====================================================================
-- >>> RUN THIS IN THE **MACHINERY PORTAL** DATABASE <<<
-- >>> Supabase project qcvbzzdbbqmnrljfnxjp (shared with MachTrek)   <<<
-- Safe to run more than once.
-- =====================================================================
-- Fuel claim receipts: "Bill to" company.
--   Each receipt line of a fuel claim can name the company the fuel is
--   later charged to (one company per receipt; empty = not charged on).
--   Chosen in the claim's Remark cell (building button); Reports show it
--   and add the totals up per company.
-- =====================================================================

alter table public.machinery_diesel_claim_lines
  add column if not exists bill_to_company_id uuid references public.machinery_companies (id) on delete set null;

create index if not exists machinery_diesel_claim_lines_bill_to_idx
  on public.machinery_diesel_claim_lines (bill_to_company_id) where bill_to_company_id is not null;

notify pgrst, 'reload schema';
