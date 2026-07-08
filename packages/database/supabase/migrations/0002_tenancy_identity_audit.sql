-- 0002: Multi-tenancy hierarchy, roles/permissions, audit log
-- Hierarchy: platform owner (service role) → partner → tenant → legal entity

create type public.tenant_plan as enum ('starter', 'growth', 'enterprise', 'managed_payroll');
create type public.tenant_status as enum ('trial', 'active', 'suspended', 'cancelled');

-- HR outsourcing / managed-payroll partners. Managed by platform owner
-- (service role) for now; partner-console policies land with the partner portal.
create table public.partners (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_email text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid references public.partners(id),
  name text not null,
  slug text not null unique,
  plan public.tenant_plan not null default 'starter',
  status public.tenant_status not null default 'trial',
  default_locale text not null default 'en' check (default_locale in ('en', 'sw')),
  timezone text not null default 'Africa/Dar_es_Salaam',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.legal_entities (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  registration_number text,
  tin text,
  jurisdiction text not null default 'tz_mainland'
    check (jurisdiction in ('tz_mainland', 'tz_zanzibar')),
  sector text not null default 'private' check (sector in ('private', 'public')),
  address text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tenant_users (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);

-- Global permission catalogue (seeded, not tenant-editable).
create table public.permissions (
  key text primary key,               -- e.g. 'people.employee.read'
  pillar text not null,               -- people | time | payroll | compliance | experience | ai
  description text not null,
  is_sensitive boolean not null default false  -- employee-relations, payroll approval, etc.
);

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  description text,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  unique (tenant_id, name)
);

create table public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_key text not null references public.permissions(key) on delete cascade,
  primary key (role_id, permission_key)
);

create table public.user_roles (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete cascade,
  primary key (tenant_id, user_id, role_id)
);

-- Immutable audit trail: insert-only, no update/delete policies ever.
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  actor_user_id uuid references auth.users(id),
  action text not null,               -- e.g. 'employee.updated', 'leave.approved'
  entity_type text not null,
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  reason text,
  created_at timestamptz not null default now()
);
create index audit_logs_tenant_entity_idx on public.audit_logs (tenant_id, entity_type, entity_id);
create index audit_logs_tenant_created_idx on public.audit_logs (tenant_id, created_at desc);

-- updated_at triggers
create trigger set_updated_at before update on public.partners
  for each row execute function app.set_updated_at();
create trigger set_updated_at before update on public.tenants
  for each row execute function app.set_updated_at();
create trigger set_updated_at before update on public.legal_entities
  for each row execute function app.set_updated_at();

-- ── Row Level Security ──────────────────────────────────────────────────
alter table public.partners enable row level security;
alter table public.tenants enable row level security;
alter table public.legal_entities enable row level security;
alter table public.tenant_users enable row level security;
alter table public.permissions enable row level security;
alter table public.roles enable row level security;
alter table public.role_permissions enable row level security;
alter table public.user_roles enable row level security;
alter table public.audit_logs enable row level security;

-- partners: no policies → platform owner (service role) only.

create policy tenants_member_read on public.tenants
  for select using (id in (select app.user_tenant_ids()));

create policy legal_entities_member on public.legal_entities
  for all
  using (tenant_id in (select app.user_tenant_ids()))
  with check (tenant_id in (select app.user_tenant_ids()));

create policy tenant_users_self_read on public.tenant_users
  for select using (user_id = auth.uid() or tenant_id in (select app.user_tenant_ids()));

create policy permissions_read on public.permissions
  for select using (auth.role() = 'authenticated');

create policy roles_member on public.roles
  for all
  using (tenant_id in (select app.user_tenant_ids()))
  with check (tenant_id in (select app.user_tenant_ids()));

create policy role_permissions_member on public.role_permissions
  for all
  using (role_id in (select id from public.roles where tenant_id in (select app.user_tenant_ids())))
  with check (role_id in (select id from public.roles where tenant_id in (select app.user_tenant_ids())));

create policy user_roles_member_read on public.user_roles
  for select using (tenant_id in (select app.user_tenant_ids()));

create policy audit_logs_member_read on public.audit_logs
  for select using (tenant_id in (select app.user_tenant_ids()));
create policy audit_logs_member_insert on public.audit_logs
  for insert with check (tenant_id in (select app.user_tenant_ids()));
