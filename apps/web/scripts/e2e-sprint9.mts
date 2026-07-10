/**
 * Sprint 9 end-to-end test: employee-experience privacy model on the live DB —
 * payslip/salary RLS (own data only), payslip metadata view, notifications
 * (own-only, mark read, EN/SW templates via production code), and the HR
 * service desk (agent vs employee visibility, internal notes).
 * Run from apps/web:  pnpm dlx tsx --env-file=.env.local scripts/e2e-sprint9.mts
 */
import { createClient } from '@supabase/supabase-js';
import { provisionTenant } from '../src/lib/tenancy/provision';
import { calculateRunCore, type RunRow } from '../src/lib/payroll/run-calc';
import { notify, renderTemplate, usersWithPermission } from '../src/lib/notify';

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
const userIds: string[] = [];
let tenantId = '';
let runId = '';

async function makeUser(tag: string): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email: `e2e-s9-${tag}-${stamp}@stellix-test.example.com`, password, email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error(`${tag} failed`);
  userIds.push(data.user.id);
  return data.user.id;
}
function signIn(tag: string) {
  const c = createClient(url, anonKey);
  return c.auth
    .signInWithPassword({ email: `e2e-s9-${tag}-${stamp}@stellix-test.example.com`, password })
    .then(() => c);
}

