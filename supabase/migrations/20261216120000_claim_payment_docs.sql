-- =====================================================================
-- >>> RUN THIS IN THE **MACHINERY PORTAL** DATABASE <<<
-- >>> Supabase project qcvbzzdbbqmnrljfnxjp (shared with MachTrek)   <<<
-- Needs all earlier migrations. Safe to run more than once.
-- =====================================================================
-- Payment documents of a fuel claim: when the accountant marks a claim paid
-- they attach the payment proof (bank slip, transfer screenshot, PDF). The
-- claimant sees it from My Claims (the document icon next to "Paid").
--
--   * Files: private bucket machinery_claim_payment_docs,
--     path <company id>/<claim id>/<random>.<ext>
--   * Rows: table machinery_claim_payment_docs (one per file)
--   * Who: add / remove = accountants of the company (claims: pay) on an
--     approved or paid claim; see = the claimant, the approvers of the
--     claimant and the accountants (same as who can review the claim).
-- =====================================================================

create table if not exists public.machinery_claim_payment_docs (
  id           uuid primary key default gen_random_uuid(),
  claim_id     uuid not null references public.machinery_diesel_claims (id) on delete cascade,
  company_id   uuid not null references public.machinery_companies (id) on delete cascade,
  path         text not null unique check (char_length(path) <= 300),
  file_name    text check (char_length(file_name) <= 200),
  uploaded_by  uuid default auth.uid(),
  created_at   timestamptz not null default now()
);
create index if not exists machinery_claim_payment_docs_claim_idx on public.machinery_claim_payment_docs (claim_id);

-- May this person see the payment documents of a claim?
create or replace function public.machinery_claim_payment_visible(p_claim uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.machinery_diesel_claims c
     where c.id = p_claim
       and (c.claimant_id = auth.uid() or coalesce(public.machinery_claim_reviewable(c.company_id, c.claimant_id), false))
  );
$$;

-- May this person attach payment documents to a claim? (accountant, approved / paid, not their own unless super admin)
create or replace function public.machinery_claim_payment_editable(p_claim uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.machinery_diesel_claims c
     where c.id = p_claim
       and c.status in ('approved', 'paid')
       and coalesce(public.machinery_can(c.company_id, 'claims', 'pay'), false)
       and (c.claimant_id <> auth.uid() or public.is_machinery_super_admin())
  );
$$;
revoke all on function public.machinery_claim_payment_visible(uuid) from public, anon;
revoke all on function public.machinery_claim_payment_editable(uuid) from public, anon;
grant execute on function public.machinery_claim_payment_visible(uuid) to authenticated;
grant execute on function public.machinery_claim_payment_editable(uuid) to authenticated;

alter table public.machinery_claim_payment_docs enable row level security;
revoke all on public.machinery_claim_payment_docs from anon;
grant select, insert, delete on public.machinery_claim_payment_docs to authenticated;

drop policy if exists "payment docs read" on public.machinery_claim_payment_docs;
create policy "payment docs read" on public.machinery_claim_payment_docs
  for select to authenticated using (public.machinery_claim_payment_visible(claim_id));

drop policy if exists "payment docs add" on public.machinery_claim_payment_docs;
create policy "payment docs add" on public.machinery_claim_payment_docs
  for insert to authenticated
  with check (
    public.machinery_claim_payment_editable(claim_id)
    and company_id = (select c.company_id from public.machinery_diesel_claims c where c.id = claim_id)
    and path like company_id::text || '/' || claim_id::text || '/%'
    and uploaded_by = auth.uid()
  );

drop policy if exists "payment docs remove" on public.machinery_claim_payment_docs;
create policy "payment docs remove" on public.machinery_claim_payment_docs
  for delete to authenticated using (public.machinery_claim_payment_editable(claim_id));

-- Storage bucket (private, 10 MB, pictures and PDF)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('machinery_claim_payment_docs', 'machinery_claim_payment_docs', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "machinery claim payment docs upload" on storage.objects;
create policy "machinery claim payment docs upload" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'machinery_claim_payment_docs'
    and public.machinery_claim_payment_editable(((storage.foldername(name))[2])::uuid)
  );
drop policy if exists "machinery claim payment docs read" on storage.objects;
create policy "machinery claim payment docs read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'machinery_claim_payment_docs'
    and public.machinery_claim_payment_visible(((storage.foldername(name))[2])::uuid)
  );
drop policy if exists "machinery claim payment docs delete" on storage.objects;
create policy "machinery claim payment docs delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'machinery_claim_payment_docs'
    and public.machinery_claim_payment_editable(((storage.foldername(name))[2])::uuid)
  );
