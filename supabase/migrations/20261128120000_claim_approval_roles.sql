-- =====================================================================
-- >>> RUN THIS IN THE **MACHINERY PORTAL** DATABASE <<<
-- >>> Supabase project qcvbzzdbbqmnrljfnxjp (shared with MachTrek)   <<<
-- >>> NOT the MJM Intranet database (briqzyxfxsvulyizzbiu)            <<<
-- Safe to run more than once.
-- =====================================================================
-- Fuel Manage → Claim approval setting: two roles.
--   Normal user : own claims; approves the claims of the people they are
--                 named as approver for ("Approved by" column).
--   Accountant  : sees every claim of the company and marks approved
--                 claims paid. Being an approver for some people does not
--                 narrow what an accountant sees or pays.
-- Nobody approves, rejects or pays their own claim (super admins may still
-- mark their own claim paid). Paid only from Approved.

-- May the signed-in user approve / reject claims of p_claimant?
create or replace function public.machinery_claim_approver(p_company uuid, p_claimant uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.is_machinery_super_admin() or exists (
    select 1 from public.machinery_user_perms up
     where up.company_id = p_company and up.user_id = auth.uid()
       and (up.perms -> 'claims') ? 'approve'
       and (jsonb_typeof(up.perms -> 'approve_for') is distinct from 'array'
            or jsonb_array_length(up.perms -> 'approve_for') = 0
            or (up.perms -> 'approve_for') ? p_claimant::text));
$$;
revoke all on function public.machinery_claim_approver(uuid, uuid) from public, anon;
grant execute on function public.machinery_claim_approver(uuid, uuid) to authenticated;

-- Reviewable (read + update policies) = approver of that person, or accountant.
create or replace function public.machinery_claim_reviewable(p_company uuid, p_claimant uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.machinery_claim_approver(p_company, p_claimant)
      or public.machinery_can(p_company, 'claims', 'pay');
$$;
revoke all on function public.machinery_claim_reviewable(uuid, uuid) from public, anon;
grant execute on function public.machinery_claim_reviewable(uuid, uuid) to authenticated;

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
    if new.status = 'paid' or old.status = 'paid' then
      -- Accountant: Approved → Paid (or undo Paid → Approved)
      if not public.machinery_can(old.company_id, 'claims', 'pay') then
        raise exception 'Only an accountant can mark fuel claims paid.' using errcode = '42501';
      end if;
      if new.status = 'paid' and old.status <> 'approved' then
        raise exception 'Only approved claims can be marked paid.' using errcode = '23514';
      end if;
      if old.status = 'paid' and new.status <> 'approved' then
        raise exception 'A paid claim can only go back to approved.' using errcode = '23514';
      end if;
      if old.claimant_id = auth.uid() and not public.is_machinery_super_admin() then
        raise exception 'You cannot mark your own claim paid.' using errcode = '42501';
      end if;
    else
      -- Approver: approve / reject / back to pending
      if not public.machinery_claim_approver(old.company_id, old.claimant_id) then
        raise exception 'You are not an approver for this person''s claims.' using errcode = '42501';
      end if;
      if old.claimant_id = auth.uid() then
        raise exception 'You cannot approve or reject your own claim.' using errcode = '42501';
      end if;
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

-- Who is accountant / approver for whom, per company
select c.name as company, coalesce(a.full_name, a.email) as person,
       (up.perms -> 'claims') ? 'pay' as accountant,
       jsonb_array_length(coalesce(up.perms -> 'approve_for', '[]'::jsonb)) as approves_people
  from public.machinery_user_perms up
  join public.machinery_companies c on c.id = up.company_id
  join public.machinery_portal_admins a on a.user_id = up.user_id
 where (up.perms -> 'claims') ?| array['pay', 'approve']
 order by 1, 2;
