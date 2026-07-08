/**
 * Golden-file test suite for the payroll engine (non-negotiable #2:
 * deterministic and reproducible). Fixed rule set + fixed inputs → exact
 * expected outputs, verified value-by-value, plus a byte-identical
 * determinism check across repeated runs.
 *
 * Run from apps/web:  pnpm dlx tsx scripts/golden-payroll.mts
 */
import {
  calculatePayroll,
  selectRules,
  type ComplianceRuleRow,
  type PayrollEmployeeInput,
} from '../src/lib/payroll/engine';

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  console.log(`${ok ? '✓' : '✗'} ${label}${ok || !detail ? '' : ` — ${detail}`}`);
  if (!ok) failures++;
}

// Fixture: the Tanzania Mainland private pack as seeded (migration 0005/0011).
const RULES: ComplianceRuleRow[] = [
  {
    id: 'r-paye', rule_type: 'paye', name: 'PAYE — resident individual, monthly',
    formula: {
      type: 'progressive_bands', period: 'monthly',
      bands: [
        { upTo: 270000, rate: 0, base: 0 },
        { upTo: 520000, rate: 0.08, base: 0, over: 270000 },
        { upTo: 760000, rate: 0.2, base: 20000, over: 520000 },
        { upTo: 1000000, rate: 0.25, base: 68000, over: 760000 },
        { upTo: null, rate: 0.3, base: 128000, over: 1000000 },
      ],
    },
    effective_from: '2025-07-01', effective_to: null, priority: 0,
    rounding_method: 'round_half_up', legal_source: 'Income Tax Act', status: 'draft', version: 1,
  },
  {
    id: 'r-nssf-ee', rule_type: 'pension_employee', name: 'NSSF — employee share',
    formula: { type: 'percentage', rate: 0.1, of: 'gross' },
    effective_from: '2025-07-01', effective_to: null, priority: 0,
    rounding_method: 'round_half_up', legal_source: 'NSSF Act', status: 'draft', version: 1,
  },
  {
    id: 'r-nssf-er', rule_type: 'pension_employer', name: 'NSSF — employer share',
    formula: { type: 'percentage', rate: 0.1, of: 'gross' },
    effective_from: '2025-07-01', effective_to: null, priority: 0,
    rounding_method: 'round_half_up', legal_source: 'NSSF Act', status: 'draft', version: 1,
  },
  {
    id: 'r-sdl', rule_type: 'sdl', name: 'Skills and Development Levy',
    formula: { type: 'percentage', rate: 0.035, of: 'gross_payroll' },
    effective_from: '2025-07-01', effective_to: null, priority: 0,
    rounding_method: 'round_half_up', legal_source: 'Finance Act', status: 'draft', version: 1,
  },
  {
    id: 'r-wcf', rule_type: 'wcf', name: 'Workers Compensation Fund — employer',
    formula: { type: 'percentage', rate: 0.005, of: 'gross_payroll' },
    effective_from: '2025-07-01', effective_to: null, priority: 0,
    rounding_method: 'round_half_up', legal_source: 'WCF Act', status: 'draft', version: 1,
  },
  {
    id: 'r-minwage', rule_type: 'minimum_wage', name: 'Minimum wage — general floor',
    formula: { type: 'minimum_wage', generalFloor: 60000 },
    effective_from: '2025-07-01', effective_to: null, priority: 0,
    rounding_method: 'none', legal_source: 'Wage Order', status: 'draft', version: 1,
  },
];

const PERIOD = { year: 2026, month: 7 };

function employee(name: string, basic: number, components: PayrollEmployeeInput['components'] = []): PayrollEmployeeInput {
  return { employeeId: `emp-${name}`, employeeName: name, basicSalary: basic, components };
}

// ── Golden case 1: gross 1,000,000, no components ─────────────────────────
// NSSF ee 100,000 · taxable 900,000 · PAYE 68,000+25%×140,000 = 103,000
// net 797,000 · employer: NSSF 100,000 + SDL 35,000 + WCF 5,000 → cost 1,140,000
{
  const r = calculatePayroll(employee('A', 1_000_000), PERIOD, RULES);
  check('G1 gross', r.grossPay === 1_000_000);
  check('G1 NSSF employee 100,000', r.statutoryDeductions.find((d) => d.code === 'PENSION_EE')?.amount === 100_000);
  check('G1 taxable 900,000', r.taxableIncome === 900_000);
  check('G1 PAYE 103,000', r.paye === 103_000, String(r.paye));
  check('G1 net 797,000', r.netPay === 797_000, String(r.netPay));
  check('G1 SDL 35,000', r.employerContributions.find((c) => c.code === 'SDL')?.amount === 35_000);
  check('G1 WCF 5,000', r.employerContributions.find((c) => c.code === 'WCF')?.amount === 5_000);
  check('G1 employer cost 1,140,000', r.employerCost === 1_140_000, String(r.employerCost));
  check('G1 trace cites PAYE rule version', r.trace.some((t) => t.step === 'paye' && t.rule?.version === 1));
  check('G1 draft rules flagged in warnings', r.warnings.some((w) => w.includes('DRAFT')));
}

