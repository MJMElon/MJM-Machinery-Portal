-- =====================================================================
-- >>> RUN THIS IN THE **MACHINERY PORTAL** DATABASE <<<
-- >>> Supabase project qcvbzzdbbqmnrljfnxjp (shared with MachTrek)   <<<
-- >>> NOT the MJM Intranet database (briqzyxfxsvulyizzbiu)            <<<
-- Safe to run more than once.
-- =====================================================================
-- The company's billing address, tel, fax and e-mail (the fuel claim form
-- letterhead) now come from the Intranet company profile (Master Manage →
-- Company → Billing details) through "Sync from MJM Intranet" and the sign-in
-- sync. Settings → Company profile here shows them read-only for Intranet
-- companies. Needs the Intranet migration 20261130 (company billing) and a
-- fresh deploy of its gw-master-data function; until then the sync leaves
-- the values kept here untouched.
alter table public.machinery_companies
  add column if not exists address text check (char_length(address) <= 400),
  add column if not exists phone   text check (char_length(phone) <= 60),
  add column if not exists fax     text check (char_length(fax) <= 60),
  add column if not exists email   text check (char_length(email) <= 120);

create or replace function public.machinery_apply_intranet_master(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  b jsonb;
  c jsonb;
  l jsonb;
  v_biz uuid;
  v_co uuid;
  n_biz int := 0;
  n_co int := 0;
  n_links int := 0;
  n_inactive int := 0;
begin
  if auth.uid() is not null and not public.is_machinery_super_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  for b in select * from jsonb_array_elements(coalesce(p -> 'businesses', '[]'::jsonb)) loop
    select id into v_biz from public.machinery_businesses where intranet_id = (b ->> 'id')::uuid;
    if v_biz is null then
      select id into v_biz from public.machinery_businesses
       where intranet_id is null and lower(name) = lower(b ->> 'name') limit 1;
    end if;
    -- Same name, but tied to an Intranet Business that no longer exists there
    -- (deleted and re-created in the Intranet): take that row over.
    if v_biz is null then
      select id into v_biz from public.machinery_businesses bz
       where lower(bz.name) = lower(b ->> 'name')
         and not exists (select 1 from jsonb_array_elements(coalesce(p -> 'businesses', '[]'::jsonb)) x
                          where (x ->> 'id')::uuid = bz.intranet_id)
       limit 1;
    end if;
    -- A Business renamed in the Intranet to a name another row still holds:
    -- free the name first (that row gets its own name back on the next loop
    -- turn, or stays as "<name> (old)" if it is gone from the Intranet).
    update public.machinery_businesses bz
       set name = bz.name || ' (old)'
     where lower(bz.name) = lower(b ->> 'name') and bz.id is distinct from v_biz;
    if v_biz is null then
      insert into public.machinery_businesses (name, description, sort_order, intranet_id)
      values (b ->> 'name', b ->> 'description', coalesce((b ->> 'sort_order')::int, 0), (b ->> 'id')::uuid)
      returning id into v_biz;
    else
      update public.machinery_businesses
         set name = b ->> 'name', description = b ->> 'description',
             sort_order = coalesce((b ->> 'sort_order')::int, sort_order), intranet_id = (b ->> 'id')::uuid
       where id = v_biz;
    end if;
    n_biz := n_biz + 1;
  end loop;

  for c in select * from jsonb_array_elements(coalesce(p -> 'companies', '[]'::jsonb)) loop
    select id into v_co from public.machinery_companies where intranet_id = (c ->> 'id')::uuid;
    if v_co is null and nullif(c ->> 'code', '') is not null then
      select id into v_co from public.machinery_companies where intranet_id is null and code = c ->> 'code' limit 1;
    end if;
    if v_co is null then
      select id into v_co from public.machinery_companies
       where intranet_id is null and lower(name) = lower(c ->> 'name') limit 1;
    end if;
    if v_co is null then
      insert into public.machinery_companies (name, code, short_name, registration_no, is_active, intranet_id, address, phone, fax, email)
      values (c ->> 'name', nullif(c ->> 'code', ''), nullif(c ->> 'short_name', ''), nullif(c ->> 'registration_no', ''),
              coalesce((c ->> 'is_active')::boolean, true), (c ->> 'id')::uuid,
              nullif(c ->> 'billing_address', ''), nullif(c ->> 'phone', ''), nullif(c ->> 'fax', ''), nullif(c ->> 'email', ''))
      returning id into v_co;
    else
      update public.machinery_companies
         set name = c ->> 'name', code = nullif(c ->> 'code', ''), short_name = nullif(c ->> 'short_name', ''),
             registration_no = nullif(c ->> 'registration_no', ''),
             is_active = coalesce((c ->> 'is_active')::boolean, true), intranet_id = (c ->> 'id')::uuid
       where id = v_co;
    end if;
    -- Billing details (letterhead) come from the Intranet company profile once
    -- its database has them; until then the values kept here stay as they are.
    if c ? 'billing_address' then
      update public.machinery_companies
         set address = nullif(c ->> 'billing_address', ''), phone = nullif(c ->> 'phone', ''),
             fax = nullif(c ->> 'fax', ''), email = nullif(c ->> 'email', '')
       where id = v_co;
    end if;
    n_co := n_co + 1;
  end loop;

  delete from public.machinery_business_companies bc
   using public.machinery_companies co
   where co.id = bc.company_id and co.intranet_id is not null;
  for l in select * from jsonb_array_elements(coalesce(p -> 'links', '[]'::jsonb)) loop
    insert into public.machinery_business_companies (business_id, company_id)
    select bz.id, co.id
      from public.machinery_businesses bz, public.machinery_companies co
     where bz.intranet_id = (l ->> 'group_id')::uuid and co.intranet_id = (l ->> 'company_id')::uuid
    on conflict do nothing;
    n_links := n_links + 1;
  end loop;

  update public.machinery_companies co
     set is_active = false
   where co.intranet_id is not null and co.is_active
     and not exists (select 1 from jsonb_array_elements(coalesce(p -> 'companies', '[]'::jsonb)) x
                      where (x ->> 'id')::uuid = co.intranet_id);
  get diagnostics n_inactive = row_count;

  -- Module access from the Intranet's Icon tags
  if p ? 'cmms_company_ids' and jsonb_typeof(p -> 'cmms_company_ids') = 'array' then
    update public.machinery_companies co
       set cmms_enabled = exists (select 1 from jsonb_array_elements_text(p -> 'cmms_company_ids') x where x::uuid = co.intranet_id)
     where co.intranet_id is not null;
  end if;
  if p ? 'diesel_company_ids' and jsonb_typeof(p -> 'diesel_company_ids') = 'array' then
    update public.machinery_companies co
       set diesel_enabled = exists (select 1 from jsonb_array_elements_text(p -> 'diesel_company_ids') x where x::uuid = co.intranet_id)
     where co.intranet_id is not null;
  end if;

  return jsonb_build_object('businesses', n_biz, 'companies', n_co, 'links', n_links, 'made_inactive', n_inactive);
end $$;
revoke all on function public.machinery_apply_intranet_master(jsonb) from public, anon, authenticated;

select name, registration_no, address, phone, fax, email, intranet_id is not null as from_intranet
  from public.machinery_companies order by name;
