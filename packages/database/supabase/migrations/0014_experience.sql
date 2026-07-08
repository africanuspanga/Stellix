-- 0014: Employee Experience — permission-aware RLS (payslip/salary privacy),
-- in-app notifications, and the HR service desk (blueprint §6).

-- ── Permission checks inside RLS ────────────────────────────────────────
create or replace function app.user_has_permission(t uuid, perm text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.role_permissions rp on rp.role_id = ur.role_id
    where ur.tenant_id = t
      and ur.user_id = auth.uid()
      and rp.permission_key = perm
  )
$$;

create or replace function app.my_employee_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.employees where user_id = auth.uid()
$$;

-- ── Payroll privacy: lines readable by payroll staff or the employee ────
drop policy tenant_isolation on public.payroll_run_lines;
create policy lines_select on public.payroll_run_lines for select using (
  tenant_id in (select app.user_tenant_ids())
  and (
    app.user_has_permission(tenant_id, 'payroll.run.read')
    or employee_id in (select app.my_employee_ids())
  )
);
create policy lines_insert on public.payroll_run_lines for insert with check (
  tenant_id in (select app.user_tenant_ids())
  and app.user_has_permission(tenant_id, 'payroll.run.prepare')
);
create policy lines_update on public.payroll_run_lines for update using (
  tenant_id in (select app.user_tenant_ids())
  and app.user_has_permission(tenant_id, 'payroll.run.prepare')
);
create policy lines_delete on public.payroll_run_lines for delete using (
  tenant_id in (select app.user_tenant_ids())
  and app.user_has_permission(tenant_id, 'payroll.run.prepare')
);

-- Runs: payroll staff only (employees use the payslip metadata view below).
drop policy tenant_isolation on public.payroll_runs;
create policy runs_select on public.payroll_runs for select using (
  tenant_id in (select app.user_tenant_ids())
  and app.user_has_permission(tenant_id, 'payroll.run.read')
);
create policy runs_insert on public.payroll_runs for insert with check (
  tenant_id in (select app.user_tenant_ids())
  and app.user_has_permission(tenant_id, 'payroll.run.prepare')
);
create policy runs_update on public.payroll_runs for update using (
  tenant_id in (select app.user_tenant_ids())
  and (
    app.user_has_permission(tenant_id, 'payroll.run.prepare')
    or app.user_has_permission(tenant_id, 'payroll.run.approve')
    or app.user_has_permission(tenant_id, 'payroll.payment.release')
  )
);
create policy runs_delete on public.payroll_runs for delete using (
  tenant_id in (select app.user_tenant_ids())
  and app.user_has_permission(tenant_id, 'payroll.run.prepare')
);

drop policy tenant_isolation on public.payroll_run_inputs;
create policy inputs_all on public.payroll_run_inputs for all using (
  tenant_id in (select app.user_tenant_ids())
  and app.user_has_permission(tenant_id, 'payroll.run.prepare')
) with check (
  tenant_id in (select app.user_tenant_ids())
  and app.user_has_permission(tenant_id, 'payroll.run.prepare')
);

-- Salary privacy: HR/payroll staff or the employee themself.
drop policy tenant_isolation on public.employee_compensation;
create policy compensation_select on public.employee_compensation for select using (
  tenant_id in (select app.user_tenant_ids())
  and (
    app.user_has_permission(tenant_id, 'people.employee.read')
    or app.user_has_permission(tenant_id, 'payroll.run.read')
    or employee_id in (select app.my_employee_ids())
  )
);
create policy compensation_write on public.employee_compensation for insert with check (
  tenant_id in (select app.user_tenant_ids())
  and app.user_has_permission(tenant_id, 'people.employee.write')
);
create policy compensation_update on public.employee_compensation for update using (
  tenant_id in (select app.user_tenant_ids())
  and app.user_has_permission(tenant_id, 'people.employee.write')
);

-- Payslip metadata for self-service: limited columns, membership-filtered.
-- (Owner-rights view: bypasses the runs policy deliberately; exposes no totals.)
create view public.payslip_run_meta as
select r.id, r.tenant_id, r.period_year, r.period_month, r.status,
       le.name as entity_name
from public.payroll_runs r
join public.legal_entities le on le.id = r.legal_entity_id
where r.tenant_id in (select app.user_tenant_ids());

-- ── Notifications (in-app; email hook point for SMTP/edge function) ─────
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null default 'general',
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_unread_idx
  on public.notifications (user_id, created_at desc) where read_at is null;

alter table public.notifications enable row level security;
create policy notifications_own_select on public.notifications for select using (
  user_id = auth.uid()
);
create policy notifications_insert on public.notifications for insert with check (
  tenant_id in (select app.user_tenant_ids())
);
create policy notifications_own_update on public.notifications for update using (
  user_id = auth.uid()
);

-- ── HR service desk ─────────────────────────────────────────────────────
create table public.service_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  employee_id uuid references public.employees(id),
  opened_by uuid not null references auth.users(id),
  category text not null default 'other' check (category in (
    'payslip_issue', 'leave_dispute', 'bank_change', 'letter_request',
    'contract_question', 'benefit_enquiry', 'complaint', 'other'
  )),
  subject text not null,
  description text,
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved', 'closed')),
  confidential boolean not null default false,
  assigned_to uuid references auth.users(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index service_requests_open_idx
  on public.service_requests (tenant_id, status) where status in ('open', 'in_progress');

create table public.service_request_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  request_id uuid not null references public.service_requests(id) on delete cascade,
  author_user_id uuid not null references auth.users(id),
  body text not null,
  is_internal boolean not null default false,  -- agent-only notes
  created_at timestamptz not null default now()
);

alter table public.service_requests enable row level security;
alter table public.service_request_messages enable row level security;

-- Requests: the opener or desk agents.
create policy requests_select on public.service_requests for select using (
  tenant_id in (select app.user_tenant_ids())
  and (opened_by = auth.uid() or app.user_has_permission(tenant_id, 'experience.desk.agent'))
);
create policy requests_insert on public.service_requests for insert with check (
  tenant_id in (select app.user_tenant_ids()) and opened_by = auth.uid()
);
create policy requests_update on public.service_requests for update using (
  tenant_id in (select app.user_tenant_ids())
  and app.user_has_permission(tenant_id, 'experience.desk.agent')
);

-- Messages: participants; internal notes visible to agents only.
create policy messages_select on public.service_request_messages for select using (
  tenant_id in (select app.user_tenant_ids())
  and (
    app.user_has_permission(tenant_id, 'experience.desk.agent')
    or (
      not is_internal
      and request_id in (select id from public.service_requests where opened_by = auth.uid())
    )
  )
);
create policy messages_insert on public.service_request_messages for insert with check (
  tenant_id in (select app.user_tenant_ids())
  and author_user_id = auth.uid()
  and (
    app.user_has_permission(tenant_id, 'experience.desk.agent')
    or request_id in (select id from public.service_requests where opened_by = auth.uid())
  )
);
