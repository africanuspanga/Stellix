# Sprint Roadmap — Tanzania AI-Native HR & Payroll Platform

Blueprint v2 mapped into executable sprints. Each sprint ends with working,
verifiable software. Sprints assume Supabase credentials are available from
Sprint 1 onward (SQL is written ahead of time and applied when they arrive).

## Sprint 0 — Foundation scaffold ✅ (done 2026-07-08)
- Monorepo (pnpm workspaces): `apps/web`, `packages/*`
- Next.js + TypeScript + Tailwind app shell
- Environment configuration (`.env.example`: Supabase, Moonshot Kimi)
- SQL migrations authored for tenancy, identity, org, people foundation
- Sprint roadmap + engineering conventions (CLAUDE.md)

## Sprint 1 — Platform foundation (Phase One) ✅ (done 2026-07-08)
- Apply migrations to Supabase (needs credentials)
- Supabase Auth wiring: sign-in, session, protected routes
- Tenancy: platform owner → partner → tenant → legal entity hierarchy
- Roles & permissions + RLS enforcement end-to-end
- Audit log service (every write audited)
- App shell: six-pillar navigation, tenant switcher

## Sprint 2 — Organization & positions (Phase Two, part 1) ✅ (done 2026-07-08)
- Branches, departments, cost centres, projects, work sites
- Job families, grades, salary bands
- Positions (approved/budgeted/vacant/occupied/frozen/abolished)
- Org chart view

## Sprint 3 — Employee records (Phase Two, part 2) ✅ (done 2026-07-08)
- Central employee record (one record powers everything)
- Effective-dated assignments (position, salary, department, manager)
- Contracts + contract expiry tracking
- Bank details, dependants, emergency contacts
- Document engine v1 (upload, categories, expiry reminders — Supabase Storage)
- Employment actions (promotion, transfer, adjustment…) with letters

## Sprint 4 — Onboarding, probation & import centre ✅ (done 2026-07-08)
- Onboarding templates + task assignment
- Probation reviews, confirmation workflow
- Import centre: Excel/CSV → map → validate → dry run → import → reconcile
  (employees, contracts, bank details, leave balances)

## Sprint 5 — Leave & workflow engine (Phase Three, part 1) ✅ (done 2026-07-08)
- Leave types, policies, periods, holiday calendars
- Leave transaction ledger (not balance-only)
- Accrual, carry-forward, encashment
- Workflow engine v1 (reusable approvals: sequential, delegation, escalation)
- Employee/manager leave requests + team calendar

## Sprint 6 — Attendance & shifts (Phase Three, part 2) ✅ (done 2026-07-08)
- Shift configuration + rostering
- Raw attendance events vs processed daily attendance (recalculable)
- Mobile web check-in with geolocation/geofence
- Attendance corrections + overtime approval
- Timesheets v1

## Sprint 7 — Payroll engine core (Phase Four, part 1) ✅ (done 2026-07-08)
- Pay components, salary structures, payroll groups
- Effective-dated statutory rule engine (no hard-coded rates)
- Tanzania Mainland compliance pack: PAYE, NSSF pension, SDL, WCF, minimum wage
- Deterministic gross-to-net calculation with full trace
- Golden-file test suite for payroll formulas

## Sprint 8 — Payroll operations (Phase Four, part 2) ✅ (done 2026-07-08)
- Payroll runs + state machine (Draft → … → Closed), immutable after approval
- Real-time payroll workspace (change an input, see the impact instantly)
- Variance engine
- Payroll sandbox (isolated scenarios, never touches live data)
- Payslips (PDF), bank/mobile-money export files, statutory schedules
- Accounting journals + loans/advances with payroll deduction

## Sprint 9 — Employee experience (Phase Five) ✅ (done 2026-07-08)
- Employee portal (payslips, leave, attendance, profile, requests)
- Manager portal (approvals, team views, roster)
- Notifications: in-app + email (Supabase), English & Swahili templates
- HR service desk v1

## Sprint 10 — WhatsApp self-service
- WhatsApp Business API integration
- Structured Swahili/English menus (payslip, leave balance, apply, shifts, loans)
- Validated transactional workflows (no free-form AI for transactions)

## Sprint 11 — AI intelligence (Phase Seven, first slice)
- Moonshot Kimi (kimi-k2.6) integration via `packages/ai`
- Policy assistant (permission-aware retrieval, tenant-isolated, pgvector)
- Payroll explanation assistant ("why did my net pay change?") — explains,
  never calculates
- Payroll anomaly summaries on top of the variance engine
- AI audit log (prompt, sources, tools, output, reviewer)

## Sprint 12 — Compliance surface & partner portal
- Compliance dashboard (contracts, permits, filings, minimum wage, hours)
- Statutory filing tracker
- HR partner portal (multi-client switching, managed payroll)
- Data protection controls (consent, retention, access requests)

## Sprint 13+ — Talent & relations (Phase Six)
- Recruitment pipeline, performance, learning, employee relations (restricted
  permissions), health & safety, offboarding workflow completion

## First commercial release = Sprints 1–11
Matches blueprint §11 (30-item release list).

## Non-negotiables enforced from Sprint 1
1. One employee record. 2. Deterministic payroll. 3. AI explains, never
calculates pay. 4. Versioned effective-dated statutory rules. 5. History
preserved on every change. 6. Full audit trail. 7. Tenant isolation via RLS
at DB level. 8. Approved payroll is immutable. 9. Sensitive HR records get
stronger permissions. 10. Human-only payroll approval and payment release.
