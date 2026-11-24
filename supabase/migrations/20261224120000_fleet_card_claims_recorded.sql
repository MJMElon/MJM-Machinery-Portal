-- =====================================================================
-- >>> RUN THIS IN THE **MACHINERY PORTAL** DATABASE <<<
-- >>> Supabase project qcvbzzdbbqmnrljfnxjp (shared with MachTrek)   <<<
-- Needs 20261213 and 20261221. Safe to run more than once.
-- =====================================================================
-- Fuel claims with nothing to pay back (only fleet card fill-ups) do not go
-- through approval: when submitted they become "Recorded" (new status)
-- straight away. They still count on the fleet card and in the reports.
-- A claim with cash receipts or fleet card reloads (payable) goes to
-- approval as before; the approver sees only the payable part.
-- =====================================================================

alter table public.machinery_diesel_claims drop constraint if exists machinery_diesel_claims_status_check;
alter table public.machinery_diesel_claims
  add constraint machinery_diesel_claims_status_check
  check (status in ('draft', 'pending', 'recorded', 'approved', 'rejected', 'paid'));

-- The claimant may save a claim that becomes Recorded (the guard still
-- refuses anyone setting Recorded by hand: only the step below does it).
drop policy if exists "diesel_claims_update" on public.machinery_diesel_claims;
create policy "diesel_claims_update" on public.machinery_diesel_claims
  for update to authenticated
  using ((claimant_id = auth.uid() and status in ('pending', 'draft') and public.machinery_can(company_id, 'claims', 'edit'))
         or (status <> 'draft' and public.machinery_claim_reviewable(company_id, claimant_id)))
  with check ((claimant_id = auth.uid() and status in ('pending', 'draft', 'recorded') and public.machinery_can(company_id, 'claims', 'edit'))
         or (status <> 'draft' and public.machinery_claim_reviewable(company_id, claimant_id)));

-- Runs after the claim guard (trigger names are taken in A–Z order):
-- a Pending claim with receipts and nothing payable becomes Recorded.
create or replace function public.machinery_claim_recorded()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'pending'
     and exists (select 1 from public.machinery_diesel_claim_lines l where l.claim_id = new.id)
     and not exists (select 1 from public.machinery_diesel_claim_lines l
                      where l.claim_id = new.id and (l.payment = 'cash' or l.line_kind = 'reload')) then
    new.status := 'recorded';
  end if;
  return new;
end $$;
drop trigger if exists machinery_diesel_claims_zrecorded on public.machinery_diesel_claims;
create trigger machinery_diesel_claims_zrecorded
  before insert or update on public.machinery_diesel_claims
  for each row execute function public.machinery_claim_recorded();

-- Claims already waiting for approval with nothing to pay back
update public.machinery_diesel_claims c set status = 'pending'
 where c.status = 'pending'
   and exists (select 1 from public.machinery_diesel_claim_lines l where l.claim_id = c.id)
   and not exists (select 1 from public.machinery_diesel_claim_lines l
                    where l.claim_id = c.id and (l.payment = 'cash' or l.line_kind = 'reload'));
select status, count(*) from public.machinery_diesel_claims group by status order by status;
