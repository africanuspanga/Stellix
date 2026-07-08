-- 0005: Compliance platform service (blueprint §5) — versioned compliance
-- packs and effective-dated statutory rules. No statutory percentage is ever
-- hard-coded in application code (non-negotiable #4); the payroll engine
-- reads these rows for the pay period being calculated.

create type public.rule_status as enum ('draft', 'approved', 'retired');

create table public.compliance_packs (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,          -- e.g. 'tz-mainland-private'
  name text not null,
  jurisdiction text not null check (jurisdiction in ('tz_mainland', 'tz_zanzibar')),
  sector text not null check (sector in ('private', 'public')),
  version integer not null default 1,
  status public.rule_status not null default 'draft',
  created_at timestamptz not null default now()
);

create table public.compliance_rules (
  id uuid primary key default gen_random_uuid(),
  pack_id uuid not null references public.compliance_packs(id) on delete cascade,
  rule_type text not null check (rule_type in (
    'paye', 'pension_employee', 'pension_employer', 'sdl', 'wcf',
    'health_employee', 'health_employer', 'minimum_wage', 'overtime',
    'night_work', 'leave_entitlement', 'severance', 'notice_period'
  )),
  name text not null,
  -- Interpreted by the payroll engine. Shapes per rule_type, e.g.:
  --   progressive_bands: {"bands":[{"upTo":270000,"rate":0,"base":0}, ...]}
  --   percentage:        {"rate":0.10,"of":"gross|basic|pensionable"}
  --   flat_monthly:      {"amount":150000,"period":"monthly"}
  formula jsonb not null,
  employee_category text,             -- null = all
  effective_from date not null,
  effective_to date,
  priority integer not null default 0,
  rounding_method text not null default 'round_half_up'
    check (rounding_method in ('round_half_up', 'round_down', 'round_up', 'none')),
  legal_source text,
  status public.rule_status not null default 'draft',
  version integer not null default 1,
  created_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from)
);
create index compliance_rules_lookup_idx
  on public.compliance_rules (pack_id, rule_type, effective_from);

-- Which pack applies to which legal entity, effective-dated so a rule change
-- (or a Zanzibar expansion) never rewrites history.
create table public.legal_entity_compliance (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  legal_entity_id uuid not null references public.legal_entities(id) on delete cascade,
  pack_id uuid not null references public.compliance_packs(id),
  effective_from date not null,
  effective_to date,
  created_at timestamptz not null default now()
);

create table public.public_holidays (
  id uuid primary key default gen_random_uuid(),
  jurisdiction text not null check (jurisdiction in ('tz_mainland', 'tz_zanzibar', 'both')),
  holiday_date date not null,
  name_en text not null,
  name_sw text not null,
  is_movable boolean not null default false,  -- Eid etc. confirmed per year
  unique (jurisdiction, holiday_date, name_en)
);

-- ── RLS ─────────────────────────────────────────────────────────────────
-- Packs, rules and holidays are platform-level reference data: readable by
-- all authenticated users, writable only by the platform owner (service role).
alter table public.compliance_packs enable row level security;
alter table public.compliance_rules enable row level security;
alter table public.public_holidays enable row level security;
alter table public.legal_entity_compliance enable row level security;

create policy compliance_packs_read on public.compliance_packs
  for select using (auth.role() = 'authenticated');
create policy compliance_rules_read on public.compliance_rules
  for select using (auth.role() = 'authenticated');
create policy public_holidays_read on public.public_holidays
  for select using (auth.role() = 'authenticated');
create policy legal_entity_compliance_member on public.legal_entity_compliance
  for all
  using (tenant_id in (select app.user_tenant_ids()))
  with check (tenant_id in (select app.user_tenant_ids()));

-- ── Seed: Tanzania Mainland — Private Sector ────────────────────────────
-- Rates below are seeded as DRAFT. They reflect commonly published values
-- but MUST be verified against current TRA/NSSF/WCF/SDL law and set to
-- 'approved' during the Sprint 7 compliance sign-off before any live payroll.
insert into public.compliance_packs (code, name, jurisdiction, sector, status)
values ('tz-mainland-private', 'Tanzania Mainland — Private Sector', 'tz_mainland', 'private', 'draft');

insert into public.compliance_rules
  (pack_id, rule_type, name, formula, effective_from, legal_source, status)
select p.id, r.rule_type, r.name, r.formula::jsonb, date '2025-07-01', r.legal_source, 'draft'
from public.compliance_packs p,
(values
  ('paye', 'PAYE — resident individual, monthly',
   '{"type":"progressive_bands","period":"monthly","bands":[
      {"upTo":270000,"rate":0,"base":0},
      {"upTo":520000,"rate":0.08,"base":0,"over":270000},
      {"upTo":760000,"rate":0.20,"base":20000,"over":520000},
      {"upTo":1000000,"rate":0.25,"base":68000,"over":760000},
      {"upTo":null,"rate":0.30,"base":128000,"over":1000000}]}',
   'Income Tax Act — VERIFY current bands before approval'),
  ('pension_employee', 'NSSF — employee share',
   '{"type":"percentage","rate":0.10,"of":"gross"}',
   'NSSF Act — VERIFY'),
  ('pension_employer', 'NSSF — employer share',
   '{"type":"percentage","rate":0.10,"of":"gross"}',
   'NSSF Act — VERIFY'),
  ('sdl', 'Skills and Development Levy',
   '{"type":"percentage","rate":0.035,"of":"gross_payroll","minEmployees":10}',
   'Finance Act — VERIFY current rate and threshold'),
  ('wcf', 'Workers Compensation Fund — employer',
   '{"type":"percentage","rate":0.005,"of":"gross_payroll"}',
   'WCF Act — VERIFY current private-sector rate')
) as r(rule_type, name, formula, legal_source)
where p.code = 'tz-mainland-private';

-- Fixed-date national public holidays (movable Islamic holidays are inserted
-- per-year once confirmed).
insert into public.public_holidays (jurisdiction, holiday_date, name_en, name_sw, is_movable)
values
  ('both', date '2026-01-01', 'New Year''s Day', 'Mwaka Mpya', false),
  ('both', date '2026-01-12', 'Zanzibar Revolution Day', 'Mapinduzi ya Zanzibar', false),
  ('both', date '2026-04-07', 'Karume Day', 'Siku ya Karume', false),
  ('both', date '2026-04-26', 'Union Day', 'Muungano', false),
  ('both', date '2026-05-01', 'Workers'' Day', 'Sikukuu ya Wafanyakazi', false),
  ('both', date '2026-07-07', 'Saba Saba', 'Saba Saba', false),
  ('both', date '2026-08-08', 'Farmers'' Day', 'Nane Nane', false),
  ('both', date '2026-10-14', 'Nyerere Day', 'Siku ya Nyerere', false),
  ('both', date '2026-12-09', 'Independence Day', 'Uhuru', false),
  ('both', date '2026-12-25', 'Christmas Day', 'Krismasi', false),
  ('both', date '2026-12-26', 'Boxing Day', 'Siku ya Kufungua Zawadi', false);
