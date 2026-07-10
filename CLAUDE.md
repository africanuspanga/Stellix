# HR Platform — Engineering Conventions

Tanzania AI-native workforce & payroll operating system. Blueprint: `docs/BLUEPRINT.md`. Roadmap: `docs/SPRINTS.md`.

## Structure
- `apps/web` — Next.js (App Router, TS, Tailwind). Server Components for reads, Client Components for interactive workspaces.
- `packages/database` — Supabase SQL migrations (`supabase/migrations/*.sql`) + generated types.
- `packages/ai` — Moonshot Kimi (OpenAI-compatible) client. AI explains; it never computes payroll.
- `packages/config` — shared constants (locales, pillars).

## Commands
- `pnpm dev` — run web app
- `pnpm build` / `pnpm lint`
- Migrations: apply in filename order with `psql "$SUPABASE_DB_URL" -f <file>` (or `supabase db push` once the CLI is linked).

## AI-native rules (docs/AI-NATIVE.md)
- Every new business operation registers a tool in `apps/web/src/lib/tools/`
  (name, description, typed inputs, permission, risk level). Buttons and
  agents share that one code path via `executeTool()` — never fork logic.
- Risk-3 operations (money, termination) are `humanOnly` — enforced in code.
- Meaningful writes emit a `domain_events` fact (`emits:` on the tool, or
  `emitEvent()` in the action).
- Facts (numbers, balances, pay) reach the model only through tool results.

## Database rules
- Every tenant-scoped table: `tenant_id uuid not null` + RLS policy via `app.current_tenant_id()`.
- Statutory rates live in `compliance_rules` (effective-dated, versioned) — never in code.
- Effective-dated history tables for salary/position/department changes; never overwrite.
- Approved payroll rows are immutable — corrections via adjustment/reversal runs.
- All writes audited to `audit_logs`.
- snake_case in SQL, camelCase in TS.

## Env
Copy `.env.example` → `.env.local` in `apps/web`. Supabase credentials pending — SQL is authored ahead and applied when they arrive. Service-role key is server-only.

## Localization
English + Swahili from day one. User-facing strings go through the i18n dictionaries, not hard-coded.
