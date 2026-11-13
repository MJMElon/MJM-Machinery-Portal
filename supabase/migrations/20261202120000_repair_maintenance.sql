-- =====================================================================
-- >>> RUN THIS IN THE **MACHINERY PORTAL** DATABASE <<<
-- >>> Supabase project qcvbzzdbbqmnrljfnxjp (shared with MachTrek)   <<<
-- >>> NOT the MJM Intranet database (briqzyxfxsvulyizzbiu)            <<<
-- Safe to run more than once.
-- =====================================================================
-- Repair & Maintenance: besides WhatsApp, cases now also come from the
-- worker app (mobile view), in three types:
--   repair_request   "Need a mechanic"     machine has a problem
--   repair_done      "I fixed something"   corrective job already done
--   service_request  "Request a service"   preventive, when the machine is due
-- WhatsApp cases stay as they are (they are repair requests).

-- ---------------------------------------------------------------------
-- 1) A case made in the app belongs to its company directly: its wa_from
--    is 'app:<company id>'. Every existing access check goes through this
--    function, so they all work for app cases without change.
-- ---------------------------------------------------------------------
create or replace function public.machinery_company_of_number(p_wa_from text)
returns uuid
language sql stable security definer
set search_path = public
as $$
  select case
    when p_wa_from like 'app:%' then
      (select id from public.machinery_companies where id::text = substr(p_wa_from, 5))
    else
      (select id from public.machinery_companies
        where p_wa_from = any (whatsapp_numbers)
        order by name
        limit 1)
  end;
$$;

-- ---------------------------------------------------------------------
-- 2) What a case can carry
-- ---------------------------------------------------------------------
alter table public.machinery_cases
  add column if not exists case_type        text not null default 'repair_request',
  add column if not exists source           text not null default 'whatsapp',
  add column if not exists created_by       uuid references auth.users (id) on delete set null,
  add column if not exists category         text,            -- problem (repair request) or part (repair done)
  add column if not exists machine_stopped  boolean,         -- repair request: the machine cannot work
  add column if not exists stopped_from     date,            -- breakdown counted from this day
  add column if not exists fixed_on         date,            -- … until this day (empty = still open)
  add column if not exists smu              numeric(12, 1),  -- hour meter / km at the time
  add column if not exists action_done      text,            -- repair done: changed / repaired / adjusted
  add column if not exists parts            jsonb not null default '[]'::jsonb,        -- [{name, qty}]
  add column if not exists attachments      jsonb not null default '[]'::jsonb,        -- [{path, kind}]
  add column if not exists service_interval numeric(12, 1),  -- service request: the interval, as set then
  add column if not exists service_due      numeric(12, 1),  -- … and the reading the service is due at
  add column if not exists preferred_date   date,
  add column if not exists approved_at      timestamptz,     -- service request approved by the office
  add column if not exists approved_by      uuid references auth.users (id) on delete set null,
  add column if not exists cost             numeric(12, 2);  -- repair / service cost (RM)

alter table public.machinery_cases drop constraint if exists machinery_cases_type_check;
alter table public.machinery_cases
  add constraint machinery_cases_type_check check (case_type in ('repair_request', 'repair_done', 'service_request'));
alter table public.machinery_cases drop constraint if exists machinery_cases_source_check;
alter table public.machinery_cases
  add constraint machinery_cases_source_check check (source in ('whatsapp', 'app'));
create index if not exists machinery_cases_machine_idx on public.machinery_cases (machine_id, opened_at desc);
create index if not exists machinery_cases_created_by_idx on public.machinery_cases (created_by, opened_at desc);

-- ---------------------------------------------------------------------
-- 3) Service schedule of a machine (Machinery Profile): the interval in the
--    machine's own unit (hours or km) and the last service. The last service
--    moves on by itself when a service request is solved.
-- ---------------------------------------------------------------------
alter table public.machinery_machines
  add column if not exists service_interval  numeric(12, 1) check (service_interval is null or service_interval > 0),
  add column if not exists last_service_smu  numeric(12, 1) check (last_service_smu is null or last_service_smu >= 0),
  add column if not exists last_service_date date;

