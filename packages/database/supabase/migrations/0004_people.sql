-- 0004: Central employee record + effective-dated history (blueprint §2.5).
-- One employee record powers every module. Salary, position, department,
-- manager and branch changes create historical assignment rows — they never
-- overwrite (non-negotiable #5).

create type public.employee_status as enum
  ('onboarding', 'probation', 'active', 'suspended', 'on_leave', 'exiting', 'exited');

create type public.employment_type as enum (
  'permanent', 'fixed_term', 'part_time', 'casual', 'seasonal',
  'internship', 'apprenticeship', 'consultancy', 'expatriate', 'project_based'
);

create type public.employment_action_type as enum (
  'hire', 'promotion', 'transfer', 'salary_adjustment', 'acting_appointment',
  'contract_renewal', 'probation_extension', 'probation_confirmation',
  'suspension', 'return_from_suspension', 'demotion', 'branch_transfer',
  'department_transfer', 'manager_change', 'cost_centre_change', 'exit'
);

create type public.action_status as enum
  ('draft', 'pending_approval', 'approved', 'rejected', 'cancelled', 'effected');

create type public.payment_method as enum ('bank', 'mobile_money', 'cash');

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  legal_entity_id uuid not null references public.legal_entities(id),
  -- portal login; null until the employee is invited
  user_id uuid references auth.users(id),
  employee_number text not null,
  first_name text not null,
  middle_name text,
  last_name text not null,
  gender text check (gender in ('male', 'female')),
  date_of_birth date,
  nationality text default 'TZ',
  national_id text,          -- NIDA
  tin text,
  nssf_number text,
  health_insurance_number text,
  work_permit_number text,
  work_permit_expiry date,
  personal_email text,
  work_email text,
  phone text,
  physical_address text,
  marital_status text,
  status public.employee_status not null default 'onboarding',
  employment_type public.employment_type not null default 'permanent',
  hire_date date not null,
  probation_end_date date,
  exit_date date,
  photo_path text,           -- Supabase Storage object path
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, employee_number)
);
create index employees_tenant_status_idx on public.employees (tenant_id, status);
create index employees_user_idx on public.employees (user_id);

-- Effective-dated organizational assignment. Current row: effective_to is null.
create table public.employee_assignments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  position_id uuid references public.positions(id),
  department_id uuid references public.departments(id),
  branch_id uuid references public.branches(id),
  cost_centre_id uuid references public.cost_centres(id),
  work_site_id uuid references public.work_sites(id),
  manager_employee_id uuid references public.employees(id),
  effective_from date not null,
  effective_to date,
  created_by_action_id uuid,   -- fk added below (employment_actions)
  created_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from)
);
create index employee_assignments_current_idx
  on public.employee_assignments (tenant_id, employee_id)
  where effective_to is null;

-- Effective-dated compensation. Statutory treatment of each component is
-- resolved by the compliance rule engine at payroll time, not stored here.
create table public.employee_compensation (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  basic_salary numeric(14, 2) not null,
  currency text not null default 'TZS',
  pay_frequency text not null default 'monthly'
    check (pay_frequency in ('monthly', 'biweekly', 'weekly', 'daily')),
  effective_from date not null,
  effective_to date,
  created_by_action_id uuid,
  created_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from)
);
create index employee_compensation_current_idx
  on public.employee_compensation (tenant_id, employee_id)
  where effective_to is null;

create table public.employee_contracts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  contract_type public.employment_type not null,
  starts_on date not null,
  ends_on date,                -- null for permanent
  probation_months integer,
  status text not null default 'draft'
    check (status in ('draft', 'pending_signature', 'signed', 'active', 'expired', 'terminated')),
  document_path text,          -- Supabase Storage object path
  signed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index employee_contracts_expiry_idx
  on public.employee_contracts (tenant_id, ends_on) where ends_on is not null;

create table public.employee_bank_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  payment_method public.payment_method not null default 'bank',
  bank_name text,
  bank_branch text,
  account_name text,
  account_number text,
  mobile_money_provider text,  -- M-Pesa, Tigo Pesa, Airtel Money, Halopesa
  mobile_money_number text,
  is_primary boolean not null default true,
  -- split payments (blueprint §4.11): percentage of net pay to this account
  split_percentage numeric(5, 2) not null default 100,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.employee_dependants (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  full_name text not null,
  relationship text not null,
  date_of_birth date,
  is_emergency_contact boolean not null default false,
  phone text,
  created_at timestamptz not null default now()
);

-- Every employment change flows through an action (blueprint §2.6); approved
-- actions generate the effective-dated rows above and can generate letters.
create table public.employment_actions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  action_type public.employment_action_type not null,
  status public.action_status not null default 'draft',
  effective_date date not null,
  details jsonb not null default '{}'::jsonb,  -- proposed changes, typed per action_type
  reason text,
  requested_by uuid references auth.users(id),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  letter_document_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index employment_actions_pending_idx
  on public.employment_actions (tenant_id, status) where status = 'pending_approval';

alter table public.employee_assignments
  add constraint employee_assignments_action_fk
  foreign key (created_by_action_id) references public.employment_actions(id);
alter table public.employee_compensation
  add constraint employee_compensation_action_fk
  foreign key (created_by_action_id) references public.employment_actions(id);

create trigger set_updated_at before update on public.employees
  for each row execute function app.set_updated_at();
create trigger set_updated_at before update on public.employee_contracts
  for each row execute function app.set_updated_at();
create trigger set_updated_at before update on public.employee_bank_accounts
  for each row execute function app.set_updated_at();
create trigger set_updated_at before update on public.employment_actions
  for each row execute function app.set_updated_at();

-- ── RLS ─────────────────────────────────────────────────────────────────
-- Two layers: tenant isolation here (hard boundary), fine-grained permission
-- checks (HR vs manager vs self) in the application/API layer on top.
-- Employees additionally get read access to their own record via user_id.
do $$
declare
  t text;
begin
  foreach t in array array[
    'employees', 'employee_assignments', 'employee_compensation',
    'employee_contracts', 'employee_bank_accounts', 'employee_dependants',
    'employment_actions'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy tenant_isolation on public.%I for all
         using (tenant_id in (select app.user_tenant_ids()))
         with check (tenant_id in (select app.user_tenant_ids()))', t);
  end loop;
end;
$$;

create policy employee_self_read on public.employees
  for select using (user_id = auth.uid());
