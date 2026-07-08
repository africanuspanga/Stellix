# Stellix — Project Handoff

> Last updated: **2026-07-08** · All work committed and pushed to
> https://github.com/africanuspanga/Stellix (branch `main`).
> Read this together with `docs/BLUEPRINT.md` (scope) and `docs/SPRINTS.md`
> (delivery log). Conventions live in `CLAUDE.md`.

---

## 1. State at a glance

**Stellix** ("Powering Africa's Workforce", black & white brand) is a
multi-tenant Tanzanian HR & payroll platform. **Sprints 0–13 are built and
verified** — the entire first-commercial-release list from the blueprint
except the WhatsApp Cloud API bot (deliberately deferred, see §7).

The complete employee lifecycle works end to end on the live Supabase
project: recruit → hire → onboard → probation → attendance/leave → payroll
(deterministic, immutable after approval) → performance → offboard. Plus:
employee/manager self-service, invite links for field workers, Swahili/English
notifications, HR service desk, AI assistants (Moonshot Kimi), compliance
dashboard, statutory filing tracker, and a partner multi-client view.

**~190 live checks** across 9 E2E suites + a 25-case payroll golden suite,
all green. **Not yet deployed** — runs on localhost only.

## 2. Running it

```bash
pnpm install
pnpm dev                      # http://localhost:3000
pnpm --filter web build       # production build (also type-checks)
cd apps/web && npx eslint     # lint
```

- **Env**: real credentials live in `apps/web/.env.local` (gitignored).
  Template: `.env.example`. Contains Supabase URL/keys, DB password,
  Supabase access token (CLI), Moonshot key.
- **Migrations**: `packages/database/supabase/migrations/0001…0017` — ALL
  applied to the linked project. Apply new ones with `supabase db push` from
  `packages/database` (needs `SUPABASE_ACCESS_TOKEN` + `SUPABASE_DB_PASSWORD`
  exported; re-run `supabase link --project-ref ovffklrscjyoepqkqbzn` if the
  gitignored link state is missing).

## 3. Services

| Service | Details |
|---|---|
| Supabase | Project ref `ovffklrscjyoepqkqbzn` (West EU). Postgres + Auth + Storage (`employee-documents` bucket). RLS everywhere. |
| Moonshot Kimi | Model `kimi-k2.6` via OpenAI-compatible API. **Quirk: rejects any `temperature` other than default** — the client in `packages/ai` handles this. |
| GitHub | `africanuspanga/Stellix`, branch `main`. |
| Vercel | **Not deployed yet** — next big step. |

⚠️ **Security note**: the service-role key, DB password, and access token were
exchanged in chat during development. Rotate them in the Supabase dashboard
before any public deployment, then update `apps/web/.env.local`.

## 4. Architecture (short version)

- `apps/web` — Next.js 16 App Router (note: `src/proxy.ts`, NOT middleware.ts).
  Server components + server actions; shadcn/base-nova UI; the reusable
  `OrgFormDialog` powers ~90% of forms.
- `packages/database` — SQL migrations (source of truth for schema).
- `packages/ai` — Kimi client. `packages/config` — pillars/locales.
- **Key libs** (framework-free, shared by app + E2E — this is the testing
  strategy: E2E scripts drive the exact production code):
  - `lib/payroll/engine.ts` — deterministic gross-to-net; rules from data
  - `lib/payroll/run-calc.ts` — run orchestration + real-time single-employee recalc
  - `lib/payroll/variance.ts`, `exports.ts` — variance engine, bank/statutory CSVs
  - `lib/workflow/engine.ts` — generic approval chains (leave uses it today)
  - `lib/attendance/process.ts`, `geofence.ts` — day processing, haversine
  - `lib/leave/working-days.ts` — weekend/holiday day counting
  - `lib/compliance/checks.ts`, `filings.ts` — dashboard snapshot, filing generation
  - `lib/invites.ts`, `lib/people/offboarding.ts`, `lib/ai/assistants.ts`, `lib/notify.ts`
- **Security model**: RLS tenant isolation on every table + permission-aware
  policies (`app.user_has_permission`) for payroll/salary/desk privacy +
  app-layer `requirePermission()` in every server action. Payroll immutability
  after approval is enforced by **database triggers** (migrations 0012/0013).
- **Non-negotiables honored**: balances = leave ledger sums (view
  `leave_balances`); effective-dated history never overwritten; approved runs
  frozen; AI explains but never calculates; statutory rules versioned in
  `compliance_rules`; everything audited (`audit_logs`, `ai_audit`).

## 5. Verification suites (run from `apps/web`)

```bash
pnpm dlx tsx scripts/golden-payroll.mts                    # 25 checks, no DB
pnpm dlx tsx --env-file=.env.local scripts/e2e-tenancy.mts    # sprint 1
pnpm dlx tsx --env-file=.env.local scripts/e2e-org.mts        # sprint 2
pnpm dlx tsx --env-file=.env.local scripts/e2e-people.mts     # sprint 3
pnpm dlx tsx --env-file=.env.local scripts/e2e-sprint4.mts    # imports/onboarding
pnpm dlx tsx --env-file=.env.local scripts/e2e-sprint5.mts    # leave/workflow
pnpm dlx tsx --env-file=.env.local scripts/e2e-sprint6.mts    # attendance
pnpm dlx tsx --env-file=.env.local scripts/e2e-sprint7.mts    # payroll engine
pnpm dlx tsx --env-file=.env.local scripts/e2e-sprint8.mts    # payroll ops
pnpm dlx tsx --env-file=.env.local scripts/e2e-sprint9.mts    # experience/privacy
pnpm dlx tsx --env-file=.env.local scripts/e2e-sprint10-12.mts
pnpm dlx tsx --env-file=.env.local scripts/e2e-sprint11.mts   # AI (real Kimi calls)
pnpm dlx tsx --env-file=.env.local scripts/e2e-sprint13.mts   # talent
```

