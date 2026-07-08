/**
 * Sprint 7 end-to-end test: the production payroll engine computing from the
 * LIVE seeded Tanzania Mainland compliance pack — rules loaded from the
 * database exactly as the app loads them, components from real assignments.
 * Run from apps/web:  pnpm dlx tsx --env-file=.env.local scripts/e2e-sprint7.mts
 */
import { createClient } from '@supabase/supabase-js';
import { provisionTenant } from '../src/lib/tenancy/provision';
import {
  calculatePayroll,
  type ComplianceRuleRow,
  type PayComponentInput,
} from '../src/lib/payroll/engine';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  console.log(`${ok ? '✓' : '✗'} ${label}${ok || !detail ? '' : ` — ${detail}`}`);
  if (!ok) failures++;
}

const stamp = Math.random().toString(36).slice(2, 8);
const password = `E2e!${stamp}Aa11`;
let userId = '';
let tenantId = '';
const PERIOD = { year: 2026, month: 7 };

try {
  const { data: u, error: uErr } = await admin.auth.admin.createUser({
    email: `e2e-s7-${stamp}@stellix-test.example.com`, password, email_confirm: true,
  });
  if (uErr || !u.user) throw uErr ?? new Error('user failed');
  userId = u.user.id;
  const { tenantId: tid, legalEntityId } = await provisionTenant(admin, {
    userId, companyName: `E2E S7 Co ${stamp}`, jurisdiction: 'tz_mainland', sector: 'private',
  });
  tenantId = tid;
  const client = createClient(url, anonKey);
  await client.auth.signInWithPassword({
    email: `e2e-s7-${stamp}@stellix-test.example.com`, password,
  });

  // ── 1. Load the live compliance pack the way the loader does ───────────
  const { data: link } = await client
    .from('legal_entity_compliance')
    .select('pack_id')
    .eq('legal_entity_id', legalEntityId)
    .maybeSingle();
  check('compliance pack attached at provisioning', Boolean(link?.pack_id));

  const { data: ruleRows } = await client
    .from('compliance_rules')
    .select('*')
    .eq('pack_id', link!.pack_id);
  const rules = (ruleRows ?? []) as ComplianceRuleRow[];
  check('live pack has 6 rules (PAYE, NSSF×2, SDL, WCF, minimum wage)',
    rules.length === 6, `got ${rules.length}: ${rules.map((r) => r.rule_type).join(',')}`);

  // ── 2. Employee with components stored in the DB ───────────────────────
  const { data: emp } = await client.from('employees')
    .insert({
      tenant_id: tenantId, legal_entity_id: legalEntityId, employee_number: 'EMP-0001',
      first_name: 'Salma', last_name: 'Kileo', hire_date: '2026-01-01', status: 'active',
    }).select('id').single();
  await client.from('employee_compensation').insert({
    tenant_id: tenantId, employee_id: emp!.id, basic_salary: 1_000_000, effective_from: '2026-01-01',
  });

  const componentDefs = [
    { name: 'Housing allowance', code: 'HOUSE', component_type: 'earning', calc_type: 'fixed', default_amount: 200_000, taxable: true, pensionable: true },
    { name: 'Transport allowance', code: 'TRANS', component_type: 'earning', calc_type: 'fixed', default_amount: 100_000, taxable: false, pensionable: false },
    { name: 'Staff loan', code: 'LOAN', component_type: 'deduction', calc_type: 'fixed', default_amount: 50_000, taxable: false, pensionable: false },
  ];
  const { data: createdComponents, error: compErr } = await client
    .from('pay_components')
    .insert(componentDefs.map((c) => ({ tenant_id: tenantId, ...c })))
    .select('id, code');
  check('pay components created', !compErr && createdComponents?.length === 3, compErr?.message);

  await client.from('employee_pay_components').insert(
    createdComponents!.map((c) => ({
      tenant_id: tenantId, employee_id: emp!.id, pay_component_id: c.id,
      effective_from: '2026-01-01',
    })),
  );

  // ── 3. Assemble engine input from DB rows (loader mapping) ─────────────
  const { data: assignments } = await client
    .from('employee_pay_components')
    .select('amount, pay_components(code, name, component_type, calc_type, default_amount, taxable, pensionable, is_active)')
    .eq('employee_id', emp!.id)
    .is('effective_to', null);
  type Row = { code: string; name: string; component_type: string; calc_type: string; default_amount: number | null; taxable: boolean; pensionable: boolean; is_active: boolean };
  const components: PayComponentInput[] = (assignments ?? [])
    .map((a) => {
      const embedded = a.pay_components as Row | Row[] | null;
      const c = Array.isArray(embedded) ? embedded[0] : embedded;
      return {
        code: c!.code, name: c!.name,
        componentType: c!.component_type as 'earning' | 'deduction',
        calcType: c!.calc_type as 'fixed' | 'percent_of_basic',
        amount: Number(a.amount ?? c!.default_amount ?? 0),
        taxable: c!.taxable, pensionable: c!.pensionable,
      };
    })
    .sort((a, b) => a.code.localeCompare(b.code));
  check('3 components loaded from DB', components.length === 3);

  // ── 4. Calculate with LIVE rules ───────────────────────────────────────
  // basic 1,000,000 + housing 200,000 + transport 100,000 = gross 1,300,000
  // NSSF ee 10% of gross = 130,000 · taxable = 1,200,000 − 130,000 = 1,070,000
  // PAYE = 128,000 + 30% × 70,000 = 149,000 · loan 50,000
  // net = 1,300,000 − 130,000 − 149,000 − 50,000 = 971,000
  // employer: NSSF 130,000 + SDL 45,500 + WCF 6,500 → cost 1,482,000
  const result = calculatePayroll(
    { employeeId: emp!.id, employeeName: 'Salma Kileo', basicSalary: 1_000_000, components },
    PERIOD,
    rules,
  );
  check('live gross 1,300,000', result.grossPay === 1_300_000, String(result.grossPay));
  check('live NSSF employee 130,000',
    result.statutoryDeductions.find((d) => d.code === 'PENSION_EE')?.amount === 130_000);
  check('live taxable 1,070,000', result.taxableIncome === 1_070_000, String(result.taxableIncome));
  check('live PAYE 149,000', result.paye === 149_000, String(result.paye));
  check('live net 971,000', result.netPay === 971_000, String(result.netPay));
  check('live SDL 45,500', result.employerContributions.find((c) => c.code === 'SDL')?.amount === 45_500);
  check('live WCF 6,500', result.employerContributions.find((c) => c.code === 'WCF')?.amount === 6_500);
  check('live employer cost 1,482,000', result.employerCost === 1_482_000, String(result.employerCost));
  check('trace cites live rule ids and versions',
    result.trace.filter((t) => t.rule).length >= 5);
  check('draft pack produces verification warnings',
    result.warnings.some((w) => w.includes('DRAFT')));

  // ── 5. Minimum wage warning from the live rule ─────────────────────────
  const lowPay = calculatePayroll(
    { employeeId: 'x', employeeName: 'Low', basicSalary: 50_000, components: [] },
    PERIOD,
    rules,
  );
  check('live minimum-wage rule warns at 50,000',
    lowPay.warnings.some((w) => w.includes('below the general minimum wage')));

  // ── 6. Determinism against live rules ──────────────────────────────────
  const again = calculatePayroll(
    { employeeId: emp!.id, employeeName: 'Salma Kileo', basicSalary: 1_000_000, components },
    PERIOD,
    rules,
  );
  check('deterministic with live rules', JSON.stringify(result) === JSON.stringify(again));
} finally {
  if (tenantId) await admin.from('tenants').delete().eq('id', tenantId);
  if (userId) await admin.auth.admin.deleteUser(userId);
  console.log('cleanup done');
}

if (failures > 0) {
  console.error(`\n${failures} check(s) FAILED`);
  process.exit(1);
}
console.log('\nAll Sprint 7 checks passed.');
