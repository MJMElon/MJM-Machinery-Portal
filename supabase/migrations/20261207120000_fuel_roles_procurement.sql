-- =====================================================================
-- >>> RUN THIS IN THE **MACHINERY PORTAL** DATABASE <<<
-- >>> Supabase project qcvbzzdbbqmnrljfnxjp (shared with MachTrek)   <<<
-- Needs 20261206120000_fleet_card_topup_requests.sql. Safe to run more than once.
-- =====================================================================
-- Fuel Manage → Approval setting: one role per person
--   Normal user / Accountant / Claim approver / Procurement
-- kept in perms.fuel_role = [role].
-- Procurement (perms.topup 'process'): sees every fleet card top-up request
-- of the company and marks approved ones topped up.

-- Fuel Manage admins also save the role (and the top-up rights)
create or replace function public.machinery_module_sections(p_module text)
returns text[]
language sql immutable
as $$
  select case p_module
    when 'machinery' then array['work', 'machines', 'suppliers']
    when 'fuel'      then array['claims', 'usage', 'cards', 'report', 'fuel_record', 'approve_for', 'topup', 'topup_approve_for', 'fuel_role']
    else array[]::text[] end;
$$;

-- Procurement reads every top-up request of the company
drop policy if exists "topup_read" on public.machinery_fleet_topup_requests;
create policy "topup_read" on public.machinery_fleet_topup_requests for select to authenticated
  using (requested_by = auth.uid()
         or public.machinery_topup_approver(company_id, requested_by)
         or public.machinery_can(company_id, 'cards', 'edit')
         or public.machinery_can(company_id, 'topup', 'process'));

-- … and marks approved requests topped up
create or replace function public.machinery_topup_done(p_id uuid, p_date date default null)
returns void
language plpgsql security definer
set search_path = public
as $$
declare r record;
begin
  select * into r from public.machinery_fleet_topup_requests where id = p_id for update;
  if not found then raise exception 'Request not found' using errcode = 'P0002'; end if;
  if not (r.requested_by = auth.uid() or public.machinery_topup_approver(r.company_id, r.requested_by)
          or public.machinery_can(r.company_id, 'cards', 'edit')
          or public.machinery_can(r.company_id, 'topup', 'process')) then
    raise exception 'Not allowed.' using errcode = '42501';
  end if;
  if r.status <> 'approved' then raise exception 'Only an approved request can be marked topped up.' using errcode = '23514'; end if;
  update public.machinery_fleet_topup_requests
     set status = 'topped_up', topped_up_on = coalesce(p_date, current_date), topped_up_by = auth.uid()
   where id = p_id;
end $$;
revoke all on function public.machinery_topup_done(uuid, date) from public, anon;
grant execute on function public.machinery_topup_done(uuid, date) to authenticated;

select 'done' as result;
