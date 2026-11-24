-- =====================================================================
-- >>> RUN THIS IN THE **MACHINERY PORTAL** DATABASE <<<
-- >>> Supabase project qcvbzzdbbqmnrljfnxjp (shared with MachTrek)   <<<
-- Needs 20261220. Safe to run more than once.
-- =====================================================================
-- Automatic top-up: choose the requestor.
--   The "Auto top-up request" box on a fleet card gets a Requestor: one of
--   the Procurement people of the company. The automatic requests of that
--   card are sent in their name (auto_topup_by), so they show in that
--   person's claim list and go to that person's approvers. Before this the
--   requestor was always the person who switched it on.
-- =====================================================================

-- Is this user Procurement in this company? (same rule as machinery_is_procurement, for any user)
create or replace function public.machinery_user_is_procurement(p_company uuid, p_user uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.machinery_user_perms up
     where up.company_id = p_company and up.user_id = p_user
       and (coalesce(up.perms -> 'fuel_role', '[]'::jsonb) ? 'procurement'
            or (not (up.perms ? 'fuel_role') and coalesce(up.perms -> 'topup', '[]'::jsonb) ? 'process')));
$$;
revoke all on function public.machinery_user_is_procurement(uuid, uuid) from public, anon, authenticated;

-- The Procurement people of a company (for the Requestor drop-down)
create or replace function public.machinery_procurement_people(p_company uuid)
returns table (user_id uuid)
language sql stable security definer
set search_path = public
as $$
  select up.user_id from public.machinery_user_perms up
   where up.company_id = p_company
     and coalesce(public.machinery_can(p_company, 'cards', 'view'), false)
     and public.machinery_user_is_procurement(p_company, up.user_id);
$$;
revoke all on function public.machinery_procurement_people(uuid) from public, anon;
grant execute on function public.machinery_procurement_people(uuid) to authenticated;

-- Switch on / off with the amounts and the requestor (default: me)
drop function if exists public.machinery_set_auto_topup(uuid, boolean, numeric, numeric);
create or replace function public.machinery_set_auto_topup(p_card uuid, p_on boolean, p_below numeric, p_amount numeric, p_requester uuid default null)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_company uuid;
  v_req uuid := coalesce(p_requester, auth.uid());
begin
  select company_id into v_company from public.machinery_diesel_cards where id = p_card;
  if v_company is null then raise exception 'Fleet card not found' using errcode = 'P0002'; end if;
  if not coalesce(public.machinery_is_procurement(v_company), false) then
    raise exception 'Only the Procurement role can set automatic top-up requests.' using errcode = '42501';
  end if;
  if p_on and (p_below is null or p_below < 0 or p_amount is null or p_amount <= 0) then
    raise exception 'Fill in the balance and the top-up amount.' using errcode = '23514';
  end if;
  if p_on and v_req <> auth.uid() and not public.machinery_user_is_procurement(v_company, v_req) then
    raise exception 'The requestor must have the Procurement role in this company.' using errcode = '42501';
  end if;
  update public.machinery_diesel_cards
     set auto_topup = p_on,
         auto_topup_below = p_below,
         auto_topup_amount = p_amount,
         auto_topup_by = case when p_on then v_req else auto_topup_by end
   where id = p_card;
  if p_on then perform public.machinery_auto_topup_run(v_company); end if;
end $$;
revoke all on function public.machinery_set_auto_topup(uuid, boolean, numeric, numeric, uuid) from public, anon;
grant execute on function public.machinery_set_auto_topup(uuid, boolean, numeric, numeric, uuid) to authenticated;

notify pgrst, 'reload schema';
