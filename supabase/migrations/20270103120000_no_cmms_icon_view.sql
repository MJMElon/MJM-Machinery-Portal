-- =====================================================================
-- >>> RUN THIS IN THE **MACHINERY PORTAL** DATABASE <<<
-- >>> Supabase project qcvbzzdbbqmnrljfnxjp (shared with MachTrek)   <<<
-- >>> NOT the MJM Intranet database (briqzyxfxsvulyizzbiu)            <<<
-- Safe to run more than once.
-- =====================================================================
-- A new person coming in from MJM Intranet sees only what CMMS 2 User
-- Access gives them. The Machinery (CMMS 2) Icon in the Intranet no longer
-- gives "view" on Maintenance Work Manage, Machinery Profile and Suppliers
-- by itself; set it in User Access. The Fuel Claims Icon still lets a person
-- submit and see their OWN fuel claims (that Icon opens Fuel Claims).
create or replace function public.machinery_icon_perms(p_company uuid, p_user uuid)
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select coalesce(
    (select case when a.intranet_fuel and c.diesel_enabled then '{"claims": ["view", "add", "edit", "delete"]}'::jsonb else '{}'::jsonb end
       from public.machinery_portal_admins a, public.machinery_companies c
      where a.user_id = p_user and c.id = p_company),
    '{}'::jsonb);
$$;
revoke all on function public.machinery_icon_perms(uuid, uuid) from public, anon;
grant execute on function public.machinery_icon_perms(uuid, uuid) to authenticated;
