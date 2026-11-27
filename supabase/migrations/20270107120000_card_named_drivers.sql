-- =====================================================================
-- >>> RUN THIS IN THE **MACHINERY PORTAL** DATABASE <<<
-- >>> Supabase project qcvbzzdbbqmnrljfnxjp (shared with MachTrek)   <<<
-- Needs 20270102 and 20270104. Safe to run more than once.
-- =====================================================================
-- Fleet card drivers without an account yet (name + phone only):
--   * machinery_card_named_drivers: the card's name-only drivers (no user);
--   * a fill-up typed in Fuel Records for one of them keeps named_driver_id
--     (and the name), so they get their own row in the grid and count in the
--     card's usage and balance like everyone else;
--   * machinery_link_named_driver(named driver, user): when the person gets an
--     Intranet / OPIS PRO account, every fill-up of the name-only driver moves
--     to the user (one that the user already has on the same day and RM is not
--     doubled), fill-ups not matched yet are matched with the user's claim
--     receipts (same card, date, RM: the claim replaces the hand-typed row),
--     the user joins the card's drivers and the name-only driver is removed;
--   * the "fleet card fill-ups not claimed yet" reminder does not count a
--     name-only driver's fill-ups for the card's other drivers.
-- =====================================================================

create table if not exists public.machinery_card_named_drivers (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.machinery_companies (id) on delete cascade,
  card_id     uuid not null references public.machinery_diesel_cards (id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 80),
  phone       text check (phone is null or char_length(phone) <= 30),
  created_by  uuid default auth.uid() references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists machinery_card_named_drivers_card_idx on public.machinery_card_named_drivers (card_id);
alter table public.machinery_card_named_drivers enable row level security;
revoke all on public.machinery_card_named_drivers from anon;

drop trigger if exists machinery_card_named_drivers_guard on public.machinery_card_named_drivers;
create trigger machinery_card_named_drivers_guard
  before insert or update on public.machinery_card_named_drivers
  for each row execute function public.machinery_diesel_same_company_guard();

drop policy if exists "machinery_card_named_drivers_read" on public.machinery_card_named_drivers;
create policy "machinery_card_named_drivers_read" on public.machinery_card_named_drivers for select to authenticated
  using (public.machinery_can(company_id, 'cards', 'view') or public.machinery_can(company_id, 'report', 'view')
         or public.machinery_can(company_id, 'usage', 'view'));
drop policy if exists "machinery_card_named_drivers_write" on public.machinery_card_named_drivers;
create policy "machinery_card_named_drivers_write" on public.machinery_card_named_drivers for all to authenticated
  using (public.machinery_can(company_id, 'cards', 'edit'))
  with check (public.machinery_can(company_id, 'cards', 'edit'));

-- fill-ups of a name-only driver
alter table public.machinery_diesel_card_usage
  add column if not exists named_driver_id uuid references public.machinery_card_named_drivers (id) on delete set null;
create index if not exists machinery_diesel_card_usage_named_idx on public.machinery_diesel_card_usage (named_driver_id) where named_driver_id is not null;

-- a name-only driver's fill-up: same card, and the name is kept with it
create or replace function public.machinery_card_usage_named_check()
returns trigger
language plpgsql
set search_path = public
as $$
declare d record;
begin
  if new.named_driver_id is null then return new; end if;
  select * into d from public.machinery_card_named_drivers where id = new.named_driver_id;
  if not found or d.card_id <> new.card_id then
    raise exception 'That driver is not on this fleet card.' using errcode = '23514';
  end if;
  new.driver_id := null;
  new.driver_name := d.name;
  return new;
end $$;
drop trigger if exists machinery_diesel_card_usage_named on public.machinery_diesel_card_usage;
create trigger machinery_diesel_card_usage_named
  before insert or update of named_driver_id, card_id on public.machinery_diesel_card_usage
  for each row execute function public.machinery_card_usage_named_check();

-- Link a name-only driver to a user: returns how many fill-ups moved
create or replace function public.machinery_link_named_driver(p_named uuid, p_user uuid)
returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  d record;
  v_moved integer := 0;
  r record;
begin
  select * into d from public.machinery_card_named_drivers where id = p_named;
  if not found then
    raise exception 'That name-only driver is not there any more.' using errcode = '22023';
  end if;
  if not public.machinery_can(d.company_id, 'cards', 'edit') then
    raise exception 'You cannot change this fleet card''s drivers.' using errcode = '42501';
  end if;
  if p_user is null or not exists (select 1 from public.machinery_portal_admins a where a.user_id = p_user) then
    raise exception 'Choose a user.' using errcode = '22023';
  end if;

  -- 1) a fill-up the user already has on the same card, day and RM (typed for both): keep the user's, drop the other
  delete from public.machinery_diesel_card_usage u
   where u.named_driver_id = p_named and u.source = 'manual' and u.claim_line_id is null
     and exists (select 1 from public.machinery_diesel_card_usage x
                  where x.id <> u.id and x.card_id = u.card_id and x.driver_id = p_user
                    and x.fill_date = u.fill_date and abs(x.amount - u.amount) < 0.01);

  -- 2) everything else moves to the user (also fill-ups the station named the same way on this card)
  with moved as (
    update public.machinery_diesel_card_usage u
       set driver_id = p_user, named_driver_id = null, driver_name = null
     where u.named_driver_id = p_named
        or (u.card_id = d.card_id and u.driver_id is null and u.named_driver_id is null
            and upper(btrim(coalesce(u.driver_name, ''))) = upper(btrim(d.name)))
    returning u.id, u.claim_line_id
  )
  select count(*) into v_moved from moved;

  -- 3) the user joins the card's drivers
  update public.machinery_diesel_cards c
     set driver_ids = case when p_user = any (coalesce(c.driver_ids, '{}')) then c.driver_ids else coalesce(c.driver_ids, '{}') || p_user end,
         driver_id = coalesce(c.driver_id, p_user)
   where c.id = d.card_id;

  -- 4) name-only driver removed
  delete from public.machinery_card_named_drivers where id = p_named;

  -- 5) fill-ups not matched yet: look for the user's claim receipt (same card, date, RM)
  for r in select u.id from public.machinery_diesel_card_usage u
            where u.card_id = d.card_id and u.driver_id = p_user and u.claim_line_id is null loop
    perform public.machinery_pair_usage(r.id);
  end loop;

  return v_moved;
