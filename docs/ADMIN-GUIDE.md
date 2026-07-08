# Stellix Administrator's Guide

> How the whole system works, for the person running it. v1 · 2026-07-08.
> Screens referenced by their sidebar names. Everything here exists and is
> tested — no roadmap items. Swahili terms shown where employees see them.

---

## 1. The big picture

Stellix is organized around **six pillars** (they mirror the sidebar):

```
PEOPLE      employees, recruitment, onboarding, probation, performance, offboarding
TIME        leave, holidays, attendance, shifts & roster, timesheets
PAYROLL     pay components, calculator, sandbox, payroll runs, payslips, exports
COMPLIANCE  dashboard, statutory filings, rules & packs
EXPERIENCE  My space, Huduma, My team, service desk, notifications
AI          assistants (policy Q&A, payslip explainer, payroll review notes)
```

Three principles explain almost every behavior you'll meet:

1. **One employee record powers everything.** Payroll, leave, attendance and
   letters all read the same record. Changes never overwrite history — they
   close the old effective-dated row and open a new one, so you can always
   answer "what was true in March?"
2. **Balances and totals are derived, never stored.** A leave balance is the
   sum of ledger entries; payroll totals are the sum of calculated lines.
   There is no number anyone can quietly edit.
3. **Approved payroll is physically immutable.** Once you approve a run, the
   database itself refuses changes. Corrections happen through reversal or a
   new run — exactly what an auditor wants to hear.

## 2. Accounts, roles & permissions

**Roles** (created automatically for every workspace):

| Role | Meant for | Can, broadly |
|---|---|---|
| `admin` | Owner / super-admin | Everything |
| `hr_manager` | HR office | Employees, leave/attendance management, onboarding, service desk agent, user invites |
| `payroll_officer` | Payroll desk | Pay components, runs (prepare), filings, payroll AI |
| `manager` | Line managers | Read team, approve leave, rosters |
| `employee` | Everyone else | Self-service only: own record, own payslips, leave requests, service desk, AI |

Sensitive actions are split on purpose: **preparing** payroll
(`payroll_officer`), **approving** it, and **releasing payment** are three
different permissions — no single junior account can do all three.

**Privacy is enforced in the database, not just the UI.** An employee account
querying payslips gets exactly one row — their own — even if someone hacks at
the API. Salaries are visible only to HR/payroll staff or the person
themselves. Internal service-desk notes never reach employees.

**Getting people in:**
- Staff with email: they sign up / you add them, then assign a role.
- Field workers: open their employee page → **Invite to portal** → share the
  one-time link (valid 14 days) via WhatsApp/SMS. They pick a password and
  land on Huduma. No email confirmation dance.

## 3. First-time setup (do it in this order)

1. **Sign up** → "Set up your organization" (company name, Mainland/Zanzibar,
   private/public). This creates your workspace, legal entity, the five
   roles, and attaches the Tanzania compliance pack.
2. **Organization** → add **Branches** (with regions), **Departments**,
   **Cost centres**, **Jobs & grades** (salary bands), then **Positions**.
   Positions exist independently of people — that's how vacancy control
   works (statuses: approved → budgeted → vacant → occupied → frozen →
   abolished).
3. **Time → Leave types** → click **Seed TZ defaults** (Annual 28, Sick 126,
   Maternity 84, Paternity 3, Compassionate 4, Unpaid), adjust to your
   policy, then run **Accrue** for the current year — this writes the
   opening entitlements into the ledger.
4. **Time → Shifts & roster** → define shifts (start/end, grace minutes,
   unpaid break, required hours; an end time before the start means night
   shift across midnight).
5. **Payroll → Pay components** → create allowances/deductions (fixed or
   %-of-basic; mark taxable/pensionable correctly) and assign them to
   employees (effective-dated).
6. **Settings → Policies** → paste your leave/attendance/conduct/payroll
   policies. This is the knowledge the AI assistant answers from.
7. **Settings → Workflows** → optional: build approval chains (e.g. manager
   → HR with SLA hours). Without one, leave falls back to single manager
   approval automatically.
8. **Load your people** — two ways:
   - One by one: **People → Employees → New employee**.
   - In bulk: **People → Import centre** (see §5).
9. **Compliance → Dashboard** → confirm the seeded statutory rules, and
   ⚠️ **before your first real payroll have an accountant verify the PAYE
   bands, NSSF, SDL, WCF and minimum-wage figures** — they ship marked
   *draft* and the system will warn on every calculation until they're
   approved in the rules table.

## 4. People

**Employee record** (People → Employees → click a name): personal + statutory
IDs (NIDA, TIN, NSSF), current placement and salary, full history, contracts,
payment accounts, dependants, documents.

- **Employment actions** (promotion, transfer, salary adjustment, suspension,
  probation confirmation…): pick the action, effective date and only the
  fields that change. The system closes the current assignment/salary row,
  opens the new one, swaps position occupancy, and every action can print a
  formal **letter** (browser print → PDF).
