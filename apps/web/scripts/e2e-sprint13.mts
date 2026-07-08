/**
 * Sprint 13 end-to-end test: recruitment pipeline + hire conversion,
 * performance cycles/goals/reviews, and offboarding through the production
 * closeOffboardingCase code (exit effectuation with history closure).
 * Run from apps/web:  pnpm dlx tsx --env-file=.env.local scripts/e2e-sprint13.mts
 */
import { createClient } from '@supabase/supabase-js';
import { provisionTenant } from '../src/lib/tenancy/provision';
import {
  closeOffboardingCase,
  STANDARD_OFFBOARDING_TASKS,
} from '../src/lib/people/offboarding';

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

try {
  const { data: u, error: uErr } = await admin.auth.admin.createUser({
    email: `e2e-s13-${stamp}@stellix-test.example.com`, password, email_confirm: true,
  });
  if (uErr || !u.user) throw uErr ?? new Error('user failed');
  userId = u.user.id;
  const { tenantId: tid, legalEntityId } = await provisionTenant(admin, {
    userId, companyName: `E2E S13 Co ${stamp}`, jurisdiction: 'tz_mainland', sector: 'private',
  });
  tenantId = tid;
  const client = createClient(url, anonKey);
  await client.auth.signInWithPassword({
    email: `e2e-s13-${stamp}@stellix-test.example.com`, password,
  });

  // ── 1. Recruitment: requisition → candidate pipeline → hire ────────────
  const { data: position } = await client.from('positions')
    .insert({
      tenant_id: tenantId, legal_entity_id: legalEntityId, code: 'POS-001',
      title: 'Field Officer', status: 'vacant',
    }).select('id').single();

  const { data: requisition, error: reqErr } = await client.from('job_requisitions')
    .insert({
      tenant_id: tenantId, position_id: position!.id, title: 'Field Officer — Mwanza',
      openings: 1, status: 'open', created_by: userId,
    }).select('id').single();
  check('requisition opened', !reqErr, reqErr?.message);

  const { data: candidate } = await client.from('candidates')
    .insert({
      tenant_id: tenantId, requisition_id: requisition!.id,
      first_name: 'Zawadi', last_name: 'Mrisho', email: 'zawadi@example.com',
      source: 'referral',
    }).select('id, stage').single();
  check('candidate starts at applied', candidate?.stage === 'applied');

  // Walk the pipeline.
  for (const stage of ['screening', 'shortlisted', 'interview', 'offer']) {
    await client.from('candidates').update({ stage }).eq('id', candidate!.id);
  }
  const { data: atOffer } = await client.from('candidates').select('stage').eq('id', candidate!.id).single();
  check('candidate progressed to offer', atOffer?.stage === 'offer');

  const { error: badStageErr } = await client.from('candidates')
    .update({ stage: 'nonsense' }).eq('id', candidate!.id);
  check('invalid stage rejected by constraint', Boolean(badStageErr));

  // Hire conversion (mirrors hireCandidate): employee + assignment + salary,
  // position occupied, candidate hired, requisition filled.
  const { data: hired } = await client.from('employees')
    .insert({
      tenant_id: tenantId, legal_entity_id: legalEntityId, employee_number: 'EMP-0001',
      first_name: 'Zawadi', last_name: 'Mrisho', personal_email: 'zawadi@example.com',
      hire_date: '2026-08-01', status: 'onboarding',
    }).select('id').single();
  await client.from('employee_assignments').insert({
    tenant_id: tenantId, employee_id: hired!.id, position_id: position!.id, effective_from: '2026-08-01',
  });
  await client.from('employee_compensation').insert({
    tenant_id: tenantId, employee_id: hired!.id, basic_salary: 700_000, effective_from: '2026-08-01',
  });
  await client.from('positions').update({ status: 'occupied' }).eq('id', position!.id);
  await client.from('candidates')
    .update({ stage: 'hired', hired_employee_id: hired!.id }).eq('id', candidate!.id);
  await client.from('job_requisitions').update({ status: 'filled' }).eq('id', requisition!.id);

  const { data: pipelineEnd } = await client.from('candidates')
    .select('stage, hired_employee_id').eq('id', candidate!.id).single();
  const { data: posAfterHire } = await client.from('positions').select('status').eq('id', position!.id).single();
  check('hire conversion: candidate hired + linked, position occupied',
    pipelineEnd?.stage === 'hired' && pipelineEnd?.hired_employee_id === hired!.id &&
    posAfterHire?.status === 'occupied');

  // ── 2. Performance ──────────────────────────────────────────────────────
  const { data: cycle, error: cycleErr } = await client.from('performance_cycles')
    .insert({ tenant_id: tenantId, name: '2026 H2', starts_on: '2026-07-01', ends_on: '2026-12-31' })
    .select('id').single();
  check('performance cycle created', !cycleErr, cycleErr?.message);

  const { error: goalErr } = await client.from('performance_goals').insert([
    { tenant_id: tenantId, cycle_id: cycle!.id, employee_id: hired!.id, title: 'Visit 40 client sites', weight: 60, created_by: userId },
    { tenant_id: tenantId, cycle_id: cycle!.id, employee_id: hired!.id, title: 'Zero safety incidents', weight: 40, created_by: userId },
  ]);
  check('goals created with weights', !goalErr, goalErr?.message);

  await client.from('performance_goals')
    .update({ status: 'achieved' })
    .eq('cycle_id', cycle!.id).eq('title', 'Visit 40 client sites');
  const { data: goalStates } = await client.from('performance_goals')
    .select('status').eq('cycle_id', cycle!.id).order('title');
  check('goal status tracked', goalStates?.some((g) => g.status === 'achieved'));

  const { error: reviewErr } = await client.from('performance_reviews').insert({
    tenant_id: tenantId, cycle_id: cycle!.id, employee_id: hired!.id,
    reviewer_user_id: userId, review_type: 'manager', rating: 4,
    strengths: 'Excellent field coverage', improvements: 'Reporting punctuality',
  });
  check('manager review submitted (4/5)', !reviewErr, reviewErr?.message);

  const { error: dupReviewErr } = await client.from('performance_reviews').insert({
    tenant_id: tenantId, cycle_id: cycle!.id, employee_id: hired!.id,
    reviewer_user_id: userId, review_type: 'manager', rating: 5,
  });
  check('duplicate review per type rejected (unique constraint)', Boolean(dupReviewErr));

  const { error: badRatingErr } = await client.from('performance_reviews').insert({
    tenant_id: tenantId, cycle_id: cycle!.id, employee_id: hired!.id,
    reviewer_user_id: userId, review_type: 'self', rating: 9,
  });
  check('rating outside 1–5 rejected', Boolean(badRatingErr));

  // ── 3. Offboarding through the production code ──────────────────────────
  const { data: exitCase } = await client.from('offboarding_cases')
    .insert({
      tenant_id: tenantId, employee_id: hired!.id, exit_type: 'resignation',
      notice_date: '2026-11-01', last_working_day: '2026-11-30',
      reason: 'Relocation', initiated_by: userId, status: 'clearance',
    }).select('id').single();
  await client.from('offboarding_tasks').insert(
    STANDARD_OFFBOARDING_TASKS.map((task) => ({
      tenant_id: tenantId, case_id: exitCase!.id, ...task,
    })),
  );
  await client.from('employees').update({ status: 'exiting' }).eq('id', hired!.id);
  const { data: caseTasks } = await client.from('offboarding_tasks')
    .select('id').eq('case_id', exitCase!.id);
  check('case created with 7 standard clearance tasks', caseTasks?.length === 7);

  let blockedEarly = false;
  try {
    await closeOffboardingCase(client, { caseId: exitCase!.id, actorUserId: userId });
  } catch (e) {
    blockedEarly = e instanceof Error && e.message.includes('pending');
  }
  check('close refused while clearance tasks pending', blockedEarly);

  await client.from('offboarding_tasks')
    .update({ status: 'completed', completed_by: userId, completed_at: new Date().toISOString() })
    .eq('case_id', exitCase!.id);
  const result = await closeOffboardingCase(client, { caseId: exitCase!.id, actorUserId: userId });
  check('case closed with exit action', Boolean(result.exitActionId));

  const { data: exitedEmployee } = await client.from('employees')
    .select('status, exit_date').eq('id', hired!.id).single();
  check('employee exited with exit date = last working day',
    exitedEmployee?.status === 'exited' && exitedEmployee?.exit_date === '2026-11-30');

  const { data: closedAssignment } = await client.from('employee_assignments')
    .select('effective_to').eq('employee_id', hired!.id).single();
  const { data: closedComp } = await client.from('employee_compensation')
    .select('effective_to').eq('employee_id', hired!.id).single();
  check('assignment and salary history closed on last working day',
    closedAssignment?.effective_to === '2026-11-30' && closedComp?.effective_to === '2026-11-30');

  const { data: vacatedPosition } = await client.from('positions')
    .select('status').eq('id', position!.id).single();
  check('position vacated for re-hiring', vacatedPosition?.status === 'vacant');

  const { data: exitAction } = await client.from('employment_actions')
    .select('action_type, status, effective_date').eq('employee_id', hired!.id)
    .eq('action_type', 'exit').single();
  check('exit employment action recorded (letter available)',
    exitAction?.status === 'effected' && exitAction?.effective_date === '2026-11-30');

  let doubleCloseBlocked = false;
  try {
    await closeOffboardingCase(client, { caseId: exitCase!.id, actorUserId: userId });
  } catch (e) {
    doubleCloseBlocked = e instanceof Error && e.message.includes('already');
  }
  check('closed case cannot be closed again', doubleCloseBlocked);
} finally {
  if (tenantId) await admin.from('tenants').delete().eq('id', tenantId);
  if (userId) await admin.auth.admin.deleteUser(userId);
  console.log('cleanup done');
}

if (failures > 0) {
  console.error(`\n${failures} check(s) FAILED`);
  process.exit(1);
}
console.log('\nAll Sprint 13 checks passed.');
