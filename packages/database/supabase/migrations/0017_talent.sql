-- 0017: Talent — recruitment pipeline (§2.3), performance (§2.8) and
-- offboarding (§2.11).

-- ── Recruitment ─────────────────────────────────────────────────────────
create table public.job_requisitions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  position_id uuid references public.positions(id),
  title text not null,
  description text,
  openings integer not null default 1 check (openings >= 1),
  status text not null default 'open' check (status in ('draft', 'open', 'on_hold', 'filled', 'closed')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.candidates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  requisition_id uuid not null references public.job_requisitions(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  email text,
  phone text,
  source text not null default 'direct' check (source in (
    'direct', 'referral', 'job_board', 'agency', 'internal', 'other'
  )),
  stage text not null default 'applied' check (stage in (
    'applied', 'screening', 'shortlisted', 'assessment', 'interview',
    'reference_check', 'offer', 'hired', 'rejected'
  )),
  notes text,
  hired_employee_id uuid references public.employees(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index candidates_pipeline_idx on public.candidates (tenant_id, requisition_id, stage);
create trigger set_updated_at before update on public.candidates
  for each row execute function app.set_updated_at();

-- ── Performance ─────────────────────────────────────────────────────────
create table public.performance_cycles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  starts_on date not null,
  ends_on date not null,
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now(),
  unique (tenant_id, name),
  check (ends_on >= starts_on)
);

create table public.performance_goals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  cycle_id uuid not null references public.performance_cycles(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  title text not null,
  description text,
  weight integer not null default 25 check (weight between 1 and 100),
  status text not null default 'on_track' check (status in (
    'on_track', 'at_risk', 'achieved', 'missed'
  )),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger set_updated_at before update on public.performance_goals
  for each row execute function app.set_updated_at();

create table public.performance_reviews (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  cycle_id uuid not null references public.performance_cycles(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  reviewer_user_id uuid not null references auth.users(id),
  review_type text not null check (review_type in ('self', 'manager')),
  rating integer check (rating between 1 and 5),
  strengths text,
  improvements text,
  status text not null default 'submitted' check (status in ('draft', 'submitted')),
  created_at timestamptz not null default now(),
  unique (cycle_id, employee_id, review_type)
);

-- ── Offboarding ─────────────────────────────────────────────────────────
create table public.offboarding_cases (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  exit_type text not null check (exit_type in (
    'resignation', 'retirement', 'end_of_contract', 'redundancy', 'dismissal',
    'death', 'medical_separation', 'mutual_separation', 'abandonment', 'transfer'
  )),
  notice_date date not null,
  last_working_day date not null,
  reason text,
  status text not null default 'initiated' check (status in (
    'initiated', 'clearance', 'final_pay', 'closed', 'cancelled'
  )),
  initiated_by uuid references auth.users(id),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  check (last_working_day >= notice_date)
);
create index offboarding_open_idx
  on public.offboarding_cases (tenant_id, status) where status not in ('closed', 'cancelled');

create table public.offboarding_tasks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  case_id uuid not null references public.offboarding_cases(id) on delete cascade,
  title text not null,
  assignee_role text not null default 'hr',
  status text not null default 'pending' check (status in ('pending', 'completed', 'skipped')),
  completed_by uuid references auth.users(id),
  completed_at timestamptz,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- ── RLS ─────────────────────────────────────────────────────────────────
do $$
declare
  t text;
begin
  foreach t in array array[
    'job_requisitions', 'candidates', 'performance_cycles',
    'performance_goals', 'performance_reviews', 'offboarding_cases',
    'offboarding_tasks'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy tenant_isolation on public.%I for all
         using (tenant_id in (select app.user_tenant_ids()))
         with check (tenant_id in (select app.user_tenant_ids()))', t);
  end loop;
end;
$$;
