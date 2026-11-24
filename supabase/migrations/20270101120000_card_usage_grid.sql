-- =====================================================================
-- >>> RUN THIS IN THE **MACHINERY PORTAL** DATABASE <<<
-- >>> Supabase project qcvbzzdbbqmnrljfnxjp (shared with MachTrek)   <<<
-- Needs 20261212. Safe to run more than once.
-- =====================================================================
-- Fleet card usage by date and driver (the card page → Usage → View):
--   * each usage row says where it came from: 'claim' (a fleet-card receipt
--     on a fuel claim), 'portal' (Fuel Station Portal: the AI agent / statement
--     import) or 'manual' (added by hand in the View window), with its id
--     and the driver id;
--   * rows from the Fuel Station Portal cannot be deleted by hand (super
--     admins excepted); rows added by hand can (Fuel Manage usage: delete).
-- =====================================================================

create or replace function public.machinery_card_month_usage(p_company uuid, p_card uuid, p_month text)
returns jsonb
language sql stable security definer
set search_path = public
as $$
  with ok as (
    select exists (
      select 1 from public.machinery_diesel_cards c
       where c.id = p_card and c.company_id = p_company
         and (public.machinery_can(p_company, 'cards', 'view')
              or public.machinery_can(p_company, 'report', 'view')
              or public.machinery_can(p_company, 'topup', 'process')
              or auth.uid() = any (c.driver_ids))) as yes
  ), span as (
    select to_date(p_month || '-01', 'YYYY-MM-DD') as d1,
           (to_date(p_month || '-01', 'YYYY-MM-DD') + interval '1 month - 1 day')::date as d2
  ), rows as (
    -- fleet-card receipts on fuel claims (claimed)
    select l.fill_date, l.litres, l.amount, l.vehicle_id, cl.claimant_id as driver_id, null::text as driver_name,
           coalesce(s.fill_at, l.created_at) as at_time, s.fill_at,
           'claim'::text as source, cl.id as claim_id, cl.claim_no, cl.status as claim_status,
           (l.receipt_path is not null) as has_receipt, l.receipt_no, coalesce(l.station, s.station) as station,
           (s.id is not null) as on_statement, s.amount as statement_amount,
           null::uuid as usage_id, 'claim'::text as origin, l.id as line_id
      from public.machinery_diesel_claim_lines l
      join public.machinery_diesel_claims cl on cl.id = l.claim_id
      left join public.machinery_diesel_card_usage s on s.claim_line_id = l.id
     where l.card_id = p_card and l.payment = 'fleet_card' and l.line_kind = 'fill'
       and cl.status not in ('rejected', 'draft')
       and l.fill_date between (select d1 from span) and (select d2 from span)
    union all
    -- fill-ups on the card (statement / typed) that no counted claim covers
    select u.fill_date, u.litres, u.amount, u.vehicle_id, coalesce(u.driver_id, dl.claimant_id), u.driver_name,
           coalesce(u.fill_at, u.created_at), u.fill_at,
           'card'::text, dl.claim_id, dl.claim_no, dl.status, false, u.receipt_no, u.station,
           (u.source <> 'manual'), u.amount,
           u.id, case when u.source = 'manual' then 'manual' else 'portal' end, null::uuid
      from public.machinery_diesel_card_usage u
      left join lateral (select c.id as claim_id, c.claim_no, c.status, c.claimant_id
                           from public.machinery_diesel_claim_lines l
                           join public.machinery_diesel_claims c on c.id = l.claim_id
                          where l.id = u.claim_line_id) dl on true
     where u.card_id = p_card
       and public.machinery_usage_counted(u.claim_line_id)
       and u.fill_date between (select d1 from span) and (select d2 from span)
  )
  select case when (select yes from ok) then
    coalesce((select jsonb_agg(jsonb_build_object(
              'date', r.fill_date,
              'time', to_char(r.fill_at at time zone 'Asia/Kuala_Lumpur', 'HH24:MI'),
              'litres', r.litres,
              'amount', r.amount,
              'driver', coalesce((select coalesce(a.full_name, a.email) from public.machinery_portal_admins a where a.user_id = r.driver_id), r.driver_name),
              'vehicle', (select coalesce(v.reg_no, v.name) from public.machinery_machines v where v.id = r.vehicle_id),
              'source', r.source,
              'claim_id', r.claim_id,
              'claim_no', r.claim_no,
              'claim_status', r.claim_status,
              'has_receipt', r.has_receipt,
              'receipt_no', r.receipt_no,
              'station', r.station,
              'on_statement', r.on_statement,
              'statement_amount', r.statement_amount,
              'driver_id', r.driver_id,
              'usage_id', r.usage_id,
              'origin', r.origin)
            order by r.fill_date desc, r.at_time desc) from rows r), '[]'::jsonb)
  else null end;
$$;
revoke all on function public.machinery_card_month_usage(uuid, uuid, text) from public, anon;
grant execute on function public.machinery_card_month_usage(uuid, uuid, text) to authenticated;

create or replace function public.machinery_card_usage_delete_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.source <> 'manual' and auth.uid() is not null and not public.is_machinery_super_admin() then
    raise exception 'This fill-up came from the Fuel Station Portal, so it cannot be deleted here.' using errcode = '42501';
  end if;
  return old;
end $$;
drop trigger if exists machinery_card_usage_delete_guard on public.machinery_diesel_card_usage;
create trigger machinery_card_usage_delete_guard
  before delete on public.machinery_diesel_card_usage
  for each row execute function public.machinery_card_usage_delete_guard();

notify pgrst, 'reload schema';
