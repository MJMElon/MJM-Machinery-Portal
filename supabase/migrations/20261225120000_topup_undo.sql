-- =====================================================================
-- >>> RUN THIS IN THE **MACHINERY PORTAL** DATABASE <<<
-- >>> Supabase project qcvbzzdbbqmnrljfnxjp (shared with MachTrek)   <<<
-- Needs 20261218. Safe to run more than once.
-- =====================================================================
-- Undo (the button on the notice after approving / rejecting): a top-up
-- request goes back to Pending. An approved one also loses the draft top-up
-- claim it made, as long as the requester has not submitted it yet.
-- Only the person who decided (or a super admin) can undo.
-- =====================================================================

create or replace function public.machinery_topup_undo(p_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  r record;
  c record;
begin
  select * into r from public.machinery_fleet_topup_requests where id = p_id for update;
  if not found then raise exception 'Request not found' using errcode = 'P0002'; end if;
  if r.status not in ('approved', 'rejected') then
    raise exception 'This request is %, so it cannot be undone.', r.status using errcode = '23514';
  end if;
  if r.decided_by is distinct from auth.uid() and not public.is_machinery_super_admin() then
    raise exception 'Only the person who decided can undo it.' using errcode = '42501';
  end if;
  if r.status = 'approved' then
    select * into c from public.machinery_diesel_claims where topup_request_id = p_id;
    if found then
      if c.status <> 'draft' then
        raise exception 'The top-up claim is already submitted, so the approval cannot be undone.' using errcode = '23514';
      end if;
      delete from public.machinery_diesel_claim_lines where claim_id = c.id;
      delete from public.machinery_diesel_claims where id = c.id;
    end if;
  end if;
  update public.machinery_fleet_topup_requests
     set status = 'pending', decided_by = null, decided_at = null, decision_note = null
   where id = p_id;
end $$;
revoke all on function public.machinery_topup_undo(uuid) from public, anon;
grant execute on function public.machinery_topup_undo(uuid) to authenticated;