- **Contracts**: track type, dates, probation months; anything ending within
  60 days shows a red countdown (and appears on the compliance dashboard).
- **Payment accounts**: bank or mobile money (M-Pesa, Tigo Pesa, Airtel,
  Halopesa), primary/secondary with net-pay split %. Payroll snapshots these
  at calculation time for the payment files.
- **Documents**: upload to a private store (contracts, IDs, certificates,
  permits) with categories and expiry reminders; downloads are time-limited
  signed links.

**Onboarding** (People → Onboarding): build reusable checklists (tasks
assigned to HR/IT/manager/payroll… with day offsets), assign to a new hire —
tasks are dated from their start date. Track everyone's progress on one board.

**Probation** (People → Probation): who's on probation, end-date countdowns,
overdue-review alerts. Completing a review with **Confirm** makes the
employee active (with a confirmation letter); **Extend** sets the new end
date; **Terminate** records the recommendation.

**Recruitment** (People → Recruitment): requisitions (optionally tied to a
vacant position), candidates through applied → screening → shortlisted →
assessment → interview → reference check → offer. At offer, **Hire as
employee** creates the full employee record and occupies the position.

**Performance** (People → Performance): cycles (e.g. "2026 H2"), weighted
goals per employee with status, plus one self-review and one manager review
per cycle (1–5 with strengths/improvements).

**Offboarding** (People → Offboarding): initiate with exit type and dates —
a 7-task clearance checklist appears (handover, assets, access, final pay,
exit interview, certificate). **The case cannot close while tasks are
open.** Closing exits the employee, ends their history rows on the last
working day, vacates the position, and issues the separation letter.

## 5. Import centre (bulk data)

People → Import centre. Upload CSV **or Excel** (first row = headers, up to
1,000 rows), then:

1. **Map columns** — Stellix auto-guesses from headers (it understands
   "Surname", "Emp No", "Mshahara", "Idara"…); confirm and fill gaps.
2. **Validate** — dates in several formats are normalized, enums checked,
   duplicate employee numbers caught (in-file and against the database).
   Every problem is listed with its row number.
3. **Dry run** — see exactly how many rows will import before anything
   writes.
4. **Import** — creates employees with department/branch (matched by name),
   salary, and bank/mobile-money account in one pass.
5. **Reconcile** — a report of every skipped/failed row and why.

## 6. Time

**Leave** (Time → Leave): requests count **working days only** — weekends and
holidays (national + your company days) are excluded automatically; half-days
supported. Balance is checked against the ledger before submission, overlaps
are rejected. Approval follows your workflow; the final approval writes the
ledger debit. Cancelling approved leave writes a compensating credit —
nothing is ever deleted.

- **Accrual** (Leave types → Accrue): grants the annual entitlement into the
  ledger; safe to re-run (already-granted employees are skipped).
- **Carry-forward** (Leave types → Carry-fwd): after year end, expires any
  balance above the cap, dated 1 January.
- **Approvals**: pending items appear in "Waiting for your approval" with
  red badges once past the SLA; approvers can **delegate** with a trace.

**Attendance** (Time → Attendance): two layers by design —
- **Raw events**: every check-in/out with GPS, method, geofence result
  (inside/outside your work-site radius). Immutable, always.
- **Processed days**: click **Process day** to compute everyone's day from
  events + roster + approved leave + holidays → worked/late/overtime minutes
  and a status (present, late, half day, absent, missing check-in/out, on
  leave, holiday, rest day). Recalculate any time; the events never change.
- **Corrections**: employees request a fix ("forgot to check out"); approval
  writes correction events and reprocesses the day.
- **Overtime**: the computed minutes are never paid automatically — a human
  approves up to the computed amount.

**Shifts & roster**: assign a shift to an employee across a date range
(weekends skippable). **Timesheets**: project/activity hours with billable
flags and approval — feeds project costing.

## 7. Payroll (the monthly routine)

**Month-end checklist:**
1. Process attendance for the month's final days; approve overtime.
2. Confirm one-off items (bonuses, extra deductions) — you'll add them on
   the run.
3. **Payroll → Payroll runs → New run** (entity + month) → **Calculate**.
4. Read the **variance findings** — the system compares to last month: new
   and missing employees, net changes over 10%, PAYE changes, zero/negative
   net, below-minimum-wage. Ask the **AI review notes** for a summary.
5. Adjust as needed: **Adjust** on any line adds a one-off earning/deduction
   and recalculates *that employee instantly*, showing previous → new net and
   PAYE. Recalculate the whole run if inputs changed broadly.
6. **Approve** (needs the approve permission). The run freezes permanently.
7. Download **Bank file** and **Mobile money file**, pay, then **Mark paid**
   (separate payment-release permission).
