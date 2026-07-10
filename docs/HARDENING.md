# Security, Privacy & Scale Hardening — Audit + Migration 0018

**Date:** 2026-07-10 · **Author:** Africanus Panga
**Target:** production-grade multi-tenant posture for 1,000 companies × 200+
employees each.

A full deep dive of the codebase (migrations `0001`–`0017` and `apps/web`).
The system is well-built — tenant isolation, permission-aware RLS on newer
tables, and payroll immutability are already solid. This pass closes the
remaining gaps in a single additive, idempotent migration (`0018`). No
application code was changed.

## What was audited and found sound

- **RLS is enabled on all 67 tables.** No table is missing row-level security;
  `partners` is intentionally service-role-only. No cross-tenant leak.
- **Salary & payroll privacy already enforced.** `0014` made
  `employee_compensation`, `payroll_runs`, `payroll_run_lines` and
  `payroll_run_inputs` permission-aware (HR/payroll staff or the employee).
- **Payroll immutability is trigger-guarded.** `0012`/`0013` reject any change
  to `approved`/`paid`/`closed` runs, lines and inputs (non-negotiable #14).
- **App-layer permissions** (`lib/authz.ts` `requirePermission`) gate every
  server action on top of RLS.

## What was fixed — migration `0018`

1. **Bank-detail privacy (the one real leak).** `employee_bank_accounts` was
   still on the membership-only policy from `0004`, so any tenant member could
   read every colleague's bank / mobile-money number straight through PostgREST
   with their own JWT, bypassing the app-layer checks. Now permission-aware and
   at parity with salary (`0014`): readable by HR/payroll staff or the employee
   themself; writable only with `people.employee.write`. Reuses the existing
   `app.user_has_permission` / `app.my_employee_ids` helpers. Verified against
   every read/write path (HR actions, import centre, payroll payment-file
   generation, self-service `me`) — none regress.

2. **Audit-trail actor forgery.** The `0002` insert policy checked membership
   only, so a member could POST an audit row with a forged `actor_user_id`.
   Now pinned to `auth.uid()` (service-role provisioning bypasses RLS).

3. **The platform-wide scale index.** `tenant_users(user_id) where is_active` —
   `app.user_tenant_ids()` is evaluated on every RLS check for every request;
   without this it seq-scanned `tenant_users` on every query in the platform.
   Plus foreign-key indexes on the employee child tables (bank, dependants,
   assignments, contracts, actions) and on `user_roles(role_id)` /
   `role_permissions(permission_key)` for joins and tenant-cascade deletes.

4. **Effective-dated integrity.** Partial unique indexes enforcing exactly one
   open (`effective_to is null`) row per employee for compensation and
   assignments (the app closes the prior row before inserting, so this also
   guards concurrent double-inserts), one primary bank account per employee,
   and a `split_percentage` 0–100 check. Each is wrapped so pre-existing data
   cannot fail the migration.

## Verification (runtime, not just review)

The full chain `0001`→`0018` was executed against a scratch PostgreSQL 17
instance (Supabase `auth`/`storage` schemas stubbed) — **all 18 migrations
apply cleanly in order**, and `0018` was re-run to prove idempotency. The new
policies were then functionally tested with simulated JWTs across two tenants:

| Test | Result |
| --- | --- |
| Plain employee sees only their own bank row | ✓ |
| HR sees all bank rows in their tenant, zero cross-tenant | ✓ |
| Plain employee cannot update even their own bank row (changes go through the service desk `bank_change` flow — deliberate) | ✓ blocked |
| HR can insert bank rows in-tenant, blocked cross-tenant | ✓ |
| Forged `actor_user_id` on audit insert rejected; honest actor accepted | ✓ |
| Second open compensation row / second primary bank account / `split_percentage` > 100 rejected | ✓ |
| `0014` salary policies unchanged (own-salary read works, cross-tenant zero) | ✓ |

## Apply

```bash
SUPABASE_DB_URL=postgres://... packages/database/scripts/migrate.sh
# 0018 runs last, after 0001–0017. Idempotent; safe to re-run.
```

## Recommended next (needs data validation first)

- **Unique NIDA per tenant** (`employees(tenant_id, national_id)` where not
  null) to block duplicate hires — deferred because the demo/stress seed may
  contain duplicate or placeholder national IDs; add after validating data.
- **Composite tenant FKs.** Child-table FKs reference `employees(id)` alone,
  and `with check` policies validate `tenant_id` membership only — so a writer
  in tenant A can technically insert a child row (tenant A) that points at an
  employee of tenant B. The row stays scoped to A (B never sees it), so this is
  data-hygiene rather than a leak, but the airtight pattern is
  `foreign key (tenant_id, employee_id) references employees (tenant_id, id)`
  (needs a `unique (tenant_id, id)` on `employees`). Platform-wide change —
  schedule it as its own migration.
- **Tighten `employees` read** if colleague PII (national_id, DOB) should not be
  visible to every member — currently the whole tenant can read the directory.
- Rotate the Supabase service-role key and Moonshot key if `apps/web/.env.local`
  was ever shared (it is correctly gitignored and not committed).
