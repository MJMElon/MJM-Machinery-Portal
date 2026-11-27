-- =====================================================================
-- >>> RUN THIS IN THE **MACHINERY PORTAL** DATABASE <<<
-- >>> Supabase project qcvbzzdbbqmnrljfnxjp (shared with MachTrek)   <<<
-- Needs 20261212 and 20261216 (task bar). Safe to run more than once.
-- =====================================================================
-- Fuel Records typed by hand count like the Fuel Station Portal:
--   * a fill-up typed in Fuel Records (from the station portal) is matched
--     with the driver's claim receipt the same way as the portal's own rows
--     (same card, a day either side, amount within RM 0.10 or the same receipt
--     no.), so it is counted once (on the claim) and not twice;
--   * the driver's reminder "fleet card fill-ups not claimed yet" (Fuel Manage
--     main page) counts these too, and a fill-up only stops counting once its
--     claim is submitted (a draft does not count).
-- =====================================================================

create or replace function public.machinery_pair_usage(p_usage uuid)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare u record; v_line uuid;
begin
  select * into u from public.machinery_diesel_card_usage where id = p_usage;
  if not found or u.claim_line_id is not null then return u.claim_line_id; end if;
  select l.id into v_line
    from public.machinery_diesel_claim_lines l
    join public.machinery_diesel_claims c on c.id = l.claim_id
   where l.card_id = u.card_id and l.payment = 'fleet_card' and l.line_kind = 'fill'
     and c.status <> 'rejected'
     and l.fill_date between u.fill_date - 1 and u.fill_date + 1
     and (abs(l.amount - u.amount) <= 0.10
          or (u.receipt_no is not null and l.receipt_no is not null
              and regexp_replace(lower(l.receipt_no), '[^a-z0-9]', '', 'g') = regexp_replace(lower(u.receipt_no), '[^a-z0-9]', '', 'g')))
     and not exists (select 1 from public.machinery_diesel_card_usage x where x.claim_line_id = l.id)
   order by (l.fill_date = u.fill_date) desc, abs(l.amount - u.amount), abs(coalesce(l.litres, 0) - coalesce(u.litres, 0)), l.created_at
   limit 1;
  if v_line is not null then
    update public.machinery_diesel_card_usage set claim_line_id = v_line where id = p_usage and claim_line_id is null;
  end if;
  return v_line;
end $$;
revoke all on function public.machinery_pair_usage(uuid) from public, anon, authenticated;

create or replace function public.machinery_pair_line(p_line uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare l record; v_usage uuid;
begin
  select ln.*, c.status as claim_status into l
    from public.machinery_diesel_claim_lines ln join public.machinery_diesel_claims c on c.id = ln.claim_id
   where ln.id = p_line;
  if not found or l.card_id is null or l.payment <> 'fleet_card' or l.line_kind <> 'fill' or l.claim_status = 'rejected' then return; end if;
  if exists (select 1 from public.machinery_diesel_card_usage x where x.claim_line_id = p_line) then return; end if;
  select u.id into v_usage
    from public.machinery_diesel_card_usage u
   where u.card_id = l.card_id and u.claim_line_id is null
     and u.fill_date between l.fill_date - 1 and l.fill_date + 1
     and (abs(l.amount - u.amount) <= 0.10
          or (u.receipt_no is not null and l.receipt_no is not null
              and regexp_replace(lower(l.receipt_no), '[^a-z0-9]', '', 'g') = regexp_replace(lower(u.receipt_no), '[^a-z0-9]', '', 'g')))
   order by (u.fill_date = l.fill_date) desc, abs(l.amount - u.amount), abs(coalesce(l.litres, 0) - coalesce(u.litres, 0)), u.fill_at nulls last
   limit 1;
  if v_usage is not null then
    update public.machinery_diesel_card_usage set claim_line_id = p_line where id = v_usage and claim_line_id is null;
  end if;
end $$;
revoke all on function public.machinery_pair_line(uuid) from public, anon, authenticated;

-- a fill-up arrives (station portal or typed by hand), or a hand-typed one is changed → look for its claim receipt
create or replace function public.machinery_card_usage_pair_trg()
returns trigger language plpgsql security definer set search_path = public
as $$ begin
  perform public.machinery_pair_usage(new.id);
  return null;
end $$;
drop trigger if exists machinery_diesel_card_usage_pair on public.machinery_diesel_card_usage;
create trigger machinery_diesel_card_usage_pair after insert on public.machinery_diesel_card_usage
  for each row when (new.claim_line_id is null)
  execute function public.machinery_card_usage_pair_trg();
drop trigger if exists machinery_diesel_card_usage_repair on public.machinery_diesel_card_usage;
create trigger machinery_diesel_card_usage_repair after update of amount, fill_date, receipt_no on public.machinery_diesel_card_usage
  for each row when (new.claim_line_id is null)
  execute function public.machinery_card_usage_pair_trg();

-- Reminder for the driver: fill-ups on their card (station portal or typed
-- by hand) in the last 60 days that no submitted claim covers yet
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
         and (u.driver_id = auth.uid() or (u.driver_id is null and auth.uid() = any (c.driver_ids)))
    )
  );
$$;
revoke all on function public.machinery_my_fuel_tasks(uuid) from public, anon;
grant execute on function public.machinery_my_fuel_tasks(uuid) to authenticated;

-- Fill-ups typed by hand already there: pair them now
do $$ declare r record; begin
  for r in select id from public.machinery_diesel_card_usage where source = 'manual' and claim_line_id is null loop
    perform public.machinery_pair_usage(r.id);
  end loop;
end $$;

notify pgrst, 'reload schema';
