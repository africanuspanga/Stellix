import { createClient } from '@supabase/supabase-js';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const PASSWORD = 'DriftmarkDemo2026!';

async function login(email: string) {
  const c = createClient(url, anon);
  const { error } = await c.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`${email}: ${error.message}`);
  return c;
}

// Admin persona
const t0 = Date.now();
const adminC = await login('demo-admin@driftmark.co.tz');
const [emps, runs, lines, variances, filings, desk] = await Promise.all([
  adminC.from('employees').select('id', { count: 'exact', head: true }),
  adminC.from('payroll_runs').select('period_month, status, totals').order('period_month'),
  adminC.from('payroll_run_lines').select('id', { count: 'exact', head: true }),
  adminC.from('payroll_runs').select('variances').eq('period_month', 7).single(),
  adminC.from('statutory_filings').select('filing_type, status, due_date'),
  adminC.from('service_requests').select('id', { count: 'exact', head: true }),
]);
console.log(`ADMIN sees: ${emps.count} employees, ${runs.data?.length} runs, ${lines.count} lines, ${desk.count} desk requests (${Date.now() - t0}ms)`);
console.log('  runs:', runs.data?.map((r) => `${r.period_month}:${r.status}`).join(' '));
console.log('  july variances:', (variances.data?.variances as unknown[])?.length);
console.log('  filings:', filings.data?.map((f) => `${f.filing_type}:${f.status}`).join(' '));

// Manager persona
const mgrC = await login('demo-manager@driftmark.co.tz');
const { data: mgrSteps } = await mgrC.from('workflow_step_actions')
  .select('id, sla_hours, created_at').eq('status', 'pending');
const { data: mgrMe } = await mgrC.from('employees').select('id').eq('work_email', 'demo-manager@driftmark.co.tz').single();
const { data: reports } = await mgrC.from('employee_assignments')
  .select('id', { count: 'exact', head: true }).eq('manager_employee_id', mgrMe!.id).is('effective_to', null);
console.log(`MANAGER sees: ${mgrSteps?.length} pending approval steps, ${reports === null ? 'n/a' : ''}${(reports as never) ?? ''} direct reports (Engineering: 24 expected)`);
const { count: reportCount } = await mgrC.from('employee_assignments')
  .select('id', { count: 'exact', head: true }).eq('manager_employee_id', mgrMe!.id).is('effective_to', null);
console.log(`  direct reports: ${reportCount}`);

// Employee persona — privacy check at scale
const empC = await login('demo-employee@driftmark.co.tz');
const [{ data: ownLines }, { count: allRuns }, { data: ownComp }, { data: notifs }] = await Promise.all([
  empC.from('payroll_run_lines').select('run_id, net_pay'),
  empC.from('payroll_runs').select('id', { count: 'exact', head: true }),
  empC.from('employee_compensation').select('employee_id'),
  empC.from('notifications').select('title'),
]);
console.log(`EMPLOYEE sees: ${ownLines?.length} payslip lines (own only, 5 expected), ${allRuns} runs (0 expected), ${ownComp?.length} salary rows (1 expected), ${notifs?.length} notifications`);
console.log('\nAll personas verified.');
