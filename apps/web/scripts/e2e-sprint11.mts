/**
 * Sprint 11 end-to-end test: AI assistants with REAL Kimi calls through the
 * production code — policy Q&A grounded in tenant policies, payslip
 * explanation from the deterministic trace, anomaly review notes, RLS-scoped
 * retrieval, and the AI audit trail.
 * Run from apps/web:  pnpm dlx tsx --env-file=.env.local scripts/e2e-sprint11.mts
 */
import { createClient } from '@supabase/supabase-js';
import { provisionTenant } from '../src/lib/tenancy/provision';
import { calculateRunCore, type RunRow } from '../src/lib/payroll/run-calc';
import { explainPayslip, policyQA, summarizeRunAnomalies } from '../src/lib/ai/assistants';
import { createKimiClient } from '../../../packages/ai/src/index';

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
function digits(s: string): string {
  return s.replace(/[^0-9]/g, ' ');
}

const stamp = Math.random().toString(36).slice(2, 8);
const password = `E2e!${stamp}Aa11`;
const userIds: string[] = [];
let tenantId = '';
let runId = '';

async function makeUser(tag: string): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email: `e2e-s11-${tag}-${stamp}@stellix-test.example.com`, password, email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error(`${tag} failed`);
  userIds.push(data.user.id);
  return data.user.id;
}
function signIn(tag: string) {
  const c = createClient(url, anonKey);
  return c.auth
    .signInWithPassword({ email: `e2e-s11-${tag}-${stamp}@stellix-test.example.com`, password })
    .then(() => c);
}

try {
  const kimi = createKimiClient();

  const userA = await makeUser('a');
  const userB = await makeUser('b');
  const { tenantId: tid, legalEntityId } = await provisionTenant(admin, {
    userId: userA, companyName: `E2E S11 Co ${stamp}`, jurisdiction: 'tz_mainland', sector: 'private',
  });
  tenantId = tid;
  const { data: employeeRole } = await admin
    .from('roles').select('id').eq('tenant_id', tenantId).eq('name', 'employee').single();
  await admin.from('tenant_users').insert({ tenant_id: tenantId, user_id: userB });
  await admin.from('user_roles').insert({ tenant_id: tenantId, user_id: userB, role_id: employeeRole!.id });

  const clientA = await signIn('a');
  const clientB = await signIn('b');

  // ── Policy Q&A (real Kimi, grounded in tenant policy) ───────────────────
  await clientA.from('company_policies').insert({
    tenant_id: tenantId, created_by: userA, title: 'Annual leave policy', category: 'leave',
    body: 'Employees earn 28 days of annual leave per year. A maximum of 7 unused days may be carried forward into the next year; anything above 7 days expires on 1 January. Carry-forward requires no approval.',
  });

  const policyResult = await policyQA(clientB, kimi.chat, {
    tenantId, userId: userB, model: kimi.model,
    question: 'How many unused leave days can I carry forward to next year?',
  });
  check('policy answer is grounded (mentions 7 days)',
    policyResult.answer.includes('7'), policyResult.answer.slice(0, 200));
  check('policy answer cites the policy source',
    policyResult.sources.some((s) => s.ref === 'Annual leave policy'));

  const offTopic = await policyQA(clientB, kimi.chat, {
    tenantId, userId: userB, model: kimi.model,
    question: 'What is the company policy on remote work from other countries?',
  });
  check('assistant refuses to invent policy (refers to HR)',
    /hr|human resources/i.test(offTopic.answer), offTopic.answer.slice(0, 200));

  // ── Payroll setup for the explainer ─────────────────────────────────────
  const { data: emp } = await clientA.from('employees')
    .insert({
      tenant_id: tenantId, legal_entity_id: legalEntityId, employee_number: 'EMP-0001',
      first_name: 'Bahati', last_name: 'Test', hire_date: '2026-01-01', status: 'active', user_id: userB,
    }).select('id').single();
  await clientA.from('employee_compensation').insert({
    tenant_id: tenantId, employee_id: emp!.id, basic_salary: 1_000_000, effective_from: '2026-01-01',
  });
  const { data: run } = await clientA.from('payroll_runs')
    .insert({ tenant_id: tenantId, legal_entity_id: legalEntityId, period_year: 2026, period_month: 7, created_by: userA })
    .select('*').single();
  runId = run!.id;
  await calculateRunCore(clientA, run as RunRow);
  await clientA.from('payroll_runs').update({ status: 'approved', approved_by: userA, approved_at: new Date().toISOString() }).eq('id', runId);

  // ── Payslip explainer as the employee (own line, real Kimi) ─────────────
  // Known values: gross 1,000,000 · NSSF 100,000 · PAYE 103,000 · net 797,000
  const explain = await explainPayslip(clientB, kimi.chat, {
    tenantId, userId: userB, model: kimi.model,
    runId, employeeId: emp!.id,
    question: 'What is my net pay this month and what was deducted?',
  });
  const numbers = digits(explain.answer);
  check('explainer states the correct net pay (797,000)',
    numbers.includes('797 000') || numbers.includes('797000') || explain.answer.replace(/[,.\s]/g, '').includes('797000'),
    explain.answer.slice(0, 300));
  check('explainer cites its data sources',
    explain.sources.some((s) => s.type === 'payroll_run_line'));

  // Someone else's payslip → blocked by RLS before any AI call.
  const foreign = await explainPayslip(clientB, kimi.chat, {
    tenantId, userId: userB, model: kimi.model,
    runId, employeeId: userA /* not an employee id B can see */,
    question: 'What is their salary?',
  });
  check('explainer refuses foreign payslips (RLS)', foreign.answer.includes('not found'));

  // ── Anomaly summary (payroll staff only, real Kimi) ─────────────────────
  const anomalies = await summarizeRunAnomalies(clientA, kimi.chat, {
    tenantId, userId: userA, model: kimi.model, runId,
  });
  check('anomaly summary produced for payroll staff',
    anomalies.answer.length > 50, anomalies.answer.slice(0, 200));

  const anomaliesAsEmployee = await summarizeRunAnomalies(clientB, kimi.chat, {
    tenantId, userId: userB, model: kimi.model, runId,
  });
  check('employee cannot get anomaly summaries (RLS on runs)',
    anomaliesAsEmployee.answer.includes('not found'));

  // ── AI audit trail ──────────────────────────────────────────────────────
  const { data: bAudit } = await clientB.from('ai_audit').select('assistant, user_id');
  check('B’s AI interactions are audited (3 rows: 2 policy + 1 payslip)',
    bAudit?.length === 3 && bAudit.every((r) => r.user_id === userB),
    JSON.stringify(bAudit?.map((r) => r.assistant)));
  const { data: aAudit } = await clientA.from('ai_audit').select('assistant');
  check('admin sees the full tenant AI audit (4 rows)',
    aAudit?.length === 4, `got ${aAudit?.length}`);
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
console.log('\nAll Sprint 11 checks passed.');