8. **Compliance → Statutory filings → Generate from run** → PAYE, NSSF
   (employee+employer), SDL, WCF records with due dates and amounts. Mark
   each *filed*/*paid* with the receipt reference as you go.
9. **Close** the run. Payslips are live for employees in My space.

**Where the numbers come from:** basic salary (effective-dated) + assigned
pay components + one-off run inputs → gross; statutory amounts come from the
versioned **compliance rules** (never hard-coded); PAYE is computed on
taxable income after employee NSSF. Every payslip line links to a **trace**
citing the exact rule and version. Same inputs always produce identical
results.

**Fixing a mistake after approval:** you can't edit — that's the point.
**Reverse** the run (it stays visible, flagged reversed) and issue a
corrected run, or handle the difference as an input on next month's run.

**Sandbox** (Payroll → Sandbox): model "what if we raise X's salary / pay a
bonus" — same engine, real rules, shows current vs scenario with the deltas,
and saves nothing.

**Calculator** (Payroll → Calculator): whole-company gross-to-net preview for
any period without creating a run.

## 8. Compliance

- **Dashboard**: missing contracts, contracts expiring ≤60 days, work permits
  expiring ≤90 days, salaries below the minimum-wage floor, missing NIDA/TIN/
  NSSF, overdue filings — each item links to the employee. A standing banner
  counts statutory rules still in *draft*.
- **Statutory filings**: the tracker for PAYE/NSSF/SDL/WCF per month — due
  dates, amounts from the frozen run, pending → filed → paid with references,
  overdue badges.
- **Rules & packs**: statutory percentages live as data with effective dates
  and versions. When the Finance Act changes, a new rule version starts on
  its effective date — history keeps calculating with the old one.

## 9. Employee & manager experience

- **My space** (`/dashboard/me`): profile, placement, salary, leave balances,
  approved payslips, requests, shifts, 7-day attendance.
- **Huduma** (`/dashboard/huduma`): the phone-first bilingual menu — payslip,
  likizo, check-in, ratiba, HR, AI. Where invited field workers land. Add an
  HR WhatsApp number to the tenant to enable the direct "HR kwenye WhatsApp"
  button.
- **My team**: direct reports, pending-approvals badge, team leave calendar,
  7-day attendance summary, contract-expiry alerts.
- **Service desk**: employees raise categorized requests (payslip issue,
  bank change, letters, complaints — with a confidential option). Agents
  reply (employee-visible or **internal notes**), set status; the requester
  is notified at every step.
- **Notifications**: the bell in the header; English or Swahili templates
  follow the workspace's default language.

## 10. AI assistants

All three **explain — they never calculate, approve or change anything**, and
every conversation is logged (who asked, what sources were used, the full
answer) under the AI audit trail.

- **Policy questions**: answers strictly from Settings → Policies, citing the
  policy. If the policies don't cover it, it says so and points to HR.
- **Payslip explainer**: narrates the calculation trace ("your PAYE rose
  because the bonus moved you into the 30% band — PAYE rule v1"). Employees
  can only ask about their own payslips — the database guarantees it.
- **Payroll review notes** (payroll staff only): turns a run's variance
  findings into prioritized review notes before approval.

Ask in English or Swahili; it answers in kind.

## 11. Partner firms (multi-client)

If your account belongs to several client workspaces, **Clients** shows each
one — headcount, latest payroll status, overdue filings, open requests — with
one-click switching. The tenant switcher in the header does the same. Each
client's data stays isolated; you simply hold memberships in each.

## 12. Troubleshooting & FAQ

- **"You need the 'X' permission"** — your role lacks it; an admin must
  assign the right role.
- **Employee can't see My space** — their employee record isn't linked to a
  login: use **Invite to portal**, or set their work email and have them sign
  up with it.
- **Leave request rejected for balance** — run the annual **Accrue** first;
  balances only exist as ledger entries.
- **Attendance shows absent despite check-in** — the day wasn't processed
  yet (**Process day**), or the events landed outside the day window.
- **"Payroll run is approved and immutable"** — by design; reverse and rerun.
- **AI says it can't answer** — the relevant policy isn't published in
  Settings → Policies, or the pack is missing data. That refusal is a
  feature: it never invents.
- **Numbers look wrong on a payslip** — open the trace first; it shows every
  step and rule. If a *rule* is wrong, fix it in Rules & packs with a new
  effective-dated version.

## 13. Mini-glossary (EN ⇄ SW used in the product)

| English | Swahili |
|---|---|
| Leave | Likizo |
| Annual leave | Likizo ya mwaka |
| Sick leave | Likizo ya ugonjwa |
| Payslip | Payslip / hati ya mshahara |
| Salary | Mshahara |
| Attendance | Mahudhurio |
| Shift/schedule | Zamu / ratiba |
| Approved | Imeidhinishwa |
| Employee services | Huduma za wafanyakazi |
