-- =====================================================================
-- >>> RUN THIS IN THE **MACHINERY PORTAL** DATABASE <<<
-- >>> Supabase project qcvbzzdbbqmnrljfnxjp (shared with MachTrek)   <<<
-- >>> NOT the MJM Intranet database (briqzyxfxsvulyizzbiu)            <<<
-- Safe to run more than once.
-- =====================================================================
-- Fleet card top-up requests.
--
--   1. In Fleet Card Manage a user presses "Request top up", picks the fleet
--      card, the amount and the reason, and submits (status Pending).
--   2. An approver of that user (Fuel Manage → Approval setting, column
--      "Top-up requests approved by") approves or rejects it.
--   3. The approved request is printed and taken to the office for the
--      top-up; the user marks it Topped up and then claims the reload on a
--      fuel claim (as before).
--
-- Rights (perms of the company):
--   cards: view           may request a top-up (sees Fleet Card Manage)
--   topup: approve        approves top-up requests of the people in
--   topup_approve_for     [user ids] (no list = everyone)
-- Nobody approves their own request (super admins may).

-- 1) Requests
create table if not exists public.machinery_fleet_topup_requests (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.machinery_companies (id) on delete cascade,
  request_no    integer,
  card_id       uuid not null references public.machinery_diesel_cards (id) on delete restrict,
  amount        numeric(12, 2) not null check (amount > 0),
  needed_by     date,
  reason        text check (reason is null or char_length(reason) <= 500),
  status        text not null default 'pending'
                check (status in ('pending', 'approved', 'rejected', 'cancelled', 'topped_up')),
  requested_by  uuid not null default auth.uid() references auth.users (id),
  requested_at  timestamptz not null default now(),
  decided_by    uuid references auth.users (id),
  decided_at    timestamptz,
  decision_note text check (decision_note is null or char_length(decision_note) <= 500),
  topped_up_on  date,
  topped_up_by  uuid references auth.users (id),
  unique (company_id, request_no)
);
create index if not exists machinery_fleet_topup_requests_company_idx
  on public.machinery_fleet_topup_requests (company_id, requested_at desc);

-- Request no. per company: 1, 2, 3 …
create or replace function public.machinery_topup_request_no()
returns trigger language plpgsql
set search_path = public
as $$
begin
  if new.request_no is null then
    perform pg_advisory_xact_lock(hashtext('topup_no_' || new.company_id::text));
    select coalesce(max(request_no), 0) + 1 into new.request_no
      from public.machinery_fleet_topup_requests where company_id = new.company_id;
  end if;
  return new;
end $$;
drop trigger if exists machinery_fleet_topup_request_no on public.machinery_fleet_topup_requests;
create trigger machinery_fleet_topup_request_no
  before insert on public.machinery_fleet_topup_requests
  for each row execute function public.machinery_topup_request_no();

-- 2) Who approves whose top-up requests
create or replace function public.machinery_topup_approver(p_company uuid, p_requester uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.is_machinery_super_admin() or exists (
    select 1 from public.machinery_user_perms up
     where up.company_id = p_company and up.user_id = auth.uid()
       and (up.perms -> 'topup') ? 'approve'
       and (jsonb_typeof(up.perms -> 'topup_approve_for') is distinct from 'array'
            or jsonb_array_length(up.perms -> 'topup_approve_for') = 0
            or (up.perms -> 'topup_approve_for') ? p_requester::text));
$$;
revoke all on function public.machinery_topup_approver(uuid, uuid) from public, anon;
grant execute on function public.machinery_topup_approver(uuid, uuid) to authenticated;

-- 3) Access: read own / as approver / card managers; add own as Pending;
--    status changes only through the functions below.
alter table public.machinery_fleet_topup_requests enable row level security;
revoke all on public.machinery_fleet_topup_requests from anon, authenticated;
grant select, insert on public.machinery_fleet_topup_requests to authenticated;

drop policy if exists "topup_read" on public.machinery_fleet_topup_requests;
create policy "topup_read" on public.machinery_fleet_topup_requests for select to authenticated
  using (requested_by = auth.uid()
         or public.machinery_topup_approver(company_id, requested_by)
         or public.machinery_can(company_id, 'cards', 'edit'));

drop policy if exists "topup_add" on public.machinery_fleet_topup_requests;
create policy "topup_add" on public.machinery_fleet_topup_requests for insert to authenticated
  with check (requested_by = auth.uid() and status = 'pending'
              and decided_by is null and topped_up_on is null
              and public.machinery_can(company_id, 'cards', 'view')
              and exists (select 1 from public.machinery_diesel_cards c
                           where c.id = card_id and c.company_id = machinery_fleet_topup_requests.company_id));

-- Approve / reject (approver of the requester, not their own request)
create or replace function public.machinery_topup_decide(p_id uuid, p_approve boolean, p_note text default null)
returns void
language plpgsql security definer
set search_path = public
as $$
declare r record;
begin
  select * into r from public.machinery_fleet_topup_requests where id = p_id for update;
  if not found then raise exception 'Request not found' using errcode = 'P0002'; end if;
  if r.status <> 'pending' then raise exception 'This request is already %.', r.status using errcode = '23514'; end if;
  if not public.machinery_topup_approver(r.company_id, r.requested_by) then
    raise exception 'You are not an approver of this person''s top-up requests.' using errcode = '42501';
  end if;
  if r.requested_by = auth.uid() and not public.is_machinery_super_admin() then
    raise exception 'You cannot approve your own request.' using errcode = '42501';
  end if;
  update public.machinery_fleet_topup_requests
     set status = case when p_approve then 'approved' else 'rejected' end,
         decided_by = auth.uid(), decided_at = now(),
         decision_note = nullif(btrim(coalesce(p_note, '')), '')
   where id = p_id;
