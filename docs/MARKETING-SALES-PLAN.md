# Stellix — 360° Marketing & Sales Plan (Tanzania)

> Working draft v1 · 2026-07-08 · Companion to `BLUEPRINT.md` (product) and
> `ADMIN-GUIDE.md` (how the system works). All amounts in TZS unless noted.

---

## 1. Positioning

**Category:** Tanzania's AI-native workforce & payroll operating system.
Not "an HR system" — an operating system for the whole employment lifecycle.

**Primary message (EN):**
> Manage employees from hiring to exit, automate compliant payroll, control
> attendance and shifts — and give every worker access from their phone.

**Primary message (SW):**
> Simamia wafanyakazi kuanzia kuajiriwa hadi kuondoka, lipa mishahara kwa
> usahihi na kwa mujibu wa sheria, dhibiti mahudhurio na zamu — na kila
> mfanyakazi apate huduma kupitia simu yake.

**Three proof points that close deals here:**
1. **Compliance you can defend** — PAYE, NSSF, SDL, WCF computed from
   versioned statutory rules; every payslip carries a full calculation trace
   ("which rule, which version, why this number"). Approved payroll is frozen
   at the database level — an auditor's dream.
2. **Built for field workers, not just office staff** — GPS check-in on any
   phone browser, Swahili interface, invite links shared over WhatsApp, no
   company email needed. Competitors assume everyone sits at a desk.
3. **AI that explains, never guesses** — employees ask "kwa nini mshahara
   wangu umepungua?" and get the actual calculation narrated, in Swahili,
   with the rules cited. HR stops answering the same payslip question 40
   times a month.

**Brand:** Stellix — black & white, clean, serious. Bilingual everything.
Tagline: *Powering Africa's Workforce*.

## 2. Market

### Size & shape (directional — validate in discovery)
- ~3M formal-sector employees in Tanzania; tens of thousands of registered
  companies filing PAYE/NSSF monthly.
- The real competitor is **Excel + a payroll clerk + a prayer**. Most
  companies under 300 staff run payroll on spreadsheets and file manually.
- TRA e-filing and NSSF online submissions keep tightening — compliance
  pressure is our tailwind. Every Finance Act change is a marketing moment.

### Segments (in priority order)

| # | Segment | Size profile | Pain | Package |
|---|---|---|---|---|
| 1 | **Growing SMEs** (30–300 staff): logistics, security firms, agri-processing, retail chains, construction, schools, clinics | Sweet spot | Excel payroll errors, TRA penalties, field-worker attendance chaos | Growth |
| 2 | **HR & accounting firms** running payroll for clients | 1 firm = 5–50 client companies | Juggling client spreadsheets; no client portal | Managed Payroll / Partner |
| 3 | **NGOs & donor-funded projects** | 20–500 staff | Audit trails, per-project cost allocation, timesheets | Growth/Enterprise |
| 4 | **Larger enterprises** (300–5,000): manufacturers, plantations, hotels, mining contractors | Fewer, longer cycles | Shift/roster complexity, multiple entities, unions | Enterprise |
| 5 | **Micro** (<30 staff) | Long tail | Price sensitivity | Starter (self-serve) |

### Competitive field & our angle

| Competitor type | Examples | Our wedge |
|---|---|---|
| Regional cloud HR | Workpay, SeamlessHR, PaySpace/Sage | Tanzania-first: TZ statutory packs, Swahili, mobile-money payouts, local support hours |
| Legacy local payroll | Aruti, desktop packages, bank payroll bureaus | Cloud + self-service + AI; no server in a closet |
| Global suites | BambooHR, Zoho People | They don't do TZ statutory payroll at all |
| Status quo | Excel + clerk | Free PAYE calculator + "cost of one TRA penalty" math |

## 3. Pricing (launch hypothesis — test with first 10 deals)

Per employee per month, billed annually (monthly +20%):

| Package | Price/employee/mo | Includes |
|---|---|---|
| **Starter** | TZS 2,500 | Employee records, leave, basic attendance, payroll + payslips, employee portal |
| **Growth** | TZS 4,500 | + shifts/roster, geofenced attendance, overtime, approvals, invites/Huduma, exports, filing tracker, AI assistants |
| **Enterprise** | TZS 7,000+ (custom) | + multiple entities, partner features, custom workflows, SSO (roadmap), dedicated support, sandbox |
| **Managed Payroll** | TZS 8,000–15,000 (service) | We (or a partner firm) run payroll end-to-end on Stellix |

- Floor of TZS 150,000/mo per tenant so micro accounts stay viable.
- Implementation fee: TZS 500K–5M depending on data migration scope (the
  Import Centre makes this cheap to deliver — sell it anyway).
- Partner firms: 25–30% recurring margin on client subscriptions they manage.
- **Anchor the value:** one avoided TRA penalty or one clerk-day saved per
  month pays for Growth at 100 employees.

## 4. Go-to-market phases

### Phase 0 — Foundation (weeks 0–4)
- Deploy production (Vercel + custom domain), rotate credentials, statutory
  rates verified & approved by a partner accountant (also our first champion).
- Landing page (bilingual) + **free Tanzania PAYE/net-pay calculator** as the
  lead magnet (the engine already computes this — expose a public page).
- Driftmark demo tenant polished (done); demo script rehearsed (see §6).
- Collateral: 2-page PDF (EN/SW), 3-minute demo video, WhatsApp intro message.

