-- 0015: AI intelligence — tenant policy knowledge base and the AI audit
-- trail (blueprint §7.7/§7.8). The AI reads; it never writes HR data.

create table public.company_policies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  title text not null,
  category text not null default 'general' check (category in (
    'general', 'leave', 'attendance', 'payroll', 'conduct', 'benefits', 'safety'
  )),
  body text not null,
  is_active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger set_updated_at before update on public.company_policies
  for each row execute function app.set_updated_at();

-- Every AI interaction is recorded: who asked, which assistant, which model,
-- what data sources were consulted, and the full response.
create table public.ai_audit (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  assistant text not null check (assistant in (
    'policy_qa', 'payslip_explainer', 'anomaly_summary'
  )),
  model text not null,
  question text not null,
  sources jsonb not null default '[]'::jsonb,  -- what was retrieved for context
  response text,
  created_at timestamptz not null default now()
);
create index ai_audit_tenant_idx on public.ai_audit (tenant_id, created_at desc);

alter table public.company_policies enable row level security;
alter table public.ai_audit enable row level security;

-- Policies: all members read active policies; admins manage.
create policy policies_read on public.company_policies for select using (
  tenant_id in (select app.user_tenant_ids())
);
create policy policies_insert on public.company_policies for insert with check (
  tenant_id in (select app.user_tenant_ids())
  and app.user_has_permission(tenant_id, 'settings.tenant.manage')
);
create policy policies_update on public.company_policies for update using (
  tenant_id in (select app.user_tenant_ids())
  and app.user_has_permission(tenant_id, 'settings.tenant.manage')
);

-- AI audit: users insert/see their own; tenant admins see everything.
create policy ai_audit_insert on public.ai_audit for insert with check (
  tenant_id in (select app.user_tenant_ids()) and user_id = auth.uid()
);
create policy ai_audit_select on public.ai_audit for select using (
  tenant_id in (select app.user_tenant_ids())
  and (user_id = auth.uid() or app.user_has_permission(tenant_id, 'settings.tenant.manage'))
);
