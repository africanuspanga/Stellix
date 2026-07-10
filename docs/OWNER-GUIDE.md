# Stellix Platform Owner's Guide

> For **you** — the person who owns and operates the Stellix SaaS business.
> This explains your Platform console, what your customers see, how the whole
> system works under the hood, and the operational tasks that are yours alone.
> Companion docs: `ADMIN-GUIDE.md` (the guide your customers use),
> `AI-NATIVE.md`, `HARDENING.md`, `PRODUCT-GAPS.md`.

---

## 1. The two-dashboard mental model

Stellix has **two levels**, and you are the only person who touches both:

```
┌──────────────────────────────────────────────────────────────┐
│  PLATFORM (you, the SaaS owner)          →  /owner            │
│  Every company on Stellix, as a business you operate.         │
│  Aggregates only — no customer employee data.                │
└──────────────────────────────────────────────────────────────┘
        owns / provisions ▼
┌──────────────────────────────────────────────────────────────┐
│  COMPANY WORKSPACE (your customers)      →  /dashboard        │
│  One per company (a "tenant"). Their HR & payroll.           │
│  A company admin runs this; see ADMIN-GUIDE.md.              │
└──────────────────────────────────────────────────────────────┘
```

It's **one application** with two doors. Which door you get depends on who you
are, enforced by the database:

- Every user belongs to one or more **companies** (tenants) and has a **role**
  there (admin, hr_manager, payroll_officer, manager, employee).
- **You**, additionally, are a **platform owner** — a separate flag that
  unlocks `/owner`. Being a platform owner is *not* a super-role inside any
  company; it's a distinct identity for running the platform.

---

## 2. Your Platform console (`/owner`)

### Getting in
1. Sign in with your owner account (`africanuspanga@gmail.com`).
2. Migration `0020` seeds that email into the `platform_owners` table the first
   time it runs after you've signed up. (If you added yourself before signing
   up, just re-run the migration — it's idempotent.)
3. Open your **avatar menu (top-right) → Platform console**. The link only
   appears for platform owners. Direct URL: `/owner`.

Anyone who isn't a platform owner who visits `/owner` is bounced to their own
`/dashboard`. There is no way to reach it by guessing.

### What you see, and what each number means

**Headline cards:**

| Card | Meaning | Why you watch it |
|---|---|---|
| **Companies** | Total tenants, split active / trial | Your customer count |
| **New (30 days)** | Companies onboarded this month | Growth rate |
| **Employees managed** | Sum of all employees across all companies | Your "units of value" — the thing you meter billing on |
| **Active users** | People with a live login across all companies | Engagement / seat usage |
| **Payroll this month** | Total net pay processed across all companies (approved runs) | The money flowing through Stellix — your credibility number and a health signal |
| **AI usage (30d)** | AI interactions + agent actions | Whether the AI-native features are landing |

**Companies table:** every company with its plan, status, employee count, user
count, payroll-per-month and join date. This is your book of business at a
glance — who's big, who's trialing, who's quiet.

### The privacy boundary (this is a feature, not a limitation)

**You cannot see any individual employee's salary, bank details, or national
ID — by design.** The console is built on aggregate database functions
(`platform_summary`, `platform_tenant_stats`) that return counts and sums, never
rows of personal data. Even as the platform owner, the row-level security does
not hand you customers' payroll records.

This matters commercially: when you sell to an HR manager who's nervous about
putting their staff's salaries in someone else's system, "the vendor
*structurally cannot* read your employees' pay — here's the architecture" is a
real answer, not a promise. See `HARDENING.md`.

### What the console does *not* do yet (your build list)
- Churn / trial-expiry alerts, per-tenant last-activity health.
- An **audited support-impersonation** path (enter a customer workspace to help,
  with every action logged). Design it audited from day one.
- Suspend / cancel controls (the `partners` table and owner write access exist;
  the UI is next).

---

## 3. What your customers do (the Company workspace)

Your customer's admin lives in `/dashboard`. Full walkthrough:
**`ADMIN-GUIDE.md`**. In one screen, their world is the **six pillars**:

