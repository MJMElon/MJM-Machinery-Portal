-- =====================================================================
-- >>> RUN THIS IN THE **MACHINERY PORTAL** DATABASE <<<
-- >>> Supabase project qcvbzzdbbqmnrljfnxjp (shared with MachTrek)   <<<
-- Needs all earlier migrations. Safe to run more than once.
-- =====================================================================
-- Fleet card top-up requests are sent by the Procurement role only (Fuel
-- Manage → User setting → role Procurement) and super admins. Approving them
-- stays with the approvers set for the requester.
-- =====================================================================

drop policy if exists "topup_add" on public.machinery_fleet_topup_requests;
create policy "topup_add" on public.machinery_fleet_topup_requests for insert to authenticated
  with check (requested_by = auth.uid() and status = 'pending'
              and decided_by is null and topped_up_on is null
              and coalesce(public.machinery_is_procurement(company_id), false)
              and exists (select 1 from public.machinery_diesel_cards c
                           where c.id = card_id and c.company_id = machinery_fleet_topup_requests.company_id));
