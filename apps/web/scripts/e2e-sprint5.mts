/**
 * Sprint 5 end-to-end test: working-day calc, leave ledger (accrual →
 * request debit → cancellation credit → carry-forward expiry), and the REAL
 * workflow engine (two-step manager→role chain, delegation, entitlement
 * checks) from lib/workflow/engine.
 * Run from apps/web:  pnpm dlx tsx --env-file=.env.local scripts/e2e-sprint5.mts
 */
import { createClient } from '@supabase/supabase-js';
import { provisionTenant } from '../src/lib/tenancy/provision';
import { actOnStep, delegateStep, startWorkflow } from '../src/lib/workflow/engine';
import { calcWorkingDays } from '../src/lib/leave/working-days';

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

async function makeUser(tag: string): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email: `e2e-s5-${tag}-${stamp}@stellix-test.example.com`,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error(`${tag} failed`);
  userIds.push(data.user.id);
  return data.user.id;
}

function signIn(tag: string) {
  const c = createClient(url, anonKey);
  return c.auth
    .signInWithPassword({ email: `e2e-s5-${tag}-${stamp}@stellix-test.example.com`, password })
    .then(() => c);
}

try {
  // ── 0. Pure working-day arithmetic ─────────────────────────────────────
  // 2026-12-24 Thu → 2026-12-28 Mon; 25th (Fri) and 26th (Sat) are holidays,
  // 27th Sun. Working days: Thu 24 + Mon 28 = 2.
  const holidays = new Set(['2026-12-25', '2026-12-26']);
  check('working days across weekend+holidays = 2',
    calcWorkingDays('2026-12-24', '2026-12-28', holidays) === 2);
  check('half-day single working day = 0.5',
    calcWorkingDays('2026-07-08', '2026-07-08', new Set(), true) === 0.5);
  check('weekend-only range = 0 days',
    calcWorkingDays('2026-07-11', '2026-07-12', new Set()) === 0);

  // ── 1. Tenant + people (HR admin A, manager B, employee C) ─────────────
  const userA = await makeUser('a');
  const userB = await makeUser('b');
  const { tenantId: tid, legalEntityId } = await provisionTenant(admin, {
    userId: userA, companyName: `E2E S5 Co ${stamp}`, jurisdiction: 'tz_mainland', sector: 'private',
  });
  tenantId = tid;
  await admin.from('tenant_users').insert({ tenant_id: tenantId, user_id: userB });
  const { data: hrRole } = await admin
    .from('roles').select('id').eq('tenant_id', tenantId).eq('name', 'hr_manager').single();
  // B needs approve rights via role; A additionally gets hr_manager for the role step.
  const { data: mgrRole } = await admin
    .from('roles').select('id').eq('tenant_id', tenantId).eq('name', 'manager').single();
  await admin.from('user_roles').insert([
    { tenant_id: tenantId, user_id: userB, role_id: mgrRole!.id },
    { tenant_id: tenantId, user_id: userA, role_id: hrRole!.id },
  ]);

  const clientA = await signIn('a');
  const clientB = await signIn('b');

  const { data: managerEmp } = await clientA.from('employees')
    .insert({
      tenant_id: tenantId, legal_entity_id: legalEntityId, employee_number: 'EMP-0001',
      first_name: 'Bertha', last_name: 'Mwakyusa', hire_date: '2025-01-01',
      status: 'active', user_id: userB,
    }).select('id').single();
  const { data: emp } = await clientA.from('employees')
    .insert({
      tenant_id: tenantId, legal_entity_id: legalEntityId, employee_number: 'EMP-0002',
      first_name: 'Chausiku', last_name: 'Ally', hire_date: '2025-06-01', status: 'active',
    }).select('id').single();
  await clientA.from('employee_assignments').insert({
    tenant_id: tenantId, employee_id: emp!.id, manager_employee_id: managerEmp!.id,
    effective_from: '2025-06-01',
  });

  // ── 2. Leave type + accrual → ledger balance ───────────────────────────
  const { data: annual } = await clientA.from('leave_types')
    .insert({
      tenant_id: tenantId, name: 'Annual leave', code: 'ANNUAL',
      annual_entitlement_days: 28, max_carry_forward_days: 7,
    }).select('id').single();
  await clientA.from('leave_ledger').insert({
    tenant_id: tenantId, employee_id: emp!.id, leave_type_id: annual!.id,
    entry_type: 'accrual', days: 28, effective_date: '2026-01-01',
    note: 'Annual grant 2026', created_by: userA,
  });
  const { data: bal1 } = await clientA.from('leave_balances')
    .select('balance_days').eq('employee_id', emp!.id).eq('leave_type_id', annual!.id).single();
  check('ledger balance after accrual = 28', Number(bal1?.balance_days) === 28);

  // ── 3. Two-step workflow: manager → hr_manager role, with SLA ──────────
  const { data: definition } = await clientA.from('workflow_definitions')
    .insert({ tenant_id: tenantId, entity_type: 'leave_request', name: 'Two level' })
    .select('id').single();
  await clientA.from('workflow_steps').insert([
    { tenant_id: tenantId, definition_id: definition!.id, step_order: 1, approver_type: 'manager', sla_hours: 24 },
    { tenant_id: tenantId, definition_id: definition!.id, step_order: 2, approver_type: 'role', approver_role_id: hrRole!.id, sla_hours: 48 },
  ]);

  // Leave request: Mon 2026-07-13 → Wed 2026-07-15 = 3 working days.
  const days = calcWorkingDays('2026-07-13', '2026-07-15', new Set());
  check('request days = 3', days === 3);
  const { data: request } = await clientA.from('leave_requests')
    .insert({
      tenant_id: tenantId, employee_id: emp!.id, leave_type_id: annual!.id,
      start_date: '2026-07-13', end_date: '2026-07-15', days, requested_by: userA,
    }).select('id').single();

  const workflow = await startWorkflow(clientA, {
    tenantId, entityType: 'leave_request', entityId: request!.id,
    employeeId: emp!.id, createdBy: userA,
  });
  await clientA.from('leave_requests')
    .update({ workflow_instance_id: workflow.instanceId }).eq('id', request!.id);

  const { data: stepRows } = await clientA.from('workflow_step_actions')
    .select('*').eq('instance_id', workflow.instanceId).order('step_order');
  check('2 steps created; step1 pending → manager user B',
    stepRows?.length === 2 && stepRows[0].status === 'pending' &&
    stepRows[0].assigned_user_id === userB && stepRows[1].status === 'waiting' &&
    stepRows[1].assigned_role_id === hrRole!.id,
    JSON.stringify(stepRows?.map((s) => ({ o: s.step_order, s: s.status }))));

  // Wrong actor: B may not act on the hr_manager step later; first, B approves step 1.
  const afterStep1 = await actOnStep(clientB, {
    stepActionId: stepRows![0].id, decision: 'approved', actorUserId: userB, comment: 'ok',
  });
  check('after manager approval workflow still pending (step 2)', afterStep1.status === 'pending');

  let wrongActorBlocked = false;
  try {
    await actOnStep(clientB, { stepActionId: stepRows![1].id, decision: 'approved', actorUserId: userB });
  } catch {
    wrongActorBlocked = true;
  }
  check('non-role-holder cannot act on role step', wrongActorBlocked);

  // Delegation: A (hr_manager) delegates step 2 to B, then B approves.
  await delegateStep(clientA, { stepActionId: stepRows![1].id, toUserId: userB, actorUserId: userA });
  const finalResult = await actOnStep(clientB, {
    stepActionId: stepRows![1].id, decision: 'approved', actorUserId: userB,
  });
  check('delegated approver completes workflow → approved', finalResult.status === 'approved');

  const { data: delegatedRow } = await clientA.from('workflow_step_actions')
    .select('delegated_to, acted_by').eq('id', stepRows![1].id).single();
  check('delegation trace preserved',
    delegatedRow?.delegated_to === userB && delegatedRow?.acted_by === userB);

  // Approval writes the ledger debit (mirrors decideLeaveStep).
  await clientA.from('leave_requests')
    .update({ status: 'approved', decided_at: new Date().toISOString() }).eq('id', request!.id);
  await clientA.from('leave_ledger').insert({
    tenant_id: tenantId, employee_id: emp!.id, leave_type_id: annual!.id,
    entry_type: 'request', days: -days, effective_date: '2026-07-13',
    leave_request_id: request!.id, created_by: userB,
  });
  const { data: bal2 } = await clientA.from('leave_balances')
    .select('balance_days').eq('employee_id', emp!.id).eq('leave_type_id', annual!.id).single();
  check('balance after approved 3-day request = 25', Number(bal2?.balance_days) === 25);

  // ── 4. Cancellation → compensating credit ──────────────────────────────
  await clientA.from('leave_ledger').insert({
    tenant_id: tenantId, employee_id: emp!.id, leave_type_id: annual!.id,
    entry_type: 'cancellation', days, effective_date: '2026-07-13',
    leave_request_id: request!.id, note: 'cancelled', created_by: userA,
  });
  await clientA.from('leave_requests').update({ status: 'cancelled' }).eq('id', request!.id);
  const { data: bal3 } = await clientA.from('leave_balances')
    .select('balance_days').eq('employee_id', emp!.id).eq('leave_type_id', annual!.id).single();
  check('balance after cancellation credit = 28', Number(bal3?.balance_days) === 28);

  // ── 5. Carry-forward expiry (cap 7 → expire 21 on Jan 1) ───────────────
  await clientA.from('leave_ledger').insert({
    tenant_id: tenantId, employee_id: emp!.id, leave_type_id: annual!.id,
    entry_type: 'expiry', days: -21, effective_date: '2027-01-01',
    note: 'Carry-forward cap 7 — 21 day(s) expired', created_by: userA,
  });
  const { data: bal4 } = await clientA.from('leave_balances')
    .select('balance_days').eq('employee_id', emp!.id).eq('leave_type_id', annual!.id).single();
  check('balance after carry-forward expiry = 7', Number(bal4?.balance_days) === 7);

  // Ledger completeness: every movement is a row, nothing overwritten.
  const { data: ledger } = await clientA.from('leave_ledger')
    .select('entry_type, days').eq('employee_id', emp!.id).order('created_at');
  check('ledger holds all 4 entries (accrual, request, cancellation, expiry)',
    ledger?.length === 4 &&
    ledger.map((l) => l.entry_type).join(',') === 'accrual,request,cancellation,expiry');
} finally {
  if (tenantId) await admin.from('tenants').delete().eq('id', tenantId);
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
  console.log('cleanup done');
}

if (failures > 0) {
  console.error(`\n${failures} check(s) FAILED`);
  process.exit(1);
}
console.log('\nAll Sprint 5 checks passed.');
