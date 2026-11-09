-- =====================================================================
-- >>> RUN THIS IN THE **MACHINERY PORTAL** DATABASE <<<
-- >>> Supabase project qcvbzzdbbqmnrljfnxjp (shared with MachTrek)   <<<
-- >>> NOT the MJM Intranet database (briqzyxfxsvulyizzbiu)            <<<
-- Supabase dashboard → (Machinery project) → SQL Editor → paste all → Run.
-- Run the earlier migrations (… 20261112120000_fuel_claim_lines.sql) first.
-- Safe to run more than once.
-- =====================================================================
--
-- 1) Named approvers: a person with the "approve" right on fuel claims may be
--    limited to the claims of particular people (Role setup → Fuel Claims →
--    Approve claims → names). Stored in the matrix as perms.approve_for =
--    ["<user id>", …]; an empty list = may approve anyone's claims.
-- 2) Who has access to the CMMS 2 / Fuel Manage Icons in MJM Intranet is
--    synced here (machinery_portal_admins.intranet_cmms / intranet_fuel), so
--    their names show up in Role setup before they first sign in.
-- =====================================================================

-- 1) May the signed-in user review (approve / reject / pay) claims of p_claimant in p_company?
create or replace function public.machinery_claim_reviewable(p_company uuid, p_claimant uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.is_machinery_super_admin() or exists (
    select 1 from public.machinery_user_perms up
     where up.company_id = p_company and up.user_id = auth.uid()
       and ((up.perms -> 'claims') ? 'approve' or (up.perms -> 'claims') ? 'pay')
       and (jsonb_typeof(up.perms -> 'approve_for') is distinct from 'array'
            or jsonb_array_length(up.perms -> 'approve_for') = 0
            or (up.perms -> 'approve_for') ? p_claimant::text));
$$;
revoke all on function public.machinery_claim_reviewable(uuid, uuid) from public, anon;
grant execute on function public.machinery_claim_reviewable(uuid, uuid) to authenticated;

-- Claims: approvers see the claims they may review
drop policy if exists "diesel_claims_read" on public.machinery_diesel_claims;
create policy "diesel_claims_read" on public.machinery_diesel_claims
  for select to authenticated
  using ((claimant_id = auth.uid() and public.machinery_can(company_id, 'claims', 'view'))
         or public.machinery_can(company_id, 'claims', 'view_all')
         or public.machinery_can(company_id, 'report', 'view')
         or public.machinery_claim_reviewable(company_id, claimant_id));
drop policy if exists "diesel_claims_update" on public.machinery_diesel_claims;
create policy "diesel_claims_update" on public.machinery_diesel_claims
  for update to authenticated
  using ((claimant_id = auth.uid() and status = 'pending' and public.machinery_can(company_id, 'claims', 'edit'))
         or public.machinery_claim_reviewable(company_id, claimant_id))
  with check ((claimant_id = auth.uid() and status = 'pending' and public.machinery_can(company_id, 'claims', 'edit'))
         or public.machinery_claim_reviewable(company_id, claimant_id));

drop policy if exists "claim_lines_read" on public.machinery_diesel_claim_lines;
create policy "claim_lines_read" on public.machinery_diesel_claim_lines
  for select to authenticated
  using (exists (select 1 from public.machinery_diesel_claims c where c.id = claim_id
                   and ((c.claimant_id = auth.uid() and public.machinery_can(c.company_id, 'claims', 'view'))
                        or public.machinery_can(c.company_id, 'claims', 'view_all')
                        or public.machinery_can(c.company_id, 'report', 'view')
                        or public.machinery_can(c.company_id, 'usage', 'view')
                        or public.machinery_claim_reviewable(c.company_id, c.claimant_id))));

-- The review guard: approve / reject need "approve", paid needs "pay", and the
-- claimant must be within the reviewer's named people (if any).
create or replace function public.machinery_diesel_claims_guard()
returns trigger language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.vehicle_id is not null
       and new.company_id <> (select v.company_id from public.machinery_machines v where v.id = new.vehicle_id) then
      raise exception 'The vehicle belongs to another company.' using errcode = '23514';
    end if;
    return new;
  end if;
  if auth.uid() is null then
    return new;
  end if;
  if new.claimant_id <> old.claimant_id or new.company_id <> old.company_id then
    raise exception 'The claimant and company of a claim cannot be changed.' using errcode = '42501';
  end if;
  if new.vehicle_id is distinct from old.vehicle_id and new.vehicle_id is not null
     and new.company_id <> (select v.company_id from public.machinery_machines v where v.id = new.vehicle_id) then
    raise exception 'The vehicle belongs to another company.' using errcode = '23514';
  end if;
  if new.status is distinct from old.status then
    if not public.machinery_claim_reviewable(old.company_id, old.claimant_id) then
      raise exception 'You are not an approver for this person''s claims.' using errcode = '42501';
    end if;
    if new.status = 'paid' or old.status = 'paid' then
      if not public.machinery_can(old.company_id, 'claims', 'pay') then
        raise exception 'You do not have the "mark paid" right for fuel claims.' using errcode = '42501';
      end if;
    elsif not public.machinery_can(old.company_id, 'claims', 'approve') then
      raise exception 'You do not have the "approve" right for fuel claims.' using errcode = '42501';
    end if;
    if old.claimant_id = auth.uid() and not public.is_machinery_super_admin() then
      raise exception 'You cannot review your own claim.' using errcode = '42501';
    end if;
    new.reviewed_by := auth.uid();
    new.reviewed_at := now();
    return new;
  end if;
  if not public.machinery_claim_reviewable(old.company_id, old.claimant_id)
     and (new.reviewed_by is distinct from old.reviewed_by
          or new.reviewed_at is distinct from old.reviewed_at
          or new.review_note is distinct from old.review_note) then
    raise exception 'Only a reviewer can change the review fields.' using errcode = '42501';
  end if;
  return new;
end $$;

-- 2) Intranet Icon access, synced
alter table public.machinery_portal_admins
  add column if not exists intranet_cmms boolean not null default false,
  add column if not exists intranet_fuel boolean not null default false;

