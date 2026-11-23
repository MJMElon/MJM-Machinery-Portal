-- =====================================================================
-- >>> RUN THIS IN THE **MACHINERY PORTAL** DATABASE <<<
-- >>> Supabase project qcvbzzdbbqmnrljfnxjp (shared with MachTrek)   <<<
-- Needs 20261212 (fleet card statement import). Safe to run more than once.
-- =====================================================================
-- Security fixes (audit):
--  1. Claim totals (amount, payable amount, litres) are always worked out by
--     the database from the claim's receipts. Nobody can type their own
--     payable amount any more, not even by calling the database directly.
--  2. An Approved or Paid claim is locked: nobody can change it or its
--     receipts. To correct one, move it back (Paid → Approved → Pending)
--     first. Approvers / accountants change only the status and the review
--     note; the claim itself stays as the claimant sent it.
--  3. A module admin cannot change their own access in User setting (another
--     admin or a super admin does it), so nobody can give themselves more rights.
--  4. Each CMMS 2 login is tied to the MJM Intranet account that first opened
--     it, not only to the e-mail address (see the gw-login function).
--  5. Fleet card web login passwords move into a locked table: only the
--     Procurement role (and super admins) can see one, with the eye button.

-- ---------------------------------------------------------------------------
-- 1 + 2) Claim header guard
create or replace function public.machinery_diesel_claims_guard()
returns trigger language plpgsql
set search_path = public
as $$
declare
  v_free constant text[] := array['status', 'review_note', 'reviewed_by', 'reviewed_at', 'updated_at'];
  v_sums record;
begin
  -- the sums of the receipts (none yet on a new claim)
  if tg_op = 'UPDATE' then
    select coalesce(sum(l.amount), 0) as amount,
           coalesce(sum(l.litres), 0) as litres,
           coalesce(sum(l.amount) filter (where l.payment = 'cash'), 0) as payable,
           min(l.fill_date) as fill_date,
           count(*) as n
      into v_sums
      from public.machinery_diesel_claim_lines l where l.claim_id = new.id;
  end if;

  if tg_op = 'INSERT' then
    if new.vehicle_id is not null
       and new.company_id <> (select v.company_id from public.machinery_machines v where v.id = new.vehicle_id) then
      raise exception 'The vehicle belongs to another company.' using errcode = '23514';
    end if;
    if auth.uid() is not null then
      -- totals come from the receipts, added after the claim
      new.amount := 0;
      new.payable_amount := 0;
      new.total_litres := 0;
      new.litres := 0;
      new.reviewed_by := null;
      new.reviewed_at := null;
      new.review_note := null;
      if new.status not in ('draft', 'pending') then
        new.status := 'pending';
      end if;
    end if;
    return new;
  end if;

  if auth.uid() is null then
    return new;  -- the system itself (service role)
  end if;

  -- (1) totals always follow the receipts
  if v_sums.n > 0 then
    new.amount := v_sums.amount;
    new.total_litres := v_sums.litres;
    new.litres := v_sums.litres;
    new.payable_amount := v_sums.payable;
    new.fill_date := coalesce(v_sums.fill_date, new.submitted_on);
  else
    new.amount := old.amount;
    new.total_litres := old.total_litres;
    new.litres := old.litres;
    new.payable_amount := old.payable_amount;
  end if;
  if new.claim_no is distinct from old.claim_no or new.created_at is distinct from old.created_at then
    raise exception 'The claim number cannot be changed.' using errcode = '42501';
  end if;
  if new.claimant_id <> old.claimant_id or new.company_id <> old.company_id then
    raise exception 'The claimant and company of a claim cannot be changed.' using errcode = '42501';
  end if;

  -- (2) an approved / paid claim is locked; someone else's claim: status and review note only
  if old.status in ('approved', 'paid') or old.claimant_id <> auth.uid() then
    if (to_jsonb(new) - v_free) is distinct from (to_jsonb(old) - v_free) then
      raise exception '%', case when old.status in ('approved', 'paid')
                                then 'This claim is approved or paid, so it is locked. Move it back to Pending first to change it.'
                                else 'Only the claimant can change this claim; you can approve, reject or add a review note.' end
            using errcode = '42501';
    end if;
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