All self-clean (create + delete their own tenants/users). No CI pipeline yet —
these are run manually.

## 6. Driftmark Technologies — the sales demo tenant

Persistent tenant (slug `driftmark-technologies`) with 122 employees,
March–July payroll (current run calculated with 8 variance findings), 1,528
attendance events, live approval queue, compliance issues on purpose,
recruitment/performance/offboarding mid-flight, 5 policies for the AI.

- Logins (password `DriftmarkDemo2026!`):
  `demo-admin@` / `demo-manager@` / `demo-employee@driftmark.co.tz`
- Rebuild identically: `pnpm dlx tsx --env-file=.env.local scripts/seed-driftmark.mts`
- Persona sanity check: `scripts/verify-driftmark.mts`
- **Do not** let cleanup scripts touch this tenant.

## 7. Known gaps, deferred items & honest caveats

**Must-do before real payroll**
1. **Statutory rates are DRAFT.** PAYE bands, NSSF 10%+10%, SDL 3.5%,
   WCF 0.5%, minimum-wage floor 60,000 and the filing due dates were seeded
   from common knowledge and are flagged `status='draft'` in
   `compliance_rules`. Have an accountant verify against current TRA/NSSF law,
   then set `status='approved'` (the engine warns on drafts).
2. **Rotate credentials** (see §3) and set Supabase Auth **Site URL** +
   redirect allowlist for the deployed domain (currently unset; signup email
   confirmation depends on it — an attempt to change it via API was blocked by
   permissions, do it in the dashboard).

**Deferred by decision**
- **WhatsApp Cloud API bot** (original Sprint 10): reshaped into invite links
  + the `/dashboard/huduma` launcher after a cost/benefit discussion. The full
  in-chat bot needs a Meta business account + webhook on a public URL. Meta's
  own "Business AI" was evaluated and rejected (no auth model, can't touch
  private HR data).
- **Email delivery**: in-app notifications work; the `notifications` table is
  the queue, but no SMTP/edge function is wired. Blueprint says email via
  Supabase — needs an SMTP provider or Resend + edge function.

**Known limitations (fine for now, fix eventually)**
- Users belonging to **multiple tenants** see mixed rows on regular pages
  (RLS grants all memberships; pages don't filter by the active-tenant
  cookie). Single-tenant users are unaffected; the partner overview page uses
  this deliberately. Fix = add `.eq('tenant_id', activeTenant)` to page
  queries, or per-request RLS via a claims-based active tenant.
- Payroll: **no proration** for mid-month hires/exits (full month is paid);
  approved overtime is not auto-fed into payroll (add it as a run input);
  off-cycle/adjustment run types exist in the enum but the UI only creates
  regular runs; no accounting journals/GL export yet (blueprint §4.12); loans
  module is just a deduction component (blueprint §4.10 wants schedules).
- Leave: `requires_document` flag isn't enforced with an upload; encashment
  entry type exists in the ledger but has no UI.
- Sidebar active-item highlighting is static (breadcrumbs are
  pathname-aware; NavGroup isn't).
- AI policy retrieval stuffs policies into context (fine ≤ ~12k chars);
  pgvector RAG per blueprint §7.8 not built.
- Phase Six leftovers not built: learning & development, employee relations
  (restricted cases), health & safety, reporting module (§8.7), full import
  types beyond employees.
- `pnpm --filter web build` type-checks `scripts/` too — E2E scripts must
  stay type-clean.

**Environment quirks worth knowing**
- Next 16: `middleware.ts` is renamed `proxy.ts`; `params`/`searchParams`/
  `cookies()` are async. Bundled docs: `apps/web/node_modules/next/dist/docs`.
- Supabase JS batch inserts: rows in one batch must share the same keys, or
  missing keys become NULL (bypassing column defaults) — bit us twice.
- The dev machine once **wiped the whole project folder** (2026-07-08 03:20,
  cause unknown, `.git` included). Everything was recovered from GitHub.
  **Commit + push after every meaningful chunk** — this habit saved the repo.
- A Vercel plugin hook injects false-positive "use Workflow DevKit" warnings
  whenever our own `lib/workflow/engine.ts` is touched — ignore them; our
  workflow engine is intentionally a DB-backed approval chain.

## 8. Recommended next steps (priority order)

1. **Deploy to Vercel** — nothing real can happen on localhost. Set env vars
   from `.env.local`, update `NEXT_PUBLIC_APP_URL` (invite links embed it),
   configure Supabase Auth URLs, rotate credentials.
2. **Statutory verification** — accountant sign-off, flip pack to `approved`.
3. **Email delivery** — SMTP/Resend edge function consuming `notifications`.
4. **Payroll completeness** — proration, overtime → run inputs, off-cycle
   runs UI, accounting export (§4.12).
5. **Active-tenant filtering** for multi-tenant users (prereq for serious
   partner accounts).
6. **WhatsApp bot** when a Meta business account exists (start with outbound
   notifications + deep links; the Huduma launcher already covers menus).
7. Phase Six modules + reporting as sales demand dictates.

## 9. Session memory

Claude Code keeps project memory in
`~/.claude/projects/-Users-admin-HR-Platform/memory/` (Supabase link, demo
tenant details, the folder-wipe incident). A fresh session reads it
automatically — this handoff is the fuller, repo-visible version.
