-- =====================================================================
-- >>> RUN THIS IN THE **MACHINERY PORTAL** DATABASE <<<
-- >>> Supabase project qcvbzzdbbqmnrljfnxjp (shared with MachTrek)   <<<
-- >>> NOT the MJM Intranet database (briqzyxfxsvulyizzbiu)            <<<
-- Safe to run more than once.
-- =====================================================================
-- Fleet card reloads from fuel claims, and the card balance.
--
-- A fuel claim line can now be a FLEET CARD RELOAD instead of a fill-up:
-- the person paid cash to top up a fleet card and claims that amount back.
--   line_kind = 'reload', card_id = the card, amount = the reload (RM),
--   payment = 'cash' (so it counts in the payable amount), no vehicle /
--   litres / unit price.
-- Every reload line is mirrored into machinery_diesel_card_reloads (column
-- claim_line_id) so Fleet Card Manage sees it with the hand-typed reloads;
-- it follows the line (edit, delete) and disappears while the claim is
-- rejected.
--
-- machinery_card_ledger(company) gives, per card and month, the reloads (RM)
-- and the fuel taken on the card (RM, litres): hand-typed card fill-ups plus
-- fleet-card receipts on fuel claims for the card's vehicle. Balance =
-- reloads - fuel taken, which must tally with the fuel station's balance.
-- =====================================================================

-- 1) Claim lines: kind + card
alter table public.machinery_diesel_claim_lines
  add column if not exists line_kind text not null default 'fill',
  add column if not exists card_id uuid references public.machinery_diesel_cards (id) on delete set null;
alter table public.machinery_diesel_claim_lines drop constraint if exists machinery_diesel_claim_lines_kind_check;
alter table public.machinery_diesel_claim_lines
  add constraint machinery_diesel_claim_lines_kind_check
  check (line_kind in ('fill', 'reload') and (line_kind <> 'reload' or card_id is not null));
create index if not exists machinery_diesel_claim_lines_card_idx on public.machinery_diesel_claim_lines (card_id, fill_date);

-- 2) Reloads: which claim line it came from (null = typed by hand on the card)
alter table public.machinery_diesel_card_reloads
  add column if not exists claim_line_id uuid unique references public.machinery_diesel_claim_lines (id) on delete cascade;

