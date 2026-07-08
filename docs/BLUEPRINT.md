# Tanzania AI-Native HR & Payroll Platform — Product and Technical Blueprint (v2)

> Full blueprint as provided by the product owner. This is the source of truth
> for scope. See SPRINTS.md for the execution plan.

## Vision
Tanzania's AI-native workforce and payroll operating system. Manage employees
from hiring to exit, automate compliant payroll, control attendance and
shifts, and give every worker access through web, mobile and WhatsApp.

## Six pillars
PEOPLE — employees, recruitment, onboarding, performance, offboarding
TIME — attendance, leave, shifts, rostering, timesheets
PAYROLL — compensation, calculations, payments, loans, accounting
COMPLIANCE — statutory rules, labour compliance, filings, privacy, safety
EMPLOYEE EXPERIENCE — web, mobile, WhatsApp, self-service, HR support
AI INTELLIGENCE — explanations, insights, automation, decision support

(Abridged header — the complete v2 blueprint text lives in the project
conversation and is decomposed into docs/SPRINTS.md. Key structural decisions
are restated below so the repo is self-describing.)

## Key architecture decisions
- Modular monolith (NestJS-style module boundaries inside Next.js server +
  future `apps/api`), NOT microservices.
- Supabase: PostgreSQL, Auth, Storage, Realtime, RLS, pgvector.
- Multi-tenancy: shared schema + tenant_id + RLS (Standard); dedicated
  project (Enterprise).
- Hierarchy: Platform Owner → HR Partner → Client Tenant → Legal Entity →
  Branch/Department/Cost Centre/Project → Employees.
- Payroll: deterministic engine; effective-dated versioned statutory rules in
  data, never in code; compliance packs (TZ Mainland Private/Public, Zanzibar).
- Payroll run state machine: Draft → Input Collection → Calculating →
  Calculated → Under Review → Input Locked → Approved → Payment Prepared →
  Paid → Statutory Filing Pending → Filed → Closed (| Reversed).
  Approved runs are immutable.
- One effective-dated employee record powers all modules.
- Positions exist independently of employees
  (approved/budgeted/vacant/occupied/frozen/abolished).
- Raw attendance events separate from processed daily attendance.
- Leave = transaction ledger, not balance column.
- AI levels: Read / Draft / Controlled action. AI never approves payroll,
  releases payments, changes salaries, or terminates employees.
- AI provider: Moonshot Kimi (kimi-k2.6) via OpenAI-compatible API.
- Email notifications via Supabase. WhatsApp is a first-class channel.
- English + Swahili throughout.

## Non-negotiable principles (§13)
1. One employee record powers the whole platform.
2. Payroll deterministic and reproducible.
3. AI explains payroll, never calculates it.
4. Every statutory rule versioned and effective-dated.
5. Every salary/employment change preserves history.
6. Every approval has a complete audit trail.
7. WhatsApp is a primary employee channel.
8. Tenant isolation enforced at database and application layers.
9. Sensitive HR records use stronger permissions.
10. Payroll approval and payment release always require authorized humans.
11. Excel migration is a first-class feature.
12. Works for desk employees and field workers.
13. Mainland and Zanzibar do not share hard-coded compliance config.
14. Approved payroll records are immutable.
15. Always answerable: What happened? Why? Which rule? Who approved? Reproducible?
