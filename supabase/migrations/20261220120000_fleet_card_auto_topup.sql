-- =====================================================================
-- >>> RUN THIS IN THE **MACHINERY PORTAL** DATABASE <<<
-- >>> Supabase project qcvbzzdbbqmnrljfnxjp (shared with MachTrek)   <<<
-- Needs all earlier migrations. Safe to run more than once.
-- =====================================================================
-- Automatic top-up requests per fleet card.
--
--   * On the fleet card page (box "Auto top-up request") Procurement sets:
--       when the card balance is below RM X → request a top-up of RM Y
--     Each card has its own amounts. "Request top up" (by hand) stays.
--   * The database checks the cards every hour, right after fuel station
--     statements come in, and when the setting is saved. A card whose
--     balance is below its amount, and that has no request waiting
--     (pending or approved), gets a top-up request: Pending, sent in the
--     name of the person who switched the automatic request on (their
--     approvers approve it, as usual). It is marked automatic.
-- =====================================================================

alter table public.machinery_diesel_cards
  add column if not exists auto_topup boolean not null default false,
  add column if not exists auto_topup_below numeric(12, 2) check (auto_topup_below is null or auto_topup_below >= 0),
  add column if not exists auto_topup_amount numeric(12, 2) check (auto_topup_amount is null or auto_topup_amount > 0),
  add column if not exists auto_topup_by uuid references auth.users (id) on delete set null,
  add column if not exists auto_topup_last_at timestamptz;

alter table public.machinery_fleet_topup_requests
  add column if not exists is_auto boolean not null default false;

-- Balance of one card now: reloads − fuel taken (same rule as the card ledger)
create or replace function public.machinery_card_balance_now(p_card uuid)
returns numeric
language sql stable security definer
set search_path = public
as $$
  with c as (select id, company_id from public.machinery_diesel_cards where id = p_card)
  select coalesce((select sum(r.amount) from public.machinery_diesel_card_reloads r where r.card_id = p_card), 0)
       - coalesce((select sum(u.amount) from public.machinery_diesel_card_usage u
                    where u.card_id = p_card and public.machinery_usage_counted(u.claim_line_id)), 0)
       - coalesce((select sum(x.amount) from (
            select coalesce(l.card_id, public.machinery_card_for_line(c.company_id, l.vehicle_id, cl.claimant_id)) as card_id, l.amount
              from public.machinery_diesel_claim_lines l
              join public.machinery_diesel_claims cl on cl.id = l.claim_id
              cross join c
             where l.company_id = c.company_id and l.payment = 'fleet_card' and l.line_kind = 'fill'
               and cl.status not in ('rejected', 'draft')
          ) x where x.card_id = p_card), 0);
$$;
revoke all on function public.machinery_card_balance_now(uuid) from public, anon, authenticated;

-- Make the automatic requests that are due (one company, or all when null). Returns how many were made.
create or replace function public.machinery_auto_topup_run(p_company uuid default null)
returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  k record;
  v_bal numeric;
  n integer := 0;
begin
  for k in
    select c.* from public.machinery_diesel_cards c
     where c.auto_topup
       and (p_company is null or c.company_id = p_company)
       and c.card_no is not null
       and c.status = 'active'
       and c.auto_topup_below is not null and c.auto_topup_amount is not null and c.auto_topup_by is not null
       and not exists (select 1 from public.machinery_fleet_topup_requests r
                        where r.card_id = c.id and r.status in ('pending', 'approved'))
  loop
    v_bal := public.machinery_card_balance_now(k.id);
    if v_bal < k.auto_topup_below then
      insert into public.machinery_fleet_topup_requests (company_id, card_id, amount, reason, status, requested_by, is_auto)
      values (k.company_id, k.id, k.auto_topup_amount,
              'Automatic: card balance RM ' || to_char(v_bal, 'FM999,999,990.00') || ' is below RM ' || to_char(k.auto_topup_below, 'FM999,999,990.00'),
              'pending', k.auto_topup_by, true);
      update public.machinery_diesel_cards set auto_topup_last_at = now() where id = k.id;
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;
revoke all on function public.machinery_auto_topup_run(uuid) from public, anon, authenticated;

-- Fleet Card Manage opens → check this company's cards (anyone who sees the cards)
create or replace function public.machinery_auto_topup_check(p_company uuid)
returns integer
language plpgsql security definer
set search_path = public
as $$
begin
  if not coalesce(public.machinery_can(p_company, 'cards', 'view'), false) then
    return 0;
  end if;
  return public.machinery_auto_topup_run(p_company);
end $$;
revoke all on function public.machinery_auto_topup_check(uuid) from public, anon;
grant execute on function public.machinery_auto_topup_check(uuid) to authenticated;

-- Procurement (or a super admin) switches it on / off and sets the amounts
create or replace function public.machinery_set_auto_topup(p_card uuid, p_on boolean, p_below numeric, p_amount numeric)
returns void
language plpgsql security definer
set search_path = public
as $$
declare v_company uuid;
begin
  select company_id into v_company from public.machinery_diesel_cards where id = p_card;
  if v_company is null then raise exception 'Fleet card not found' using errcode = 'P0002'; end if;
  if not coalesce(public.machinery_is_procurement(v_company), false) then
    raise exception 'Only the Procurement role can set automatic top-up requests.' using errcode = '42501';
  end if;
  if p_on and (p_below is null or p_below < 0 or p_amount is null or p_amount <= 0) then
    raise exception 'Fill in the balance and the top-up amount.' using errcode = '23514';
  end if;
  update public.machinery_diesel_cards
     set auto_topup = p_on,
         auto_topup_below = p_below,
         auto_topup_amount = p_amount,
         auto_topup_by = case when p_on then auth.uid() else auto_topup_by end
   where id = p_card;
  if p_on then perform public.machinery_auto_topup_run(v_company); end if;
end $$;
revoke all on function public.machinery_set_auto_topup(uuid, boolean, numeric, numeric) from public, anon;
grant execute on function public.machinery_set_auto_topup(uuid, boolean, numeric, numeric) to authenticated;

-- Right after fuel station statement rows come in (AI agent / import)
create or replace function public.machinery_auto_topup_after_usage()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare co uuid;
begin
  for co in select distinct company_id from new_rows loop
    perform public.machinery_auto_topup_run(co);
  end loop;
  return null;
end $$;
drop trigger if exists machinery_auto_topup_after_usage on public.machinery_diesel_card_usage;
create trigger machinery_auto_topup_after_usage
  after insert on public.machinery_diesel_card_usage
  referencing new table as new_rows
  for each statement execute function public.machinery_auto_topup_after_usage();

-- Every hour (Supabase pg_cron)
do $$
begin
  create extension if not exists pg_cron;
exception when others then
  raise notice 'pg_cron is not available: automatic top-ups are checked when statements come in and when Fleet Card Manage is opened.';
end $$;
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'machinery-auto-topup';
    perform cron.schedule('machinery-auto-topup', '23 * * * *', 'select public.machinery_auto_topup_run(null)');
  end if;
end $$;
