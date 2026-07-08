/**
 * Sprint 8 end-to-end test: the monthly payroll process on the live DB using
 * production code — run calculation, real-time single-employee recalc,
 * variance engine, DB-enforced immutability after approval, state machine,
 * payment files and statutory schedules.
 * Run from apps/web:  pnpm dlx tsx --env-file=.env.local scripts/e2e-sprint8.mts
 */
import { createClient } from '@supabase/supabase-js';
import { provisionTenant } from '../src/lib/tenancy/provision';
import { calculateRunCore, recalcEmployeeLine, type RunRow } from '../src/lib/payroll/run-calc';
import { buildBankCsv, buildMobileMoneyCsv, buildStatutoryCsv, type ExportLine } from '../src/lib/payroll/exports';
import type { VarianceFinding } from '../src/lib/payroll/variance';

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
const runIds: string[] = [];

try {
  const { data: u, error: uErr } = await admin.auth.admin.createUser({
    email: `e2e-s8-${stamp}@stellix-test.example.com`, password, email_confirm: true,
  });
  if (uErr || !u.user) throw uErr ?? new Error('user failed');
  userId = u.user.id;
  const { tenantId: tid, legalEntityId } = await provisionTenant(admin, {
    userId, companyName: `E2E S8 Co ${stamp}`, jurisdiction: 'tz_mainland', sector: 'private',
  });
  tenantId = tid;
  const client = createClient(url, anonKey);
  await client.auth.signInWithPassword({
    email: `e2e-s8-${stamp}@stellix-test.example.com`, password,
  });

  // ── Setup: two employees, salaries, components, payment accounts ───────
  async function hire(no: string, first: string, salary: number) {
    const { data: emp } = await client.from('employees')
      .insert({
        tenant_id: tenantId, legal_entity_id: legalEntityId, employee_number: no,
        first_name: first, last_name: 'Test', hire_date: '2026-01-01', status: 'active',
      }).select('id').single();
    await client.from('employee_compensation').insert({
      tenant_id: tenantId, employee_id: emp!.id, basic_salary: salary, effective_from: '2026-01-01',
    });
    return emp!.id as string;
  }
  const emp1 = await hire('EMP-0001', 'Asha', 1_000_000);
  const emp2 = await hire('EMP-0002', 'Bakari', 400_000);

  const { data: houseComp } = await client.from('pay_components')
    .insert({ tenant_id: tenantId, name: 'Housing allowance', code: 'HOUSE', component_type: 'earning', calc_type: 'fixed', default_amount: 200_000, taxable: true, pensionable: false })
    .select('id').single();
  await client.from('employee_pay_components').insert({
    tenant_id: tenantId, employee_id: emp1, pay_component_id: houseComp!.id, effective_from: '2026-01-01',
  });
  await client.from('employee_bank_accounts').insert([
    { tenant_id: tenantId, employee_id: emp1, payment_method: 'bank', bank_name: 'CRDB', account_name: 'Asha Test', account_number: '0150111222333', is_primary: true },
    { tenant_id: tenantId, employee_id: emp2, payment_method: 'mobile_money', mobile_money_provider: 'M-Pesa', mobile_money_number: '+255700000002', is_primary: true },
  ]);

  // ── June run: calculate + approve (baseline for variances) ─────────────
  const { data: juneRun } = await client.from('payroll_runs')
    .insert({ tenant_id: tenantId, legal_entity_id: legalEntityId, period_year: 2026, period_month: 6, created_by: userId })
    .select('*').single();
  runIds.push(juneRun!.id);
  const juneOutcome = await calculateRunCore(client, juneRun as RunRow);
  // emp1: gross 1.2M, NSSF 120k, taxable 1.08M, PAYE 152,000, net 928,000
  // emp2: gross 400k, NSSF 40k, taxable 360k, PAYE 7,200, net 352,800
  check('June: 2 employees calculated', juneOutcome.employees === 2);
  check('June totals: net 1,280,800 · PAYE 159,200',
    juneOutcome.totals.net === 1_280_800 && juneOutcome.totals.paye === 159_200,
    JSON.stringify(juneOutcome.totals));
  await client.from('payroll_runs').update({ status: 'approved', approved_by: userId, approved_at: new Date().toISOString() }).eq('id', juneRun!.id);

  // ── July run: calculate, then real-time bonus recalc ───────────────────
  const { data: julyRun } = await client.from('payroll_runs')
    .insert({ tenant_id: tenantId, legal_entity_id: legalEntityId, period_year: 2026, period_month: 7, created_by: userId })
    .select('*').single();
  runIds.push(julyRun!.id);
  await calculateRunCore(client, julyRun as RunRow);

  await client.from('payroll_run_inputs').insert({
    tenant_id: tenantId, run_id: julyRun!.id, employee_id: emp1,
    code: 'BONUS', name: 'Performance bonus', input_type: 'earning',
    amount: 100_000, taxable: true, pensionable: false, created_by: userId,
  });
  const impact = await recalcEmployeeLine(client, julyRun as RunRow, emp1);
  // With bonus: gross 1.3M, NSSF 130k, taxable 1.17M, PAYE 179,000, net 991,000
  check('real-time recalc: previous net 928,000 → new net 991,000',
    impact.previous?.net === 928_000 && impact.next.net === 991_000,
    JSON.stringify(impact));
  const { data: julyAfterBonus } = await client.from('payroll_runs').select('totals').eq('id', julyRun!.id).single();
  check('totals updated instantly after single-employee recalc',
    (julyAfterBonus?.totals as { net: number }).net === 991_000 + 352_800,
    JSON.stringify(julyAfterBonus?.totals));

  // ── New hire mid-period → full recalc → variance engine ────────────────
  const emp3 = await hire('EMP-0003', 'Chiku', 500_000);
  const julyOutcome = await calculateRunCore(client, julyRun as RunRow);
  check('July: 3 employees after new hire', julyOutcome.employees === 3);
  const types = julyOutcome.variances.map((v: VarianceFinding) => `${v.type}:${v.employeeName.split(' ')[0]}`);
  check('variance: new employee detected', types.includes('new_employee:Chiku'), types.join(','));
  check('variance: PAYE change flagged for bonus recipient',
    julyOutcome.variances.some((v) => v.type === 'paye_change' && v.employeeName.startsWith('Asha')));

  // ── Approve → DB-level immutability ────────────────────────────────────
  const { error: approveErr } = await client.from('payroll_runs')
    .update({ status: 'approved', approved_by: userId, approved_at: new Date().toISOString() })
    .eq('id', julyRun!.id);
  check('July approved', !approveErr, approveErr?.message);

  const { error: lineEditErr } = await client.from('payroll_run_lines')
    .update({ net_pay: 9_999_999 }).eq('run_id', julyRun!.id).eq('employee_id', emp1);
  check('approved line UPDATE blocked by trigger',
    Boolean(lineEditErr?.message.includes('immutable')), lineEditErr?.message);

  const { error: lineDelErr } = await client.from('payroll_run_lines')
    .delete().eq('run_id', julyRun!.id).eq('employee_id', emp1);
  check('approved line DELETE blocked', Boolean(lineDelErr?.message.includes('immutable')));

  const { error: inputErr } = await client.from('payroll_run_inputs').insert({
    tenant_id: tenantId, run_id: julyRun!.id, employee_id: emp1,
    code: 'X', name: 'Sneaky', input_type: 'earning', amount: 1, created_by: userId,
  });
  check('approved run rejects new inputs', Boolean(inputErr?.message.includes('immutable')));

  let recalcBlocked = false;
  try {
    const { data: fresh } = await client.from('payroll_runs').select('*').eq('id', julyRun!.id).single();
    await calculateRunCore(client, fresh as RunRow);
  } catch {
    recalcBlocked = true;
  }
  check('recalculation of approved run blocked', recalcBlocked);

  const { error: totalsErr } = await client.from('payroll_runs')
    .update({ totals: { net: 1 } }).eq('id', julyRun!.id);
  check('approved totals tamper blocked', Boolean(totalsErr?.message));

  const { error: backwardsErr } = await client.from('payroll_runs')
    .update({ status: 'draft' }).eq('id', julyRun!.id);
  check('backwards transition approved→draft blocked', Boolean(backwardsErr?.message));

  // ── Forward transitions: paid → closed ─────────────────────────────────
  const { error: paidErr } = await client.from('payroll_runs')
    .update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', julyRun!.id);
  const { error: closedErr } = await client.from('payroll_runs')
    .update({ status: 'closed', closed_at: new Date().toISOString() }).eq('id', julyRun!.id);
  check('approved → paid → closed transitions allowed', !paidErr && !closedErr,
    paidErr?.message ?? closedErr?.message);

  // ── Exports from immutable snapshots ───────────────────────────────────
  const { data: lineRows } = await client.from('payroll_run_lines')
    .select('employee_name, employee_number, gross_pay, taxable_income, paye, pension_employee, net_pay, employer_contributions, payment')
    .eq('run_id', julyRun!.id).order('employee_number');
  const exportLines: ExportLine[] = (lineRows ?? []).map((r) => ({
    employeeName: r.employee_name, employeeNumber: r.employee_number,
    grossPay: Number(r.gross_pay), taxableIncome: Number(r.taxable_income),
    paye: Number(r.paye), pensionEmployee: Number(r.pension_employee),
    netPay: Number(r.net_pay),
    employerContributions: r.employer_contributions as Array<{ code: string; amount: number }>,
    payment: r.payment as ExportLine['payment'],
  }));

  const bankCsv = buildBankCsv(exportLines);
  check('bank file: only the bank-paid employee, correct net',
    bankCsv.includes('0150111222333') && bankCsv.includes('991000') && !bankCsv.includes('+255700000002'),
    bankCsv);
  const mmCsv = buildMobileMoneyCsv(exportLines);
  check('mobile-money file: M-Pesa employee with 352,800',
    mmCsv.includes('+255700000002') && mmCsv.includes('352800') && !mmCsv.includes('0150111222333'));
  const payeCsv = buildStatutoryCsv('paye', exportLines);
  check('PAYE schedule: 3 employees + header',
    payeCsv.split('\n').length === 4 && payeCsv.includes('179000'));
  const pensionCsv = buildStatutoryCsv('pension', exportLines);
  check('pension schedule totals employee+employer shares',
    pensionCsv.includes('130000,130000,260000'));
  const sdlCsv = buildStatutoryCsv('sdl_wcf', exportLines);
  check('SDL/WCF schedule includes 45,500 SDL for gross 1.3M',
    sdlCsv.includes('45500'), sdlCsv);
} finally {
  // Escape hatch for cleanup: finalized runs must be reversed before delete.
  for (const runId of runIds) {
    await admin.from('payroll_runs').update({ status: 'reversed' }).eq('id', runId);
  }
  if (tenantId) await admin.from('tenants').delete().eq('id', tenantId);
  if (userId) await admin.auth.admin.deleteUser(userId);
  console.log('cleanup done');
}

if (failures > 0) {
  console.error(`\n${failures} check(s) FAILED`);
  process.exit(1);
}
console.log('\nAll Sprint 8 checks passed.');