// ── Golden case 2: low earner at the tax-free threshold ───────────────────
// Gross 270,000 → NSSF 27,000 → taxable 243,000 → PAYE 0 → net 243,000
{
  const r = calculatePayroll(employee('B', 270_000), PERIOD, RULES);
  check('G2 PAYE 0 below threshold', r.paye === 0);
  check('G2 net 243,000', r.netPay === 243_000, String(r.netPay));
}

// ── Golden case 3: second band ────────────────────────────────────────────
// Gross 520,000 → NSSF 52,000 → taxable 468,000 → PAYE 8%×198,000 = 15,840
{
  const r = calculatePayroll(employee('C', 520_000), PERIOD, RULES);
  check('G3 PAYE 15,840', r.paye === 15_840, String(r.paye));
  check('G3 net 452,160', r.netPay === 452_160, String(r.netPay));
}

// ── Golden case 4: top band ───────────────────────────────────────────────
// Gross 5,000,000 → NSSF 500,000 → taxable 4,500,000 →
// PAYE 128,000 + 30%×3,500,000 = 1,178,000 → net 3,322,000
{
  const r = calculatePayroll(employee('D', 5_000_000), PERIOD, RULES);
  check('G4 PAYE 1,178,000', r.paye === 1_178_000, String(r.paye));
  check('G4 net 3,322,000', r.netPay === 3_322_000, String(r.netPay));
}

// ── Golden case 5: allowances + loan deduction ────────────────────────────
// Basic 800,000 + housing 200,000 (taxable, pensionable) + transport 100,000
// (non-taxable) → gross 1,100,000; pensionable 1,000,000... NSSF of GROSS
// per rule: 110,000 → taxable = (800k+200k) − 110,000 = 890,000 →
// PAYE 68,000 + 25%×130,000 = 100,500; loan 50,000 →
// net = 1,100,000 − 110,000 − 100,500 − 50,000 = 839,500
{
  const r = calculatePayroll(
    employee('E', 800_000, [
      { code: 'HOUSE', name: 'Housing allowance', componentType: 'earning', calcType: 'fixed', amount: 200_000, taxable: true, pensionable: true },
      { code: 'TRANS', name: 'Transport allowance', componentType: 'earning', calcType: 'fixed', amount: 100_000, taxable: false, pensionable: false },
      { code: 'LOAN', name: 'Staff loan repayment', componentType: 'deduction', calcType: 'fixed', amount: 50_000, taxable: false, pensionable: false },
    ]),
    PERIOD,
    RULES,
  );
  check('G5 gross 1,100,000', r.grossPay === 1_100_000);
  check('G5 taxable 890,000 (non-taxable excluded, pension deducted)', r.taxableIncome === 890_000, String(r.taxableIncome));
  check('G5 PAYE 100,500', r.paye === 100_500, String(r.paye));
  check('G5 net 839,500', r.netPay === 839_500, String(r.netPay));
}

// ── Golden case 6: percent-of-basic component ─────────────────────────────
{
  const r = calculatePayroll(
    employee('F', 1_000_000, [
      { code: 'RESP', name: 'Responsibility allowance', componentType: 'earning', calcType: 'percent_of_basic', amount: 15, taxable: true, pensionable: false },
    ]),
    PERIOD,
    RULES,
  );
  check('G6 15% of basic = 150,000; gross 1,150,000', r.grossPay === 1_150_000);
}

// ── Golden case 7: minimum wage warning ───────────────────────────────────
{
  const r = calculatePayroll(employee('G', 50_000), PERIOD, RULES);
  check('G7 below-minimum-wage warning raised',
    r.warnings.some((w) => w.includes('below the general minimum wage')));
}

// ── Effective dating: a future PAYE change must not apply to July 2026 ────
{
  const futureRule: ComplianceRuleRow = {
    ...RULES[0], id: 'r-paye-2027', effective_from: '2027-01-01', version: 2,
    formula: { bands: [{ upTo: null, rate: 0.5, base: 0, over: 0 }] },
  };
  const selected = selectRules([...RULES, futureRule], PERIOD);
  check('effective dating: July 2026 uses v1, not the 2027 rule',
    selected.get('paye')?.version === 1);
  const selected2027 = selectRules([...RULES, futureRule], { year: 2027, month: 2 });
  check('effective dating: Feb 2027 picks v2', selected2027.get('paye')?.version === 2);
}

// ── Determinism: 3 runs, byte-identical results ───────────────────────────
{
  const inputs = employee('H', 1_234_567, [
    { code: 'HOUSE', name: 'Housing', componentType: 'earning', calcType: 'fixed', amount: 333_333, taxable: true, pensionable: true },
  ]);
  const runs = [1, 2, 3].map(() => JSON.stringify(calculatePayroll(inputs, PERIOD, RULES)));
  check('determinism: identical output across 3 runs', runs[0] === runs[1] && runs[1] === runs[2]);
}

if (failures > 0) {
  console.error(`\n${failures} golden check(s) FAILED`);
  process.exit(1);
}
console.log('\nAll golden payroll checks passed.');
