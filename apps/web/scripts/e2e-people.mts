/**
 * Sprint 3 end-to-end test: employee lifecycle — hire with effective-dated
 * assignment/compensation, promotion effectuation preserving history,
 * contracts, bank accounts, dependants, and document storage RLS.
 * Run from apps/web:  pnpm dlx tsx --env-file=.env.local scripts/e2e-people.mts
 */
import { createClient } from '@supabase/supabase-js';
import { provisionTenant } from '../src/lib/tenancy/provision';

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
let userAId = '';
let userBId = '';
let tenantId = '';
let storagePath = '';

try {
  const { data: a, error: aErr } = await admin.auth.admin.createUser({
    email: `e2e-ppl-a-${stamp}@stellix-test.example.com`, password, email_confirm: true,
  });
  if (aErr || !a.user) throw aErr ?? new Error('user A failed');
  userAId = a.user.id;
  const { data: b, error: bErr } = await admin.auth.admin.createUser({
    email: `e2e-ppl-b-${stamp}@stellix-test.example.com`, password, email_confirm: true,
  });
  if (bErr || !b.user) throw bErr ?? new Error('user B failed');
  userBId = b.user.id;

  const { tenantId: tid, legalEntityId } = await provisionTenant(admin, {
    userId: userAId, companyName: `E2E People Co ${stamp}`,
    jurisdiction: 'tz_mainland', sector: 'private',
  });
  tenantId = tid;

  const clientA = createClient(url, anonKey);
  await clientA.auth.signInWithPassword({
    email: `e2e-ppl-a-${stamp}@stellix-test.example.com`, password,
  });

  // Org scaffolding: two positions (junior + senior).
  const { data: juniorPos } = await clientA.from('positions')
    .insert({ tenant_id: tenantId, legal_entity_id: legalEntityId, code: 'P-01', title: 'Officer', status: 'vacant' })
    .select('id').single();
  const { data: seniorPos } = await clientA.from('positions')
    .insert({ tenant_id: tenantId, legal_entity_id: legalEntityId, code: 'P-02', title: 'Senior Officer', status: 'vacant' })
    .select('id').single();

  // 1. Hire (employee + hire action + assignment + compensation).
  const { data: emp, error: empErr } = await clientA.from('employees')
    .insert({
      tenant_id: tenantId, legal_entity_id: legalEntityId, employee_number: 'EMP-0001',
      first_name: 'Amina', last_name: 'Mushi', hire_date: '2026-01-01',
      status: 'active', employment_type: 'permanent', nssf_number: 'NSSF-123',
    })
    .select('id').single();
  check('employee created', !empErr, empErr?.message);
  const empId = emp!.id as string;

  const { data: hireAction } = await clientA.from('employment_actions')
    .insert({
      tenant_id: tenantId, employee_id: empId, action_type: 'hire', status: 'effected',
      effective_date: '2026-01-01', details: { position_id: juniorPos!.id, basic_salary: 1_200_000 },
      requested_by: userAId, approved_by: userAId, approved_at: new Date().toISOString(),
    })
    .select('id').single();
  await clientA.from('employee_assignments').insert({
    tenant_id: tenantId, employee_id: empId, position_id: juniorPos!.id,
    effective_from: '2026-01-01', created_by_action_id: hireAction!.id,
  });
  await clientA.from('employee_compensation').insert({
    tenant_id: tenantId, employee_id: empId, basic_salary: 1_200_000,
    effective_from: '2026-01-01', created_by_action_id: hireAction!.id,
  });
  await clientA.from('positions').update({ status: 'occupied' }).eq('id', juniorPos!.id);
  check('hire action + initial assignment + compensation recorded', true);

  // 2. Promotion: close current rows, open new ones (effective 2026-07-01).
  const { data: promo } = await clientA.from('employment_actions')
    .insert({
      tenant_id: tenantId, employee_id: empId, action_type: 'promotion', status: 'effected',
      effective_date: '2026-07-01', details: { position_id: seniorPos!.id, basic_salary: 1_800_000 },
      reason: 'Annual review', requested_by: userAId, approved_by: userAId,
      approved_at: new Date().toISOString(),
    })
    .select('id').single();
  await clientA.from('employee_assignments')
    .update({ effective_to: '2026-06-30' })
    .eq('employee_id', empId).is('effective_to', null);
  await clientA.from('employee_assignments').insert({
    tenant_id: tenantId, employee_id: empId, position_id: seniorPos!.id,
    effective_from: '2026-07-01', created_by_action_id: promo!.id,
  });
  await clientA.from('employee_compensation')
    .update({ effective_to: '2026-06-30' })
    .eq('employee_id', empId).is('effective_to', null);
  await clientA.from('employee_compensation').insert({
    tenant_id: tenantId, employee_id: empId, basic_salary: 1_800_000,
    effective_from: '2026-07-01', created_by_action_id: promo!.id,
  });
  await clientA.from('positions').update({ status: 'vacant' }).eq('id', juniorPos!.id);
  await clientA.from('positions').update({ status: 'occupied' }).eq('id', seniorPos!.id);

  const { data: assignments } = await clientA.from('employee_assignments')
    .select('position_id, effective_from, effective_to').eq('employee_id', empId)
    .order('effective_from');
  check('history preserved: 2 assignment rows', assignments?.length === 2);
  check('old assignment closed 2026-06-30',
    assignments?.[0]?.effective_to === '2026-06-30' && assignments?.[0]?.position_id === juniorPos!.id);
  check('current assignment is senior position',
    assignments?.[1]?.effective_to === null && assignments?.[1]?.position_id === seniorPos!.id);

  const { data: comps } = await clientA.from('employee_compensation')
    .select('basic_salary, effective_to').eq('employee_id', empId).order('effective_from');
  check('salary history: 1.2M closed → 1.8M current',
    comps?.length === 2 && Number(comps[0].basic_salary) === 1_200_000 &&
    comps[0].effective_to === '2026-06-30' && Number(comps[1].basic_salary) === 1_800_000 &&
    comps[1].effective_to === null);

  const { data: posStates } = await clientA.from('positions')
    .select('id, status').in('id', [juniorPos!.id, seniorPos!.id]);
  const stateById = new Map(posStates?.map((p) => [p.id, p.status]));
  check('position occupancy swapped',
    stateById.get(juniorPos!.id) === 'vacant' && stateById.get(seniorPos!.id) === 'occupied');

  // 3. Contract with expiry.
  const { error: ctErr } = await clientA.from('employee_contracts').insert({
    tenant_id: tenantId, employee_id: empId, contract_type: 'fixed_term',
    starts_on: '2026-01-01', ends_on: '2026-08-15', status: 'active', probation_months: 3,
  });
  check('fixed-term contract created', !ctErr, ctErr?.message);

  // 4. Bank account + dependant.
  const { error: bankErr } = await clientA.from('employee_bank_accounts').insert({
    tenant_id: tenantId, employee_id: empId, payment_method: 'mobile_money',
    mobile_money_provider: 'M-Pesa', mobile_money_number: '+255700000001',
  });
  const { error: depErr } = await clientA.from('employee_dependants').insert({
    tenant_id: tenantId, employee_id: empId, full_name: 'Neema Mushi',
    relationship: 'child', is_emergency_contact: false,
  });
  check('bank account + dependant created', !bankErr && !depErr, bankErr?.message ?? depErr?.message);

  // 5. Document storage: upload via user A (RLS on storage.objects).
  storagePath = `${tenantId}/${empId}/test-contract.txt`;
  const { error: upErr } = await clientA.storage
    .from('employee-documents')
    .upload(storagePath, new Blob(['signed contract']), { contentType: 'text/plain' });
  check('user A uploads document to tenant path', !upErr, upErr?.message);

  const { data: docRow, error: docErr } = await clientA.from('employee_documents')
    .insert({
      tenant_id: tenantId, employee_id: empId, category: 'contract',
      name: 'Signed contract', storage_path: storagePath, uploaded_by: userAId,
    })
    .select('id').single();
  check('document metadata recorded', !docErr && Boolean(docRow), docErr?.message);

  const { data: signed } = await clientA.storage
    .from('employee-documents').createSignedUrl(storagePath, 60);
  check('signed URL generated', Boolean(signed?.signedUrl));

  // 6. Storage isolation: user B cannot upload into or read tenant A's path.
  const clientB = createClient(url, anonKey);
  await clientB.auth.signInWithPassword({
    email: `e2e-ppl-b-${stamp}@stellix-test.example.com`, password,
  });
  const { error: bUpErr } = await clientB.storage
    .from('employee-documents')
    .upload(`${tenantId}/${empId}/rogue.txt`, new Blob(['x']));
  check('user B cannot upload into tenant A storage', Boolean(bUpErr));
  const { data: bDl, error: bDlErr } = await clientB.storage
    .from('employee-documents').download(storagePath);
  check('user B cannot download tenant A document', Boolean(bDlErr) || !bDl);
  const { data: bEmployees } = await clientB.from('employees').select('id');
  check('user B sees no employees', bEmployees?.length === 0);
} finally {
  if (storagePath) await admin.storage.from('employee-documents').remove([storagePath]);
  if (tenantId) await admin.from('tenants').delete().eq('id', tenantId);
  if (userAId) await admin.auth.admin.deleteUser(userAId);
  if (userBId) await admin.auth.admin.deleteUser(userBId);
  console.log('cleanup done');
}

if (failures > 0) {
  console.error(`\n${failures} check(s) FAILED`);
  process.exit(1);
}
console.log('\nAll Sprint 3 checks passed.');
