-- 0009: Reusable workflow engine v1 + leave management with transaction
-- ledger (non-negotiable #6/#15: approvals audited; balances derivable).

-- ── Workflow engine (generic, sequential v1) ────────────────────────────
create table public.workflow_definitions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  entity_type text not null,             -- 'leave_request', 'expense', 'payroll_run', …
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, entity_type, name)
);

create table public.workflow_steps (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  definition_id uuid not null references public.workflow_definitions(id) on delete cascade,
  step_order integer not null,
  approver_type text not null check (approver_type in ('manager', 'role')),
  approver_role_id uuid references public.roles(id),
  sla_hours integer,                     -- escalation threshold; null = none
  created_at timestamptz not null default now(),
  unique (definition_id, step_order)
);

create table public.workflow_instances (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  definition_id uuid references public.workflow_definitions(id),
  entity_type text not null,
  entity_id uuid not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  current_step integer not null default 1,
  total_steps integer not null default 1,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index workflow_instances_entity_idx
  on public.workflow_instances (tenant_id, entity_type, entity_id);

-- One row per step per instance; the acting surface for approvers.
create table public.workflow_step_actions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  instance_id uuid not null references public.workflow_instances(id) on delete cascade,
  step_order integer not null,
  approver_type text not null,
  assigned_user_id uuid references auth.users(id),   -- resolved manager / delegate
  assigned_role_id uuid references public.roles(id), -- any holder may act
  sla_hours integer,
  status text not null default 'waiting' check (status in (
    'waiting',    -- not yet reached
    'pending',    -- awaiting decision
    'approved', 'rejected', 'delegated', 'skipped'
  )),
  acted_by uuid references auth.users(id),
  acted_at timestamptz,
  comment text,
  delegated_to uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (instance_id, step_order)
);
create index workflow_step_actions_pending_idx
  on public.workflow_step_actions (tenant_id, status) where status = 'pending';

-- ── Leave ───────────────────────────────────────────────────────────────
create table public.leave_types (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  name_sw text,
  code text not null,
  is_paid boolean not null default true,
  annual_entitlement_days numeric(5, 1) not null default 0,
  accrual_method text not null default 'annual_grant'
    check (accrual_method in ('annual_grant', 'monthly')),
  max_carry_forward_days numeric(5, 1) not null default 0,
  allow_negative_balance boolean not null default false,
  requires_document boolean not null default false,
  gender_restriction text check (gender_restriction in ('male', 'female')),
  min_service_months integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, code)
);

create table public.tenant_holidays (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  holiday_date date not null,
  name text not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, holiday_date, name)
);

create table public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  leave_type_id uuid not null references public.leave_types(id),
  start_date date not null,
  end_date date not null,
  days numeric(5, 1) not null,
  is_half_day boolean not null default false,
  reason text,
  document_path text,
  status text not null default 'pending' check (status in (
    'pending', 'approved', 'rejected', 'cancelled'
  )),
  workflow_instance_id uuid references public.workflow_instances(id),
  requested_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  check (end_date >= start_date),
  check (days > 0)
);
create index leave_requests_employee_idx on public.leave_requests (tenant_id, employee_id);
create index leave_requests_pending_idx
  on public.leave_requests (tenant_id, status) where status = 'pending';

-- The ledger: balances are ALWAYS sum(days); never a stored balance column.
create table public.leave_ledger (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  leave_type_id uuid not null references public.leave_types(id),
  entry_type text not null check (entry_type in (
    'accrual', 'carry_forward', 'grant', 'request', 'cancellation',
    'adjustment', 'encashment', 'expiry'
  )),
  days numeric(6, 1) not null,           -- credit > 0, debit < 0
  effective_date date not null,
  leave_request_id uuid references public.leave_requests(id),
  note text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index leave_ledger_balance_idx
  on public.leave_ledger (tenant_id, employee_id, leave_type_id, effective_date);

-- Balance view (security invoker → RLS of the querying user applies).
create view public.leave_balances
with (security_invoker = true) as
select
  tenant_id,
  employee_id,
  leave_type_id,
  sum(days) as balance_days
from public.leave_ledger
group by tenant_id, employee_id, leave_type_id;

-- ── RLS ─────────────────────────────────────────────────────────────────
do $$
declare
  t text;
begin
  foreach t in array array[
    'workflow_definitions', 'workflow_steps', 'workflow_instances',
    'workflow_step_actions', 'leave_types', 'tenant_holidays',
    'leave_requests', 'leave_ledger'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy tenant_isolation on public.%I for all
         using (tenant_id in (select app.user_tenant_ids()))
         with check (tenant_id in (select app.user_tenant_ids()))', t);
  end loop;
end;
$$;
