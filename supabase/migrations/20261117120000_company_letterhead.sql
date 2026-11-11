-- =====================================================================
-- >>> RUN THIS IN THE **MACHINERY PORTAL** DATABASE <<<
-- >>> Supabase project qcvbzzdbbqmnrljfnxjp (shared with MachTrek)   <<<
-- >>> NOT the MJM Intranet database (briqzyxfxsvulyizzbiu)            <<<
-- Safe to run more than once.
-- =====================================================================
-- Letterhead details for printouts (fuel claim form): address, phone, fax,
-- e-mail. Kept in CMMS 2 (Settings → Company profile); the Intranet sync
-- does not touch them.
alter table public.machinery_companies
  add column if not exists address text check (char_length(address) <= 400),
  add column if not exists phone   text check (char_length(phone) <= 60),
  add column if not exists fax     text check (char_length(fax) <= 60),
  add column if not exists email   text check (char_length(email) <= 120);
select name, registration_no, address, phone, fax, email from public.machinery_companies order by name;
