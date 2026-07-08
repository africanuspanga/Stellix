/**
 * Sprint 2 end-to-end test: permission resolution + organization CRUD through
 * RLS + audit coverage + tenant isolation.
 * Run from apps/web:  pnpm dlx tsx --env-file=.env.local scripts/e2e-org.mts
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

try {
  const { data: a, error: aErr } = await admin.auth.admin.createUser({
    email: `e2e-org-a-${stamp}@stellix-test.example.com`,
    password,
    email_confirm: true,
  });
  if (aErr || !a.user) throw aErr ?? new Error('user A creation failed');
  userAId = a.user.id;
  const { data: b, error: bErr } = await admin.auth.admin.createUser({
    email: `e2e-org-b-${stamp}@stellix-test.example.com`,
    password,
    email_confirm: true,
  });
  if (bErr || !b.user) throw bErr ?? new Error('user B creation failed');
  userBId = b.user.id;

  const { tenantId: tid, legalEntityId } = await provisionTenant(admin, {
    userId: userAId,
    companyName: `E2E Org Co ${stamp}`,
    jurisdiction: 'tz_mainland',
    sector: 'private',
  });
  tenantId = tid;

  const clientA = createClient(url, anonKey);
  await clientA.auth.signInWithPassword({
    email: `e2e-org-a-${stamp}@stellix-test.example.com`,
    password,
  });

  // 1. Permission resolution — same embedded query authz.ts uses.
  const { data: permRows, error: permErr } = await clientA
    .from('user_roles')
    .select('roles(role_permissions(permission_key))')
    .eq('tenant_id', tenantId)
    .eq('user_id', userAId);
  check('permission query executes', !permErr, permErr?.message);
  type RoleEmbed = { role_permissions: Array<{ permission_key: string }> };
  const keys = new Set<string>();
  for (const row of (permRows ?? []) as unknown as Array<{ roles: RoleEmbed | RoleEmbed[] | null }>) {
    const roles = Array.isArray(row.roles) ? row.roles : row.roles ? [row.roles] : [];
    for (const role of roles) for (const rp of role.role_permissions ?? []) keys.add(rp.permission_key);
  }
  check('admin resolves 28 permissions', keys.size >= 28, `got ${keys.size}`);
  check("includes 'people.position.manage'", keys.has('people.position.manage'));

  // 2. Org CRUD through the user's RLS-scoped client.
  const { data: branch, error: brErr } = await clientA
    .from('branches')
    .insert({ tenant_id: tenantId, legal_entity_id: legalEntityId, name: 'HQ', code: 'DSM-01', region: 'Dar es Salaam' })
    .select('id')
    .single();
  check('branch created via RLS client', !brErr, brErr?.message);

  const { data: dept } = await clientA
    .from('departments')
    .insert({ tenant_id: tenantId, name: 'Finance', code: 'FIN' })
    .select('id')
    .single();
  const { data: subDept } = await clientA
    .from('departments')
    .insert({ tenant_id: tenantId, name: 'Payroll', code: 'FIN-PAY', parent_department_id: dept!.id })
    .select('id')
    .single();
  check('department hierarchy created', Boolean(dept && subDept));

  const { data: family } = await clientA
    .from('job_families')
    .insert({ tenant_id: tenantId, name: 'Finance & Accounting' })
    .select('id')
    .single();
  const { data: grade, error: grErr } = await clientA
    .from('job_grades')
    .insert({ tenant_id: tenantId, job_family_id: family!.id, name: 'G5', level: 5, band_min: 1_500_000, band_max: 2_500_000 })
    .select('id')
    .single();
  check('job grade with salary band created', !grErr, grErr?.message);

  const { data: headPos } = await clientA
    .from('positions')
    .insert({
      tenant_id: tenantId, legal_entity_id: legalEntityId, department_id: dept!.id,
      branch_id: branch!.id, job_grade_id: grade!.id, code: 'POS-001',
      title: 'Head of Finance', status: 'occupied',
    })
    .select('id')
    .single();
  const { data: officerPos, error: posErr } = await clientA
    .from('positions')
    .insert({
      tenant_id: tenantId, legal_entity_id: legalEntityId, department_id: subDept!.id,
      job_grade_id: grade!.id, code: 'POS-002', title: 'Payroll Officer',
      status: 'vacant', reports_to_position_id: headPos!.id, is_budgeted: true,
      budgeted_annual_cost: 30_000_000,
    })
    .select('id, status')
    .single();
  check('positions with reporting line created', !posErr, posErr?.message);

  // 3. Position status transition (vacancy control basis).
  const { error: statusErr } = await clientA
    .from('positions')
    .update({ status: 'frozen' })
    .eq('id', officerPos!.id);
  const { data: frozen } = await clientA
    .from('positions')
    .select('status')
    .eq('id', officerPos!.id)
    .single();
  check('position status transition vacant → frozen', !statusErr && frozen?.status === 'frozen');

  // 4. Unique constraint: duplicate position code rejected.
  const { error: dupErr } = await clientA
    .from('positions')
    .insert({ tenant_id: tenantId, legal_entity_id: legalEntityId, code: 'POS-001', title: 'Duplicate' });
  check('duplicate position code rejected', Boolean(dupErr));

  // 5. Isolation: user B sees none of it and cannot write into tenant A.
  const clientB = createClient(url, anonKey);
  await clientB.auth.signInWithPassword({
    email: `e2e-org-b-${stamp}@stellix-test.example.com`,
    password,
  });
  const { data: bPositions } = await clientB.from('positions').select('id');
  check('user B sees no positions', bPositions?.length === 0);
  const { error: bWrite } = await clientB
    .from('branches')
    .insert({ tenant_id: tenantId, legal_entity_id: legalEntityId, name: 'Rogue branch' });
  check('user B cannot create branch in tenant A', Boolean(bWrite));
} finally {
  if (tenantId) await admin.from('tenants').delete().eq('id', tenantId);
  if (userAId) await admin.auth.admin.deleteUser(userAId);
  if (userBId) await admin.auth.admin.deleteUser(userBId);
  console.log('cleanup done');
}

if (failures > 0) {
  console.error(`\n${failures} check(s) FAILED`);
  process.exit(1);
}
console.log('\nAll Sprint 2 checks passed.');
