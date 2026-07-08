-- 0011: Pay components (recurring earnings/deductions) and a draft
-- minimum-wage rule for the Tanzania Mainland private pack.
-- Statutory amounts (PAYE/NSSF/SDL/WCF) are NEVER pay components — the rule
-- engine computes them from compliance_rules at calculation time.

create table public.pay_components (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  code text not null,
  component_type text not null check (component_type in ('earning', 'deduction')),
  calc_type text not null default 'fixed' check (calc_type in ('fixed', 'percent_of_basic')),
  default_amount numeric(14, 2),        -- fixed amount, or percent when percent_of_basic
  taxable boolean not null default true,     -- earnings: subject to PAYE
  pensionable boolean not null default false, -- earnings: part of the NSSF base
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, code)
);

-- Effective-dated per-employee assignment (amount overrides the default).
create table public.employee_pay_components (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  pay_component_id uuid not null references public.pay_components(id) on delete cascade,
  amount numeric(14, 2),                -- null = use component default
  effective_from date not null,
  effective_to date,
  created_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from)
);
create index employee_pay_components_current_idx
  on public.employee_pay_components (tenant_id, employee_id)
  where effective_to is null;

do $$
declare
  t text;
begin
  foreach t in array array['pay_components', 'employee_pay_components'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy tenant_isolation on public.%I for all
         using (tenant_id in (select app.user_tenant_ids()))
         with check (tenant_id in (select app.user_tenant_ids()))', t);
  end loop;
end;
$$;

-- Draft minimum-wage rule (blueprint §5.3). Sector-schedule amounts MUST be
-- verified against the current wage order before approval.
insert into public.compliance_rules
  (pack_id, rule_type, name, formula, effective_from, legal_source, status)
select
  p.id,
  'minimum_wage',
  'Minimum wage — private sector general floor',
  '{"type":"minimum_wage","period":"monthly","generalFloor":60000,
    "sectors":{"telecom_finance":400000,"mining":350000,"domestic":60000}}'::jsonb,
  date '2025-07-01',
  'Wage Order — VERIFY sector schedule before approval',
  'draft'
from public.compliance_packs p
where p.code = 'tz-mainland-private'
  and not exists (
    select 1 from public.compliance_rules r
    where r.pack_id = p.id and r.rule_type = 'minimum_wage'
  );
