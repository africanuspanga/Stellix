/**
 * Sprint 1 end-to-end test against the live Supabase project.
 * Exercises the REAL provisioning code path, then proves RLS isolation.
 * Creates throwaway users/tenant and cleans them up afterwards.
 *
 * Run from apps/web:  pnpm dlx tsx --env-file=.env.local scripts/e2e-tenancy.mts
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
const emailA = `e2e-a-${stamp}@stellix-test.example.com`;
const emailB = `e2e-b-${stamp}@stellix-test.example.com`;
const password = `E2e!${stamp}Aa11`;

let userAId = '';
let userBId = '';
let tenantId = '';

try {
  // 1. Create two confirmed users (admin API).
  const { data: a, error: aErr } = await admin.auth.admin.createUser({
    email: emailA,
    password,
    email_confirm: true,
    user_metadata: { full_name: 'E2E User A' },
  });
  if (aErr) throw aErr;
  userAId = a.user.id;
  const { data: b, error: bErr } = await admin.auth.admin.createUser({
    email: emailB,
    password,
    email_confirm: true,
  });
  if (bErr) throw bErr;
  userBId = b.user.id;
  check('users created', true);

  // 2. Provision a tenant for user A through the real code path.
  const result = await provisionTenant(admin, {
    userId: userAId,
    companyName: `E2E Test Co ${stamp}`,
    jurisdiction: 'tz_mainland',
    sector: 'private',
  });
  tenantId = result.tenantId;
  check('tenant provisioned', Boolean(tenantId && result.legalEntityId && result.adminRoleId));

  // 3. Sign in as user A — RLS-scoped visibility.
  const clientA = createClient(url, anonKey);
  const { error: signInErr } = await clientA.auth.signInWithPassword({ email: emailA, password });
  check('user A signs in with password', !signInErr, signInErr?.message);

  const { data: tenantsA } = await clientA.from('tenants').select('id, name');
  check('user A sees exactly their tenant', tenantsA?.length === 1 && tenantsA[0].id === tenantId);

  const { data: rolesA } = await clientA.from('roles').select('name').eq('tenant_id', tenantId);
  check('5 default roles visible', rolesA?.length === 5, `got ${rolesA?.length}`);

  const { data: myRoles } = await clientA
    .from('user_roles')
    .select('role_id, roles(name)')
    .eq('user_id', userAId);
  const roleName = (myRoles?.[0] as { roles?: { name?: string } } | undefined)?.roles?.name;
  check('user A holds the admin role', roleName === 'admin', `got ${roleName}`);

  const { data: perms } = await clientA.from('permissions').select('key');
  check('permission catalogue readable (28 keys)', (perms?.length ?? 0) >= 28, `got ${perms?.length}`);

  const { data: audits } = await clientA
    .from('audit_logs')
    .select('action, actor_user_id')
    .eq('tenant_id', tenantId);
  check(
    'audit trail has tenant.created by user A',
    audits?.some((r) => r.action === 'tenant.created' && r.actor_user_id === userAId) ?? false,
  );

  const { data: packLink } = await clientA
    .from('legal_entity_compliance')
    .select('pack_id')
    .eq('tenant_id', tenantId);
  check('compliance pack attached to legal entity', (packLink?.length ?? 0) === 1);

  // 4. RLS isolation: user B (no membership) must see nothing.
  const clientB = createClient(url, anonKey);
  await clientB.auth.signInWithPassword({ email: emailB, password });
  const { data: tenantsB } = await clientB.from('tenants').select('id');
  const { data: rolesB } = await clientB.from('roles').select('id');
  const { data: auditsB } = await clientB.from('audit_logs').select('id');
  check('user B sees no tenants', tenantsB?.length === 0);
  check('user B sees no roles', rolesB?.length === 0);
  check('user B sees no audit logs', auditsB?.length === 0);

  // 5. Cross-tenant write must be rejected by RLS (insert into A's tenant).
  const { error: crossWrite } = await clientB
    .from('audit_logs')
    .insert({ tenant_id: tenantId, action: 'evil.write', entity_type: 'tenant' });
  check('user B cannot write into tenant A audit log', Boolean(crossWrite));
} finally {
  // Cleanup: tenant cascade removes entities/roles/memberships/audits.
  if (tenantId) await admin.from('tenants').delete().eq('id', tenantId);
  if (userAId) await admin.auth.admin.deleteUser(userAId);
  if (userBId) await admin.auth.admin.deleteUser(userBId);
  console.log('cleanup done');
}

if (failures > 0) {
  console.error(`\n${failures} check(s) FAILED`);
  process.exit(1);
}
console.log('\nAll Sprint 1 checks passed.');
