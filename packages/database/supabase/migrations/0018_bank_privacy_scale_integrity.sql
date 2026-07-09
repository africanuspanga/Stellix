-- 0018: Close the remaining privacy gap on bank details, add the platform-wide
-- scale index, and enforce effective-dated integrity.
--
-- Migration 0014 made salary (employee_compensation) and payroll runs
-- permission-aware, but employee_bank_accounts was left on the original
-- membership-only policy from 0004 — so any tenant member could read every
-- colleague's bank / mobile-money number straight through PostgREST with their
-- own JWT, bypassing the app-layer checks. Bank details are as sensitive as
-- salary (non-negotiable #9); this brings them to parity with 0014.
--
-- Also adds tenant_users(user_id) — hit by app.user_tenant_ids() on every RLS
-- check for every request — and effective-dated "one current row" guards.
--
-- Reuses the helpers defined in 0014 (app.user_has_permission, app.my_employee_ids).
-- Idempotent: safe to re-run. Apply after 0001–0017.

-- ── Bank-account privacy: HR/payroll staff or the employee themself ──────
drop policy if exists tenant_isolation on public.employee_bank_accounts;
drop policy if exists bank_select on public.employee_bank_accounts;
drop policy if exists bank_insert on public.employee_bank_accounts;
drop policy if exists bank_update on public.employee_bank_accounts;
drop policy if exists bank_delete on public.employee_bank_accounts;

create policy bank_select on public.employee_bank_accounts for select using (
  tenant_id in (select app.user_tenant_ids())
  and (
    app.user_has_permission(tenant_id, 'people.employee.read')
    or app.user_has_permission(tenant_id, 'people.employee.write')
    or app.user_has_permission(tenant_id, 'payroll.run.read')
    or employee_id in (select app.my_employee_ids())
  )
);
create policy bank_insert on public.employee_bank_accounts for insert with check (
  tenant_id in (select app.user_tenant_ids())
  and app.user_has_permission(tenant_id, 'people.employee.write')
);
create policy bank_update on public.employee_bank_accounts for update using (
  tenant_id in (select app.user_tenant_ids())
  and app.user_has_permission(tenant_id, 'people.employee.write')
) with check (
  tenant_id in (select app.user_tenant_ids())
  and app.user_has_permission(tenant_id, 'people.employee.write')
);
create policy bank_delete on public.employee_bank_accounts for delete using (
  tenant_id in (select app.user_tenant_ids())
  and app.user_has_permission(tenant_id, 'people.employee.write')
);

-- ── Audit trail: no actor forgery ───────────────────────────────────────
-- The 0002 insert policy checked tenant membership only, so a member could
-- POST an audit row with an arbitrary actor_user_id via PostgREST and pollute
-- the immutable trail (non-negotiable #6). Pin the actor to the caller; the
-- service-role provisioning path bypasses RLS and is unaffected.
drop policy if exists audit_logs_member_insert on public.audit_logs;
create policy audit_logs_member_insert on public.audit_logs for insert with check (
  tenant_id in (select app.user_tenant_ids())
  and (actor_user_id = auth.uid() or actor_user_id is null)
);

-- ── Scale indexes ───────────────────────────────────────────────────────
-- app.user_tenant_ids() runs on every RLS check for every request; without a
-- user_id index this seq-scans tenant_users on every query platform-wide.
create index if not exists tenant_users_user_active_idx
  on public.tenant_users (user_id) where is_active;

-- Foreign-key indexes on employee child tables — joins and tenant-cascade
-- deletes (dropping a tenant walks every child) otherwise do O(n) scans.
create index if not exists employee_bank_accounts_employee_idx on public.employee_bank_accounts (employee_id);
create index if not exists employee_dependants_employee_idx on public.employee_dependants (employee_id);
create index if not exists employee_assignments_employee_idx on public.employee_assignments (employee_id);
create index if not exists employee_contracts_employee_idx on public.employee_contracts (employee_id);
create index if not exists employment_actions_employee_idx on public.employment_actions (employee_id);
create index if not exists user_roles_role_idx on public.user_roles (role_id);
create index if not exists role_permissions_key_idx on public.role_permissions (permission_key);

-- ── Integrity: exactly one open (current) row / primary account ──────────
-- Effective-dated history must have one open row per employee, or "current
-- salary/position" is ambiguous. The app closes the prior row before inserting
-- the new one, so this also guards against a concurrent double-insert.
-- Guarded so pre-existing data can't fail the whole migration; if it can't be
-- created, the flow is unchanged and a NOTICE is emitted.
do $$ begin
  create unique index employee_compensation_one_current
    on public.employee_compensation (employee_id) where effective_to is null;
exception when duplicate_table then null;
  when others then raise notice 'employee_compensation_one_current not created: %', sqlerrm;
end $$;

do $$ begin
  create unique index employee_assignments_one_current
    on public.employee_assignments (employee_id) where effective_to is null;
exception when duplicate_table then null;
  when others then raise notice 'employee_assignments_one_current not created: %', sqlerrm;
end $$;

do $$ begin
  create unique index employee_bank_accounts_one_primary
    on public.employee_bank_accounts (employee_id) where is_primary;
exception when duplicate_table then null;
  when others then raise notice 'employee_bank_accounts_one_primary not created: %', sqlerrm;
end $$;

-- Split-payment percentages must be a real percentage.
do $$ begin
  alter table public.employee_bank_accounts
    add constraint employee_bank_split_pct_ck
    check (split_percentage >= 0 and split_percentage <= 100);
exception when duplicate_object then null;
  when others then raise notice 'employee_bank_split_pct_ck not added: %', sqlerrm;
end $$;