-- Every portal user may see the portal user list (names for Role setup and the
-- approver names); only super admins may change it.
drop policy if exists "portal_admins_super_read" on public.machinery_portal_admins;
drop policy if exists "portal_admins_read" on public.machinery_portal_admins;
create policy "portal_admins_read" on public.machinery_portal_admins
  for select to authenticated using (public.is_machinery_portal_admin());

-- People list for drop-downs now also carries the Intranet flags
drop function if exists public.machinery_portal_people();
create or replace function public.machinery_portal_people()
returns table (user_id uuid, email text, full_name text, is_super_admin boolean, intranet_cmms boolean, intranet_fuel boolean)
language sql stable security definer
set search_path = public
as $$
  select a.user_id, a.email, a.full_name, a.is_super_admin, a.intranet_cmms, a.intranet_fuel
    from public.machinery_portal_admins a
   where public.is_machinery_portal_admin()
   order by coalesce(a.full_name, a.email);
$$;
revoke all on function public.machinery_portal_people() from public, anon;
grant execute on function public.machinery_portal_people() to authenticated;

-- Applied by the sync (service role): which portal users have which Icon.
-- p = { cmms: [user ids], fuel: [user ids] } (null = leave that flag alone)
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
       set intranet_cmms = exists (select 1 from jsonb_array_elements_text(p -> 'cmms') x where x::uuid = a.user_id);
    get diagnostics n_c = row_count;
  end if;
  if jsonb_typeof(p -> 'fuel') = 'array' then
    update public.machinery_portal_admins a
       set intranet_fuel = exists (select 1 from jsonb_array_elements_text(p -> 'fuel') x where x::uuid = a.user_id);
    get diagnostics n_f = row_count;
  end if;
  return jsonb_build_object('cmms_rows', n_c, 'fuel_rows', n_f);
end $$;
revoke all on function public.machinery_apply_intranet_users(jsonb) from public, anon, authenticated;

select email, full_name, is_super_admin, intranet_cmms, intranet_fuel from public.machinery_portal_admins order by email;
