-- =====================================================================
-- >>> RUN THIS IN THE **MACHINERY PORTAL** DATABASE <<<
-- >>> Supabase project qcvbzzdbbqmnrljfnxjp (shared with MachTrek)   <<<
-- >>> NOT the MJM Intranet database (briqzyxfxsvulyizzbiu)            <<<
-- Safe to run more than once.
-- =====================================================================
-- Module admins: a person can be admin of Machinery Manage and / or Fuel
-- Manage in a company (perms.admin = ["machinery", "fuel"]). A module admin
-- sees everyone's access in that company and changes the rights of THEIR
-- module only (User Access, Fuel → Claim approval setting), including making
-- other people admin of the same module. Super admins still do everything.

-- The sections of each module (keep in step with src/lib/perms.js ROLE_MODEL)
create or replace function public.machinery_module_sections(p_module text)
returns text[]
language sql immutable
as $$
  select case p_module
    when 'machinery' then array['work', 'machines', 'suppliers']
    when 'fuel'      then array['claims', 'usage', 'cards', 'report', 'fuel_record', 'approve_for']
    else array[]::text[] end;
$$;

-- Is the signed-in user admin of p_module (or of any module when p_module is null) in p_company?
create or replace function public.machinery_module_admin(p_company uuid, p_module text default null)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.is_machinery_super_admin() or exists (
    select 1 from public.machinery_user_perms up
     where up.company_id = p_company and up.user_id = auth.uid()
       and jsonb_typeof(up.perms -> 'admin') = 'array'
       and (case when p_module is null then jsonb_array_length(up.perms -> 'admin') > 0
                 else (up.perms -> 'admin') ? p_module end));
$$;
revoke all on function public.machinery_module_admin(uuid, text) from public, anon;
grant execute on function public.machinery_module_admin(uuid, text) to authenticated;

-- Module admins read everyone's access in their company (writes go through the function below)
drop policy if exists "user_perms_read" on public.machinery_user_perms;
create policy "user_perms_read" on public.machinery_user_perms
  for select to authenticated
  using (user_id = auth.uid() or public.is_machinery_super_admin() or public.machinery_module_admin(company_id));

-- Save one module's part of a person's access. Only the keys of that module
-- (and the admin flag of that module) change; everything else is kept.
create or replace function public.machinery_save_module_perms(p_company uuid, p_user uuid, p_module text, p_perms jsonb)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  cur jsonb;
  k text;
  admins jsonb;
  secs text[] := public.machinery_module_sections(p_module);
begin
  if array_length(secs, 1) is null then
    raise exception 'Unknown module %', p_module using errcode = '22023';
  end if;
  if not public.machinery_module_admin(p_company, p_module) then
    raise exception 'Only an admin of this module can change its user access.' using errcode = '42501';
  end if;
  select perms into cur from public.machinery_user_perms where company_id = p_company and user_id = p_user;
  cur := coalesce(cur, '{}'::jsonb);
  foreach k in array secs loop
    cur := cur - k;
    if jsonb_typeof(p_perms -> k) = 'array' and (jsonb_array_length(p_perms -> k) > 0 or k = 'approve_for') then
      cur := cur || jsonb_build_object(k, p_perms -> k);
    end if;
  end loop;
  if p_module = 'fuel' and not coalesce((cur -> 'claims') ? 'approve', false) then
    cur := cur - 'approve_for';
  end if;
  -- the admin flag of this module
  admins := coalesce((select jsonb_agg(x) from jsonb_array_elements_text(coalesce(cur -> 'admin', '[]'::jsonb)) x where x <> p_module), '[]'::jsonb);
  if coalesce((p_perms -> 'admin') ? p_module, false) then
    admins := admins || to_jsonb(p_module);
  end if;
  cur := cur - 'admin';
  if jsonb_array_length(admins) > 0 then
    cur := cur || jsonb_build_object('admin', admins);
  end if;
  insert into public.machinery_user_perms (company_id, user_id, perms)
  values (p_company, p_user, cur)
  on conflict (company_id, user_id) do update set perms = excluded.perms;
  return cur;
end $$;
revoke all on function public.machinery_save_module_perms(uuid, uuid, text, jsonb) from public, anon;
grant execute on function public.machinery_save_module_perms(uuid, uuid, text, jsonb) to authenticated;

-- Module admins per company
select c.name as company, coalesce(a.full_name, a.email) as person, up.perms -> 'admin' as admin_of
  from public.machinery_user_perms up
  join public.machinery_companies c on c.id = up.company_id
  join public.machinery_portal_admins a on a.user_id = up.user_id
 where jsonb_array_length(coalesce(up.perms -> 'admin', '[]'::jsonb)) > 0
 order by 1, 2;
