-- =====================================================================
-- >>> RUN THIS IN THE **MACHINERY PORTAL** DATABASE <<<
-- >>> Supabase project qcvbzzdbbqmnrljfnxjp (shared with MachTrek)   <<<
-- >>> NOT the MJM Intranet database (briqzyxfxsvulyizzbiu)            <<<
-- Safe to run more than once.
-- =====================================================================
-- Fleet Card Manage: a card starts as an APPLICATION (check list: vehicle
-- sticker, Puspakom test, insurance, road tax, subsidy application, awarded
-- subsidy, fleet card application, card tested; driver medical check, GDL
-- course, licence expiry). The card number comes once it is awarded.
alter table public.machinery_diesel_cards
  add column if not exists subsidy_litres numeric(10, 2) check (subsidy_litres is null or subsidy_litres >= 0),
  add column if not exists checklist      jsonb not null default '{}'::jsonb,
  add column if not exists driver_id      uuid references auth.users (id) on delete set null,
  add column if not exists licence_expiry date;

-- No card number yet while applying
alter table public.machinery_diesel_cards alter column card_no drop not null;
alter table public.machinery_diesel_cards drop constraint if exists machinery_diesel_cards_card_no_check;
alter table public.machinery_diesel_cards
  add constraint machinery_diesel_cards_card_no_check
  check (card_no is null or char_length(btrim(card_no)) between 1 and 40);

-- New status: application
alter table public.machinery_diesel_cards drop constraint if exists machinery_diesel_cards_status_check;
alter table public.machinery_diesel_cards
  add constraint machinery_diesel_cards_status_check
  check (status in ('application', 'active', 'blocked', 'cancelled'));

select c.name as company, d.card_no, d.status, d.provider, d.subsidy_litres
  from public.machinery_diesel_cards d join public.machinery_companies c on c.id = d.company_id
 order by c.name, d.card_no;

-- Applying for the KPDN subsidy (shows the check list) and the fuel
-- station's login record for the card.
alter table public.machinery_diesel_cards
  add column if not exists kpdn_apply     boolean not null default false,
  add column if not exists login_id       text check (char_length(login_id) <= 80),
  add column if not exists login_password text check (char_length(login_password) <= 80);
update public.machinery_diesel_cards set kpdn_apply = true where kpdn_apply = false and checklist <> '{}'::jsonb;