-- ---------------------------------------------------------------------
-- 4) A worker sends a case from the app. Needs "Send requests from the
--    mobile app" (work → add) for the company.
-- ---------------------------------------------------------------------
create or replace function public.machinery_submit_case(p_company uuid, p_type text, p_data jsonb)
returns public.machinery_cases
language plpgsql security definer
set search_path = public
as $$
declare
  c public.machinery_cases;
  m public.machinery_machines;
  me_name text;
  v_smu numeric := nullif(p_data ->> 'smu', '')::numeric;
  v_due numeric;
  v_window numeric;
  v_supplier uuid;
  v_stopped boolean := coalesce((p_data ->> 'machine_stopped')::boolean, false);
  v_from date := nullif(p_data ->> 'stopped_from', '')::date;
  v_fixed date := nullif(p_data ->> 'fixed_on', '')::date;
begin
  if not public.machinery_can(p_company, 'work', 'add') then
    raise exception 'You may not send requests for this company. Ask your admin for "Send requests from the mobile app".'
      using errcode = '42501';
  end if;
  if p_type not in ('repair_request', 'repair_done', 'service_request') then
    raise exception 'Unknown request type' using errcode = '22023';
  end if;
  select * into m from public.machinery_machines where id = (p_data ->> 'machine_id')::uuid and company_id = p_company;
  if m.id is null then
    raise exception 'Choose a machine of this company.' using errcode = '22023';
  end if;
  if v_smu is not null and v_smu < 0 then
    raise exception 'The meter reading cannot be negative.' using errcode = '22023';
  end if;
  select coalesce(nullif(trim(a.full_name), ''), a.email) into me_name
    from public.machinery_portal_admins a where a.user_id = auth.uid();

  if p_type = 'service_request' then
    if v_smu is null then
      raise exception 'Enter the meter reading.' using errcode = '22023';
    end if;
    -- Due reading and window: 50 hours or 500 km either side.
    if m.service_interval is not null and m.last_service_smu is not null then
      v_due := m.last_service_smu + m.service_interval;
      v_window := case when m.service_unit ilike '%hour%' then 50 else 500 end;
      if v_smu < v_due - v_window then
        raise exception 'Too early for the service: it can be requested from %.', (v_due - v_window)
          using errcode = '22023';
      end if;
    end if;
    -- The workshop that handles this machine, if one is set in the Supplier list.
    select s.id into v_supplier from public.machinery_suppliers s
     where s.company_id = p_company and m.id = any (s.machine_ids) order by s.name limit 1;
  end if;
  if p_type = 'repair_request' and v_stopped and v_from is null then
    v_from := (now() at time zone 'Asia/Kuala_Lumpur')::date;
  end if;
  if v_fixed is not null and v_from is not null and v_fixed < v_from then
    raise exception '"Fixed on" cannot be before "From".' using errcode = '22023';
  end if;

  insert into public.machinery_cases (
    wa_from, sender_name, machine_id, machine_name, problem, status, case_type, source, created_by,
    category, machine_stopped, stopped_from, fixed_on, smu, action_done, parts, attachments,
    service_interval, service_due, preferred_date, supplier_id)
  values (
    'app:' || p_company::text, me_name, m.id, m.name, nullif(trim(coalesce(p_data ->> 'problem', '')), ''), 'pending',
    p_type, 'app', auth.uid(),
    nullif(trim(coalesce(p_data ->> 'category', '')), ''),
    case when p_type = 'repair_request' then v_stopped when p_type = 'repair_done' then v_from is not null end,
    v_from, v_fixed, v_smu,
    nullif(trim(coalesce(p_data ->> 'action_done', '')), ''),
    coalesce(p_data -> 'parts', '[]'::jsonb), coalesce(p_data -> 'attachments', '[]'::jsonb),
    case when p_type = 'service_request' then m.service_interval end, v_due,
    nullif(p_data ->> 'preferred_date', '')::date, v_supplier)
  returning * into c;
  return c;
