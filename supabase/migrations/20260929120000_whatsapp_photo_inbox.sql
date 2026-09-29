-- =====================================================================
-- MJM Machinery Portal · WhatsApp Photo Inbox (module 1)
-- Target: the SAME Supabase project as MachTrek.
-- Adds NEW objects only (machinery_ prefix). Does not touch any
-- workrecords_* table, the workrecords_photos bucket, or their policies.
-- Safe to run more than once.
--
-- How to run: Supabase dashboard → SQL Editor → paste this whole file → Run.
-- Before running: edit the e-mail in section 5 to your HQ admin login.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Who may use the portal. A Supabase Auth login alone is NOT enough;
--    the user must be listed here (the project is shared with other apps).
-- ---------------------------------------------------------------------
create table if not exists public.machinery_portal_admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  email      text,
  created_at timestamptz not null default now()
);

alter table public.machinery_portal_admins enable row level security;
revoke all on public.machinery_portal_admins from anon, authenticated;
grant select on public.machinery_portal_admins to authenticated;

drop policy if exists "portal_admins_read_self" on public.machinery_portal_admins;
create policy "portal_admins_read_self" on public.machinery_portal_admins
  for select to authenticated
  using (user_id = auth.uid());

create or replace function public.is_machinery_portal_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.machinery_portal_admins where user_id = auth.uid());
$$;
revoke all on function public.is_machinery_portal_admin() from public, anon;
grant execute on function public.is_machinery_portal_admin() to authenticated;

-- ---------------------------------------------------------------------
-- 2) Incoming WhatsApp messages (photos + logged non-photo messages).
--    Written ONLY by the whatsapp-webhook Edge Function (service role).
-- ---------------------------------------------------------------------
create table if not exists public.machinery_whatsapp_messages (
  id               uuid primary key default gen_random_uuid(),
  wa_message_id    text not null unique,          -- Meta "wamid…"; dedupes webhook retries
  wa_from          text not null,                 -- sender number, digits incl. country code
  sender_name      text,                          -- WhatsApp profile name
  phone_number_id  text,                          -- our business number that received it
  message_type     text not null,                 -- image | text | video | …
  received_at      timestamptz not null,          -- WhatsApp's timestamp
  caption          text,
  media_id         text,
  mime_type        text,
  file_size        bigint,
  storage_path     text,                          -- object path in machinery_whatsapp_photos
  status           text not null default 'received'
                   check (status in ('received', 'processing', 'saved', 'failed', 'ignored')),
  error_details    text,
  attempts         integer not null default 0,
  ack_status       text check (ack_status in ('pending', 'sent', 'failed', 'skipped')),
  ack_message_id   text,
  ack_error        text,
  ack_sent_at      timestamptz,
  reviewed_at      timestamptz,
  reviewed_by      uuid references auth.users (id) on delete set null,
  reviewed_by_email text,
  -- Future links (no foreign keys yet, so MachTrek tables stay untouched).
  -- Match workrecords_companies.id / workrecords_machines.id (uuid) later.
  company_id       uuid,
  machine_id       uuid,
  job_id           uuid,
  raw              jsonb,                         -- original message object from Meta
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists machinery_wa_msg_received_idx on public.machinery_whatsapp_messages (received_at desc);
create index if not exists machinery_wa_msg_status_idx   on public.machinery_whatsapp_messages (status);
create index if not exists machinery_wa_msg_machine_idx  on public.machinery_whatsapp_messages (machine_id);

create or replace function public.machinery_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists machinery_wa_msg_touch on public.machinery_whatsapp_messages;
create trigger machinery_wa_msg_touch
  before update on public.machinery_whatsapp_messages
  for each row execute function public.machinery_touch_updated_at();

-- Browser access: read-only, portal admins only. No anon access at all.
-- (The Edge Function uses the service role, which bypasses RLS.)
alter table public.machinery_whatsapp_messages enable row level security;
revoke all on public.machinery_whatsapp_messages from anon, authenticated;
grant select on public.machinery_whatsapp_messages to authenticated;

drop policy if exists "wa_msg_admin_read" on public.machinery_whatsapp_messages;
create policy "wa_msg_admin_read" on public.machinery_whatsapp_messages
  for select to authenticated
  using (public.is_machinery_portal_admin());

-- Mark / unmark Reviewed. The only write the browser can do; reviewer is
-- always the real signed-in user (cannot be spoofed from the client).
create or replace function public.machinery_set_whatsapp_reviewed(p_id uuid, p_reviewed boolean)
returns public.machinery_whatsapp_messages
language plpgsql security definer
set search_path = public
as $$
declare
  r public.machinery_whatsapp_messages;
begin
  if not public.is_machinery_portal_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.machinery_whatsapp_messages
     set reviewed_at       = case when p_reviewed then now() else null end,
         reviewed_by       = case when p_reviewed then auth.uid() else null end,
         reviewed_by_email = case when p_reviewed then (select email from auth.users where id = auth.uid()) else null end
   where id = p_id
  returning * into r;
  if r.id is null then
    raise exception 'record not found' using errcode = 'P0002';
  end if;
  return r;
end $$;
revoke all on function public.machinery_set_whatsapp_reviewed(uuid, boolean) from public, anon;
grant execute on function public.machinery_set_whatsapp_reviewed(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- 3) PRIVATE Storage bucket for the photos (max 16 MB, images only).
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('machinery_whatsapp_photos', 'machinery_whatsapp_photos', false, 16777216,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Portal admins may READ (needed to create short-lived signed URLs).
-- No insert/update/delete policies: only the Edge Function (service role) writes.
drop policy if exists "machinery_wa_photos_admin_read" on storage.objects;
create policy "machinery_wa_photos_admin_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'machinery_whatsapp_photos' and public.is_machinery_portal_admin());

-- ---------------------------------------------------------------------
-- 4) Nothing else. MachTrek objects are intentionally untouched.
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- 5) Grant portal access to your HQ admin login (edit the e-mail).
--    Run again later with another e-mail to add more admins.
-- ---------------------------------------------------------------------
insert into public.machinery_portal_admins (user_id, email)
select id, email from auth.users
where lower(email) = lower('CHANGE-ME@example.com')      -- ← your HQ admin e-mail
on conflict (user_id) do nothing;

-- Shows who has access now (should list at least one row).
select user_id, email, created_at from public.machinery_portal_admins;
