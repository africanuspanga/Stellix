-- 0020: Platform-owner (SaaS operator) identity and the cross-tenant
-- operational console.
--
-- The platform owner runs Stellix itself and needs to see the whole business:
-- every tenant, its plan/status, headcount, active users, and payroll volume —
-- WITHOUT reading individual customer PII (salaries, bank details, national
-- IDs). So owners get cross-tenant read on tenant *metadata* and partners, plus
-- SECURITY DEFINER aggregate functions that compute counts/sums across tenants
-- but never return a personal record.
--
-- Idempotent: safe to re-run. Apply after 0001–0019.

create table if not exists public.platform_owners (
  user_id uuid primary key references auth.users(id) on delete cascade,
  note text,
  created_at timestamptz not null default now()
);

alter table public.platform_owners enable row level security;

-- An owner can confirm their own membership; the list is otherwise managed by
-- the service role (no self-insert — you cannot make yourself an owner).
drop policy if exists platform_owners_self_read on public.platform_owners;
create policy platform_owners_self_read on public.platform_owners for select using (
  user_id = auth.uid()
);

create or replace function app.is_platform_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.platform_owners where user_id = auth.uid())
$$;
grant execute on function app.is_platform_owner() to authenticated, service_role;
comment on function app.is_platform_owner() is
  'True when auth.uid() is a Stellix platform owner (SaaS operator).';

-- Cross-tenant metadata read for owners (added alongside the existing
-- member-scoped policies; both are OR-ed for SELECT).
drop policy if exists tenants_platform_owner_read on public.tenants;
create policy tenants_platform_owner_read on public.tenants for select using (
  app.is_platform_owner()
);

drop policy if exists partners_platform_owner_all on public.partners;
create policy partners_platform_owner_all on public.partners for all
  using (app.is_platform_owner())
  with check (app.is_platform_owner());

-- ── Per-tenant operational stats (aggregates only, no PII) ───────────────
create or replace function app.platform_tenant_stats()
returns table (
  tenant_id uuid,
  name text,
  slug text,
  plan text,
  status text,
  created_at timestamptz,
  employee_count bigint,
  user_count bigint,
  payroll_net_this_month numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    t.id, t.name, t.slug, t.plan::text, t.status::text, t.created_at,
    (select count(*) from public.employees e
       where e.tenant_id = t.id and e.status <> 'exited'),
    (select count(*) from public.tenant_users tu
       where tu.tenant_id = t.id and tu.is_active),
    coalesce((
      select sum((pr.totals->>'net')::numeric)
      from public.payroll_runs pr
      where pr.tenant_id = t.id
        and pr.status in ('approved', 'paid', 'closed')
        and pr.period_year = extract(year from now())::int
        and pr.period_month = extract(month from now())::int
    ), 0)
  from public.tenants t
  where app.is_platform_owner()      -- empty result for non-owners
  order by t.created_at desc
$$;
grant execute on function app.platform_tenant_stats() to authenticated;

-- ── Platform-wide summary (one row of headline numbers) ─────────────────
create or replace function app.platform_summary()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select case when not app.is_platform_owner() then null else (
    select json_build_object(
      'tenants', (select count(*) from public.tenants),
      'active_tenants', (select count(*) from public.tenants where status = 'active'),
      'trial_tenants', (select count(*) from public.tenants where status = 'trial'),
      'employees', (select count(*) from public.employees where status <> 'exited'),
      'users', (select count(*) from public.tenant_users where is_active),
      'new_tenants_30d', (select count(*) from public.tenants where created_at >= now() - interval '30 days'),
      'payroll_net_this_month', coalesce((
        select sum((totals->>'net')::numeric) from public.payroll_runs
        where status in ('approved','paid','closed')
          and period_year = extract(year from now())::int
          and period_month = extract(month from now())::int), 0),
      'ai_interactions_30d', (select count(*) from public.ai_audit where created_at >= now() - interval '30 days'),
      'agent_actions_30d', (select count(*) from public.agent_actions where created_at >= now() - interval '30 days')
    )
  ) end
$$;
grant execute on function app.platform_summary() to authenticated;

-- ── Seed the founding owner ─────────────────────────────────────────────
-- Seeds only if that account already exists in auth.users; otherwise the owner
-- signs up first, then this line is re-run (the migration is idempotent).
insert into public.platform_owners (user_id, note)
select id, 'Founding owner' from auth.users where email = 'africanuspanga@gmail.com'
on conflict (user_id) do nothing;
