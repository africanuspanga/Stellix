# Stellix — Powering Africa's Workforce

> Brand: Stellix. Colours: black & white (neutral shadcn theme).

Tanzania's AI-native workforce and payroll operating system: manage employees
from hiring to exit, automate compliant payroll, control attendance and
shifts, and give every worker access through web, mobile and WhatsApp.

- **Blueprint:** `docs/BLUEPRINT.md` (scope source of truth)
- **Roadmap:** `docs/SPRINTS.md` (Sprint 0 → first commercial release)
- **Conventions:** `CLAUDE.md`

## Structure

```
apps/web                 Next.js 16 app (App Router, TS, Tailwind)
packages/database        Supabase SQL migrations + migrate script
packages/ai              Moonshot Kimi client (AI explains, never calculates)
packages/config          Shared constants (pillars, locales)
docs/                    Blueprint + sprint roadmap
```

## Getting started

```bash
pnpm install
pnpm dev           # http://localhost:3000
```

## Connecting Supabase (when credentials arrive)

1. Copy `.env.example` → `apps/web/.env.local`, fill in
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`.
2. Apply migrations:
   ```bash
   SUPABASE_DB_URL=postgres://... packages/database/scripts/migrate.sh
   ```
3. Restart `pnpm dev` — the home page shows connection status.

Migrations `0001`–`0005` create: tenancy hierarchy (partner → tenant → legal
entity) with RLS isolation, roles/permissions, immutable audit log, full
organization structure with independent positions, effective-dated employee
records, and the versioned compliance rule engine seeded with a **draft**
Tanzania Mainland private-sector pack (PAYE bands, NSSF, SDL, WCF — must be
verified against current law before live payroll).

## AI

`packages/ai` targets Moonshot's OpenAI-compatible API
(`MOONSHOT_API_KEY`, model `kimi-k2.6`). Platform rule: AI explains payroll
and policy — the deterministic payroll engine does all calculation.
