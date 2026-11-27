-- =====================================================================
-- >>> RUN THIS IN THE **MACHINERY PORTAL** DATABASE <<<
-- >>> Supabase project qcvbzzdbbqmnrljfnxjp                          <<<
-- Safe to run more than once.
-- =====================================================================
-- People with the Fuel Claims icon in MJM Intranet (and no role set in User
-- Access) count as Fuel Claims users of the companies they have the icon for:
-- "View own claims record" (driver level). machinery_diesel_people now says
-- so (has_access / can_claim), so they can be picked as fleet card drivers
-- everywhere and show with their name instead of "Unknown user".
-- =====================================================================
create or replace function public.machinery_diesel_people(p_company uuid)
returns table (user_id uuid, email text, full_name text, is_super_admin boolean, has_access boolean, is_admin boolean, can_claim boolean, can_report boolean)
language sql
stable
security definer
set search_path = public
as $$
  select a.user_id, a.email, a.full_name, a.is_super_admin,
         (up.user_id is not null and jsonb_array_length(coalesce(up.perms -> 'claims', '[]'::jsonb)) > 0)
           or jsonb_array_length(coalesce(public.machinery_icon_perms(p_company, a.user_id) -> 'claims', '[]'::jsonb)) > 0 as has_access,
         coalesce((up.perms -> 'claims') ? 'approve', false),
         coalesce((up.perms -> 'claims') ? 'add', false) or coalesce((public.machinery_icon_perms(p_company, a.user_id) -> 'claims') ? 'add', false),
         coalesce((up.perms -> 'report') ? 'view', false)
    from public.machinery_portal_admins a
    left join public.machinery_user_perms up on up.user_id = a.user_id and up.company_id = p_company
   where (public.machinery_diesel_can(p_company, 'report') or public.machinery_diesel_can(p_company, 'admin')
          or public.machinery_can(p_company, 'usage', 'view') or public.machinery_can(p_company, 'cards', 'view'))
     and (not public.machinery_scope_on('fuel')
          or exists (select 1 from public.machinery_user_companies uc
                      where uc.user_id = a.user_id and uc.company_id = p_company and uc.module = 'fuel'))
   order by coalesce(a.full_name, a.email);
$$;

notify pgrst, 'reload schema';
