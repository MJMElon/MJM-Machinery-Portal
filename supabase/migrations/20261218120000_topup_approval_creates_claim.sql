-- =====================================================================
-- >>> RUN THIS IN THE **MACHINERY PORTAL** DATABASE <<<
-- >>> Supabase project qcvbzzdbbqmnrljfnxjp (shared with MachTrek)   <<<
-- Needs all earlier migrations. Safe to run more than once.
-- =====================================================================
-- Fleet card top-up request → approved → a top-up claim for the requester.
--
--   * Approving a top-up request (Claims Approval → Pending approval) now
--     also puts a DRAFT fuel claim in the requester's My Claims with one
--     "Fleet card reload" row: that card, the approved amount. The requester
--     adds the receipt and submits it like any claim (the same as a top-up
--     claim made without a request).
--   * Such a draft is not deleted after 30 days.
--   * When that claim is marked Paid, the request becomes Topped up.
-- =====================================================================

alter table public.machinery_diesel_claims
  add column if not exists topup_request_id uuid unique
    references public.machinery_fleet_topup_requests (id) on delete set null;

-- Approve / reject (approver of the requester, not their own request)
create or replace function public.machinery_topup_decide(p_id uuid, p_approve boolean, p_note text default null)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  r record;
  v_claim uuid;
  v_sub text := current_setting('request.jwt.claim.sub', true);
  v_claims text := current_setting('request.jwt.claims', true);
  v_today date := (now() at time zone 'Asia/Kuala_Lumpur')::date;
begin
  select * into r from public.machinery_fleet_topup_requests where id = p_id for update;
  if not found then raise exception 'Request not found' using errcode = 'P0002'; end if;
  if r.status <> 'pending' then raise exception 'This request is already %.', r.status using errcode = '23514'; end if;
  if not public.machinery_topup_approver(r.company_id, r.requested_by) then
    raise exception 'You are not an approver of this person''s top-up requests.' using errcode = '42501';
  end if;
  if r.requested_by = auth.uid() and not public.is_machinery_super_admin() then
    raise exception 'You cannot approve your own request.' using errcode = '42501';
  end if;
  update public.machinery_fleet_topup_requests
     set status = case when p_approve then 'approved' else 'rejected' end,
         decided_by = auth.uid(), decided_at = now(),
         decision_note = nullif(btrim(coalesce(p_note, '')), '')
   where id = p_id;

  if p_approve and not exists (select 1 from public.machinery_diesel_claims where topup_request_id = p_id) then
    -- The draft claim is made by the system for the requester (not as the
    -- approver, who may not write other people's claims).
    perform set_config('request.jwt.claim.sub', '', true);
    perform set_config('request.jwt.claims', '', true);
    insert into public.machinery_diesel_claims
      (company_id, claimant_id, submitted_on, fill_date, status, notes, amount, topup_request_id)
    values
      (r.company_id, r.requested_by, v_today, v_today, 'draft',
       'Fleet card top-up request TU-' || lpad(coalesce(r.request_no, 0)::text, 4, '0'), 0, p_id)
    returning id into v_claim;
    insert into public.machinery_diesel_claim_lines
      (claim_id, company_id, line_no, fill_date, line_kind, card_id, amount, payment, subsidised, remark)
    values
      (v_claim, r.company_id, 1, v_today, 'reload', r.card_id, r.amount, 'cash', false,
       'Top-up request TU-' || lpad(coalesce(r.request_no, 0)::text, 4, '0') || coalesce(': ' || nullif(btrim(r.reason), ''), ''));
    perform set_config('request.jwt.claim.sub', coalesce(v_sub, ''), true);
    perform set_config('request.jwt.claims', coalesce(v_claims, ''), true);
  end if;
end $$;
revoke all on function public.machinery_topup_decide(uuid, boolean, text) from public, anon;
grant execute on function public.machinery_topup_decide(uuid, boolean, text) to authenticated;

-- The top-up claim paid → the request is Topped up.
create or replace function public.machinery_topup_claim_paid()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.topup_request_id is not null and new.status = 'paid' and old.status is distinct from 'paid' then
    update public.machinery_fleet_topup_requests
       set status = 'topped_up',
           topped_up_on = (now() at time zone 'Asia/Kuala_Lumpur')::date,
           topped_up_by = auth.uid()
     where id = new.topup_request_id and status = 'approved';
  end if;
  return new;
end $$;
drop trigger if exists machinery_topup_claim_paid on public.machinery_diesel_claims;
create trigger machinery_topup_claim_paid
  after update of status on public.machinery_diesel_claims
  for each row execute function public.machinery_topup_claim_paid();

-- Drafts made from an approved top-up request are kept (no 30-day delete).
create or replace function public.machinery_purge_expired_drafts()
returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  n integer;
begin
  delete from public.machinery_diesel_claims
   where status = 'draft'
     and topup_request_id is null
     and coalesce(updated_at, created_at) < now() - interval '30 days';
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.machinery_purge_expired_drafts() from public, anon, authenticated;
