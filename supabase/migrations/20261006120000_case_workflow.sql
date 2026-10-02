-- =====================================================================
-- MJM Portal · Case workflow: action log (messages to suppliers, notes,
-- milestones), closing remark, pinned cases.
-- Target: the SAME Supabase project as MachTrek. Safe to run more than once.
--
-- How to run: Supabase dashboard → SQL Editor → paste this whole file → Run.
-- Run 20261005120000_cmms_setup.sql first.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Pinned cases (max 3 pending pins per company, shared by its users).
-- ---------------------------------------------------------------------
alter table public.machinery_cases
  add column if not exists pinned_at timestamptz;

-- Access check by case (company comes from the number that opened it).
create or replace function public.machinery_case_can(p_case uuid, p_action text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.machinery_cmms_can(public.machinery_company_of_number(c.wa_from), p_action)
    from public.machinery_cases c where c.id = p_case;
$$;
revoke all on function public.machinery_case_can(uuid, text) from public, anon;
grant execute on function public.machinery_case_can(uuid, text) to authenticated;

create or replace function public.machinery_set_case_pinned(p_id uuid, p_pinned boolean)
returns public.machinery_cases
language plpgsql security definer
set search_path = public
as $$
declare
  c public.machinery_cases;
  co uuid;
  n int;
begin
  select * into c from public.machinery_cases where id = p_id;
  if c.id is null then
    raise exception 'case not found' using errcode = 'P0002';
  end if;
  co := public.machinery_company_of_number(c.wa_from);
  if not public.machinery_cmms_can(co, 'edit') then
    raise exception 'You do not have edit access for this company.' using errcode = '42501';
  end if;
  if p_pinned and c.pinned_at is null then
    select count(*) into n from public.machinery_cases x
     where x.pinned_at is not null and x.status = 'pending'
       and public.machinery_company_of_number(x.wa_from) is not distinct from co;
    if n >= 3 then
      raise exception 'Only 3 cases can be pinned. Unpin one first (hold its case number for 3 seconds).'
        using errcode = '22023';
    end if;
  end if;
  update public.machinery_cases
     set pinned_at = case when p_pinned then coalesce(pinned_at, now()) else null end
   where id = p_id
  returning * into c;
  return c;
end $$;
revoke all on function public.machinery_set_case_pinned(uuid, boolean) from public, anon;
grant execute on function public.machinery_set_case_pinned(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- 2) Case action log: messages sent to suppliers, internal notes and
--    milestones (closed / reopened). Shown as the case's timeline.
-- ---------------------------------------------------------------------
create table if not exists public.machinery_case_actions (
  id               uuid primary key default gen_random_uuid(),
  case_id          uuid not null references public.machinery_cases (id) on delete cascade,
  kind             text not null check (kind in ('sent', 'note', 'closed', 'reopened')),
  body             text,
  supplier_id      uuid references public.machinery_suppliers (id) on delete set null,
  supplier_name    text,                      -- kept even if the supplier is deleted later
  to_phone         text,
  delivery         text check (delivery in ('sent', 'failed')),  -- for kind = 'sent'
  wa_message_id    text,
  error            text,
  created_by       uuid references auth.users (id) on delete set null,
  created_by_email text,
  created_at       timestamptz not null default now()
);
create index if not exists machinery_case_actions_case_idx on public.machinery_case_actions (case_id, created_at);

alter table public.machinery_case_actions enable row level security;
revoke all on public.machinery_case_actions from anon, authenticated;
grant select on public.machinery_case_actions to authenticated;

drop policy if exists "case_actions_admin_read" on public.machinery_case_actions;
create policy "case_actions_admin_read" on public.machinery_case_actions
  for select to authenticated using (public.is_machinery_portal_admin());
-- Rows are written only by the functions below and the case-action Edge Function.

create or replace function public.machinery_add_case_note(p_case uuid, p_body text)
returns public.machinery_case_actions
language plpgsql security definer
set search_path = public
as $$
declare
  a public.machinery_case_actions;
begin
  if not coalesce(public.machinery_case_can(p_case, 'edit'), false) then
    raise exception 'You do not have edit access for this company.' using errcode = '42501';
  end if;
  if nullif(trim(coalesce(p_body, '')), '') is null then
    raise exception 'Note is empty.' using errcode = '22023';
  end if;
  insert into public.machinery_case_actions (case_id, kind, body, created_by, created_by_email)
  values (p_case, 'note', trim(p_body), auth.uid(), (select email from auth.users where id = auth.uid()))
  returning * into a;
  return a;
end $$;
revoke all on function public.machinery_add_case_note(uuid, text) from public, anon;
grant execute on function public.machinery_add_case_note(uuid, text) to authenticated;

-- Close (solve) or reopen a case, with an optional remark, and log it.
create or replace function public.machinery_close_case(p_id uuid, p_solved boolean, p_remark text)
returns public.machinery_cases
language plpgsql security definer
set search_path = public
as $$
declare
  c public.machinery_cases;
  me_email text := (select email from auth.users where id = auth.uid());
begin
  select * into c from public.machinery_cases where id = p_id;
  if c.id is null then
    raise exception 'case not found' using errcode = 'P0002';
  end if;
  if not public.machinery_cmms_can(public.machinery_company_of_number(c.wa_from), 'solve') then
    raise exception 'You do not have solve access for this company.' using errcode = '42501';
  end if;
  update public.machinery_cases
     set status          = case when p_solved then 'solved' else 'pending' end,
         solved_at       = case when p_solved then now() else null end,
         solved_by       = case when p_solved then auth.uid() else null end,
         solved_by_email = case when p_solved then me_email else null end,
         pinned_at       = case when p_solved then null else pinned_at end
   where id = p_id
  returning * into c;
  insert into public.machinery_case_actions (case_id, kind, body, created_by, created_by_email)
  values (p_id, case when p_solved then 'closed' else 'reopened' end,
          nullif(trim(coalesce(p_remark, '')), ''), auth.uid(), me_email);
  return c;
end $$;
revoke all on function public.machinery_close_case(uuid, boolean, text) from public, anon;
grant execute on function public.machinery_close_case(uuid, boolean, text) to authenticated;

-- The older solve function now logs too (same rules, no remark).
create or replace function public.machinery_set_case_solved(p_id uuid, p_solved boolean)
returns public.machinery_cases
language sql security definer
set search_path = public
as $$
  select public.machinery_close_case(p_id, p_solved, null);
$$;

-- Shows the newest actions (empty the first time).
select case_id, kind, body, delivery, created_at from public.machinery_case_actions order by created_at desc limit 10;
