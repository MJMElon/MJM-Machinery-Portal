-- =====================================================================
-- >>> RUN THIS IN THE **MACHINERY PORTAL** DATABASE <<<
-- >>> Supabase project qcvbzzdbbqmnrljfnxjp (shared with MachTrek)   <<<
-- >>> NOT the MJM Intranet database (briqzyxfxsvulyizzbiu)            <<<
-- Safe to run more than once.
-- =====================================================================
-- Every machine / vehicle gets a running number within its company
-- (shown as M0001, M0002, …). It is given on save and can never be edited.
alter table public.machinery_machines add column if not exists machine_no integer;

-- Existing machines: numbered in the order they were created.
with numbered as (
  select id, row_number() over (partition by company_id order by created_at, name) as n
    from public.machinery_machines where machine_no is null
), taken as (
  select company_id, coalesce(max(machine_no), 0) as top from public.machinery_machines group by company_id
)
update public.machinery_machines m
   set machine_no = n.n + coalesce(t.top, 0)
  from numbered n left join public.machinery_machines mm on mm.id = n.id
  left join taken t on t.company_id = mm.company_id
 where m.id = n.id;

create unique index if not exists machinery_machines_no_key on public.machinery_machines (company_id, machine_no);

create or replace function public.machinery_machine_no()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' then
    new.machine_no := old.machine_no;          -- never editable
    return new;
  end if;
  if new.machine_no is null then
    select coalesce(max(machine_no), 0) + 1 into new.machine_no
      from public.machinery_machines where company_id = new.company_id;
  end if;
  return new;
end $$;
drop trigger if exists machinery_machines_no on public.machinery_machines;
create trigger machinery_machines_no
  before insert or update on public.machinery_machines
  for each row execute function public.machinery_machine_no();

select c.name as company, 'M' || lpad(m.machine_no::text, 4, '0') as machine_no, m.name
  from public.machinery_machines m join public.machinery_companies c on c.id = m.company_id
 order by c.name, m.machine_no;