-- 3) Mirror a reload line into the card's reloads (or take it out)
create or replace function public.machinery_mirror_claim_reload(p_line uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  l record;
begin
  select ln.*, c.status as claim_status, c.claim_no, c.claimant_id
    into l
    from public.machinery_diesel_claim_lines ln
    join public.machinery_diesel_claims c on c.id = ln.claim_id
   where ln.id = p_line;
  if not found or l.line_kind <> 'reload' or l.card_id is null or l.claim_status = 'rejected' or l.amount <= 0 then
    delete from public.machinery_diesel_card_reloads where claim_line_id = p_line;
    return;
  end if;
  insert into public.machinery_diesel_card_reloads (company_id, card_id, reload_date, amount, reference, notes, created_by, claim_line_id)
  values (l.company_id, l.card_id, l.fill_date, l.amount,
          'Fuel claim ' || lpad(coalesce(l.claim_no, 0)::text, 3, '0') || coalesce(' · ' || l.receipt_no, ''),
          l.remark, l.claimant_id, p_line)
  on conflict (claim_line_id) do update
     set company_id = excluded.company_id, card_id = excluded.card_id, reload_date = excluded.reload_date,
         amount = excluded.amount, reference = excluded.reference, notes = excluded.notes;
end $$;
revoke all on function public.machinery_mirror_claim_reload(uuid) from public, anon, authenticated;

create or replace function public.machinery_claim_line_reload_sync()
returns trigger language plpgsql security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.machinery_diesel_card_reloads where claim_line_id = old.id;
    return null;
  end if;
  perform public.machinery_mirror_claim_reload(new.id);
  return null;
end $$;
drop trigger if exists machinery_diesel_claim_lines_reload_sync on public.machinery_diesel_claim_lines;
create trigger machinery_diesel_claim_lines_reload_sync
  after insert or update or delete on public.machinery_diesel_claim_lines
  for each row execute function public.machinery_claim_line_reload_sync();

-- A rejected claim's reloads leave the card; back to pending / approved they return.
create or replace function public.machinery_claim_status_reload_sync()
returns trigger language plpgsql security definer
set search_path = public
as $$
declare
  v_line uuid;
begin
  for v_line in select id from public.machinery_diesel_claim_lines where claim_id = new.id and line_kind = 'reload' loop
    perform public.machinery_mirror_claim_reload(v_line);
  end loop;
  return null;
end $$;
drop trigger if exists machinery_diesel_claims_reload_sync on public.machinery_diesel_claims;
create trigger machinery_diesel_claims_reload_sync
  after update of status on public.machinery_diesel_claims
  for each row when (old.status is distinct from new.status)
  execute function public.machinery_claim_status_reload_sync();

-- A mirrored reload is changed through its claim line, not on the card.
create or replace function public.machinery_card_reload_guard()
returns trigger language plpgsql
set search_path = public
as $$
begin
  if coalesce(old.claim_line_id, new.claim_line_id) is not null and current_user <> 'postgres'
     and not (tg_op = 'DELETE' and not exists (select 1 from public.machinery_diesel_claim_lines where id = old.claim_line_id)) then
    raise exception 'This reload comes from a fuel claim. Change or delete it on the claim.' using errcode = '23514';
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists machinery_diesel_card_reloads_claim_guard on public.machinery_diesel_card_reloads;
create trigger machinery_diesel_card_reloads_claim_guard
  before update or delete on public.machinery_diesel_card_reloads
  for each row execute function public.machinery_card_reload_guard();

-- Mirror what is already there (none on a fresh run; safe to repeat)
do $$
declare v_line uuid;
begin
  for v_line in select id from public.machinery_diesel_claim_lines where line_kind = 'reload' loop
    perform public.machinery_mirror_claim_reload(v_line);
  end loop;
end $$;

-- 4) Cards a claimant may reload (card no. only; needs the right to add claims)
create or replace function public.machinery_claim_cards(p_company uuid)
returns table (id uuid, card_no text, provider text, vehicle_id uuid, status text)
language sql security definer stable
set search_path = public
as $$
  select c.id, c.card_no, c.provider, c.vehicle_id, c.status
    from public.machinery_diesel_cards c
   where c.company_id = p_company
     and c.card_no is not null
     and c.status not in ('cancelled', 'application')
     and (public.machinery_can(p_company, 'claims', 'add') or public.machinery_can(p_company, 'claims', 'view')
          or public.machinery_can(p_company, 'claims', 'view_all') or public.machinery_can(p_company, 'cards', 'view')
          or public.machinery_can(p_company, 'report', 'view'))
   order by c.card_no;
$$;
revoke all on function public.machinery_claim_cards(uuid) from public, anon;
grant execute on function public.machinery_claim_cards(uuid) to authenticated;

-- 5) Per card and month: reloads in, fuel taken out (RM and litres)
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
    select cd.id, l.fill_date, l.amount, l.litres
      from public.machinery_diesel_claim_lines l
      join public.machinery_diesel_claims c on c.id = l.claim_id
      join public.machinery_diesel_cards cd on cd.company_id = l.company_id and cd.vehicle_id = l.vehicle_id
     where l.company_id = p_company and l.payment = 'fleet_card' and l.line_kind = 'fill'
       and l.vehicle_id is not null and c.status <> 'rejected'
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

select cd.card_no, l.month, l.kind, l.amount, l.litres
  from public.machinery_diesel_cards cd
  join lateral public.machinery_card_ledger(cd.company_id) l on l.card_id = cd.id
 order by cd.card_no, l.month, l.kind;