end $$;
revoke all on function public.machinery_link_named_driver(uuid, uuid) from public, anon;
grant execute on function public.machinery_link_named_driver(uuid, uuid) to authenticated;

-- Reminder for the driver: a name-only driver's fill-ups are not theirs
create or replace function public.machinery_my_fuel_tasks(p_company uuid)
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select jsonb_build_object(
    'unclaimed_fills', (
      select count(*)
        from public.machinery_diesel_card_usage u
        join public.machinery_diesel_cards c on c.id = u.card_id
       where u.company_id = p_company
         and public.machinery_usage_counted(u.claim_line_id)
         and u.fill_date >= ((now() at time zone 'Asia/Kuala_Lumpur')::date - 60)
         and (u.driver_id = auth.uid()
              or (u.driver_id is null and u.named_driver_id is null and auth.uid() = any (c.driver_ids)))
    )
  );
$$;
revoke all on function public.machinery_my_fuel_tasks(uuid) from public, anon;
grant execute on function public.machinery_my_fuel_tasks(uuid) to authenticated;

notify pgrst, 'reload schema';

-- check
select to_regclass('public.machinery_card_named_drivers') is not null as named_drivers_table,
       exists (select 1 from information_schema.columns where table_schema = 'public'
                 and table_name = 'machinery_diesel_card_usage' and column_name = 'named_driver_id') as usage_column;