-- (2) the receipts of an approved / paid claim are locked too (also for super admins)
create or replace function public.machinery_claim_lines_lock()
returns trigger language plpgsql
set search_path = public
as $$
declare v_status text;
begin
  if auth.uid() is null then
    return coalesce(new, old);
  end if;
  select c.status into v_status from public.machinery_diesel_claims c where c.id = coalesce(new.claim_id, old.claim_id);
  -- (no claim any more = the claim itself is being deleted)
  if v_status in ('approved', 'paid') then
    raise exception 'This claim is approved or paid, so its receipts are locked. Move it back to Pending first.' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and new.claim_id <> old.claim_id then
    raise exception 'A receipt cannot move to another claim.' using errcode = '42501';
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists machinery_diesel_claim_lines_lock on public.machinery_diesel_claim_lines;
create trigger machinery_diesel_claim_lines_lock
  before insert or update or delete on public.machinery_diesel_claim_lines
  for each row execute function public.machinery_claim_lines_lock();

-- Put every claim's totals right once (a typed-in payable amount is undone)
update public.machinery_diesel_claims c
   set amount         = s.amount,
       total_litres   = s.litres,
       litres         = s.litres,
       payable_amount = s.payable,
       fill_date      = coalesce(s.fill_date, c.submitted_on)
  from (select l.claim_id,
               coalesce(sum(l.amount), 0) as amount,
               coalesce(sum(l.litres), 0) as litres,
               coalesce(sum(l.amount) filter (where l.payment = 'cash'), 0) as payable,
               min(l.fill_date) as fill_date
          from public.machinery_diesel_claim_lines l group by l.claim_id) s
 where s.claim_id = c.id
   and (c.amount, c.total_litres, c.litres, c.payable_amount, c.fill_date)
       is distinct from (s.amount, s.litres, s.litres, s.payable, coalesce(s.fill_date, c.submitted_on));

-- ---------------------------------------------------------------------------
-- 3) User setting: a module admin cannot change their own access
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
  if p_user = auth.uid() and not public.is_machinery_super_admin() then
    raise exception 'You cannot change your own access. Ask another admin of this module or a super admin.' using errcode = '42501';
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

-- ---------------------------------------------------------------------------
-- 4) A CMMS 2 login belongs to one MJM Intranet account (its Intranet user id)
alter table public.machinery_portal_admins add column if not exists intranet_user_id text;
create unique index if not exists machinery_portal_admins_intranet_key
  on public.machinery_portal_admins (intranet_user_id) where intranet_user_id is not null;

-- Called by gw-login (service role) before signing someone in:
--   'ok'        go ahead (first visit, or the same Intranet account as before)
--   'mismatch'  this e-mail's CMMS 2 login belongs to another Intranet account
--   'moved'     this Intranet account already has another CMMS 2 login (e-mail changed)
create or replace function public.machinery_check_intranet_login(p_email text, p_intranet_id text)
returns text
language plpgsql security definer
set search_path = public
as $$
declare v_pinned text; v_other text;
begin
  if coalesce(p_intranet_id, '') = '' then
    return 'mismatch';
  end if;
  select a.intranet_user_id into v_pinned
    from public.machinery_portal_admins a where lower(a.email) = lower(btrim(p_email)) limit 1;
  if v_pinned is not null and v_pinned <> p_intranet_id then
    return 'mismatch';
  end if;
  select a.email into v_other
    from public.machinery_portal_admins a
   where a.intranet_user_id = p_intranet_id and lower(a.email) <> lower(btrim(p_email)) limit 1;
  if v_other is not null then
    return 'moved';
  end if;
  return 'ok';
