-- 0016: Employee portal invites (reshaped Sprint 10) + statutory filing
-- tracker (Sprint 12, blueprint §5.5) + tenant HR WhatsApp contact.

-- ── Employee invites: one-time links that create portal accounts ────────
create table public.employee_invites (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  token text not null unique,
  created_by uuid references auth.users(id),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_user_id uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index employee_invites_open_idx
  on public.employee_invites (tenant_id, employee_id) where accepted_at is null;

alter table public.employee_invites enable row level security;
-- HR manages invites; acceptance happens through the service role on the
-- public invite page (no session yet), so no anon policies are needed.
create policy invites_manage on public.employee_invites for all using (
  tenant_id in (select app.user_tenant_ids())
  and app.user_has_permission(tenant_id, 'people.employee.write')
) with check (
  tenant_id in (select app.user_tenant_ids())
  and app.user_has_permission(tenant_id, 'people.employee.write')
);

-- Optional HR WhatsApp number for the Huduma "contact HR" handoff.
alter table public.tenants add column if not exists hr_whatsapp_number text;

-- ── Statutory filing tracker ────────────────────────────────────────────
create table public.statutory_filings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  legal_entity_id uuid not null references public.legal_entities(id),
  payroll_run_id uuid references public.payroll_runs(id),
  filing_type text not null check (filing_type in ('paye', 'nssf', 'sdl', 'wcf')),
  period_year integer not null,
  period_month integer not null check (period_month between 1 and 12),
  due_date date not null,
  amount numeric(14, 2) not null default 0,
  status text not null default 'pending' check (status in ('pending', 'filed', 'paid')),
  payment_reference text,
  filed_at timestamptz,
  paid_at timestamptz,
  responsible_user_id uuid references auth.users(id),
  notes text,
  created_at timestamptz not null default now(),
  unique (tenant_id, legal_entity_id, filing_type, period_year, period_month)
);
create index statutory_filings_due_idx
  on public.statutory_filings (tenant_id, due_date) where status = 'pending';

alter table public.statutory_filings enable row level security;
create policy filings_read on public.statutory_filings for select using (
  tenant_id in (select app.user_tenant_ids())
  and (
    app.user_has_permission(tenant_id, 'compliance.filing.manage')
    or app.user_has_permission(tenant_id, 'compliance.dashboard.read')
  )
);
create policy filings_write on public.statutory_filings for insert with check (
  tenant_id in (select app.user_tenant_ids())
  and app.user_has_permission(tenant_id, 'compliance.filing.manage')
);
create policy filings_update on public.statutory_filings for update using (
  tenant_id in (select app.user_tenant_ids())
  and app.user_has_permission(tenant_id, 'compliance.filing.manage')
);
