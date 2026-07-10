# Owner's-Eye View: What Makes Customers Happy — and Pay

Written from the SaaS owner's chair. The platform is architecturally strong and
functionally broad; these are the gaps between "impressive demo" and "customers
renew and refer". Ranked by impact on retention and willingness to pay.

## Tier 1 — Blocks getting paid at all

1. **Billing & subscriptions.** There is no way to charge anyone; "Billing" is a
   dead nav link. Even for pilots, wire plan selection + invoicing. For Tanzania,
   **mobile-money collection (M-Pesa/Tigo/Airtel) beats cards** — customers will
   pay how they already pay. Meter on active employees (the value unit).
2. **Statutory rates signed off.** The seeded PAYE/NSSF/SDL/WCF are `draft`.
   Customers pay for *correct* payroll; an accountant must approve the packs.
   (Engine math is already verified by the golden tests — this is data, not code.)
3. **Email/SMS delivery.** Notifications are written in-app only; the email hook
   is a stub. Payslip-ready, leave-approved and invite emails are table stakes.
   Add SMS for the ~majority of Tanzanian field workers without daily email.

## Tier 2 — What makes them *love* it (retention + referrals)

4. **Payslip PDF + "why did my pay change?" in the worker's hand.** The explainer
   exists; put it on a phone with a downloadable/WhatsApp-able payslip. This is
   the single most viral employee-facing moment in payroll.
5. **WhatsApp channel (blueprint pillar, not built).** "Check my leave balance /
   apply for leave / get my payslip" over WhatsApp is a genuine wedge in this
   market and a headline reason an SME switches. The AI-native tool registry is
   the perfect backend for it — each WhatsApp intent maps to an existing tool.
6. **Bank/mobile-money payment file → actually pays people.** Exports exist but
   silently drop employees missing details (now flagged in review). Close the
   loop: validated bank files + mobile-money bulk disbursement integration.
7. **Onboarding wizard.** First-run today drops the admin into an empty
   dashboard. A guided "add your company → import staff → run your first
   (sandbox) payroll" flow converts trials. The import centre already exists;
   wrap it in a checklist.
8. **Reporting & statutory schedules.** One-click PAYE/NSSF/SDL/WCF filing
   schedules and a headcount/cost dashboard. HR/finance live in these; they're
   the artifacts that justify the subscription internally.

## Tier 3 — Operational excellence (owner-side, mostly shipped now)

9. **Platform console** — shipped this pass (`/owner`): every company, plan,
   status, headcount, users, payroll volume, AI usage. Extend with: churn/trial
   expiry alerts, per-tenant health (last login, last payroll run), and a
   support impersonation path (audited) for helping customers.
10. **Ambient AI agents** (spine shipped): contract-expiry chasers, missing
    attendance nudges, payroll variance flags — the "tireless employee" that
    lets you sell *work*, not software. Build the dispatcher next.
11. **Status page + uptime + backups discipline.** Trust infrastructure for a
    system holding payroll. Cheap to stand up, disproportionately reassuring.

## The one-line strategy

Sell **outcomes on the phone of every worker** (payslip, leave, pay-change
explanation over WhatsApp) billed via **mobile money per active employee**, with
the owner console proving the business runs itself. Tier 1 unlocks revenue;
Tier 2 is why they stay and tell other SMEs.
