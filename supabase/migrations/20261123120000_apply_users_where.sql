-- =====================================================================
-- >>> RUN THIS IN THE **MACHINERY PORTAL** DATABASE <<<
-- >>> Supabase project qcvbzzdbbqmnrljfnxjp (shared with MachTrek)   <<<
-- >>> NOT the MJM Intranet database (briqzyxfxsvulyizzbiu)            <<<
-- Safe to run more than once.
-- =====================================================================
-- "Sync from MJM Intranet" stopped with "UPDATE requires a WHERE clause":
-- the database refuses an UPDATE over a whole table. The flag updates now
-- name their rows.
create or replace function public.machinery_apply_intranet_users(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare n_c int := 0; n_f int := 0;
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
  return jsonb_build_object('cmms_rows', n_c, 'fuel_rows', n_f);
end $$;
revoke all on function public.machinery_apply_intranet_users(jsonb) from public, anon, authenticated;

select email, full_name, is_super_admin, intranet_cmms, intranet_fuel from public.machinery_portal_admins order by email;
