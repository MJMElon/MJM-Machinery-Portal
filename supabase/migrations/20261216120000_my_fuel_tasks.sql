-- =====================================================================
-- >>> RUN THIS IN THE **MACHINERY PORTAL** DATABASE <<<
-- >>> Supabase project qcvbzzdbbqmnrljfnxjp (shared with MachTrek)   <<<
-- >>> NOT the MJM Intranet database (briqzyxfxsvulyizzbiu)            <<<
-- Safe to run more than once.
-- =====================================================================
-- Fuel Manage main page → task bar: reminders the browser cannot work out
-- from what it may read. For now: the signed-in person's fleet card fill-ups
-- that came in from the station statement (Setel import / AI agent) in the
-- last 60 days and are not on any fuel claim yet. More reminders can be
-- added to the returned object later.
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
         and u.source in ('setel', 'statement')
         and u.claim_line_id is null
         and u.fill_date >= ((now() at time zone 'Asia/Kuala_Lumpur')::date - 60)
         and (u.driver_id = auth.uid() or (u.driver_id is null and auth.uid() = any (c.driver_ids)))
    )
  );
$$;
revoke all on function public.machinery_my_fuel_tasks(uuid) from public, anon;
grant execute on function public.machinery_my_fuel_tasks(uuid) to authenticated;
