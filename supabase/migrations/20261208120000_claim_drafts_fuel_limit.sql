-- =====================================================================
-- >>> RUN THIS IN THE **MACHINERY PORTAL** DATABASE <<<
-- >>> Supabase project qcvbzzdbbqmnrljfnxjp (shared with MachTrek)   <<<
-- Needs 20261205 (fleet card history) and 20261207 (roles). Safe to run more than once.
-- =====================================================================
-- 1) Fuel claims can be saved as Draft
--    A draft is seen and changed only by the claimant (and super admins):
--    approvers, accountants and reports do not see it; it counts nowhere
--    (fuel usage, fleet card balance, card reloads) until it is submitted
--    (Draft → Pending). Draft lines stay editable like Pending ones.
-- 2) User setting: Fuel limit (litres) per person, kept in
--    perms.fuel_limit = [litres]; Fuel Manage admins may set it.

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

-- 1c) Status changes: the claimant submits a draft (or takes a pending claim back)
create or replace function public.machinery_diesel_claims_guard()
returns trigger language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.vehicle_id is not null
       and new.company_id <> (select v.company_id from public.machinery_machines v where v.id = new.vehicle_id) then
      raise exception 'The vehicle belongs to another company.' using errcode = '23514';
    end if;
    return new;
  end if;
  if auth.uid() is null then
    return new;
  end if;
  if new.claimant_id <> old.claimant_id or new.company_id <> old.company_id then
    raise exception 'The claimant and company of a claim cannot be changed.' using errcode = '42501';
  end if;
  if new.vehicle_id is distinct from old.vehicle_id and new.vehicle_id is not null
     and new.company_id <> (select v.company_id from public.machinery_machines v where v.id = new.vehicle_id) then
    raise exception 'The vehicle belongs to another company.' using errcode = '23514';
  end if;
  if new.status is distinct from old.status then
    -- The claimant: Draft → Pending (submit) or Pending → Draft (take back)
    if (old.status, new.status) in (('draft', 'pending'), ('pending', 'draft')) then
      if old.claimant_id <> auth.uid() and not public.is_machinery_super_admin() then
        raise exception 'Only the claimant can submit or take back this claim.' using errcode = '42501';
      end if;
      return new;
    end if;
    if old.status = 'draft' or new.status = 'draft' then
      raise exception 'A draft can only be submitted (Pending).' using errcode = '23514';
    end if;
    if new.status = 'paid' or old.status = 'paid' then
      -- Accountant: Approved → Paid (or undo Paid → Approved)
      if not public.machinery_can(old.company_id, 'claims', 'pay') then
        raise exception 'Only an accountant can mark fuel claims paid.' using errcode = '42501';
      end if;
      if new.status = 'paid' and old.status <> 'approved' then
        raise exception 'Only approved claims can be marked paid.' using errcode = '23514';
      end if;
      if old.status = 'paid' and new.status <> 'approved' then
        raise exception 'A paid claim can only go back to approved.' using errcode = '23514';
      end if;
      if old.claimant_id = auth.uid() and not public.is_machinery_super_admin() then
        raise exception 'You cannot mark your own claim paid.' using errcode = '42501';
      end if;
    else
      -- Approver: approve / reject / back to pending
      if not public.machinery_claim_approver(old.company_id, old.claimant_id) then
        raise exception 'You are not an approver for this person''s claims.' using errcode = '42501';
      end if;
      if old.claimant_id = auth.uid() then
        raise exception 'You cannot approve or reject your own claim.' using errcode = '42501';
      end if;
    end if;
    new.reviewed_by := auth.uid();
    new.reviewed_at := now();
    return new;
  end if;
  if not public.machinery_claim_reviewable(old.company_id, old.claimant_id)
     and (new.reviewed_by is distinct from old.reviewed_by
          or new.reviewed_at is distinct from old.reviewed_at
          or new.review_note is distinct from old.review_note) then
    raise exception 'Only a reviewer can change the review fields.' using errcode = '42501';
  end if;
  return new;
end $$;

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

-- 1e) Card balance and the card's receipts leave drafts out
create or replace function public.machinery_card_ledger(p_company uuid)
returns table (card_id uuid, month text, kind text, amount numeric, litres numeric, entries integer)
language sql security definer stable
set search_path = public
as $$
  with ok as (
    select public.machinery_can(p_company, 'cards', 'view') or public.machinery_can(p_company, 'report', 'view') as yes
  ),
  reloads as (
    select r.card_id, to_char(r.reload_date, 'YYYY-MM') as month, 'reload'::text as kind,
           sum(r.amount) as amount, 0::numeric as litres, count(*)::int as entries
      from public.machinery_diesel_card_reloads r
     where r.company_id = p_company
     group by r.card_id, to_char(r.reload_date, 'YYYY-MM')
  ),
  usage_rows as (
    select u.card_id, u.fill_date, u.amount, u.litres
      from public.machinery_diesel_card_usage u
     where u.company_id = p_company
    union all
    select x.card_id, x.fill_date, x.amount, x.litres
      from (
        select coalesce(l.card_id, public.machinery_card_for_line(p_company, l.vehicle_id, c.claimant_id)) as card_id,
               l.fill_date, l.amount, l.litres
          from public.machinery_diesel_claim_lines l
          join public.machinery_diesel_claims c on c.id = l.claim_id
         where l.company_id = p_company and l.payment = 'fleet_card' and l.line_kind = 'fill'
           and c.status not in ('rejected', 'draft')
      ) x
     where x.card_id is not null
  ),
  used as (
    select u.card_id, to_char(u.fill_date, 'YYYY-MM') as month, 'usage'::text as kind,
           sum(u.amount) as amount, sum(coalesce(u.litres, 0)) as litres, count(*)::int as entries
      from usage_rows u
     group by u.card_id, to_char(u.fill_date, 'YYYY-MM')
  )
  select * from reloads where (select yes from ok)
  union all
  select * from used where (select yes from ok);
$$;
revoke all on function public.machinery_card_ledger(uuid) from public, anon;
grant execute on function public.machinery_card_ledger(uuid) to authenticated;

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

-- 2) Fuel Manage admins also save the fuel limit (User setting)
create or replace function public.machinery_module_sections(p_module text)
returns text[]
language sql immutable
as $$
  select case p_module
    when 'machinery' then array['work', 'machines', 'suppliers']
    when 'fuel'      then array['claims', 'usage', 'cards', 'report', 'fuel_record', 'approve_for', 'topup', 'topup_approve_for', 'fuel_role', 'fuel_limit']
    else array[]::text[] end;
$$;

select 'done' as result;
