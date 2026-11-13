-- =====================================================================
-- >>> RUN THIS IN THE **MACHINERY PORTAL** DATABASE <<<
-- >>> Supabase project qcvbzzdbbqmnrljfnxjp (shared with MachTrek)   <<<
-- >>> NOT the MJM Intranet database (briqzyxfxsvulyizzbiu)            <<<
-- Run 20261129120000_fuel_usage_records.sql first. Safe to run more than once.
-- =====================================================================
-- Fuel Usage Record, mobile view: a site worker photographs the pump meter
-- and submits the diesel taken from a phone. Each record can carry that
-- photo, and a worker with only "Add records" sees their own entries.

-- 1) Photo of the meter on a record
alter table public.machinery_fuel_records
  add column if not exists photo_path text check (char_length(photo_path) <= 300);

-- 2) A worker reads the records they entered themselves (others need View)
drop policy if exists "fuel_records_read" on public.machinery_fuel_records;
create policy "fuel_records_read" on public.machinery_fuel_records for select to authenticated
  using (public.machinery_can(company_id, 'fuel_record', 'view')
         or (created_by = auth.uid() and public.machinery_can(company_id, 'fuel_record', 'add')));

-- 3) Meter photos: private bucket, files under <company id>/<uploader id>/
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('machinery_fuel_record_photos', 'machinery_fuel_record_photos', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "machinery fuel record photos upload" on storage.objects;
create policy "machinery fuel record photos upload" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'machinery_fuel_record_photos'
    and (storage.foldername(name))[2] = auth.uid()::text
    and (public.machinery_can(((storage.foldername(name))[1])::uuid, 'fuel_record', 'add')
         or public.machinery_can(((storage.foldername(name))[1])::uuid, 'fuel_record', 'edit'))
  );

drop policy if exists "machinery fuel record photos read" on storage.objects;
create policy "machinery fuel record photos read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'machinery_fuel_record_photos'
    and ((storage.foldername(name))[2] = auth.uid()::text
         or public.machinery_can(((storage.foldername(name))[1])::uuid, 'fuel_record', 'view'))
  );

drop policy if exists "machinery fuel record photos delete" on storage.objects;
create policy "machinery fuel record photos delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'machinery_fuel_record_photos'
    and ((storage.foldername(name))[2] = auth.uid()::text
         or public.machinery_can(((storage.foldername(name))[1])::uuid, 'fuel_record', 'delete'))
  );

select count(*) as fuel_records, count(photo_path) as with_photo from public.machinery_fuel_records;