end $$;
revoke all on function public.machinery_check_intranet_login(text, text) from public, anon, authenticated;
grant execute on function public.machinery_check_intranet_login(text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 5) Fleet card web login passwords: locked table, Procurement only
create table if not exists public.machinery_diesel_card_secrets (
  card_id uuid primary key references public.machinery_diesel_cards(id) on delete cascade,
  login_password text check (char_length(login_password) <= 80),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.machinery_diesel_card_secrets enable row level security;
-- no policies: nobody reads or writes it directly, only through the functions below
revoke all on public.machinery_diesel_card_secrets from anon, authenticated;

alter table public.machinery_diesel_cards add column if not exists login_password_set boolean not null default false;

-- Procurement role of Fuel Manage in this company (or a super admin)
create or replace function public.machinery_is_procurement(p_company uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.is_machinery_super_admin() or (
    public.machinery_in_company(p_company, 'fuel') and exists (
      select 1 from public.machinery_user_perms up
       where up.company_id = p_company and up.user_id = auth.uid()
         and (coalesce(up.perms -> 'fuel_role', '[]'::jsonb) ? 'procurement'
              or (not (up.perms ? 'fuel_role') and coalesce(up.perms -> 'topup', '[]'::jsonb) ? 'process'))));
$$;
revoke all on function public.machinery_is_procurement(uuid) from public, anon;
grant execute on function public.machinery_is_procurement(uuid) to authenticated;

-- The eye button: the password, for Procurement only (null for anyone else)
create or replace function public.machinery_card_password(p_card uuid)
returns text
language plpgsql security definer
set search_path = public
as $$
declare v_company uuid; v_pw text;
begin
  select c.company_id into v_company from public.machinery_diesel_cards c where c.id = p_card;
  if v_company is null or not public.machinery_is_procurement(v_company) then
    raise exception 'Only the Procurement role can see fleet card passwords.' using errcode = '42501';
  end if;
  select s.login_password into v_pw from public.machinery_diesel_card_secrets s where s.card_id = p_card;
  return v_pw;
end $$;
revoke all on function public.machinery_card_password(uuid) from public, anon;
grant execute on function public.machinery_card_password(uuid) to authenticated;

-- Set or clear the password: whoever may edit the card (they cannot read it back)
create or replace function public.machinery_set_card_password(p_card uuid, p_password text)
returns void
language plpgsql security definer
set search_path = public
as $$
declare v_company uuid; v_pw text := nullif(btrim(coalesce(p_password, '')), '');
begin
  select c.company_id into v_company from public.machinery_diesel_cards c where c.id = p_card;
  if v_company is null
     or not (coalesce(public.machinery_can(v_company, 'cards', 'edit'), false) or public.machinery_is_procurement(v_company)) then
    raise exception 'You cannot change this fleet card.' using errcode = '42501';
  end if;
  if char_length(v_pw) > 80 then
    raise exception 'The password is too long (80 characters at most).' using errcode = '22001';
  end if;
  if v_pw is null then
    delete from public.machinery_diesel_card_secrets where card_id = p_card;
  else
    insert into public.machinery_diesel_card_secrets (card_id, login_password, updated_by, updated_at)
    values (p_card, v_pw, auth.uid(), now())
    on conflict (card_id) do update set login_password = excluded.login_password, updated_by = excluded.updated_by, updated_at = now();
  end if;
  update public.machinery_diesel_cards set login_password_set = (v_pw is not null) where id = p_card;
end $$;
revoke all on function public.machinery_set_card_password(uuid, text) from public, anon;
grant execute on function public.machinery_set_card_password(uuid, text) to authenticated;

-- A password still written straight onto the card (an older copy of the app
-- open somewhere) is moved into the locked table at once.
create or replace function public.machinery_card_password_move()
returns trigger language plpgsql security definer set search_path = public
as $$ begin
  insert into public.machinery_diesel_card_secrets (card_id, login_password, updated_by, updated_at)
  values (new.id, left(new.login_password, 80), auth.uid(), now())
  on conflict (card_id) do update set login_password = excluded.login_password, updated_by = excluded.updated_by, updated_at = now();
  update public.machinery_diesel_cards set login_password = null, login_password_set = true where id = new.id;
  return null;
end $$;
drop trigger if exists machinery_diesel_cards_password_move on public.machinery_diesel_cards;
create trigger machinery_diesel_cards_password_move
  after insert or update of login_password on public.machinery_diesel_cards
  for each row when (new.login_password is not null)
  execute function public.machinery_card_password_move();

-- Move the passwords already saved, then wipe them from the cards
insert into public.machinery_diesel_card_secrets (card_id, login_password, updated_at)
select c.id, c.login_password, now() from public.machinery_diesel_cards c where c.login_password is not null
on conflict (card_id) do update set login_password = excluded.login_password;
update public.machinery_diesel_cards
   set login_password_set = exists (select 1 from public.machinery_diesel_card_secrets s where s.card_id = machinery_diesel_cards.id),
       login_password = null
 where login_password is not null
    or login_password_set <> exists (select 1 from public.machinery_diesel_card_secrets s where s.card_id = machinery_diesel_cards.id);

select 'done' as result;