end $$;
revoke all on function public.machinery_submit_case(uuid, text, jsonb) from public, anon;
grant execute on function public.machinery_submit_case(uuid, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 5) Office: approve a service request; solve a case with its cost.
-- ---------------------------------------------------------------------
create or replace function public.machinery_approve_case(p_id uuid)
returns public.machinery_cases
language plpgsql security definer
set search_path = public
as $$
declare c public.machinery_cases;
begin
  if not (coalesce(public.machinery_case_can(p_id, 'send'), false) or coalesce(public.machinery_case_can(p_id, 'edit'), false)) then
    raise exception 'You do not have access to approve requests for this company.' using errcode = '42501';
  end if;
  update public.machinery_cases
     set approved_at = coalesce(approved_at, now()), approved_by = coalesce(approved_by, auth.uid())
   where id = p_id
  returning * into c;
  if c.id is null then
    raise exception 'case not found' using errcode = 'P0002';
  end if;
  return c;
end $$;
revoke all on function public.machinery_approve_case(uuid) from public, anon;
grant execute on function public.machinery_approve_case(uuid) to authenticated;

-- Solve with the cost (may be empty). A solved service request becomes the
-- machine's last service; a stopped machine counts as fixed today.
create or replace function public.machinery_solve_case(p_id uuid, p_cost numeric, p_remark text)
returns public.machinery_cases
language plpgsql security definer
set search_path = public
as $$
declare
  c public.machinery_cases;
  v_today date := (now() at time zone 'Asia/Kuala_Lumpur')::date;
begin
  if p_cost is not null and p_cost < 0 then
    raise exception 'The cost cannot be negative.' using errcode = '22023';
  end if;
  c := public.machinery_close_case(p_id, true, p_remark);   -- checks solve access, logs the milestone
  update public.machinery_cases
     set cost = coalesce(p_cost, cost),
         fixed_on = case when machine_stopped and fixed_on is null then v_today else fixed_on end
   where id = p_id
  returning * into c;
  if c.case_type = 'service_request' and c.machine_id is not null and c.smu is not null then
    update public.machinery_machines
       set last_service_smu = c.smu, last_service_date = v_today
     where id = c.machine_id and (last_service_smu is null or last_service_smu < c.smu);
  end if;
  return c;
end $$;
revoke all on function public.machinery_solve_case(uuid, numeric, text) from public, anon;
grant execute on function public.machinery_solve_case(uuid, numeric, text) to authenticated;

-- ---------------------------------------------------------------------
-- 6) Photos and videos sent from the app: private bucket,
--    files under <company id>/<uploader id>/
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('machinery_case_files', 'machinery_case_files', false, 52428800,
        array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime', 'video/webm', 'video/3gpp'])
on conflict (id) do nothing;

drop policy if exists "machinery case files upload" on storage.objects;
create policy "machinery case files upload" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'machinery_case_files'
    and (storage.foldername(name))[2] = auth.uid()::text
    and public.machinery_can(((storage.foldername(name))[1])::uuid, 'work', 'add')
  );

drop policy if exists "machinery case files read" on storage.objects;
create policy "machinery case files read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'machinery_case_files'
    and ((storage.foldername(name))[2] = auth.uid()::text
         or public.machinery_can(((storage.foldername(name))[1])::uuid, 'work', 'view'))
  );

drop policy if exists "machinery case files delete own" on storage.objects;
create policy "machinery case files delete own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'machinery_case_files' and (storage.foldername(name))[2] = auth.uid()::text);

select case_type, source, status, count(*) from public.machinery_cases group by 1, 2, 3 order by 1, 2, 3;
