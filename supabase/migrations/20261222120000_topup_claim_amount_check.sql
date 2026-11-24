-- =====================================================================
-- >>> RUN THIS IN THE **MACHINERY PORTAL** DATABASE <<<
-- >>> Supabase project qcvbzzdbbqmnrljfnxjp (shared with MachTrek)   <<<
-- Needs 20261218 (top-up request → claim). Safe to run more than once.
-- =====================================================================
-- A top-up claim (made from an approved top-up request) can only be
-- submitted when its fleet card reload row is that card and exactly the
-- approved amount. A draft can still be saved with any figures.
-- =====================================================================

create or replace function public.machinery_topup_claim_check()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare r record;
begin
  if new.topup_request_id is null or new.status <> 'pending' or old.status is not distinct from 'pending' then
    return new;
  end if;
  select * into r from public.machinery_fleet_topup_requests where id = new.topup_request_id;
  if not found then return new; end if;
  if not exists (
    select 1 from public.machinery_diesel_claim_lines l
     where l.claim_id = new.id and l.line_kind = 'reload' and l.card_id = r.card_id and l.amount = r.amount
  ) then
    raise exception 'The fleet card reload on this claim must be RM % (the approved top-up request TU-%).',
      to_char(r.amount, 'FM999,999,990.00'), lpad(coalesce(r.request_no, 0)::text, 4, '0');
  end if;
  return new;
end $$;
drop trigger if exists machinery_topup_claim_check on public.machinery_diesel_claims;
create trigger machinery_topup_claim_check
  before update of status on public.machinery_diesel_claims
  for each row execute function public.machinery_topup_claim_check();
