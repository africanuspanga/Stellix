/**
 * Driftmark Technologies — persistent sales-demo tenant.
 *
 * 120 employees across 8 departments and 3 branches, with months of leave,
 * attendance, payroll, compliance, talent and service-desk history so every
 * demo path has live data. RE-RUNNABLE: wipes and rebuilds the tenant.
 *
 * Run from apps/web:  pnpm dlx tsx --env-file=.env.local scripts/seed-driftmark.mts
 *
 * Demo logins (password: DriftmarkDemo2026!)
 *   demo-admin@driftmark.co.tz     — HR/payroll admin (presenter view)
 *   demo-manager@driftmark.co.tz   — Engineering manager (approvals, team)
 *   demo-employee@driftmark.co.tz  — Field officer (My space, Huduma)
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { provisionTenant } from '../src/lib/tenancy/provision';
import { startWorkflow } from '../src/lib/workflow/engine';
import { calculateRunCore, type RunRow } from '../src/lib/payroll/run-calc';
import { generateFilingsFromRun } from '../src/lib/compliance/filings';
import { processDay, type ShiftSpec } from '../src/lib/attendance/process';
import { isWeekend } from '../src/lib/leave/working-days';
import { STANDARD_OFFBOARDING_TASKS } from '../src/lib/people/offboarding';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin: SupabaseClient = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const PASSWORD = 'DriftmarkDemo2026!';
const SLUG = 'driftmark-technologies';
const DEMO_EMAILS = [
  'demo-admin@driftmark.co.tz',
  'demo-manager@driftmark.co.tz',
  'demo-employee@driftmark.co.tz',
];

function log(msg: string) {
  console.log(`▸ ${msg}`);
}

// Deterministic PRNG so reruns produce the same company.
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(19611961);
const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
const randInt = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min;

const MALE = ['Juma', 'Baraka', 'Emmanuel', 'Ibrahim', 'Joseph', 'Musa', 'Daniel', 'Hassan', 'Peter', 'Salum', 'Rashid', 'Frank', 'Godfrey', 'Abdallah', 'Elias', 'Michael', 'Omari', 'Samuel', 'Yusuph', 'Vincent', 'Charles', 'Deogratius', 'Innocent', 'Mathias', 'Fadhili'];
const FEMALE = ['Amina', 'Neema', 'Zawadi', 'Rehema', 'Grace', 'Fatuma', 'Joyce', 'Salma', 'Esther', 'Mariamu', 'Happiness', 'Gloria', 'Jane', 'Halima', 'Beatrice', 'Anna', 'Zainabu', 'Lucy', 'Agnes', 'Mwanaidi', 'Rose', 'Irene', 'Diana', 'Winifrida', 'Upendo'];
const SURNAMES = ['Mushi', 'Mwakalinga', 'Komba', 'Shayo', 'Massawe', 'Kimaro', 'Mrema', 'Swai', 'Temba', 'Lyimo', 'Mollel', 'Sanga', 'Mwenda', 'Kileo', 'Nnko', 'Mafuru', 'Bakari', 'Salehe', 'Mgaya', 'Haule', 'Kapinga', 'Mwakyusa', 'Ndosi', 'Macha', 'Urassa', 'Tarimo', 'Msuya', 'Mbwambo', 'Chande', 'Mhando'];
const BANKS = ['CRDB', 'NMB', 'NBC', 'Stanbic', 'Equity'];
const MM_PROVIDERS = ['M-Pesa', 'Tigo Pesa', 'Airtel Money', 'Halopesa'];

interface DeptSpec {
  name: string;
  code: string;
  count: number;
  salary: [number, number];
  headTitle: string;
  headSalary: number;
}
const DEPARTMENTS: DeptSpec[] = [
  { name: 'Engineering', code: 'ENG', count: 25, salary: [1_200_000, 3_500_000], headTitle: 'Chief Technology Officer', headSalary: 7_500_000 },
  { name: 'Finance', code: 'FIN', count: 10, salary: [900_000, 2_500_000], headTitle: 'Chief Financial Officer', headSalary: 7_000_000 },
  { name: 'Operations', code: 'OPS', count: 20, salary: [600_000, 1_200_000], headTitle: 'Head of Operations', headSalary: 4_500_000 },
  { name: 'Sales & Marketing', code: 'SAL', count: 15, salary: [700_000, 1_500_000], headTitle: 'Head of Sales', headSalary: 4_000_000 },
  { name: 'Field Services', code: 'FLD', count: 30, salary: [300_000, 650_000], headTitle: 'Field Services Manager', headSalary: 2_200_000 },
  { name: 'Security', code: 'SEC', count: 10, salary: [280_000, 450_000], headTitle: 'Security Supervisor', headSalary: 900_000 },
  { name: 'People & Culture', code: 'HRD', count: 5, salary: [800_000, 1_800_000], headTitle: 'Head of People & Culture', headSalary: 3_500_000 },
  { name: 'Customer Support', code: 'SUP', count: 5, salary: [500_000, 900_000], headTitle: 'Support Team Lead', headSalary: 1_400_000 },
];

async function wipeExisting() {
  const { data: existing } = await admin.from('tenants').select('id').eq('slug', SLUG).maybeSingle();
  if (existing) {
    log(`existing tenant found — wiping (${existing.id})`);
    await admin.from('payroll_runs').update({ status: 'reversed' }).eq('tenant_id', existing.id);
    await admin.from('attendance_events').delete().eq('tenant_id', existing.id);
    const { error } = await admin.from('tenants').delete().eq('id', existing.id);
    if (error) throw new Error(`wipe failed: ${error.message}`);
  }
  const { data: userList } = await admin.auth.admin.listUsers({ perPage: 1000 });
  for (const user of userList?.users ?? []) {
    if (DEMO_EMAILS.includes(user.email ?? '')) await admin.auth.admin.deleteUser(user.id);
  }
}

async function makeUser(email: string, name: string): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: name },
  });
  if (error || !data.user) throw error ?? new Error(`${email} failed`);
  return data.user.id;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
async function batchInsert(table: string, rows: Record<string, unknown>[]) {
  for (const part of chunk(rows, 400)) {
    const { error } = await admin.from(table).insert(part);
    if (error) throw new Error(`${table} insert failed: ${error.message}`);
  }
}

async function main() {
  log('wiping any previous Driftmark demo…');
  await wipeExisting();

  // ── Users & tenant ───────────────────────────────────────────────────
  log('creating demo users…');
  const adminUser = await makeUser(DEMO_EMAILS[0], 'Aisha Mwangamba');
  const managerUser = await makeUser(DEMO_EMAILS[1], 'Emmanuel Kimaro');
  const employeeUser = await makeUser(DEMO_EMAILS[2], 'Juma Salehe');

  log('provisioning tenant…');
  const { tenantId, legalEntityId } = await provisionTenant(admin, {
    userId: adminUser,
    companyName: 'Driftmark Technologies',
    legalEntityName: 'Driftmark Technologies Ltd',
    jurisdiction: 'tz_mainland',
    sector: 'private',
  });
  // Force the slug so reruns find it.
  await admin.from('tenants').update({ slug: SLUG, hr_whatsapp_number: '+255700000099' }).eq('id', tenantId);

  const { data: roles } = await admin.from('roles').select('id, name').eq('tenant_id', tenantId);
  const roleId = (name: string) => roles!.find((r) => r.name === name)!.id as string;
  await batchInsert('tenant_users', [
    { tenant_id: tenantId, user_id: managerUser },
    { tenant_id: tenantId, user_id: employeeUser },
  ]);
  await batchInsert('user_roles', [
    { tenant_id: tenantId, user_id: adminUser, role_id: roleId('hr_manager') },
    { tenant_id: tenantId, user_id: managerUser, role_id: roleId('manager') },
    { tenant_id: tenantId, user_id: employeeUser, role_id: roleId('employee') },
  ]);

  // ── Org structure ────────────────────────────────────────────────────
  log('building org structure…');
  const branchSpecs = [
    { name: 'Dar es Salaam HQ', code: 'DSM', region: 'Dar es Salaam', lat: -6.8161, lng: 39.2803 },
    { name: 'Mwanza Branch', code: 'MWZ', region: 'Mwanza', lat: -2.5164, lng: 32.9175 },
    { name: 'Arusha Branch', code: 'ARU', region: 'Arusha', lat: -3.3869, lng: 36.683 },
  ];
  const branchIds: string[] = [];
  for (const spec of branchSpecs) {
    const { data } = await admin.from('branches')
      .insert({ tenant_id: tenantId, legal_entity_id: legalEntityId, name: spec.name, code: spec.code, region: spec.region })
      .select('id').single();
    branchIds.push(data!.id);
    await admin.from('work_sites').insert({
      tenant_id: tenantId, branch_id: data!.id, name: `${spec.name} site`,
      latitude: spec.lat, longitude: spec.lng, geofence_radius_m: 200,
    });
  }

  const deptIds = new Map<string, string>();
  for (const [i, dept] of DEPARTMENTS.entries()) {
    const { data } = await admin.from('departments')
      .insert({ tenant_id: tenantId, legal_entity_id: legalEntityId, name: dept.name, code: dept.code })
      .select('id').single();
    deptIds.set(dept.code, data!.id);
    await admin.from('cost_centres').insert({
      tenant_id: tenantId, legal_entity_id: legalEntityId,
      name: `${dept.name} cost centre`, code: `CC-${(i + 1) * 100}`,
    });
  }

  const { data: family } = await admin.from('job_families')
    .insert({ tenant_id: tenantId, name: 'General' }).select('id').single();
  const gradeSpecs = [
    { name: 'G1 — Entry', level: 1, min: 280_000, max: 500_000 },
    { name: 'G2 — Officer', level: 2, min: 500_000, max: 900_000 },
    { name: 'G3 — Senior Officer', level: 3, min: 900_000, max: 1_600_000 },
    { name: 'G4 — Specialist', level: 4, min: 1_600_000, max: 2_800_000 },
    { name: 'G5 — Manager', level: 5, min: 2_800_000, max: 4_800_000 },
    { name: 'G6 — Executive', level: 6, min: 4_800_000, max: 8_000_000 },
  ];
  await batchInsert('job_grades', gradeSpecs.map((g) => ({
    tenant_id: tenantId, job_family_id: family!.id, name: g.name, level: g.level,
    band_min: g.min, band_max: g.max,
  })));

  // Head positions per department.
  const positionIds = new Map<string, string>();
  for (const [i, dept] of DEPARTMENTS.entries()) {
    const { data } = await admin.from('positions')
      .insert({
        tenant_id: tenantId, legal_entity_id: legalEntityId,
        department_id: deptIds.get(dept.code), branch_id: branchIds[0],
        code: `POS-${String(i + 1).padStart(3, '0')}`, title: dept.headTitle, status: 'occupied',
      }).select('id').single();
    positionIds.set(dept.code, data!.id);
  }
  // A couple of open vacancies for the recruitment story.
  const { data: vacantPos } = await admin.from('positions')
    .insert({
      tenant_id: tenantId, legal_entity_id: legalEntityId,
      department_id: deptIds.get('ENG'), branch_id: branchIds[0],
      code: 'POS-101', title: 'Senior Backend Engineer', status: 'vacant', is_budgeted: true,
      budgeted_annual_cost: 42_000_000,
    }).select('id').single();
  await admin.from('positions').insert({
    tenant_id: tenantId, legal_entity_id: legalEntityId,
    department_id: deptIds.get('FLD'), branch_id: branchIds[1],
    code: 'POS-102', title: 'Field Technician — Mwanza', status: 'vacant',
  });

  // ── Employees ────────────────────────────────────────────────────────
  log('creating 120 employees…');
  interface Emp {
    number: string; first: string; last: string; gender: 'male' | 'female';
    dept: DeptSpec; salary: number; hireDate: string; type: string;
    isHead: boolean; flags: { noContract?: boolean; missingIds?: boolean; expat?: boolean; belowMin?: boolean };
  }
  const specs: Emp[] = [];
  let counter = 0;
  const usedNames = new Set<string>();
  for (const dept of DEPARTMENTS) {
    for (let i = 0; i < dept.count; i++) {
      counter++;
      const gender = rand() < 0.45 ? 'female' : 'male';
      let first = '', last = '';
      do {
        first = gender === 'female' ? pick(FEMALE) : pick(MALE);
        last = pick(SURNAMES);
      } while (usedNames.has(`${first} ${last}`));
      usedNames.add(`${first} ${last}`);
      const isHead = i === 0;
      const year = isHead ? randInt(2019, 2022) : randInt(2021, 2025);
      const hireDate = `${year}-${String(randInt(1, 12)).padStart(2, '0')}-${String(randInt(1, 28)).padStart(2, '0')}`;
      const belowMin = dept.code === 'SEC' && i >= 8; // 2 casual guards below floor
      specs.push({
        number: `DMK-${String(counter).padStart(4, '0')}`,
        first, last, gender, dept,
        salary: isHead ? dept.headSalary : belowMin ? 55_000 : randInt(dept.salary[0] / 1000, dept.salary[1] / 1000) * 1000,
        hireDate,
        type: belowMin ? 'casual' : isHead ? 'permanent' : rand() < 0.12 ? 'fixed_term' : rand() < 0.05 ? 'internship' : 'permanent',
        isHead,
        flags: {
          belowMin,
          noContract: !isHead && rand() < 0.05,
          missingIds: !isHead && rand() < 0.07,
          expat: false,
        },
      });
    }
  }
  // 3 expatriates in Engineering (permits; one expiring soon).
  specs[2].flags.expat = true;
  specs[3].flags.expat = true;
  specs[4].flags.expat = true;

  const today = new Date('2026-07-08T00:00:00Z');
  const soonPermit = new Date(today); soonPermit.setUTCDate(soonPermit.getUTCDate() + 45);
  const farPermit = new Date(today); farPermit.setUTCDate(farPermit.getUTCDate() + 300);

  const employeeRows = specs.map((s, i) => ({
    tenant_id: tenantId,
    legal_entity_id: legalEntityId,
    employee_number: s.number,
    first_name: s.first,
    last_name: s.last,
    gender: s.gender,
    date_of_birth: `${randInt(1972, 2002)}-${String(randInt(1, 12)).padStart(2, '0')}-${String(randInt(1, 28)).padStart(2, '0')}`,
    nationality: s.flags.expat ? pick(['KE', 'UG']) : 'TZ',
    national_id: s.flags.missingIds ? null : `19${randInt(72, 99)}${String(randInt(10000000, 99999999))}`,
    tin: s.flags.missingIds ? null : `TIN-${randInt(100000, 999999)}`,
    nssf_number: s.flags.missingIds && rand() < 0.5 ? null : `NSSF-${randInt(100000, 999999)}`,
    work_permit_number: s.flags.expat ? `WP-${randInt(1000, 9999)}` : null,
    work_permit_expiry: s.flags.expat ? (i === 2 ? soonPermit : farPermit).toISOString().slice(0, 10) : null,
    personal_email: `${s.first.toLowerCase()}.${s.last.toLowerCase()}${i}@example.com`,
    phone: `+2557${randInt(10000000, 99999999)}`,
    status: 'active',
    employment_type: s.type,
    hire_date: s.hireDate,
  }));
  await batchInsert('employees', employeeRows);

  const { data: employees } = await admin.from('employees')
    .select('id, employee_number, first_name, last_name')
    .eq('tenant_id', tenantId).order('employee_number');
  const empBy = new Map(employees!.map((e) => [e.employee_number as string, e.id as string]));
  const idOf = (i: number) => empBy.get(specs[i].number)!;

  // Link demo users: manager = Engineering head (index 0), employee = first field officer.
  const fieldStart = DEPARTMENTS.slice(0, 4).reduce((s, d) => s + d.count, 0); // FLD block start
  await admin.from('employees').update({ user_id: managerUser, work_email: DEMO_EMAILS[1] }).eq('id', idOf(0));
  await admin.from('employees').update({ user_id: employeeUser, work_email: DEMO_EMAILS[2] }).eq('id', idOf(fieldStart + 1));
  const demoEmployeeIdx = fieldStart + 1;

  // Assignments: heads manage their departments; heads report to CTO-less simplicity.
  log('assignments, salaries, banking, contracts…');
  const deptStartIdx = new Map<string, number>();
  {
    let offset = 0;
    for (const dept of DEPARTMENTS) { deptStartIdx.set(dept.code, offset); offset += dept.count; }
  }
  const assignmentRows = specs.map((s, i) => {
    const headIdx = deptStartIdx.get(s.dept.code)!;
    return {
      tenant_id: tenantId,
      employee_id: idOf(i),
      department_id: deptIds.get(s.dept.code),
      branch_id: s.dept.code === 'FLD' ? branchIds[i % 3] : branchIds[0],
      position_id: s.isHead ? positionIds.get(s.dept.code) : null,
      manager_employee_id: s.isHead ? null : idOf(headIdx),
      effective_from: s.hireDate,
    };
  });
  await batchInsert('employee_assignments', assignmentRows);

  await batchInsert('employee_compensation', specs.map((s, i) => ({
    tenant_id: tenantId, employee_id: idOf(i), basic_salary: s.salary, effective_from: s.hireDate,
  })));

  await batchInsert('employee_bank_accounts', specs.map((s, i) => {
    const mobile = rand() < 0.4;
    return mobile
      ? {
          tenant_id: tenantId, employee_id: idOf(i), payment_method: 'mobile_money',
          mobile_money_provider: pick(MM_PROVIDERS), mobile_money_number: `+2557${randInt(10000000, 99999999)}`,
        }
      : {
          tenant_id: tenantId, employee_id: idOf(i), payment_method: 'bank',
          bank_name: pick(BANKS), account_name: `${s.first} ${s.last}`,
          account_number: String(randInt(1000000000, 2147483647)),
        };
  }));

  const contractRows: Record<string, unknown>[] = [];
  const soonEnd = (days: number) => {
    const d = new Date(today); d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  };
  specs.forEach((s, i) => {
    if (s.flags.noContract) return;
    const fixed = s.type === 'fixed_term' || s.type === 'casual' || s.type === 'internship';
    contractRows.push({
      tenant_id: tenantId, employee_id: idOf(i),
      contract_type: s.type === 'casual' ? 'casual' : s.type === 'internship' ? 'internship' : fixed ? 'fixed_term' : 'permanent',
      starts_on: s.hireDate,
      ends_on: fixed ? soonEnd(i % 7 === 0 ? randInt(20, 55) : randInt(120, 400)) : null,
      status: 'active', probation_months: 3,
    });
  });
  await batchInsert('employee_contracts', contractRows);

  // Probation: three recent hires.
  for (const i of [24, 60, 100]) {
    await admin.from('employees').update({ status: 'probation', probation_end_date: soonEnd(i === 24 ? -5 : 40) }).eq('id', idOf(i));
  }
  await admin.from('probation_reviews').insert([
    { tenant_id: tenantId, employee_id: idOf(24), review_date: soonEnd(-10), created_by: adminUser },
    { tenant_id: tenantId, employee_id: idOf(60), review_date: soonEnd(21), created_by: adminUser },
  ]);

  // ── Pay components ───────────────────────────────────────────────────
  log('pay components & assignments…');
  const componentSpecs = [
    { name: 'Housing allowance', code: 'HOUSE', component_type: 'earning', calc_type: 'percent_of_basic', default_amount: 15, taxable: true, pensionable: false },
    { name: 'Transport allowance', code: 'TRANS', component_type: 'earning', calc_type: 'fixed', default_amount: 100_000, taxable: true, pensionable: false },
    { name: 'Airtime allowance', code: 'AIRTIME', component_type: 'earning', calc_type: 'fixed', default_amount: 30_000, taxable: false, pensionable: false },
    { name: 'Staff loan repayment', code: 'LOAN', component_type: 'deduction', calc_type: 'fixed', default_amount: 80_000, taxable: false, pensionable: false },
    { name: 'Union dues', code: 'UNION', component_type: 'deduction', calc_type: 'percent_of_basic', default_amount: 1, taxable: false, pensionable: false },
  ];
  await batchInsert('pay_components', componentSpecs.map((c) => ({ tenant_id: tenantId, ...c })));
  const { data: components } = await admin.from('pay_components').select('id, code').eq('tenant_id', tenantId);
  const compId = (code: string) => components!.find((c) => c.code === code)!.id as string;

  const componentAssignments: Record<string, unknown>[] = [];
  specs.forEach((s, i) => {
    const eid = idOf(i);
    if (s.isHead || s.salary >= 1_500_000) {
      componentAssignments.push({ tenant_id: tenantId, employee_id: eid, pay_component_id: compId('HOUSE'), effective_from: s.hireDate });
    }
    if (s.dept.code !== 'FLD' || i % 2 === 0) {
      componentAssignments.push({ tenant_id: tenantId, employee_id: eid, pay_component_id: compId('TRANS'), effective_from: s.hireDate });
    }
    if (s.salary >= 900_000) {
      componentAssignments.push({ tenant_id: tenantId, employee_id: eid, pay_component_id: compId('AIRTIME'), effective_from: s.hireDate });
    }
    if (i % 8 === 0) {
      componentAssignments.push({ tenant_id: tenantId, employee_id: eid, pay_component_id: compId('LOAN'), amount: randInt(40, 150) * 1000, effective_from: '2026-01-01' });
    }
    if (s.dept.code === 'FLD' || s.dept.code === 'SEC') {
      componentAssignments.push({ tenant_id: tenantId, employee_id: eid, pay_component_id: compId('UNION'), effective_from: s.hireDate });
    }
  });
  await batchInsert('employee_pay_components', componentAssignments);

  // ── Leave ────────────────────────────────────────────────────────────
  log('leave types, accruals and requests…');
  const leaveTypeSpecs = [
    { name: 'Annual leave', name_sw: 'Likizo ya mwaka', code: 'ANNUAL', annual_entitlement_days: 28, max_carry_forward_days: 7, requires_document: false, gender_restriction: null },
    { name: 'Sick leave', name_sw: 'Likizo ya ugonjwa', code: 'SICK', annual_entitlement_days: 126, max_carry_forward_days: 0, requires_document: true, gender_restriction: null },
    { name: 'Maternity leave', name_sw: 'Likizo ya uzazi', code: 'MATERNITY', annual_entitlement_days: 84, max_carry_forward_days: 0, requires_document: false, gender_restriction: 'female' },
    { name: 'Paternity leave', name_sw: 'Likizo ya ubaba', code: 'PATERNITY', annual_entitlement_days: 3, max_carry_forward_days: 0, requires_document: false, gender_restriction: 'male' },
    { name: 'Compassionate leave', name_sw: 'Likizo ya msiba', code: 'COMPASSIONATE', annual_entitlement_days: 4, max_carry_forward_days: 0, requires_document: false, gender_restriction: null },
  ];
  await batchInsert('leave_types', leaveTypeSpecs.map((t) => ({ tenant_id: tenantId, ...t })));
  const { data: leaveTypes } = await admin.from('leave_types').select('id, code').eq('tenant_id', tenantId);
  const leaveTypeId = (code: string) => leaveTypes!.find((t) => t.code === code)!.id as string;

  await batchInsert('leave_ledger', specs.map((_, i) => ({
    tenant_id: tenantId, employee_id: idOf(i), leave_type_id: leaveTypeId('ANNUAL'),
    entry_type: 'accrual', days: 28, effective_date: '2026-01-01',
    note: 'Annual grant 2026', created_by: adminUser,
  })));

  // Two-step approval workflow (manager → HR) so pending items show SLAs.
  const { data: definition } = await admin.from('workflow_definitions')
    .insert({ tenant_id: tenantId, entity_type: 'leave_request', name: 'Manager then HR' })
    .select('id').single();
  await admin.from('workflow_steps').insert([
    { tenant_id: tenantId, definition_id: definition!.id, step_order: 1, approver_type: 'manager', sla_hours: 24 },
    { tenant_id: tenantId, definition_id: definition!.id, step_order: 2, approver_type: 'role', approver_role_id: roleId('hr_manager'), sla_hours: 48 },
  ]);

  // Approved historical leave (+ ledger debits), including current on-leave.
  const approvedLeave: Array<{ empIdx: number; from: string; to: string; days: number }> = [
    { empIdx: 10, from: '2026-05-04', to: '2026-05-08', days: 5 },
    { empIdx: 35, from: '2026-06-08', to: '2026-06-12', days: 5 },
    { empIdx: 50, from: '2026-06-22', to: '2026-06-26', days: 5 },
    { empIdx: 72, from: '2026-07-06', to: '2026-07-10', days: 5 }, // on leave THIS week
    { empIdx: 90, from: '2026-07-06', to: '2026-07-17', days: 10 }, // on leave now
  ];
  for (const leave of approvedLeave) {
    const { data: request } = await admin.from('leave_requests')
      .insert({
        tenant_id: tenantId, employee_id: idOf(leave.empIdx), leave_type_id: leaveTypeId('ANNUAL'),
        start_date: leave.from, end_date: leave.to, days: leave.days,
        status: 'approved', requested_by: adminUser, decided_at: new Date().toISOString(),
      }).select('id').single();
    await admin.from('leave_ledger').insert({
      tenant_id: tenantId, employee_id: idOf(leave.empIdx), leave_type_id: leaveTypeId('ANNUAL'),
      entry_type: 'request', days: -leave.days, effective_date: leave.from,
      leave_request_id: request!.id, created_by: adminUser,
    });
  }
  // Rejected + cancelled examples.
  await admin.from('leave_requests').insert([
    { tenant_id: tenantId, employee_id: idOf(15), leave_type_id: leaveTypeId('ANNUAL'), start_date: '2026-08-03', end_date: '2026-08-14', days: 10, status: 'rejected', requested_by: adminUser },
    { tenant_id: tenantId, employee_id: idOf(41), leave_type_id: leaveTypeId('SICK'), start_date: '2026-06-01', end_date: '2026-06-03', days: 3, status: 'cancelled', requested_by: adminUser },
  ]);

  // Pending requests with REAL workflow instances (3 from Engineering →
  // demo-manager's queue; 2 older than SLA so they show as overdue).
  const pendingSpecs = [
    { empIdx: 5, from: '2026-07-20', to: '2026-07-24', days: 5, ageHours: 30 },
    { empIdx: 8, from: '2026-08-03', to: '2026-08-07', days: 5, ageHours: 50 },
    { empIdx: 12, from: '2026-07-27', to: '2026-07-28', days: 2, ageHours: 2 },
    { empIdx: 66, from: '2026-07-15', to: '2026-07-17', days: 3, ageHours: 12 },
    { empIdx: 82, from: '2026-08-10', to: '2026-08-21', days: 10, ageHours: 1 },
  ];
  for (const p of pendingSpecs) {
    const createdAt = new Date(Date.now() - p.ageHours * 3_600_000).toISOString();
    const { data: request } = await admin.from('leave_requests')
      .insert({
        tenant_id: tenantId, employee_id: idOf(p.empIdx), leave_type_id: leaveTypeId('ANNUAL'),
        start_date: p.from, end_date: p.to, days: p.days,
        status: 'pending', requested_by: adminUser, created_at: createdAt,
      }).select('id').single();
    const workflow = await startWorkflow(admin, {
      tenantId, entityType: 'leave_request', entityId: request!.id,
      employeeId: idOf(p.empIdx), createdBy: adminUser,
    });
    await admin.from('leave_requests').update({ workflow_instance_id: workflow.instanceId }).eq('id', request!.id);
    await admin.from('workflow_step_actions')
      .update({ created_at: createdAt }).eq('instance_id', workflow.instanceId);
  }

  // ── Shifts, roster, attendance ───────────────────────────────────────
  log('shifts, roster and 10 days of attendance events…');
  const shiftSpecs = [
    { name: 'Day shift', code: 'DAY', start_time: '08:00', end_time: '17:00', grace_minutes: 15, unpaid_break_minutes: 60, required_hours: 8, is_night: false },
    { name: 'Field shift', code: 'FIELD', start_time: '07:30', end_time: '16:30', grace_minutes: 15, unpaid_break_minutes: 60, required_hours: 8, is_night: false },
    { name: 'Night watch', code: 'NIGHT', start_time: '22:00', end_time: '06:00', grace_minutes: 10, unpaid_break_minutes: 30, required_hours: 7.5, is_night: true },
  ];
  await batchInsert('shifts', shiftSpecs.map((s) => ({ tenant_id: tenantId, ...s })));
  const { data: shifts } = await admin.from('shifts').select('id, code').eq('tenant_id', tenantId);
  const shiftId = (code: string) => shifts!.find((s) => s.code === code)!.id as string;
  const shiftFor = (s: Emp) => (s.dept.code === 'SEC' ? 'NIGHT' : s.dept.code === 'FLD' ? 'FIELD' : 'DAY');
  const shiftSpecOf = (code: string): ShiftSpec => {
    const s = shiftSpecs.find((x) => x.code === code)!;
    return {
      startTime: s.start_time, endTime: s.end_time, graceMinutes: s.grace_minutes,
      unpaidBreakMinutes: s.unpaid_break_minutes, requiredHours: s.required_hours,
      overtimeEligible: true,
    };
  };

  // Working dates: last 10 working days up to 2026-07-07, plus next week roster.
  const pastDates: string[] = [];
  {
    const cursor = new Date('2026-07-07T00:00:00Z');
    while (pastDates.length < 10) {
      const iso = cursor.toISOString().slice(0, 10);
      if (!isWeekend(iso)) pastDates.unshift(iso);
      cursor.setUTCDate(cursor.getUTCDate() - 1);
    }
  }
  const futureDates: string[] = [];
  {
    const cursor = new Date('2026-07-08T00:00:00Z');
    while (futureDates.length < 8) {
      const iso = cursor.toISOString().slice(0, 10);
      if (!isWeekend(iso)) futureDates.push(iso);
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  }

  const attendanceCohort = specs.map((s, i) => ({ s, i })).filter(({ i }) => i % 3 !== 2); // ~80 employees
  const rosterRows: Record<string, unknown>[] = [];
  for (const { s, i } of attendanceCohort) {
    for (const date of [...pastDates, ...futureDates]) {
      rosterRows.push({
        tenant_id: tenantId, employee_id: idOf(i), shift_id: shiftId(shiftFor(s)),
        work_date: date, created_by: adminUser,
      });
    }
  }
  await batchInsert('roster_assignments', rosterRows);

  const onLeaveSet = new Set<string>();
  for (const leave of approvedLeave) {
    const cursor = new Date(`${leave.from}T00:00:00Z`);
    const end = new Date(`${leave.to}T00:00:00Z`);
    while (cursor <= end) {
      onLeaveSet.add(`${idOf(leave.empIdx)}|${cursor.toISOString().slice(0, 10)}`);
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  }

  const eventRows: Record<string, unknown>[] = [];
  const dayRows: Record<string, unknown>[] = [];
  const site = branchSpecs[0];
  for (const { s, i } of attendanceCohort) {
    const eid = idOf(i);
    const code = shiftFor(s);
    for (const date of pastDates) {
      if (onLeaveSet.has(`${eid}|${date}`)) {
        dayRows.push({
          tenant_id: tenantId, employee_id: eid, work_date: date, shift_id: shiftId(code),
          status: 'on_leave', worked_minutes: 0, late_minutes: 0,
          early_departure_minutes: 0, overtime_minutes: 0,
        });
        continue;
      }
      const roll = rand();
      if (roll < 0.03) {
        // absent — no events
        dayRows.push({
          tenant_id: tenantId, employee_id: eid, work_date: date, shift_id: shiftId(code),
          status: 'absent', worked_minutes: 0, late_minutes: 0,
          early_departure_minutes: 0, overtime_minutes: 0,
        });
        continue;
      }
      const startHour = code === 'NIGHT' ? 22 : code === 'FIELD' ? 7 : 8;
      const startMinBase = code === 'FIELD' ? 30 : 0;
      const lateBy = roll < 0.15 ? randInt(20, 70) : randInt(-10, 12);
      const inDate = new Date(`${date}T00:00:00Z`);
      inDate.setUTCHours(startHour, startMinBase + Math.max(-15, lateBy), randInt(0, 59));
      const missOut = roll >= 0.03 && roll < 0.07;
      const overtimeMin = roll > 0.85 ? randInt(60, 180) : randInt(-20, 10);
      const outDate = new Date(inDate);
      outDate.setUTCHours(code === 'NIGHT' ? 30 : startHour + 9, startMinBase + Math.max(0, overtimeMin), 0);

      const outsideGeofence = rand() < 0.05;
      eventRows.push({
        tenant_id: tenantId, employee_id: eid, event_type: 'check_in',
        event_time: inDate.toISOString(), method: 'mobile_web',
        latitude: site.lat + (outsideGeofence ? 0.02 : rand() * 0.001),
        longitude: site.lng + (rand() * 0.001),
        geofence_result: outsideGeofence ? 'outside' : 'inside', created_by: adminUser,
      });
      if (!missOut) {
        eventRows.push({
          tenant_id: tenantId, employee_id: eid, event_type: 'check_out',
          event_time: outDate.toISOString(), method: 'mobile_web',
          geofence_result: 'inside', created_by: adminUser,
        });
      }
      const processed = processDay(
        [
          { eventType: 'check_in', eventTime: inDate.toISOString() },
          ...(missOut ? [] : [{ eventType: 'check_out' as const, eventTime: outDate.toISOString() }]),
        ],
        { workDate: date, shift: shiftSpecOf(code), isHoliday: date === '2026-07-07', isOnApprovedLeave: false, isWeekend: false },
      );
      dayRows.push({
        tenant_id: tenantId, employee_id: eid, work_date: date, shift_id: shiftId(code),
        first_in: processed.firstIn, last_out: processed.lastOut,
        worked_minutes: processed.workedMinutes, late_minutes: processed.lateMinutes,
        early_departure_minutes: processed.earlyDepartureMinutes,
        overtime_minutes: processed.overtimeMinutes, status: processed.status,
      });
    }
  }
  await batchInsert('attendance_events', eventRows);
  await batchInsert('attendance_days', dayRows);
  log(`  ${eventRows.length} raw events · ${dayRows.length} processed days`);

  await admin.from('attendance_corrections').insert([
    {
      tenant_id: tenantId, employee_id: idOf(demoEmployeeIdx), work_date: pastDates[7],
      corrected_out: `${pastDates[7]}T16:30:00Z`, reason: 'Forgot to check out — device battery died',
      requested_by: employeeUser,
    },
    {
      tenant_id: tenantId, employee_id: idOf(30), work_date: pastDates[8],
      corrected_in: `${pastDates[8]}T08:00:00Z`, corrected_out: `${pastDates[8]}T17:00:00Z`,
      reason: 'Was at the Mwanza client site all day', requested_by: adminUser,
    },
  ]);

  // Timesheets for engineering.
  await batchInsert('timesheet_entries', [3, 4, 5, 6].flatMap((i) => [
    { tenant_id: tenantId, employee_id: idOf(i), work_date: pastDates[9], activity: 'Client API integration', hours: 6, billable: true, created_by: adminUser },
    { tenant_id: tenantId, employee_id: idOf(i), work_date: pastDates[8], activity: 'Internal platform work', hours: 8, billable: false, created_by: adminUser },
  ]));

  // ── Payroll: March → July 2026 ───────────────────────────────────────
  log('payroll runs March–July (this is the heavy part)…');
  const runFor = async (month: number): Promise<RunRow> => {
    const { data } = await admin.from('payroll_runs')
      .insert({ tenant_id: tenantId, legal_entity_id: legalEntityId, period_year: 2026, period_month: month, created_by: adminUser })
      .select('*').single();
    return data as RunRow;
  };
  const advance = async (runId: string, to: 'approved' | 'paid' | 'closed') => {
    const extras: Record<string, Record<string, unknown>> = {
      approved: { approved_by: adminUser, approved_at: new Date().toISOString() },
      paid: { paid_at: new Date().toISOString() },
      closed: { closed_at: new Date().toISOString() },
    };
    const { error } = await admin.from('payroll_runs').update({ status: to, ...extras[to] }).eq('id', runId);
    if (error) throw new Error(`advance ${to}: ${error.message}`);
  };

  let mayRunId = '';
  let juneRunId = '';
  for (const month of [3, 4, 5, 6]) {
    const run = await runFor(month);
    const outcome = await calculateRunCore(admin, run);
    log(`  2026-${String(month).padStart(2, '0')}: ${outcome.employees} employees · net ${outcome.totals.net.toLocaleString()}`);
    await advance(run.id, 'approved');
    await advance(run.id, 'paid');
    if (month !== 6) await advance(run.id, 'closed');
    if (month === 5) mayRunId = run.id;
    if (month === 6) juneRunId = run.id;
  }

  // Mid-year changes that make July's variance panel interesting:
  // a 20% raise (promotion) + two new hires.
  const raiseIdx = 6;
  await admin.from('employee_compensation')
    .update({ effective_to: '2026-06-30' })
    .eq('employee_id', idOf(raiseIdx)).is('effective_to', null);
  await admin.from('employee_compensation').insert({
    tenant_id: tenantId, employee_id: idOf(raiseIdx),
    basic_salary: Math.round(specs[raiseIdx].salary * 1.2), effective_from: '2026-07-01',
  });
  await admin.from('employment_actions').insert({
    tenant_id: tenantId, employee_id: idOf(raiseIdx), action_type: 'salary_adjustment',
    status: 'effected', effective_date: '2026-07-01',
    details: { basic_salary: Math.round(specs[raiseIdx].salary * 1.2) },
    reason: 'Annual review — promotion band adjustment',
    requested_by: adminUser, approved_by: adminUser, approved_at: new Date().toISOString(),
  });

  const newHires = [
    { first: 'Neema', last: 'Mafuru', dept: 'ENG', salary: 1_800_000 },
    { first: 'Rashid', last: 'Mgaya', dept: 'FLD', salary: 480_000 },
  ];
  for (const [i, hire] of newHires.entries()) {
    const { data: employee } = await admin.from('employees')
      .insert({
        tenant_id: tenantId, legal_entity_id: legalEntityId,
        employee_number: `DMK-0${121 + i}`, first_name: hire.first, last_name: hire.last,
        hire_date: '2026-07-01', status: 'onboarding', employment_type: 'permanent',
        phone: `+2557${randInt(10000000, 99999999)}`,
      }).select('id').single();
    await admin.from('employee_assignments').insert({
      tenant_id: tenantId, employee_id: employee!.id, department_id: deptIds.get(hire.dept),
      branch_id: branchIds[0], manager_employee_id: idOf(deptStartIdx.get(hire.dept)!),
      effective_from: '2026-07-01',
    });
    await admin.from('employee_compensation').insert({
      tenant_id: tenantId, employee_id: employee!.id, basic_salary: hire.salary, effective_from: '2026-07-01',
    });
  }

  const julyRun = await runFor(7);
  // One-off bonus through the real-time input path.
  await admin.from('payroll_run_inputs').insert({
    tenant_id: tenantId, run_id: julyRun.id, employee_id: idOf(20),
    code: 'BONUS', name: 'Q2 performance bonus', input_type: 'earning',
    amount: 500_000, taxable: true, pensionable: false, created_by: adminUser,
  });
  const julyOutcome = await calculateRunCore(admin, julyRun);
  log(`  2026-07 (current): ${julyOutcome.employees} employees · ${julyOutcome.variances.length} variance findings`);

  // Statutory filings: May generated (SDL left pending → overdue), June paid.
  await generateFilingsFromRun(admin, mayRunId, adminUser);
  await admin.from('statutory_filings')
    .update({ status: 'paid', payment_reference: 'TRA-2026-05-8841', filed_at: new Date().toISOString(), paid_at: new Date().toISOString() })
    .eq('tenant_id', tenantId).eq('period_month', 5).neq('filing_type', 'sdl');
  await generateFilingsFromRun(admin, juneRunId, adminUser);
  await admin.from('statutory_filings')
    .update({ status: 'filed', filed_at: new Date().toISOString() })
    .eq('tenant_id', tenantId).eq('period_month', 6).in('filing_type', ['paye', 'nssf']);

  // ── Talent ───────────────────────────────────────────────────────────
  log('recruitment, performance, offboarding…');
  const { data: requisition } = await admin.from('job_requisitions')
    .insert({
      tenant_id: tenantId, position_id: vacantPos!.id, title: 'Senior Backend Engineer',
      description: 'Node.js/PostgreSQL engineer for the payments platform team.',
      openings: 1, status: 'open', created_by: adminUser,
    }).select('id').single();
  await batchInsert('candidates', [
    { tenant_id: tenantId, requisition_id: requisition!.id, first_name: 'Lightness', last_name: 'Mwasonga', email: 'lightness@example.com', stage: 'interview', source: 'job_board', notes: 'Strong on distributed systems; panel 2 booked.' },
    { tenant_id: tenantId, requisition_id: requisition!.id, first_name: 'Kelvin', last_name: 'Mahenge', email: 'kelvin@example.com', stage: 'offer', source: 'referral', notes: 'Offer sent 2026-07-05, expecting response this week.' },
    { tenant_id: tenantId, requisition_id: requisition!.id, first_name: 'Doreen', last_name: 'Kessy', email: 'doreen@example.com', stage: 'screening', source: 'direct' },
    { tenant_id: tenantId, requisition_id: requisition!.id, first_name: 'Alex', last_name: 'Mliwa', email: 'alexm@example.com', stage: 'rejected', source: 'job_board', notes: 'Below the bar on system design.' },
  ]);
  const { data: requisition2 } = await admin.from('job_requisitions')
    .insert({
      tenant_id: tenantId, title: 'Field Technician — Mwanza', openings: 2, status: 'open', created_by: adminUser,
    }).select('id').single();
  await batchInsert('candidates', [
    { tenant_id: tenantId, requisition_id: requisition2!.id, first_name: 'Bahati', last_name: 'Simba', stage: 'applied', source: 'direct' },
    { tenant_id: tenantId, requisition_id: requisition2!.id, first_name: 'Christina', last_name: 'Malya', stage: 'shortlisted', source: 'referral' },
  ]);

  const { data: cycle } = await admin.from('performance_cycles')
    .insert({ tenant_id: tenantId, name: '2026 Mid-Year', starts_on: '2026-01-01', ends_on: '2026-06-30', status: 'open' })
    .select('id').single();
  const goalRows: Record<string, unknown>[] = [];
  for (const i of [0, 1, 3, 5, 25, 26, 35, 55, 70, 71, 85, 100, 110, 115, demoEmployeeIdx]) {
    goalRows.push(
      { tenant_id: tenantId, cycle_id: cycle!.id, employee_id: idOf(i), title: 'Deliver quarterly objectives', weight: 60, status: pick(['on_track', 'achieved', 'at_risk']), created_by: adminUser },
      { tenant_id: tenantId, cycle_id: cycle!.id, employee_id: idOf(i), title: 'Zero compliance findings', weight: 40, status: 'on_track', created_by: adminUser },
    );
  }
  await batchInsert('performance_goals', goalRows);
  await batchInsert('performance_reviews', [1, 3, 25, 55, demoEmployeeIdx].map((i) => ({
    tenant_id: tenantId, cycle_id: cycle!.id, employee_id: idOf(i),
    reviewer_user_id: managerUser, review_type: 'manager', rating: randInt(3, 5),
    strengths: 'Consistent delivery and ownership.', improvements: 'Documentation depth.',
  })));

  const { data: exitCase } = await admin.from('offboarding_cases')
    .insert({
      tenant_id: tenantId, employee_id: idOf(45), exit_type: 'resignation',
      notice_date: '2026-07-01', last_working_day: '2026-08-31',
      reason: 'Further studies abroad', initiated_by: adminUser, status: 'clearance',
    }).select('id').single();
  await batchInsert('offboarding_tasks', STANDARD_OFFBOARDING_TASKS.map((task, i) => ({
    tenant_id: tenantId, case_id: exitCase!.id, ...task,
    status: i < 3 ? 'completed' : 'pending',
    completed_by: i < 3 ? adminUser : null,
    completed_at: i < 3 ? new Date().toISOString() : null,
  })));
  await admin.from('employees').update({ status: 'exiting' }).eq('id', idOf(45));

  // Onboarding for the newest hire.
  const { data: template } = await admin.from('onboarding_templates')
    .insert({ tenant_id: tenantId, name: 'Head office onboarding' }).select('id').single();
  await batchInsert('onboarding_template_tasks', [
    { tenant_id: tenantId, template_id: template!.id, title: 'Sign employment contract', assignee_role: 'hr', due_days_after_start: 0, sort_order: 1 },
    { tenant_id: tenantId, template_id: template!.id, title: 'Issue laptop & accounts', assignee_role: 'it', due_days_after_start: 1, sort_order: 2 },
    { tenant_id: tenantId, template_id: template!.id, title: 'Payroll & NSSF registration', assignee_role: 'payroll', due_days_after_start: 3, sort_order: 3 },
    { tenant_id: tenantId, template_id: template!.id, title: 'Team induction week', assignee_role: 'manager', due_days_after_start: 5, sort_order: 4 },
  ]);
  const { data: newestHire } = await admin.from('employees')
    .select('id').eq('tenant_id', tenantId).eq('employee_number', 'DMK-0121').single();
  await batchInsert('employee_onboarding_tasks', [
    { tenant_id: tenantId, employee_id: newestHire!.id, template_id: template!.id, title: 'Sign employment contract', assignee_role: 'hr', due_date: '2026-07-01', status: 'completed', completed_by: adminUser, completed_at: new Date().toISOString(), sort_order: 1 },
    { tenant_id: tenantId, employee_id: newestHire!.id, template_id: template!.id, title: 'Issue laptop & accounts', assignee_role: 'it', due_date: '2026-07-02', status: 'completed', completed_by: adminUser, completed_at: new Date().toISOString(), sort_order: 2 },
    { tenant_id: tenantId, employee_id: newestHire!.id, template_id: template!.id, title: 'Payroll & NSSF registration', assignee_role: 'payroll', due_date: '2026-07-06', status: 'pending', sort_order: 3 },
    { tenant_id: tenantId, employee_id: newestHire!.id, template_id: template!.id, title: 'Team induction week', assignee_role: 'manager', due_date: '2026-07-08', status: 'pending', sort_order: 4 },
  ]);

  // ── Experience: policies, service desk, notifications ────────────────
  log('policies, service desk, notifications…');
  await batchInsert('company_policies', [
    { tenant_id: tenantId, created_by: adminUser, title: 'Annual leave policy', category: 'leave', body: 'Every employee earns 28 working days of annual leave per calendar year, accrued as a full grant on 1 January. A maximum of 7 unused days may be carried into the following year; days above 7 expire on 1 January. Leave must be requested through Stellix and approved by your manager and HR before travel is booked. Public holidays and weekends do not count against your balance.' },
    { tenant_id: tenantId, created_by: adminUser, title: 'Sick leave policy', category: 'leave', body: 'Employees are entitled to 126 days of sick leave over a 36-month cycle: the first 63 days at full pay and the following 63 days at half pay, in line with the Employment and Labour Relations Act. A medical certificate from a registered practitioner is required for absences longer than 2 consecutive days.' },
    { tenant_id: tenantId, created_by: adminUser, title: 'Attendance and lateness', category: 'attendance', body: 'Standard office hours are 08:00 to 17:00 with a 15-minute grace period. Field and night teams follow their published rosters. Check-in and check-out happen through the Stellix mobile page and are geofenced to company work sites. Three unexplained late arrivals of more than 30 minutes in one month trigger a conversation with your manager. Overtime must be approved by a supervisor before it is paid.' },
    { tenant_id: tenantId, created_by: adminUser, title: 'Payroll and salary advances', category: 'payroll', body: 'Salaries are paid by the last working day of each month to your registered bank account or mobile money number. Payslips are available in Stellix under My Space. Salary advances of up to 30% of net pay may be requested once per quarter and are recovered over a maximum of 3 months. PAYE, NSSF, SDL and WCF are handled per Tanzanian law.' },
    { tenant_id: tenantId, created_by: adminUser, title: 'Code of conduct', category: 'conduct', body: 'Driftmark Technologies expects honesty, respect and professionalism. Conflicts of interest must be declared to People & Culture. Company equipment and data are for business use; client data is confidential. Violations are handled through the disciplinary procedure with a right to be heard.' },
  ]);

  const { data: deskRequest } = await admin.from('service_requests')
    .insert({
      tenant_id: tenantId, employee_id: idOf(demoEmployeeIdx), opened_by: employeeUser,
      category: 'payslip_issue', subject: 'June payslip missing transport allowance',
      description: 'My June payslip does not show the transport allowance I usually receive.',
      priority: 'high', status: 'in_progress', assigned_to: adminUser,
    }).select('id').single();
  await batchInsert('service_request_messages', [
    { tenant_id: tenantId, request_id: deskRequest!.id, author_user_id: adminUser, body: 'Thanks Juma — checking with payroll and will revert by tomorrow.', is_internal: false },
    { tenant_id: tenantId, request_id: deskRequest!.id, author_user_id: adminUser, body: 'NOTE: TRANS component assignment ended in May by mistake — needs re-assignment and a July adjustment.', is_internal: true },
  ]);
  await batchInsert('service_requests', [
    { tenant_id: tenantId, employee_id: idOf(33), opened_by: adminUser, category: 'bank_change', subject: 'Switch salary to NMB account', priority: 'normal', status: 'open', confidential: false, resolved_at: null },
    { tenant_id: tenantId, employee_id: idOf(77), opened_by: adminUser, category: 'letter_request', subject: 'Employment letter for embassy visa application', priority: 'normal', status: 'resolved', confidential: false, resolved_at: new Date().toISOString() },
    { tenant_id: tenantId, employee_id: idOf(12), opened_by: adminUser, category: 'complaint', subject: 'Working environment concern — night shift transport', priority: 'high', status: 'open', confidential: true, resolved_at: null },
  ]);

  await batchInsert('notifications', [
    { tenant_id: tenantId, user_id: managerUser, category: 'leave', title: 'Leave request awaiting your approval', body: 'Daniel Temba requested 5 day(s) of Annual leave (2026-07-20 → 2026-07-24).', link: '/dashboard/time/leave' },
    { tenant_id: tenantId, user_id: managerUser, category: 'leave', title: 'Leave request awaiting your approval', body: 'Team member requested 5 day(s) of Annual leave (2026-08-03 → 2026-08-07).', link: '/dashboard/time/leave' },
    { tenant_id: tenantId, user_id: adminUser, category: 'service_desk', title: 'New HR request: June payslip missing transport allowance', body: 'payslip_issue request opened. Priority: high.', link: '/dashboard/experience/service-desk' },
    { tenant_id: tenantId, user_id: employeeUser, category: 'leave', title: 'Ombi la likizo limeidhinishwa', body: 'Ombi la Likizo ya mwaka la 2026-07-06 → 2026-07-10 limeidhinishwa.', link: '/dashboard/me' },
  ]);

  // Invite links for two employees without accounts (demo the invite flow).
  const expiresAt = new Date(); expiresAt.setUTCDate(expiresAt.getUTCDate() + 14);
  await batchInsert('employee_invites', [7, 52].map((i) => ({
    tenant_id: tenantId, employee_id: idOf(i),
    token: `driftmarkdemo${i}${Math.random().toString(36).slice(2, 10)}`,
    created_by: adminUser, expires_at: expiresAt.toISOString(),
  })));

  // ── Summary ──────────────────────────────────────────────────────────
  const counts: Record<string, number> = {};
  for (const table of ['employees', 'attendance_events', 'attendance_days', 'payroll_run_lines', 'leave_ledger', 'statutory_filings']) {
    const { count } = await admin.from(table).select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId);
    counts[table] = count ?? 0;
  }
  console.log('\n══ Driftmark Technologies is ready ══');
  console.log(`tenant: ${tenantId}`);
  for (const [table, count] of Object.entries(counts)) console.log(`  ${table}: ${count}`);
  console.log(`\nLogins (password: ${PASSWORD})`);
  for (const email of DEMO_EMAILS) console.log(`  ${email}`);
}

main().catch((e) => {
  console.error('SEED FAILED:', e);
  process.exit(1);
});
