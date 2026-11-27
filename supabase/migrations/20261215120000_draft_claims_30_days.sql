-- =====================================================================
-- >>> RUN THIS IN THE **MACHINERY PORTAL** DATABASE <<<
-- >>> Supabase project qcvbzzdbbqmnrljfnxjp (shared with MachTrek)   <<<
-- Needs all earlier migrations. Safe to run more than once.
-- =====================================================================
-- Fuel claim drafts are kept 30 days from their last save, then deleted for
-- good (with their receipt rows). My Claims shows the days left.
--
--   * The app deletes an expired draft (and its receipt photos) when the
--     claimant opens My Claims.
--   * This job deletes any expired draft every night as well (Supabase
--     pg_cron). A photo of a draft deleted here stays in the storage bucket
--     but is no longer linked to anything.
-- =====================================================================

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
     and coalesce(updated_at, created_at) < now() - interval '30 days';
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.machinery_purge_expired_drafts() from public, anon, authenticated;

-- Every night at 03:17 Malaysia time (19:17 UTC).
do $$
begin
  create extension if not exists pg_cron;
exception when others then
  raise notice 'pg_cron is not available: expired drafts are deleted by the app only.';
end $$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'machinery-purge-expired-drafts';
    perform cron.schedule('machinery-purge-expired-drafts', '17 19 * * *', 'select public.machinery_purge_expired_drafts()');
  end if;
end $$;

-- Clear the drafts that are already past 30 days.
select public.machinery_purge_expired_drafts() as expired_drafts_deleted;
