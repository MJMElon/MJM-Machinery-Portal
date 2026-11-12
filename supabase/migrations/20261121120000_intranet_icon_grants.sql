-- =====================================================================
-- >>> RUN THIS IN THE **MACHINERY PORTAL** DATABASE <<<
-- >>> Supabase project qcvbzzdbbqmnrljfnxjp (shared with MachTrek)   <<<
-- >>> NOT the MJM Intranet database (briqzyxfxsvulyizzbiu)            <<<
-- Safe to run more than once.
-- =====================================================================
-- Access that comes straight from the MJM Intranet icons, without any
-- Role setup in CMMS 2:
--   Fuel Claims icon  → own fuel claims (view / add / edit / delete) in every
--                       company that has Fuel Manage
--   Machinery icon    → view Maintenance Work Manage, Machinery Profile and
--                       the Supplier list in every company that has CMMS
-- Role setup adds more on top (review, pay, usage, cards, edit machines, …).

-- The extra rights an Intranet icon gives in a company (jsonb like perms)
create or replace function public.machinery_icon_perms(p_company uuid, p_user uuid)
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select coalesce(
    (select case when a.intranet_fuel and c.diesel_enabled then '{"claims": ["view", "add", "edit", "delete"]}'::jsonb else '{}'::jsonb end
         || case when a.intranet_cmms and c.cmms_enabled then '{"work": ["view"], "machines": ["view"], "suppliers": ["view"]}'::jsonb else '{}'::jsonb end
       from public.machinery_portal_admins a, public.machinery_companies c
      where a.user_id = p_user and c.id = p_company),
    '{}'::jsonb);
$$;
revoke all on function public.machinery_icon_perms(uuid, uuid) from public, anon;
grant execute on function public.machinery_icon_perms(uuid, uuid) to authenticated;

-- The signed-in user's full matrix for a company: Role setup + icon rights
create or replace function public.machinery_my_perms(p_company uuid)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare v jsonb := '{}'::jsonb; k text; icon jsonb;
begin
  select up.perms into v from public.machinery_user_perms up where up.company_id = p_company and up.user_id = auth.uid();
  v := coalesce(v, '{}'::jsonb);
  icon := public.machinery_icon_perms(p_company, auth.uid());
  for k in select jsonb_object_keys(icon) loop
    v := jsonb_set(v, array[k], (select coalesce(jsonb_agg(distinct x), '[]'::jsonb)
                                   from (select jsonb_array_elements(coalesce(v -> k, '[]'::jsonb) || (icon -> k)) x) s));
  end loop;
  return v;
end $$;
revoke all on function public.machinery_my_perms(uuid) from public, anon;
grant execute on function public.machinery_my_perms(uuid) to authenticated;

-- machinery_can: Role setup OR the icon rights
create or replace function public.machinery_can(p_company uuid, p_section text, p_action text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.is_machinery_super_admin()
      or exists (select 1 from public.machinery_user_perms up
                  where up.company_id = p_company and up.user_id = auth.uid() and (up.perms -> p_section) ? p_action)
      or (public.machinery_icon_perms(p_company, auth.uid()) -> p_section) ? p_action;
$$;

select a.email, a.intranet_cmms, a.intranet_fuel from public.machinery_portal_admins a order by a.email;
