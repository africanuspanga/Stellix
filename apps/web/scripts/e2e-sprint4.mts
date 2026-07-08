/**
 * Sprint 4 end-to-end test: onboarding templates/tasks, probation reviews
 * with confirmation, and the import pipeline (parse → auto-map → validate →
 * import) using the exact production code from lib/imports/employees.
 * Run from apps/web:  pnpm dlx tsx --env-file=.env.local scripts/e2e-sprint4.mts
 */
import { createClient } from '@supabase/supabase-js';
import { provisionTenant } from '../src/lib/tenancy/provision';
import {
  guessMapping,
  parseSheet,
  runEmployeeImport,
  validateEmployeeRows,
} from '../src/lib/imports/employees';

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
    email: `e2e-s4-${stamp}@stellix-test.example.com`, password, email_confirm: true,
  });
  if (uErr || !u.user) throw uErr ?? new Error('user failed');
  userId = u.user.id;

  const { tenantId: tid, legalEntityId } = await provisionTenant(admin, {
    userId, companyName: `E2E S4 Co ${stamp}`, jurisdiction: 'tz_mainland', sector: 'private',
  });
  tenantId = tid;

  const client = createClient(url, anonKey);
  await client.auth.signInWithPassword({
    email: `e2e-s4-${stamp}@stellix-test.example.com`, password,
  });

  // ── 1. Onboarding templates & task instances ──────────────────────────
  const { data: template, error: tplErr } = await client
    .from('onboarding_templates')
    .insert({ tenant_id: tenantId, name: 'Head office staff' })
    .select('id').single();
  check('template created', !tplErr, tplErr?.message);

  await client.from('onboarding_template_tasks').insert([
    { tenant_id: tenantId, template_id: template!.id, title: 'Sign contract', assignee_role: 'hr', due_days_after_start: 0, sort_order: 1 },
    { tenant_id: tenantId, template_id: template!.id, title: 'Issue laptop', assignee_role: 'it', due_days_after_start: 3, sort_order: 2 },
  ]);

  const { data: emp } = await client.from('employees')
    .insert({
      tenant_id: tenantId, legal_entity_id: legalEntityId, employee_number: 'EMP-0001',
      first_name: 'Juma', last_name: 'Hassan', hire_date: '2026-07-01',
      status: 'probation', probation_end_date: '2026-06-30',
    })
    .select('id').single();

  // Assign: instances with due dates from hire date (mirrors assignTemplate).
  const { data: tplTasks } = await client
    .from('onboarding_template_tasks').select('*').eq('template_id', template!.id).order('sort_order');
  const instances = tplTasks!.map((t) => {
    const due = new Date('2026-07-01T00:00:00Z');
    due.setUTCDate(due.getUTCDate() + t.due_days_after_start);
    return {
      tenant_id: tenantId, employee_id: emp!.id, template_id: template!.id,
      title: t.title, assignee_role: t.assignee_role,
      due_date: due.toISOString().slice(0, 10), sort_order: t.sort_order,
    };
  });
  const { error: instErr } = await client.from('employee_onboarding_tasks').insert(instances);
  check('template assigned → task instances created', !instErr, instErr?.message);

  const { data: tasks } = await client
    .from('employee_onboarding_tasks').select('title, due_date').eq('employee_id', emp!.id).order('sort_order');
  check('due dates offset from hire date',
    tasks?.[0]?.due_date === '2026-07-01' && tasks?.[1]?.due_date === '2026-07-04',
    JSON.stringify(tasks));

  const { error: doneErr } = await client
    .from('employee_onboarding_tasks')
    .update({ status: 'completed', completed_by: userId, completed_at: new Date().toISOString() })
    .eq('employee_id', emp!.id).eq('title', 'Sign contract');
  check('task completed', !doneErr, doneErr?.message);

  // ── 2. Probation review → confirmation workflow ───────────────────────
  const { data: review, error: revErr } = await client
    .from('probation_reviews')
    .insert({ tenant_id: tenantId, employee_id: emp!.id, review_date: '2026-06-25', created_by: userId })
    .select('id').single();
  check('probation review scheduled', !revErr, revErr?.message);

  // Complete with 'confirm' (mirrors completeReview effects).
  await client.from('probation_reviews').update({
    status: 'completed', recommendation: 'confirm', manager_feedback: 'Strong performer',
    completed_by: userId, completed_at: new Date().toISOString(),
  }).eq('id', review!.id);
  await client.from('employment_actions').insert({
    tenant_id: tenantId, employee_id: emp!.id, action_type: 'probation_confirmation',
    status: 'effected', effective_date: '2026-07-08', details: {},
    requested_by: userId, approved_by: userId, approved_at: new Date().toISOString(),
  });
  await client.from('employees').update({ status: 'active' }).eq('id', emp!.id);

  const { data: confirmed } = await client.from('employees').select('status').eq('id', emp!.id).single();
  const { data: confAction } = await client.from('employment_actions')
    .select('id').eq('employee_id', emp!.id).eq('action_type', 'probation_confirmation');
  check('confirmation: employee active + action recorded',
    confirmed?.status === 'active' && (confAction?.length ?? 0) === 1);

  // ── 3. Import pipeline (real production code) ─────────────────────────
  await client.from('departments').insert({ tenant_id: tenantId, name: 'Operations' });

  const csv = [
    'First Name,Surname,Hire Date,Salary,Department,Phone,Employment Type,NSSF Number,Account Number,Bank Name',
    'Amina,Mushi,2026-01-15,1500000,Operations,+255700000001,permanent,NSSF-01,0150111222333,CRDB',
    'Baraka,Komba,15/02/2026,900000,Operations,+255700000002,casual,NSSF-02,,',
    ',Missing,2026-03-01,700000,Operations,,,,,',                       // missing first name
    'Neema,Salum,not-a-date,800000,Operations,,permanent,,,',           // bad date
    'Zawadi,Mrisho,2026-04-01,650000,Warehouse,,permanent,,,',          // unknown department
  ].join('\n');

  const parsed = parseSheet(Buffer.from(csv));
  check('parseSheet: 10 columns, 5 data rows', parsed.headers.length === 10 && parsed.rows.length === 5);

  const mapping = guessMapping(parsed.headers);
  check('auto-mapping found required fields',
    mapping.first_name !== undefined && mapping.last_name !== undefined && mapping.hire_date !== undefined,
    JSON.stringify(mapping));
  check('auto-mapping caught salary/bank/department',
    mapping.basic_salary !== undefined && mapping.account_number !== undefined && mapping.department_name !== undefined);

  const { data: existing } = await client.from('employees').select('employee_number');
  const validation = validateEmployeeRows(parsed.rows, mapping, new Set((existing ?? []).map((e) => e.employee_number as string)));
  check('validation: 3 valid, 2 rejected', validation.valid.length === 3 && validation.errors.length === 2,
    `valid=${validation.valid.length} errors=${JSON.stringify(validation.errors)}`);
  check('DD/MM/YYYY date normalized', validation.valid[1]?.values.hire_date === '2026-02-15',
    validation.valid[1]?.values.hire_date);

  const summary = await runEmployeeImport(client, {
    tenantId, legalEntityId, userId, records: validation.valid,
  });
  check('import: 2 created, 1 failed (unknown department)',
    summary.created === 2 && summary.failed.length === 1 &&
    summary.failed[0].message.includes('Warehouse'),
    JSON.stringify(summary));

  const { data: imported } = await client
    .from('employees').select('first_name, employee_number').in('first_name', ['Amina', 'Baraka']);
  check('imported employees exist with auto numbers', imported?.length === 2);

  const { data: aminaBank } = await client
    .from('employee_bank_accounts')
    .select('account_number, employees!inner(first_name)')
    .eq('employees.first_name', 'Amina');
  check('bank account imported for Amina', aminaBank?.length === 1 && aminaBank[0].account_number === '0150111222333');

  const { data: comps } = await client
    .from('employee_compensation')
    .select('basic_salary, employees!inner(first_name)')
    .eq('employees.first_name', 'Baraka');
  check('salary imported for Baraka (900,000)', Number(comps?.[0]?.basic_salary) === 900_000);
} finally {
  if (tenantId) await admin.from('tenants').delete().eq('id', tenantId);
  if (userId) await admin.auth.admin.deleteUser(userId);
  console.log('cleanup done');
}

if (failures > 0) {
  console.error(`\n${failures} check(s) FAILED`);
  process.exit(1);
}
console.log('\nAll Sprint 4 checks passed.');
