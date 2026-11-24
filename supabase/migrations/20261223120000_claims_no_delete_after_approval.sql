-- =====================================================================
-- >>> RUN THIS IN THE **MACHINERY PORTAL** DATABASE <<<
-- >>> Supabase project qcvbzzdbbqmnrljfnxjp (shared with MachTrek)   <<<
-- Safe to run more than once.
-- =====================================================================
-- A fuel claim that is approved (pending for reimbursement) or paid cannot be
-- deleted by anyone, super admins included. The claimant deletes their own
-- draft / pending claims as before; a super admin also rejected ones.
-- =====================================================================

drop policy if exists "diesel_claims_delete" on public.machinery_diesel_claims;
create policy "diesel_claims_delete" on public.machinery_diesel_claims
  for delete to authenticated
  using (status not in ('approved', 'paid')
         and ((claimant_id = auth.uid() and status in ('pending', 'draft') and public.machinery_can(company_id, 'claims', 'delete'))
              or public.is_machinery_super_admin()));
