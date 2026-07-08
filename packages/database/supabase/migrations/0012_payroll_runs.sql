-- 0012: Payroll runs — state machine, calculated lines with full trace
-- snapshots, one-off run inputs, and DB-enforced immutability after approval
-- (non-negotiable #14).

create table public.payroll_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  legal_entity_id uuid not null references public.legal_entities(id),
  period_year integer not null,
  period_month integer not null check (period_month between 1 and 12),
  run_type text not null default 'regular' check (run_type in (
    'regular', 'off_cycle', 'adjustment', 'final'
  )),
  status text not null default 'draft' check (status in (
    'draft', 'calculated', 'approved', 'paid', 'closed', 'reversed'
  )),
  totals jsonb,                 -- {gross, paye, net, employerCost, employees}
  variances jsonb,              -- findings vs previous period, set at calculation
  notes text,
  created_by uuid references auth.users(id),
  calculated_at timestamptz,
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  paid_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (tenant_id, legal_entity_id, period_year, period_month, run_type)
);

-- Immutable snapshot per employee: amounts, trace, and payment details as
-- they were at calculation time.
create table public.payroll_run_lines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  run_id uuid not null references public.payroll_runs(id) on delete cascade,
  employee_id uuid not null references public.employees(id),
  employee_name text not null,
  employee_number text not null,
  basic_salary numeric(14, 2) not null,
  gross_pay numeric(14, 2) not null,
  taxable_income numeric(14, 2) not null,
  paye numeric(14, 2) not null,
  pension_employee numeric(14, 2) not null default 0,
  total_deductions numeric(14, 2) not null,
  net_pay numeric(14, 2) not null,
  employer_cost numeric(14, 2) not null,
  earnings jsonb not null default '[]'::jsonb,
  statutory_deductions jsonb not null default '[]'::jsonb,
  other_deductions jsonb not null default '[]'::jsonb,
  employer_contributions jsonb not null default '[]'::jsonb,
  payment jsonb,                -- snapshot: {method, bankName, accountNumber, mmProvider, mmNumber}
  warnings jsonb not null default '[]'::jsonb,
  trace jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (run_id, employee_id)
);
create index payroll_run_lines_run_idx on public.payroll_run_lines (tenant_id, run_id);

-- One-off inputs for a run (bonus, extra deduction, overtime pay…): the
-- real-time workspace adds these and recalculates the affected employee.
create table public.payroll_run_inputs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  run_id uuid not null references public.payroll_runs(id) on delete cascade,
  employee_id uuid not null references public.employees(id),
  code text not null,
  name text not null,
  input_type text not null check (input_type in ('earning', 'deduction')),
  amount numeric(14, 2) not null,
  taxable boolean not null default true,
  pensionable boolean not null default false,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index payroll_run_inputs_run_idx on public.payroll_run_inputs (tenant_id, run_id);

-- ── Immutability triggers ────────────────────────────────────────────────
-- After approval, run rows accept ONLY forward status transitions and their
-- timestamps; lines and inputs are frozen entirely.
create or replace function app.guard_payroll_run_update()
returns trigger
language plpgsql
as $$
begin
  if old.status in ('approved', 'paid', 'closed') then
    -- Whitelist forward transitions.
    if not (
      (old.status = 'approved' and new.status in ('paid', 'reversed')) or
      (old.status = 'paid' and new.status = 'closed')
    ) then
      raise exception 'Payroll run % is % and immutable (non-negotiable #14)',
        old.id, old.status;
    end if;
    -- Financial content must not change during a transition.
    if new.totals is distinct from old.totals
      or new.period_year is distinct from old.period_year
      or new.period_month is distinct from old.period_month
      or new.legal_entity_id is distinct from old.legal_entity_id then
      raise exception 'Approved payroll content cannot be modified';
    end if;
  end if;
  return new;
end;
$$;

create or replace function app.guard_payroll_children()
returns trigger
language plpgsql
as $$
declare
  run_status text;
  target_run uuid;
begin
  target_run := coalesce(new.run_id, old.run_id);
  select status into run_status from public.payroll_runs where id = target_run;
  if run_status in ('approved', 'paid', 'closed') then
    raise exception 'Payroll run is % — lines and inputs are immutable', run_status;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function app.guard_payroll_run_delete()
returns trigger
language plpgsql
as $$
begin
  if old.status in ('approved', 'paid', 'closed') then
    raise exception 'Payroll run % is % and cannot be deleted', old.id, old.status;
  end if;
  return old;
end;
$$;

create trigger guard_run_update before update on public.payroll_runs
  for each row execute function app.guard_payroll_run_update();
create trigger guard_run_delete before delete on public.payroll_runs
  for each row execute function app.guard_payroll_run_delete();
create trigger guard_lines before insert or update or delete on public.payroll_run_lines
  for each row execute function app.guard_payroll_children();
create trigger guard_inputs before insert or update or delete on public.payroll_run_inputs
  for each row execute function app.guard_payroll_children();

-- ── RLS ─────────────────────────────────────────────────────────────────
do $$
declare
  t text;
begin
  foreach t in array array['payroll_runs', 'payroll_run_lines', 'payroll_run_inputs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy tenant_isolation on public.%I for all
         using (tenant_id in (select app.user_tenant_ids()))
         with check (tenant_id in (select app.user_tenant_ids()))', t);
  end loop;
end;
$$;
