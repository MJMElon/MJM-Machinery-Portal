-- =====================================================================
-- >>> RUN THIS IN THE **MACHINERY PORTAL** DATABASE <<<
-- >>> Supabase project qcvbzzdbbqmnrljfnxjp (shared with MachTrek)   <<<
-- >>> NOT the MJM Intranet database (briqzyxfxsvulyizzbiu)            <<<
-- Supabase dashboard → (Machinery project) → SQL Editor → paste all → Run.
-- Safe to run more than once.
-- =====================================================================
-- Fuel claim rows get a separate Description (Diesel / Petrol …) next to the
-- free-text Remark. Descriptions typed so far were kept in "remark"; move them.
alter table public.machinery_diesel_claim_lines
  add column if not exists description text check (char_length(description) <= 120);
update public.machinery_diesel_claim_lines
   set description = remark, remark = null
 where description is null and remark is not null and char_length(remark) <= 120;
select count(*) as lines, count(description) as with_description from public.machinery_diesel_claim_lines;
