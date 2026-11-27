-- =====================================================================
-- Fuel claim receipt files (bucket machinery_diesel_receipts). Safe to run more than once.
--  1) Whoever can see a claim can open its receipt files — also an approver who
--     has no report / "view all claims" right (they could approve but not see the receipt).
--  2) A claimant can no longer delete the receipt file of a claim that is
--     approved, paid or recorded (it is the evidence of the claim).
-- =====================================================================

create index if not exists machinery_diesel_claim_lines_receipt_path_idx
  on public.machinery_diesel_claim_lines (receipt_path) where receipt_path is not null;
create index if not exists machinery_diesel_claims_receipt_path_idx
  on public.machinery_diesel_claims (receipt_path) where receipt_path is not null;

-- Is this receipt file part of a finished claim?
create or replace function public.machinery_receipt_locked(p_path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.machinery_diesel_claim_lines l
      join public.machinery_diesel_claims c on c.id = l.claim_id
     where l.receipt_path = p_path and c.status in ('approved', 'paid', 'recorded'))
  or exists (
    select 1 from public.machinery_diesel_claims c
     where c.receipt_path = p_path and c.status in ('approved', 'paid', 'recorded'));
$$;
revoke all on function public.machinery_receipt_locked(text) from public, anon;
grant execute on function public.machinery_receipt_locked(text) to authenticated;

drop policy if exists "machinery diesel receipts read" on storage.objects;
create policy "machinery diesel receipts read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'machinery_diesel_receipts'
    and (
      (storage.foldername(name))[2] = (select auth.uid())::text
      or public.machinery_diesel_can(((storage.foldername(name))[1])::uuid, 'report')
      -- the claim rules decide: these selects only see the claims this person may read
      or exists (select 1 from public.machinery_diesel_claim_lines l where l.receipt_path = objects.name)
      or exists (select 1 from public.machinery_diesel_claims c where c.receipt_path = objects.name)
    )
  );

drop policy if exists "machinery diesel receipts delete own" on storage.objects;
create policy "machinery diesel receipts delete own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'machinery_diesel_receipts'
    and (storage.foldername(name))[2] = (select auth.uid())::text
    and not public.machinery_receipt_locked(name)
  );

notify pgrst, 'reload schema';