try {
  // ── Template rendering (production code, EN + SW) ──────────────────────
  const sw = renderTemplate('leave_approved', 'sw', { type: 'Likizo ya mwaka', from: '2026-08-03', to: '2026-08-07' });
  check('Swahili template renders', sw.title === 'Ombi la likizo limeidhinishwa' && sw.body.includes('limeidhinishwa'));
  const en = renderTemplate('leave_submitted', 'en', { employee: 'Asha', days: 3, type: 'Annual leave', from: 'a', to: 'b' });
  check('English template interpolates params', en.body.startsWith('Asha requested 3 day(s)'));

  // ── Tenant: admin A, employees B and C (employee role only) ────────────
  const userA = await makeUser('a');
  const userB = await makeUser('b');
  const userC = await makeUser('c');
  const { tenantId: tid, legalEntityId } = await provisionTenant(admin, {
    userId: userA, companyName: `E2E S9 Co ${stamp}`, jurisdiction: 'tz_mainland', sector: 'private',
  });
  tenantId = tid;
  const { data: employeeRole } = await admin
    .from('roles').select('id').eq('tenant_id', tenantId).eq('name', 'employee').single();
  await admin.from('tenant_users').insert([
    { tenant_id: tenantId, user_id: userB },
    { tenant_id: tenantId, user_id: userC },
  ]);
  await admin.from('user_roles').insert([
    { tenant_id: tenantId, user_id: userB, role_id: employeeRole!.id },
    { tenant_id: tenantId, user_id: userC, role_id: employeeRole!.id },
  ]);

  const clientA = await signIn('a');
  const clientB = await signIn('b');
  const clientC = await signIn('c');

  async function hire(no: string, first: string, salary: number, userId: string) {
    const { data: emp } = await clientA.from('employees')
      .insert({
        tenant_id: tenantId, legal_entity_id: legalEntityId, employee_number: no,
        first_name: first, last_name: 'Test', hire_date: '2026-01-01', status: 'active', user_id: userId,
      }).select('id').single();
    await clientA.from('employee_compensation').insert({
      tenant_id: tenantId, employee_id: emp!.id, basic_salary: salary, effective_from: '2026-01-01',
    });
    return emp!.id as string;
  }
  const empB = await hire('EMP-0001', 'Bahati', 900_000, userB);
  await hire('EMP-0002', 'Cecilia', 1_100_000, userC);

  // ── Payroll privacy ─────────────────────────────────────────────────────
  const { data: run } = await clientA.from('payroll_runs')
    .insert({ tenant_id: tenantId, legal_entity_id: legalEntityId, period_year: 2026, period_month: 7, created_by: userA })
    .select('*').single();
  runId = run!.id;
  await calculateRunCore(clientA, run as RunRow);
  await clientA.from('payroll_runs').update({ status: 'approved', approved_by: userA, approved_at: new Date().toISOString() }).eq('id', runId);

  const { data: bLines } = await clientB.from('payroll_run_lines').select('employee_id, net_pay');
  check('employee B sees exactly one line — their own',
    bLines?.length === 1 && bLines[0].employee_id === empB, JSON.stringify(bLines));

  const { data: bRuns } = await clientB.from('payroll_runs').select('id');
  check('employee B cannot read payroll_runs (totals protected)', bRuns?.length === 0);

  const { data: bMeta } = await clientB.from('payslip_run_meta').select('id, period_year, status');
  check('employee B reads payslip metadata via the view',
    bMeta?.length === 1 && bMeta[0].status === 'approved');

  const { data: bComp } = await clientB.from('employee_compensation').select('employee_id, basic_salary');
  check('employee B sees only their own salary',
    bComp?.length === 1 && bComp[0].employee_id === empB && Number(bComp[0].basic_salary) === 900_000);

  const { data: aLines } = await clientA.from('payroll_run_lines').select('id');
  check('payroll staff (admin) still sees all lines', aLines?.length === 2);

  // ── Notifications ───────────────────────────────────────────────────────
  const agents = await usersWithPermission(clientA, tenantId, 'experience.desk.agent');
  check('permission fan-out finds the admin as desk agent', agents.includes(userA));

  await notify(clientA, {
    tenantId, userIds: [userB], template: 'leave_approved', locale: 'sw',
    params: { type: 'Likizo', from: '2026-08-03', to: '2026-08-07' },
    category: 'leave', link: '/dashboard/me',
  });
  const { data: bNotifs } = await clientB.from('notifications').select('*');
  check('B received the Swahili notification',
    bNotifs?.length === 1 && bNotifs[0].title === 'Ombi la likizo limeidhinishwa');
  const { data: cNotifs } = await clientC.from('notifications').select('*');
  check('C cannot see B’s notifications', cNotifs?.length === 0);

  await clientB.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', bNotifs![0].id);
  const { data: bUnread } = await clientB.from('notifications').select('id').is('read_at', null);
  check('B marks notification read', bUnread?.length === 0);

  // ── Service desk ────────────────────────────────────────────────────────
  const { data: request, error: reqErr } = await clientB.from('service_requests')
    .insert({
      tenant_id: tenantId, employee_id: empB, opened_by: userB,
      category: 'payslip_issue', subject: 'Missing housing allowance', priority: 'high',
    }).select('id').single();
  check('employee B opens a desk request', !reqErr, reqErr?.message);

  const { data: cSees } = await clientC.from('service_requests').select('id');
  check('employee C cannot see B’s request', cSees?.length === 0);
  const { data: aSees } = await clientA.from('service_requests').select('id');
  check('agent sees the request', aSees?.length === 1);

  await clientA.from('service_request_messages').insert([
    { tenant_id: tenantId, request_id: request!.id, author_user_id: userA, body: 'Checking with payroll.', is_internal: false },
    { tenant_id: tenantId, request_id: request!.id, author_user_id: userA, body: 'NOTE: component was never assigned.', is_internal: true },
  ]);
  const { data: bMessages } = await clientB.from('service_request_messages').select('body, is_internal');
  check('employee sees the public reply but NOT the internal note',
    bMessages?.length === 1 && bMessages[0].is_internal === false, JSON.stringify(bMessages));
  const { data: aMessages } = await clientA.from('service_request_messages').select('id');
  check('agent sees both messages', aMessages?.length === 2);

  const { error: bStatusErr } = await clientB.from('service_requests')
    .update({ status: 'closed' }).eq('id', request!.id);
  const { data: statusAfter } = await clientA.from('service_requests').select('status').eq('id', request!.id).single();
  check('employee cannot change request status (RLS)',
    statusAfter?.status === 'open', bStatusErr?.message ?? `status=${statusAfter?.status}`);

  const { error: aStatusErr } = await clientA.from('service_requests')
    .update({ status: 'resolved', assigned_to: userA, resolved_at: new Date().toISOString() })
    .eq('id', request!.id);
  check('agent resolves the request', !aStatusErr, aStatusErr?.message);
} finally {
  if (runId) await admin.from('payroll_runs').update({ status: 'reversed' }).eq('id', runId);
  if (tenantId) await admin.from('tenants').delete().eq('id', tenantId);
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
  console.log('cleanup done');
}

if (failures > 0) {
  console.error(`\n${failures} check(s) FAILED`);
  process.exit(1);
}
console.log('\nAll Sprint 9 checks passed.');
