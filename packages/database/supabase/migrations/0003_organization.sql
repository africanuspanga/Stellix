-- 0003: Organization structure — branches, departments, cost centres,
-- projects, work sites, job architecture, positions.
-- Positions exist independently of employees (blueprint §2.1).

create type public.position_status as enum
  ('approved', 'budgeted', 'vacant', 'occupied', 'frozen', 'abolished');

create table public.branches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  legal_entity_id uuid not null references public.legal_entities(id) on delete cascade,
  name text not null,
  code text,
  region text,
  address text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, legal_entity_id, name)
);

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  legal_entity_id uuid references public.legal_entities(id) on delete cascade,
  parent_department_id uuid references public.departments(id),
  name text not null,
  code text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.cost_centres (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  legal_entity_id uuid references public.legal_entities(id) on delete cascade,
  name text not null,
  code text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, code)
);

create table public.org_projects (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  code text,
  client_name text,
  starts_on date,
  ends_on date,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.work_sites (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid references public.branches(id),
  name text not null,
  -- geofence for mobile check-in (Sprint 6)
  latitude numeric(9, 6),
  longitude numeric(9, 6),
  geofence_radius_m integer,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.job_families (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  unique (tenant_id, name)
);

create table public.job_grades (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  job_family_id uuid references public.job_families(id),
  name text not null,
  level integer,
  -- salary band
  band_min numeric(14, 2),
  band_max numeric(14, 2),
  currency text not null default 'TZS',
  created_at timestamptz not null default now(),
  unique (tenant_id, name)
);

create table public.positions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  legal_entity_id uuid not null references public.legal_entities(id) on delete cascade,
  department_id uuid references public.departments(id),
  branch_id uuid references public.branches(id),
  job_grade_id uuid references public.job_grades(id),
  reports_to_position_id uuid references public.positions(id),
  code text not null,
  title text not null,
  status public.position_status not null default 'approved',
  is_budgeted boolean not null default false,
  budgeted_annual_cost numeric(14, 2),
  headcount integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, code)
);

create trigger set_updated_at before update on public.branches
  for each row execute function app.set_updated_at();
create trigger set_updated_at before update on public.departments
  for each row execute function app.set_updated_at();
create trigger set_updated_at before update on public.positions
  for each row execute function app.set_updated_at();

-- ── RLS: uniform tenant isolation ───────────────────────────────────────
do $$
declare
  t text;
begin
  foreach t in array array[
    'branches', 'departments', 'cost_centres', 'org_projects',
    'work_sites', 'job_families', 'job_grades', 'positions'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy tenant_isolation on public.%I for all
         using (tenant_id in (select app.user_tenant_ids()))
         with check (tenant_id in (select app.user_tenant_ids()))', t);
  end loop;
end;
$$;
