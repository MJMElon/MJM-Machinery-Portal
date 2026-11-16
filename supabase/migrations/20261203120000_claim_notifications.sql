-- =====================================================================
-- >>> RUN THIS IN THE **MACHINERY PORTAL** DATABASE <<<
-- >>> Supabase project qcvbzzdbbqmnrljfnxjp (shared with MachTrek)   <<<
-- >>> NOT the MJM Intranet database (briqzyxfxsvulyizzbiu)            <<<
-- Safe to run more than once.
-- =====================================================================
-- Emails about fuel claims (Edge Function claim-notify): one row per message
-- sent, so the same email never goes out twice. Only the function writes it.
create table if not exists public.machinery_claim_notifications (
  id          uuid primary key default gen_random_uuid(),
  claim_id    uuid not null references public.machinery_diesel_claims (id) on delete cascade,
  event       text not null check (event in ('submitted', 'approved', 'rejected', 'paid')),
  stamp       text not null,            -- created_at / reviewed_at of that change
  recipients  text[],
  errors      text[],
  sent_at     timestamptz not null default now(),
  unique (claim_id, event, stamp)
);
alter table public.machinery_claim_notifications enable row level security;
revoke all on public.machinery_claim_notifications from anon, authenticated;
drop policy if exists "claim_notifications_super_read" on public.machinery_claim_notifications;
create policy "claim_notifications_super_read" on public.machinery_claim_notifications
  for select to authenticated using (public.is_machinery_super_admin());
grant select on public.machinery_claim_notifications to authenticated;

select count(*) as emails_logged from public.machinery_claim_notifications;
