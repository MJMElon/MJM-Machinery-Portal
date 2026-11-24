-- =====================================================================
-- >>> RUN THIS IN THE **MACHINERY PORTAL** DATABASE <<<
-- >>> Supabase project qcvbzzdbbqmnrljfnxjp (shared with MachTrek)   <<<
-- >>> NOT the MJM Intranet database (briqzyxfxsvulyizzbiu)            <<<
-- Needs all earlier migrations. Safe to run more than once.
-- =====================================================================
-- MJM Intranet Super Admin = Super Admin in this portal.
--
--   * machinery_portal_admins.intranet_super = true means "this person is a
--     super admin here because they are an Intranet Super Admin".
--   * At each sign-in from the Intranet (gw-login) and at each sync
--     (sync-intranet / background sync) an Intranet Super Admin gets
--     is_super_admin = true here.
--   * When someone stops being an Intranet Super Admin, only a super admin
--     right that came from the Intranet is taken back. People made super admin
--     inside this portal keep it.
-- =====================================================================

alter table public.machinery_portal_admins add column if not exists intranet_super boolean not null default false;

-- p = { cmms: [user ids], fuel: [user ids], super: [user ids] }
create or replace function public.machinery_apply_intranet_users(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare n_c int := 0; n_f int := 0; n_s int := 0; n_x int := 0;
begin
  if auth.uid() is not null and not public.is_machinery_super_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if jsonb_typeof(p -> 'cmms') = 'array' then
    update public.machinery_portal_admins a
       set intranet_cmms = exists (select 1 from jsonb_array_elements_text(p -> 'cmms') x where x::uuid = a.user_id)
     where a.user_id is not null;
    get diagnostics n_c = row_count;
  end if;
  if jsonb_typeof(p -> 'fuel') = 'array' then
    update public.machinery_portal_admins a
       set intranet_fuel = exists (select 1 from jsonb_array_elements_text(p -> 'fuel') x where x::uuid = a.user_id)
     where a.user_id is not null;
    get diagnostics n_f = row_count;
  end if;
  if jsonb_typeof(p -> 'super') = 'array' then
    -- Intranet Super Admins who are not super admin here yet
    update public.machinery_portal_admins a
       set is_super_admin = true, intranet_super = true
     where not a.is_super_admin
       and exists (select 1 from jsonb_array_elements_text(p -> 'super') x where x::uuid = a.user_id);
    get diagnostics n_s = row_count;
    -- No longer Intranet Super Admin: take back only what the Intranet gave
    update public.machinery_portal_admins a
       set is_super_admin = false, intranet_super = false
     where a.intranet_super
       and not exists (select 1 from jsonb_array_elements_text(p -> 'super') x where x::uuid = a.user_id);
    get diagnostics n_x = row_count;
  end if;
  return jsonb_build_object('cmms_rows', n_c, 'fuel_rows', n_f, 'super_added', n_s, 'super_removed', n_x);
end $$;
revoke all on function public.machinery_apply_intranet_users(jsonb) from public, anon, authenticated;

select email, full_name, is_super_admin, intranet_super from public.machinery_portal_admins order by is_super_admin desc, email;