end $$;
revoke all on function public.machinery_topup_decide(uuid, boolean, text) from public, anon;
grant execute on function public.machinery_topup_decide(uuid, boolean, text) to authenticated;

-- Cancel a pending request (the requester)
create or replace function public.machinery_topup_cancel(p_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare r record;
begin
  select * into r from public.machinery_fleet_topup_requests where id = p_id for update;
  if not found then raise exception 'Request not found' using errcode = 'P0002'; end if;
  if r.requested_by <> auth.uid() and not public.is_machinery_super_admin() then
    raise exception 'Only the person who asked can cancel this request.' using errcode = '42501';
  end if;
  if r.status <> 'pending' then raise exception 'Only a pending request can be cancelled.' using errcode = '23514'; end if;
  update public.machinery_fleet_topup_requests set status = 'cancelled' where id = p_id;
end $$;
revoke all on function public.machinery_topup_cancel(uuid) from public, anon;
grant execute on function public.machinery_topup_cancel(uuid) to authenticated;

-- Mark an approved request topped up (the requester, the approver or a card manager)
create or replace function public.machinery_topup_done(p_id uuid, p_date date default null)
returns void
language plpgsql security definer
set search_path = public
as $$
declare r record;
begin
  select * into r from public.machinery_fleet_topup_requests where id = p_id for update;
  if not found then raise exception 'Request not found' using errcode = 'P0002'; end if;
  if not (r.requested_by = auth.uid() or public.machinery_topup_approver(r.company_id, r.requested_by)
          or public.machinery_can(r.company_id, 'cards', 'edit')) then
    raise exception 'Not allowed.' using errcode = '42501';
  end if;
  if r.status <> 'approved' then raise exception 'Only an approved request can be marked topped up.' using errcode = '23514'; end if;
  update public.machinery_fleet_topup_requests
     set status = 'topped_up', topped_up_on = coalesce(p_date, current_date), topped_up_by = auth.uid()
   where id = p_id;
end $$;
revoke all on function public.machinery_topup_done(uuid, date) from public, anon;
grant execute on function public.machinery_topup_done(uuid, date) to authenticated;

-- 4) Fuel Manage module admins also set the top-up rights (Approval setting)
create or replace function public.machinery_module_sections(p_module text)
returns text[]
language sql immutable
as $$
  select case p_module
    when 'machinery' then array['work', 'machines', 'suppliers']
    when 'fuel'      then array['claims', 'usage', 'cards', 'report', 'fuel_record', 'approve_for', 'topup', 'topup_approve_for']
    else array[]::text[] end;
$$;

create or replace function public.machinery_save_module_perms(p_company uuid, p_user uuid, p_module text, p_perms jsonb)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  cur jsonb;
  k text;
  admins jsonb;
  secs text[] := public.machinery_module_sections(p_module);
begin
  if array_length(secs, 1) is null then
    raise exception 'Unknown module %', p_module using errcode = '22023';
  end if;
  if not public.machinery_module_admin(p_company, p_module) then
    raise exception 'Only an admin of this module can change its user access.' using errcode = '42501';
  end if;
  select perms into cur from public.machinery_user_perms where company_id = p_company and user_id = p_user;
  cur := coalesce(cur, '{}'::jsonb);
  foreach k in array secs loop
    cur := cur - k;
    if jsonb_typeof(p_perms -> k) = 'array' and (jsonb_array_length(p_perms -> k) > 0 or k = 'approve_for') then
      cur := cur || jsonb_build_object(k, p_perms -> k);
    end if;
  end loop;
  if p_module = 'fuel' and not coalesce((cur -> 'claims') ? 'approve', false) then
    cur := cur - 'approve_for';
  end if;
  if p_module = 'fuel' and not coalesce((cur -> 'topup') ? 'approve', false) then
    cur := cur - 'topup_approve_for';
  end if;
  -- the admin flag of this module
  admins := coalesce((select jsonb_agg(x) from jsonb_array_elements_text(coalesce(cur -> 'admin', '[]'::jsonb)) x where x <> p_module), '[]'::jsonb);
  if coalesce((p_perms -> 'admin') ? p_module, false) then
    admins := admins || to_jsonb(p_module);
  end if;
  cur := cur - 'admin';
  if jsonb_array_length(admins) > 0 then
    cur := cur || jsonb_build_object('admin', admins);
  end if;
  insert into public.machinery_user_perms (company_id, user_id, perms)
  values (p_company, p_user, cur)
  on conflict (company_id, user_id) do update set perms = excluded.perms;
  return cur;
end $$;
revoke all on function public.machinery_save_module_perms(uuid, uuid, text, jsonb) from public, anon;
grant execute on function public.machinery_save_module_perms(uuid, uuid, text, jsonb) to authenticated;

-- Check
select 'done' as result, count(*) as top_up_requests from public.machinery_fleet_topup_requests;
