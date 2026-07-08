-- 0008: Onboarding templates & tasks, probation reviews, import centre.

-- ── Onboarding ──────────────────────────────────────────────────────────
create table public.onboarding_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, name)
);

create table public.onboarding_template_tasks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  template_id uuid not null references public.onboarding_templates(id) on delete cascade,
  title text not null,
  description text,
  assignee_role text not null default 'hr' check (assignee_role in (
    'employee', 'hr', 'manager', 'payroll', 'it', 'finance', 'security', 'facilities', 'safety'
  )),
  due_days_after_start integer not null default 0,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- Task instances created when a template is assigned to an employee.
create table public.employee_onboarding_tasks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  template_id uuid references public.onboarding_templates(id),
  title text not null,
  description text,
  assignee_role text not null default 'hr',
  due_date date,
  status text not null default 'pending' check (status in ('pending', 'completed', 'skipped')),
  completed_by uuid references auth.users(id),
  completed_at timestamptz,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index employee_onboarding_tasks_open_idx
  on public.employee_onboarding_tasks (tenant_id, status) where status = 'pending';

-- ── Probation reviews ───────────────────────────────────────────────────
create table public.probation_reviews (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  review_date date not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'completed', 'cancelled')),
  manager_feedback text,
  employee_feedback text,
  recommendation text check (recommendation in ('confirm', 'extend', 'terminate')),
  new_probation_end_date date,
  completed_by uuid references auth.users(id),
  completed_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index probation_reviews_due_idx
  on public.probation_reviews (tenant_id, review_date) where status = 'scheduled';

-- ── Import centre ───────────────────────────────────────────────────────
create table public.imports (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  import_type text not null default 'employees' check (import_type in ('employees')),
  file_name text not null,
  status text not null default 'uploaded' check (status in (
    'uploaded', 'validated', 'imported', 'failed'
  )),
  headers jsonb not null default '[]'::jsonb,   -- detected column headers
  rows jsonb not null default '[]'::jsonb,      -- raw parsed rows (capped)
  mapping jsonb not null default '{}'::jsonb,   -- target field -> source column index
  errors jsonb not null default '[]'::jsonb,    -- [{row, message}]
  total_rows integer not null default 0,
  valid_rows integer not null default 0,
  summary jsonb,                                -- result of the import run
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  imported_at timestamptz
);

-- ── RLS ─────────────────────────────────────────────────────────────────
do $$
declare
  t text;
begin
  foreach t in array array[
    'onboarding_templates', 'onboarding_template_tasks',
    'employee_onboarding_tasks', 'probation_reviews', 'imports'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy tenant_isolation on public.%I for all
         using (tenant_id in (select app.user_tenant_ids()))
         with check (tenant_id in (select app.user_tenant_ids()))', t);
  end loop;
end;
$$;
