# Stellix is AI-Native, Not AI-Assisted

The litmus test: **if every screen were deleted, an AI agent could still run
HR and payroll through Stellix** — because the screens were only ever one of
two clients. Humans and AI agents are both first-class user classes, and both
use the same doors.

## The three structural commitments

### 1. Every action is a callable, described operation
`apps/web/src/lib/tools/` is the tool registry. Every business operation is a
discrete service with a name (`people.find_employee`, `desk.raise_request`),
a description, JSON-Schema typed inputs, a **permission requirement** and a
**risk level**. Humans reach it through a button; agents reach it through a
tool call. One code path: `executeTool()` is the single choke point that does
the permission check, records the audit trail, and emits the domain event —
there is no AI backdoor and no logic an agent can't reach.

Risk levels:
| Risk | Meaning | Agent behaviour |
|---|---|---|
| 0 | Read-only: query & explain | Executes freely (unless disabled) |
| 1 | Draft: produces content, changes nothing | Executes freely (unless disabled) |
| 2 | Controlled write (leave request, desk ticket) | **Proposal** by default — human confirms |
| 3 | Money / irreversible (payroll approval, payments, termination) | **Structurally unreachable** — `humanOnly`, enforced in code, not prompt |

The registry refuses to register a risk-3 tool that is not `humanOnly`.

### 2. The AI is a user with an identity, not a superpower
The agent always acts **on behalf of** the signed-in human, inside their RLS
session, checked by the **same permission service** (`lib/authz.ts` →
`ctx.permissions`) that governs buttons. The AI acting for an employee can
raise a desk ticket but cannot read colleagues' salaries — exactly like the
employee. Human-only permissions (`payroll.run.approve`,
`payroll.payment.release`) are unreachable for agents at the executor level.
Every agent invocation is written to `agent_actions` (what was asked, which
tool, what input, at what risk, who it acted for, who approved, what changed)
**before** the result goes anywhere — trust is inspectable.

### 3. Everything emits events, and agents listen
`domain_events` (migration `0019`) is the nervous system: tools declare what
fact they publish (`desk.request.raised`, `leave.requested`) and
`executeTool` emits it on success. `processed_at` is the ambient dispatcher's
checkpoint, so standing agents can subscribe like staff with infinite
attention: *quote sent + 48h silence → draft follow-up* becomes, in Stellix
terms, *contract expiring in 30 days → draft the renewal letter*.

## The trust ladder (graduated autonomy)

`ai_autonomy_policies` grants autonomy **per tool, per tenant**, the way you
delegate to a new employee: `0` disabled → `1` read/draft → `2` propose
(human confirms each) → `3` bounded autonomy. Defaults are conservative
(reads free, writes propose). Proposals live in `agent_actions
(status='proposed')`; confirming one re-executes through the same choke
point under the human's own identity. The irreducible always-human list is
not a policy row — it's the `humanOnly` flag, unchangeable at runtime.

## Facts vs knowledge

Numbers — pay, balances, headcounts — come **only** from structured tool
queries (the payroll engine computed them deterministically). The model's
fuzzy retrieval is used only for unstructured knowledge (company policies,
documents). The agent guardrails (`lib/ai/agent.ts`) forbid generating or
recalculating figures: the model narrates facts, it never produces them.

## The three agent modes

- **Reactive** (shipped): "find Juma's payslip and explain the PAYE" — the
  agent card on `/dashboard/ai` plans with Kimi tool-calling and acts through
  the registry.
- **Ambient** (spine shipped, dispatcher next): standing subscribers on
  `domain_events` — contract-expiry chasers, unmatched-payment flags,
  missing-attendance nudges.
- **Autonomous-within-policy** (ladder shipped): level-3 grants per tool per
  tenant, earned as the AI proves itself.

## Commercial framing

AI-assisted SaaS sells software; the customer still does the work. Stellix
sells **work**: the platform follows up, reconciles, chases, drafts and
monitors — a tireless colleague, priced like one. That cannot be retrofitted:
the registry, the permissioned agent identity and the event spine are the
skeleton, not an add-on.

## Coverage roadmap

The doors exist; now every operation moves behind them:

1. Extract the remaining server-action logic into `lib/` functions and
   register them as tools (leave request/approval, employment actions,
   onboarding tasks, attendance corrections). The rule is in `CLAUDE.md`:
   **new business operations must register a tool** — the server action
   becomes a thin wrapper over `executeTool`.
2. Ambient dispatcher: a scheduled worker (Supabase cron / Vercel cron)
   draining unprocessed `domain_events` through subscribed agents, writing
   drafts and notifications — never level-3 actions without a policy grant.
3. Autonomy settings UI on `/dashboard/settings` (read `ai_autonomy_policies`,
   admin-managed, per tool).
4. Proposal inbox: surface `agent_actions (proposed)` for one-click
   confirm/reject (the `confirmProposal`/`rejectProposal` executors exist).
5. Backfill `emitEvent` into the existing high-value server actions
   (payroll run lifecycle, employment actions, leave decisions) so the event
   spine covers the whole product, not just tool calls.