```
PEOPLE      employees, recruitment, onboarding, probation, performance, offboarding
TIME        leave, holidays, attendance, shifts & roster, timesheets
PAYROLL     pay components, calculator, sandbox, runs, payslips, exports
COMPLIANCE  dashboard, statutory filings, rules & packs
EXPERIENCE  My space (Huduma), My team, service desk, notifications
AI          assistant + the Stellix agent
```

**Roles inside a company** (auto-created when a company signs up):

| Role | For | Can, broadly |
|---|---|---|
| `admin` | The company owner | Everything in their workspace |
| `hr_manager` | HR office | People, leave/attendance, onboarding, invites, branding |
| `payroll_officer` | Payroll desk | Pay components, prepare runs, filings |
| `manager` | Line managers | Read team, approve leave, rosters |
| `employee` | Everyone | Self-service: own record, payslips, leave, service desk, AI |

The three most sensitive payroll actions — **prepare**, **approve**, **release
payment** — are three separate permissions, so no single junior account can run
money end to end. That separation is not cosmetic; it's enforced in the database.

---

## 4. How the entire system works (plain-English architecture)

### 4.1 One wall per company (multi-tenancy)
Every table that holds company data has a `tenant_id`, and **Row-Level Security
(RLS)** in PostgreSQL filters every query to the caller's company automatically.
A user physically cannot read another company's data, even by calling the API
directly — the database refuses. This is the "shared database, hard walls"
model; big enterprise customers can later get a dedicated database.

### 4.2 One employee record, with memory
Each employee is one record. Salary, position, department and manager changes
**never overwrite** — they close the current effective-dated row and open a new
one. So payroll for July uses July's salary even if you enter an August raise
today, and you can always answer "what was true in March?" (This exact
correctness was hardened recently — see `PRODUCT-GAPS.md` history.)

### 4.3 Payroll: deterministic, rules-as-data, immutable
- **Statutory rates live in data**, not code (`compliance_rules`), and are
  **effective-dated** — a rate change is a new versioned row, so re-running an
  old month reproduces the old result exactly.
- The **engine is pure and deterministic**: same inputs → byte-identical output,
  proven by a **golden-file test suite** that runs on every code change in CI.
- **Approved runs are physically immutable** — database triggers reject any edit
  to an approved/paid/closed run. Corrections go through reversal or a new run.
  This is what makes the payroll auditable.
- **AI never calculates pay.** It explains the numbers the engine produced.

### 4.4 AI-native, not AI-assisted
Stellix is built so **humans and AI agents use the same doors**. Every business
action is a **tool** in a registry with a permission and a risk level; a button
and the AI call the *same* checked function. The AI acts **as the signed-in
person, with their exact permissions** — it can never do more than they can, and
money actions (payroll approval, payments) are structurally human-only. A
**trust ladder** lets each company decide, per action, whether the AI can read,
draft, propose-for-approval, or act autonomously. Every meaningful change also
publishes an **event**, so "ambient" agents (contract-expiry chasers, etc.) can
watch and help. Full detail: **`AI-NATIVE.md`**. This is the foundation that lets
you eventually sell *work done*, not just software.

### 4.5 Payslip branding
Each company sets its own **logo, one of four templates, and two brand colours**
(Settings → Payslip branding), so payslips carry the employer's identity.
Employees download a real PDF via the browser print dialog. Colours are
validated as hex in the app and the database (they render into the payslip's
styling).

### 4.6 The stack
- **Next.js 16** (App Router) — the web app, server-rendered.
- **Supabase** — PostgreSQL (data + RLS), Auth (logins), Storage (documents,
  logos). This is where your data and security live.
- **Moonshot Kimi** — the language model behind the AI features (explains,
  never computes).
- **Vercel** — hosting/deploys. **GitHub Actions** — CI on every push.

---

## 5. Operations runbook (the part only you do)

### 5.1 Secrets & environments
- Real credentials live in `apps/web/.env.local` — **gitignored, never
  committed**. It holds the Supabase URL, anon key, **service-role key**
  (god-mode — server only), DB connection string, and the Moonshot key.
- If that file is ever shared (it has been, during development), **rotate the
  Supabase service-role key and the Moonshot key** in their dashboards.

