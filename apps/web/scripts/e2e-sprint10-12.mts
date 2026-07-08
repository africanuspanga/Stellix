/**
 * Sprints 10 (reshaped) + 12 end-to-end test: invite links through the real
 * acceptance code, statutory filing generation from an approved run,
 * compliance snapshot checks, and the partner multi-client view.
 * Run from apps/web:  pnpm dlx tsx --env-file=.env.local scripts/e2e-sprint10-12.mts
 */
import { createClient } from '@supabase/supabase-js';
import { provisionTenant } from '../src/lib/tenancy/provision';
import { calculateRunCore, type RunRow } from '../src/lib/payroll/run-calc';
import { acceptInvite } from '../src/lib/invites';
import { buildFilingDrafts, generateFilingsFromRun } from '../src/lib/compliance/filings';
import { getComplianceSnapshot } from '../src/lib/compliance/checks';

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
const tenantIds: string[] = [];
const runIds: string[] = [];

try {
  // ── Pure filing math first ──────────────────────────────────────────────
  const drafts = buildFilingDrafts({ year: 2026, month: 7 }, [
    {
      paye: 103_000, pension_employee: 100_000,
      employer_contributions: [
        { code: 'PENSION_ER', amount: 100_000 },
        { code: 'SDL', amount: 35_000 },
        { code: 'WCF', amount: 5_000 },
      ],
    },
  ]);
  const byType = new Map(drafts.map((d) => [d.filing_type, d]));
  check('filing drafts: PAYE 103,000 due 7 Aug',
    byType.get('paye')?.amount === 103_000 && byType.get('paye')?.due_date === '2026-08-07');
  check('filing drafts: NSSF 200,000 (ee+er) due end of Aug',
    byType.get('nssf')?.amount === 200_000 && byType.get('nssf')?.due_date === '2026-08-31');
  check('filing drafts: SDL 35,000 · WCF 5,000',
    byType.get('sdl')?.amount === 35_000 && byType.get('wcf')?.amount === 5_000);
  check('December rolls into January next year',
    buildFilingDrafts({ year: 2026, month: 12 }, [])[0].due_date === '2027-01-07');

  // ── Tenant + payroll setup ──────────────────────────────────────────────
  const { data: uA, error: uErr } = await admin.auth.admin.createUser({
    email: `e2e-sx-a-${stamp}@stellix-test.example.com`, password, email_confirm: true,
  });
  if (uErr || !uA.user) throw uErr ?? new Error('user A failed');
  const userA = uA.user.id;
  userIds.push(userA);

  const { tenantId, legalEntityId } = await provisionTenant(admin, {
    userId: userA, companyName: `E2E SX Co ${stamp}`, jurisdiction: 'tz_mainland', sector: 'private',
  });
  tenantIds.push(tenantId);
  const clientA = createClient(url, anonKey);
  await clientA.auth.signInWithPassword({
    email: `e2e-sx-a-${stamp}@stellix-test.example.com`, password,
  });

  const { data: emp1 } = await clientA.from('employees')
    .insert({
      tenant_id: tenantId, legal_entity_id: legalEntityId, employee_number: 'EMP-0001',
      first_name: 'Amani', last_name: 'Test', hire_date: '2026-01-01', status: 'active',
      national_id: 'NIDA-1', tin: 'TIN-1', nssf_number: 'NSSF-1',
      personal_email: `amani-${stamp}@stellix-test.example.com`, phone: '+255700000001',
    }).select('id').single();
  await clientA.from('employee_compensation').insert({
    tenant_id: tenantId, employee_id: emp1!.id, basic_salary: 1_000_000, effective_from: '2026-01-01',
  });
  await clientA.from('employee_contracts').insert({
    tenant_id: tenantId, employee_id: emp1!.id, contract_type: 'permanent',
    starts_on: '2026-01-01', status: 'active',
  });

  const { data: run } = await clientA.from('payroll_runs')
    .insert({ tenant_id: tenantId, legal_entity_id: legalEntityId, period_year: 2026, period_month: 7, created_by: userA })
    .select('*').single();
  runIds.push(run!.id);
  await calculateRunCore(clientA, run as RunRow);
  await clientA.from('payroll_runs').update({ status: 'approved', approved_by: userA, approved_at: new Date().toISOString() }).eq('id', run!.id);

  // ── Filing generation from the live run (real code) ─────────────────────
  const generated = await generateFilingsFromRun(clientA, run!.id, userA);
  check('4 filings generated from approved run', generated.created === 4);
  const again = await generateFilingsFromRun(clientA, run!.id, userA);
  check('regeneration is idempotent (4 skipped)', again.created === 0 && again.skipped === 4);

  const { data: filingRows } = await clientA.from('statutory_filings')
    .select('filing_type, amount, due_date, status').order('filing_type');
  const payeRow = filingRows?.find((f) => f.filing_type === 'paye');
  check('live PAYE filing 103,000 pending',
    Number(payeRow?.amount) === 103_000 && payeRow?.status === 'pending');

  await clientA.from('statutory_filings')
    .update({ status: 'paid', payment_reference: 'TRA-12345', paid_at: new Date().toISOString(), filed_at: new Date().toISOString() })
    .eq('filing_type', 'paye').eq('tenant_id', tenantId);
  const { data: paid } = await clientA.from('statutory_filings')
    .select('status, payment_reference').eq('filing_type', 'paye').single();
  check('filing marked paid with reference', paid?.status === 'paid' && paid?.payment_reference === 'TRA-12345');

  // ── Compliance snapshot (real code) ─────────────────────────────────────
  const permitExpiry = new Date();
  permitExpiry.setUTCDate(permitExpiry.getUTCDate() + 30);
  const { data: emp2 } = await clientA.from('employees')
    .insert({
      tenant_id: tenantId, legal_entity_id: legalEntityId, employee_number: 'EMP-0002',
      first_name: 'Baraka', last_name: 'Risk', hire_date: '2026-06-01', status: 'active',
      nationality: 'KE', work_permit_number: 'WP-1',
      work_permit_expiry: permitExpiry.toISOString().slice(0, 10),
    }).select('id').single();
  await clientA.from('employee_compensation').insert({
    tenant_id: tenantId, employee_id: emp2!.id, basic_salary: 50_000, effective_from: '2026-06-01',
  });
  // Overdue filing: June period due 7 July (yesterday relative to 2026-07-08).
  await clientA.from('statutory_filings').insert({
    tenant_id: tenantId, legal_entity_id: legalEntityId, filing_type: 'sdl',
    period_year: 2026, period_month: 6, due_date: '2026-07-07', amount: 30_000,
  });

  const snapshot = await getComplianceSnapshot(clientA);
  check('missing contract flagged for Baraka only',
    snapshot.missingContracts.length === 1 && snapshot.missingContracts[0].name.includes('Baraka'));
  check('below minimum wage flagged (50,000 < 60,000 floor)',
    snapshot.belowMinimumWage.some((i) => i.name.includes('Baraka')),
    JSON.stringify(snapshot.belowMinimumWage));
  check('incomplete statutory IDs flagged (NIDA/TIN/NSSF)',
    snapshot.incompleteFiles.some((i) => i.name.includes('Baraka') && i.detail.includes('TIN')));
  check('expiring work permit flagged (90-day window)',
    snapshot.expiringPermits.some((i) => i.name.includes('Baraka')));
  check('overdue filing detected', snapshot.overdueFilings.length === 1
    && snapshot.overdueFilings[0].filingType === 'sdl');
  check('draft statutory rules surfaced', snapshot.draftRuleCount >= 6);

  // ── Invite links (real acceptance code) ─────────────────────────────────
  const token = `tok${stamp}${Math.random().toString(36).slice(2)}`;
  const expires = new Date();
  expires.setUTCDate(expires.getUTCDate() + 14);
  const { error: invErr } = await clientA.from('employee_invites').insert({
    tenant_id: tenantId, employee_id: emp1!.id, token,
    created_by: userA, expires_at: expires.toISOString(),
  });
  check('HR creates invite (RLS permits)', !invErr, invErr?.message);

  const accepted = await acceptInvite(admin, { token, password: `Inv!${stamp}Aa11` });
  userIds.push(accepted.userId);
  check('invite accepted → account created for employee email',
    accepted.email === `amani-${stamp}@stellix-test.example.com`);

  const clientNew = createClient(url, anonKey);
  const { error: signInErr } = await clientNew.auth.signInWithPassword({
    email: accepted.email, password: `Inv!${stamp}Aa11`,
  });
  check('invited employee signs in immediately (no email confirmation)', !signInErr, signInErr?.message);

  const { data: selfEmployee } = await clientNew.from('employees').select('id, user_id');
  check('new account linked to the employee record + tenant membership',
    selfEmployee?.some((e) => e.id === emp1!.id && e.user_id === accepted.userId));
  const { data: newRoles } = await clientNew
    .from('user_roles').select('roles(name)').eq('user_id', accepted.userId);
  const roleName = (Array.isArray(newRoles?.[0]?.roles) ? newRoles?.[0]?.roles[0] : newRoles?.[0]?.roles) as { name?: string } | undefined;
  check('employee role assigned automatically', roleName?.name === 'employee');

  let reuseBlocked = false;
  try {
    await acceptInvite(admin, { token, password: 'Another!123' });
  } catch (e) {
    reuseBlocked = e instanceof Error && e.message.includes('already used');
  }
  check('invite cannot be used twice', reuseBlocked);

  let expiredBlocked = false;
  const oldToken = `old${stamp}`;
  await admin.from('employee_invites').insert({
    tenant_id: tenantId, employee_id: emp2!.id, token: oldToken,
    created_by: userA, expires_at: '2026-01-01T00:00:00Z',
  });
  try {
    await acceptInvite(admin, { token: oldToken, password: 'Whatever!123' });
  } catch (e) {
    expiredBlocked = e instanceof Error && e.message.includes('expired');
  }
  check('expired invite rejected', expiredBlocked);

  // ── Partner: one user across two client tenants ─────────────────────────
  const { tenantId: tenant2 } = await provisionTenant(admin, {
    userId: userA, companyName: `E2E SX Client2 ${stamp}`, jurisdiction: 'tz_mainland', sector: 'private',
  });
  tenantIds.push(tenant2);
  const { data: myTenants } = await clientA.from('tenants').select('id, name').order('name');
  check('partner user sees both client workspaces', myTenants?.length === 2);
  const { data: crossEmployees } = await clientA.from('employees').select('tenant_id');
  check('cross-client data resolvable per tenant for the overview',
    new Set((crossEmployees ?? []).map((e) => e.tenant_id)).size === 1 /* client2 has none yet */
    && crossEmployees?.every((e) => e.tenant_id === tenantId));
} finally {
  for (const runId of runIds) {
    await admin.from('payroll_runs').update({ status: 'reversed' }).eq('id', runId);
  }
  for (const tid of tenantIds) await admin.from('tenants').delete().eq('id', tid);
  for (const id of userIds) await admin.auth.admin.deleteUser(id);
  console.log('cleanup done');
}

if (failures > 0) {
  console.error(`\n${failures} check(s) FAILED`);
  process.exit(1);
}
console.log('\nAll Sprint 10+12 checks passed.');
