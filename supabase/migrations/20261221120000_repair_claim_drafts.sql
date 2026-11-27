-- =====================================================================
-- >>> RUN THIS IN THE **MACHINERY PORTAL** DATABASE <<<
-- >>> Supabase project qcvbzzdbbqmnrljfnxjp (shared with MachTrek)   <<<
-- Safe to run more than once.
-- =====================================================================
-- Repair: claim Drafts. The parts of 20261208 (claim drafts) that later SQL
-- did not replace. Run this if approving a top-up request (or saving a claim
-- as draft) says: violates check constraint "machinery_diesel_claims_status_check".
-- It does NOT touch the claim lock, the card balance or the user setting
-- (newer versions of those come from 20261212 / 20261213).
-- =====================================================================

-- 1a) Status Draft
alter table public.machinery_diesel_claims drop constraint if exists machinery_diesel_claims_status_check;
alter table public.machinery_diesel_claims
  add constraint machinery_diesel_claims_status_check
  check (status in ('draft', 'pending', 'approved', 'rejected', 'paid'));

-- 1b) Who sees / changes a claim
drop policy if exists "diesel_claims_read" on public.machinery_diesel_claims;
create policy "diesel_claims_read" on public.machinery_diesel_claims
  for select to authenticated
  using ((claimant_id = auth.uid() and public.machinery_can(company_id, 'claims', 'view'))
         or public.is_machinery_super_admin()
         or (status <> 'draft'
             and (public.machinery_can(company_id, 'claims', 'view_all')
                  or public.machinery_can(company_id, 'report', 'view')
                  or public.machinery_claim_reviewable(company_id, claimant_id))));

drop policy if exists "diesel_claims_insert" on public.machinery_diesel_claims;
create policy "diesel_claims_insert" on public.machinery_diesel_claims
  for insert to authenticated
  with check (
    public.machinery_can(company_id, 'claims', 'add')
    and claimant_id = auth.uid()
    and status in ('pending', 'draft')
    and reviewed_by is null
    and (vehicle_id is null or exists (select 1 from public.machinery_machines v
                 where v.id = vehicle_id and v.company_id = machinery_diesel_claims.company_id and v.is_active))
  );

drop policy if exists "diesel_claims_update" on public.machinery_diesel_claims;
create policy "diesel_claims_update" on public.machinery_diesel_claims
  for update to authenticated
  using ((claimant_id = auth.uid() and status in ('pending', 'draft') and public.machinery_can(company_id, 'claims', 'edit'))
         or (status <> 'draft' and public.machinery_claim_reviewable(company_id, claimant_id)))
  with check ((claimant_id = auth.uid() and status in ('pending', 'draft') and public.machinery_can(company_id, 'claims', 'edit'))
         or (status <> 'draft' and public.machinery_claim_reviewable(company_id, claimant_id)));

drop policy if exists "diesel_claims_delete" on public.machinery_diesel_claims;
create policy "diesel_claims_delete" on public.machinery_diesel_claims
  for delete to authenticated
  using ((claimant_id = auth.uid() and status in ('pending', 'draft') and public.machinery_can(company_id, 'claims', 'delete'))
         or public.is_machinery_super_admin());

drop policy if exists "claim_lines_read" on public.machinery_diesel_claim_lines;
create policy "claim_lines_read" on public.machinery_diesel_claim_lines
  for select to authenticated
  using (exists (select 1 from public.machinery_diesel_claims c where c.id = claim_id
                   and ((c.claimant_id = auth.uid() and public.machinery_can(c.company_id, 'claims', 'view'))
                        or public.is_machinery_super_admin()
                        or (c.status <> 'draft'
                            and (public.machinery_can(c.company_id, 'claims', 'view_all')
                                 or public.machinery_can(c.company_id, 'report', 'view')
                                 or public.machinery_can(c.company_id, 'usage', 'view')
                                 or public.machinery_claim_reviewable(c.company_id, c.claimant_id))))));

drop policy if exists "claim_lines_write" on public.machinery_diesel_claim_lines;
create policy "claim_lines_write" on public.machinery_diesel_claim_lines
  for all to authenticated
  using (public.is_machinery_super_admin() or exists (select 1 from public.machinery_diesel_claims c where c.id = claim_id
                   and c.claimant_id = auth.uid() and c.status in ('pending', 'draft')
                   and (public.machinery_can(c.company_id, 'claims', 'add') or public.machinery_can(c.company_id, 'claims', 'edit'))))
  with check (public.is_machinery_super_admin() or exists (select 1 from public.machinery_diesel_claims c where c.id = claim_id
                   and c.claimant_id = auth.uid() and c.status in ('pending', 'draft')
                   and (public.machinery_can(c.company_id, 'claims', 'add') or public.machinery_can(c.company_id, 'claims', 'edit'))));


-- 1d) A draft's fleet card reload is not on the card until the claim is submitted
create or replace function public.machinery_mirror_claim_reload(p_line uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  l record;
begin
  select ln.*, c.status as claim_status, c.claim_no, c.claimant_id
    into l
    from public.machinery_diesel_claim_lines ln
    join public.machinery_diesel_claims c on c.id = ln.claim_id
   where ln.id = p_line;
  if not found or l.line_kind <> 'reload' or l.card_id is null or l.claim_status in ('rejected', 'draft') or l.amount <= 0 then
    delete from public.machinery_diesel_card_reloads where claim_line_id = p_line;
    return;
  end if;
  insert into public.machinery_diesel_card_reloads (company_id, card_id, reload_date, amount, reference, notes, created_by, claim_line_id)
  values (l.company_id, l.card_id, l.fill_date, l.amount,
          'Fuel claim ' || lpad(coalesce(l.claim_no, 0)::text, 3, '0') || coalesce(' · ' || l.receipt_no, ''),
          l.remark, l.claimant_id, p_line)
  on conflict (claim_line_id) do update
     set company_id = excluded.company_id, card_id = excluded.card_id, reload_date = excluded.reload_date,
         amount = excluded.amount, reference = excluded.reference, notes = excluded.notes;
end $$;


create or replace function public.machinery_card_claim_lines(p_company uuid, p_card uuid, p_from date, p_to date)
returns table (
  id uuid, claim_id uuid, claim_no integer, claim_status text, claimant_id uuid,
  fill_date date, payment text, litres numeric, amount numeric,
  vehicle_id uuid, receipt_no text, station text
)
language sql stable security definer
set search_path = public
as $$
  select l.id, l.claim_id, c.claim_no::int, c.status, c.claimant_id,
         l.fill_date, l.payment, l.litres, l.amount,
         l.vehicle_id, l.receipt_no, l.station
    from public.machinery_diesel_claim_lines l
    join public.machinery_diesel_claims c on c.id = l.claim_id
   where l.company_id = p_company
     and l.line_kind = 'fill'
     and c.status not in ('rejected', 'draft')
     and l.fill_date between p_from and p_to
     and (public.machinery_can(p_company, 'cards', 'view') or public.machinery_can(p_company, 'report', 'view'))
     and coalesce(case when l.payment = 'fleet_card' then l.card_id end,
                  public.machinery_card_for_line(p_company, l.vehicle_id, c.claimant_id)) = p_card
   order by l.fill_date desc;
$$;
revoke all on function public.machinery_card_claim_lines(uuid, uuid, date, date) from public, anon;
grant execute on function public.machinery_card_claim_lines(uuid, uuid, date, date) to authenticated;