### 5.2 Applying database migrations ⚠️ (action needed)
Migrations are versioned SQL in `packages/database/supabase/migrations/`. They
are written and tested but **only take effect when applied to your live
database.** Currently **0018–0021 are authored and CI-verified but not yet
applied** to production — until you apply them, bank-detail privacy, the AI
tables, the owner console, and payslip branding won't work live.

Apply them (idempotent, safe to re-run):
```bash
cd packages/database/supabase/migrations
source ../../../../apps/web/.env.local
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 \
  -f 0018_bank_privacy_scale_integrity.sql \
  -f 0019_ai_native_foundation.sql \
  -f 0020_platform_owner.sql \
  -f 0021_payslip_branding.sql
```
If the `db.<ref>.supabase.co` host doesn't resolve, use the **Session pooler**
connection string from the Supabase dashboard (Settings → Database).

### 5.3 Making yourself (or a colleague) a platform owner
`0020` auto-seeds `africanuspanga@gmail.com`. To add another owner (only ever do
this with the service role / SQL editor — there is no self-service):
```sql
insert into public.platform_owners (user_id, note)
select id, 'Ops' from auth.users where email = 'someone@yourco.com'
on conflict do nothing;
```

### 5.4 Deploys & CI
- Pushing to `main` triggers **GitHub Actions**: lint, typecheck, the **golden
  payroll suite**, a full production build, and the **entire migration chain**
  against a fresh Postgres. **Green means the payroll math and every migration
  are verified.** Never deploy a red build.
- Hosting is Vercel; connect the repo and set the same env vars there.

### 5.5 Backups & recovery
- Enable **Supabase Point-in-Time Recovery** (paid tier) for the payroll
  database — this is non-negotiable for a system holding people's pay.
- Approved payroll is immutable in-app, but you still want DB-level backups for
  disaster recovery.

### 5.6 The payroll go-live gate (do not skip)
The seeded PAYE / NSSF / SDL / WCF rates are marked **`draft` / "VERIFY"**. The
engine math is proven; the *rates* must be confirmed against current Tanzanian
law by an accountant and flipped to `approved` before any real payroll. A wrong
rate means a wrong payslip and a customer facing TRA penalties — the fastest way
to lose trust in this business.

---

## 6. Go-live checklist (ordered)

1. **Apply migrations 0018–0021** to production (§5.2).
2. **Rotate** the Supabase service-role and Moonshot keys (§5.1).
3. **Accountant signs off** the statutory rates → set packs to `approved` (§5.6).
4. **Enable Supabase PITR** backups (§5.5).
5. **Wire billing** — mobile-money collection (M-Pesa/Tigo/Airtel) metered per
   active employee. See `PRODUCT-GAPS.md`.
6. **Email/SMS delivery** for payslip-ready / leave / invite notifications.
7. **Counsel review** of `/privacy` and `/terms`; register with the PDPC.
8. **Sign 2–3 design partners** and **run one payroll cycle in parallel** with
   their existing process; reconcile to the shilling. That reconciliation is
   your QA, your compliance proof, and your first testimonials.
9. Only then open **self-serve sign-ups** to strangers.

---

## 7. Document map

| Doc | What it's for |
|---|---|
| **OWNER-GUIDE.md** (this) | You, running the platform |
| **ADMIN-GUIDE.md** | Your customers, running their company |
| **AI-NATIVE.md** | The AI architecture (tools, agent, trust ladder, events) |
| **HARDENING.md** | The security/privacy model and how it was verified |
| **PRODUCT-GAPS.md** | What to build next to make customers pay & stay |
| **BLUEPRINT.md** | The original product vision & principles |
| **SPRINTS.md** | What shipped, sprint by sprint |
| **DESIGN.md** | The visual design language |
| **MARKETING-SALES-PLAN.md** | Go-to-market for Tanzania |
| **HANDOFF.md** | Engineering handoff notes |

---

### One paragraph, if you read nothing else

You operate **one platform** that hosts **many companies**. Your `/owner`
console shows the whole business in aggregates (never customers' private pay).
Each company runs itself in `/dashboard` under strict database-enforced walls,
with deterministic, auditable, immutable payroll and an AI that acts only within
each user's permissions. Your remaining work to reach paying customers is not
engineering — it's **applying the migrations, getting the tax rates signed off,
wiring mobile-money billing, and proving one payroll in parallel.** Everything
else is built, tested, and green in CI.