### Phase 1 — Lighthouse customers (months 1–3) · target: 5 paying tenants
- Hand-picked: 1 security firm (field workers), 1 school, 1 NGO, 1 retail
  chain, 1 accounting firm as first partner.
- Founder-led sales; 50% first-year discount in exchange for a logo, a case
  study, and a monthly feedback call.
- Success metric: **3 reference customers running real monthly payroll**.

### Phase 2 — Repeatable engine (months 4–9) · target: 40 tenants
- Hire 2 sales reps (Dar) + 1 implementation/support person.
- Partner program live: recruit 5 accounting/HR firms onto the partner
  portal; they bring books of clients.
- Content machine (§5) at full cadence; webinars each Finance Act update.
- Success metric: CAC < 4 months of subscription revenue; churn <2%/mo.

### Phase 3 — Scale & moats (months 10–18)
- Mwanza/Arusha coverage (branches already modeled in-product).
- WhatsApp bot ships (huge marketing moment: "payslip on WhatsApp").
- Bank/mobile-money payout integrations → co-marketing with a bank.
- Explore Zanzibar pack (product already supports separate jurisdiction).

## 5. Marketing channels (the 360°)

**Digital**
- **SEO/content:** own the queries — "PAYE calculator Tanzania", "NSSF
  contribution rate", "how to file SDL", "mkataba wa kazi template".
  Two posts/week, EN+SW. The free calculator is the funnel top.
- **LinkedIn:** founder + company posts 3×/week: payroll tips, Finance Act
  breakdowns, mini-demos. HR managers in TZ live here.
- **WhatsApp:** business line as the primary inbound channel ("Piga hodi kwa
  demo"); broadcast list for compliance alerts (opt-in from calculator).
- **Google Ads:** small always-on budget on high-intent payroll keywords.
- **Email:** monthly "Compliance Calendar" newsletter (filing deadlines —
  the product literally generates these dates).

**Offline / relationship (this is Tanzania — relationships close deals)**
- **Association of Tanzania Employers (ATE)** and HR professional forums:
  sponsor/speak at events; offer member pricing.
- **Accountant channel:** breakfast seminars for accounting firms — "Run all
  your clients' payroll from one dashboard" (partner portal demo).
- **TRA/NSSF seminar seasons:** be present wherever employers gather to
  hear about compliance changes.
- **University career/HR days:** brand seeding with tomorrow's HR managers.
- Radio (Clouds/EFM business slots) only after Phase 2 — awareness, not leads.

**Product-led**
- Payslips and invite messages carry "Powered by Stellix" (tasteful).
- Free calculator → email/WhatsApp capture → nurture sequence.
- Referral: one month free per referred tenant that converts.

## 6. Sales playbook

**Process:** Prospect → 20-min discovery call → **live Driftmark demo**
(30 min) → pilot proposal (1 month, their real data via Import Centre) →
contract → implementation (target: first payroll within 2 weeks).

**The demo script (using the Driftmark tenant):**
1. Open the **compliance dashboard** — overdue SDL filing, expiring permits,
   below-minimum-wage flags. "This is Monday morning as an HR manager."
2. Approve a **leave request** from the manager queue (SLA badge showing).
3. Check in with **GPS** as Juma the field officer (phone in hand).
4. Open the **July payroll run**: 8 variance findings; click one employee's
   **trace** — every shilling explained with the rule cited.
5. Show the **payslip** and the bank + mobile-money files.
6. Ask the **AI** (in Swahili): "Naweza kuhamisha siku ngapi za likizo?" —
   it answers from company policy with citation.
7. Close on the Import Centre: "Bring Friday's Excel; you'll see your own
   company here by Tuesday."

**Objection handling**
- *"Data yetu iko salama?"* → Tenant isolation enforced in the database
  (RLS), per-role permissions, EU-hosted encrypted infrastructure, full audit
  trail; your employees see only their own payslips (demonstrate live).
- *"Internet ikikata?"* → Payroll runs monthly, not per-minute; attendance
  works on any phone browser; offline capture is on the roadmap.
- *"Tuna mtu wa payroll tayari"* → Stellix makes them faster and auditable,
  not redundant — show the variance engine doing their review prep.
- *"Bei"* → Cost of one penalty / one clerk-day / one padded overtime claim.

**Team ramp:** founder-led (P1) → 2 AEs + 1 implementer (P2) → +1 partner
manager (P3). Comp: base + 15% of first-year contract value.

**KPIs:** demos/week, demo→pilot ≥40%, pilot→paid ≥60%, time-to-first-payroll
≤14 days, logo churn <2%/mo, NPS ≥45, partner-sourced revenue ≥30% by P3.

## 7. Budget sketch (first 12 months, excluding salaries)

| Line | TZS/yr |
|---|---|
| Domain, hosting, tooling | 6M |
| Content & design (freelance, bilingual) | 18M |
| Google/LinkedIn ads | 24M |
| Events, seminars, association fees | 20M |
| Collateral, video, swag | 8M |
| Referral & partner incentives | 10M |
| **Total** | **~86M (~USD 33K)** |

## 8. Risks & mitigations
- **Statutory change mid-year** → the rule engine is effective-dated by
  design; turn every change into a marketing win ("updated same week").
- **Long enterprise cycles** → keep SME motion primary; enterprises come via
  references.
- **Partner channel conflict** → clear rules: partners own accounts they
  source; house accounts flagged.
- **Copycats** → moats are the compliance pack depth, the audit/immutability
  story, Swahili AI, and the partner network — keep shipping.
