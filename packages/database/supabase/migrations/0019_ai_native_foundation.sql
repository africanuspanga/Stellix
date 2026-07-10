-- 0019: AI-native foundation — the event spine, the agent trust ladder, and
-- the agent action ledger.
--
-- Stellix is architected for two user classes: humans and AI agents, both
-- passing through the same doors. Three commitments (docs/AI-NATIVE.md):
--   1. Every business operation is a named, described, permission-checked
--      tool (the registry lives in apps/web/src/lib/tools/).
--   2. The agent is a permissioned user: it acts ON BEHALF OF a human and can
--      never do more than that human. Human-only permissions (payroll
--      approval, payment release) are structurally unreachable for agents.
--   3. Every meaningful change emits a domain event; ambient agents subscribe
--      to the stream instead of being prompted.
--
-- Idempotent: safe to re-run. Apply after 0001–0018.

-- ── The agent action ledger ─────────────────────────────────────────────
-- Every tool call an agent makes (or proposes) is recorded here BEFORE it is
-- visible anywhere else: what was asked, which tool, with what input, at what
-- risk level, who it acted for, who approved, what came back.
create table if not exists public.agent_actions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  -- The human principal the agent acts for. Permissions are THEIRS.
  on_behalf_of uuid not null references auth.users(id),
  agent text not null default 'stellix_assistant',
  tool_name text not null,
  input jsonb not null default '{}'::jsonb,
  output jsonb,
  risk_level integer not null check (risk_level between 0 and 3),
  -- executed: ran immediately (within autonomy policy)
  -- proposed:  awaiting the human's confirmation (trust ladder level 2)
  -- approved/rejected: the human's decision on a proposal
  -- failed: handler error (recorded, never silent)
  status text not null default 'executed' check (status in (
    'executed', 'proposed', 'approved', 'rejected', 'failed'
  )),
  error text,
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  executed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists agent_actions_tenant_idx
  on public.agent_actions (tenant_id, created_at desc);
create index if not exists agent_actions_pending_idx
  on public.agent_actions (tenant_id, status) where status = 'proposed';

alter table public.agent_actions enable row level security;

drop policy if exists agent_actions_select on public.agent_actions;
create policy agent_actions_select on public.agent_actions for select using (
  tenant_id in (select app.user_tenant_ids())
  and (on_behalf_of = auth.uid() or app.user_has_permission(tenant_id, 'settings.tenant.manage'))
);
-- The agent runs inside the principal's session, so inserts are pinned to the
-- caller — an agent cannot claim to act for someone else.
drop policy if exists agent_actions_insert on public.agent_actions;
create policy agent_actions_insert on public.agent_actions for insert with check (
  tenant_id in (select app.user_tenant_ids()) and on_behalf_of = auth.uid()
);
-- Approving/rejecting a proposal = the principal deciding on their own
-- agent's work; executing it then re-runs executeTool under THEIR permissions.
drop policy if exists agent_actions_update on public.agent_actions;
create policy agent_actions_update on public.agent_actions for update using (
  tenant_id in (select app.user_tenant_ids()) and on_behalf_of = auth.uid()
) with check (
  tenant_id in (select app.user_tenant_ids()) and on_behalf_of = auth.uid()
);

-- ── The event spine ─────────────────────────────────────────────────────
-- Every meaningful change publishes a fact: 'leave.requested',
-- 'payroll.run.approved', 'employee.hired'. Ambient agents are standing
-- subscribers with infinite attention; processed_at is their checkpoint.
create table if not exists public.domain_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  event_type text not null,
  entity_type text not null,
  entity_id uuid,
  actor_user_id uuid references auth.users(id),
  agent_action_id uuid references public.agent_actions(id),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);
create index if not exists domain_events_tenant_type_idx
  on public.domain_events (tenant_id, event_type, created_at desc);
create index if not exists domain_events_unprocessed_idx
  on public.domain_events (created_at) where processed_at is null;

alter table public.domain_events enable row level security;

drop policy if exists domain_events_select on public.domain_events;
create policy domain_events_select on public.domain_events for select using (
  tenant_id in (select app.user_tenant_ids())
);
drop policy if exists domain_events_insert on public.domain_events;
create policy domain_events_insert on public.domain_events for insert with check (
  tenant_id in (select app.user_tenant_ids())
  and (actor_user_id = auth.uid() or actor_user_id is null)
);
-- No member update/delete policies: events are immutable facts. The ambient
-- dispatcher (service role) marks processed_at.

-- ── The trust ladder ────────────────────────────────────────────────────
-- Autonomy is granted per tool per tenant, the way you would delegate to a
-- new employee: 0 disabled, 1 read/draft, 2 propose (human confirms each),
-- 3 bounded autonomy (execute within policy). Tools flagged human-only in the
-- registry (anything moving money) ignore this table entirely — an agent can
-- never execute them at any level.
create table if not exists public.ai_autonomy_policies (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  tool_name text not null,
  level integer not null check (level between 0 and 3),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, tool_name)
);

alter table public.ai_autonomy_policies enable row level security;

drop policy if exists ai_autonomy_read on public.ai_autonomy_policies;
create policy ai_autonomy_read on public.ai_autonomy_policies for select using (
  tenant_id in (select app.user_tenant_ids())
);
drop policy if exists ai_autonomy_write on public.ai_autonomy_policies;
create policy ai_autonomy_write on public.ai_autonomy_policies for all using (
  tenant_id in (select app.user_tenant_ids())
  and app.user_has_permission(tenant_id, 'settings.tenant.manage')
) with check (
  tenant_id in (select app.user_tenant_ids())
  and app.user_has_permission(tenant_id, 'settings.tenant.manage')
);

-- ── ai_audit: admit the tool-calling agent ──────────────────────────────
do $$ begin
  alter table public.ai_audit drop constraint if exists ai_audit_assistant_check;
  alter table public.ai_audit add constraint ai_audit_assistant_check
    check (assistant in ('policy_qa', 'payslip_explainer', 'anomaly_summary', 'agent'));
exception when others then
  raise notice 'ai_audit assistant constraint not updated: %', sqlerrm;
end $$;
