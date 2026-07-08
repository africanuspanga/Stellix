// Stellix payroll engine core (blueprint §4, non-negotiables #2/#3/#4/#15).
//
// DETERMINISTIC: same inputs → same outputs, always. No clock reads, no
// randomness, no I/O — a pure function over explicit inputs.
// RULE-DRIVEN: every statutory amount comes from an effective-dated
// compliance rule row passed in; nothing is hard-coded here.
// EXPLAINABLE: every step emits a trace line with the rule it applied
// (name, version, status, legal source) so the platform can always answer
// "What happened? Why? Which rule? Can it be reproduced?"

export interface ComplianceRuleRow {
  id: string;
  rule_type: string;
  name: string;
  formula: Record<string, unknown>;
  effective_from: string;
  effective_to: string | null;
  priority: number;
  rounding_method: 'round_half_up' | 'round_down' | 'round_up' | 'none';
  legal_source: string | null;
  status: 'draft' | 'approved' | 'retired';
  version: number;
}

export interface PayComponentInput {
  code: string;
  name: string;
  componentType: 'earning' | 'deduction';
  calcType: 'fixed' | 'percent_of_basic';
  amount: number;              // fixed amount, or percent for percent_of_basic
  taxable: boolean;
  pensionable: boolean;
}

export interface PayrollEmployeeInput {
  employeeId: string;
  employeeName: string;
  basicSalary: number;
  components: PayComponentInput[];
}

export interface PayrollPeriod {
  year: number;
  month: number;               // 1–12
}

export interface TraceLine {
  step: string;
  detail: string;
  amount: number;
  rule?: {
    name: string;
    version: number;
    status: string;
    legalSource: string | null;
  };
}

export interface PayrollLine {
  code: string;
  name: string;
  amount: number;
  ruleId?: string;
}

export interface PayrollResult {
  employeeId: string;
  employeeName: string;
  period: PayrollPeriod;
  basicSalary: number;
  earnings: PayrollLine[];
  grossPay: number;
  pensionableBase: number;
  taxableIncome: number;
  statutoryDeductions: PayrollLine[];  // employee-side (NSSF, health, PAYE)
  otherDeductions: PayrollLine[];      // loans, unions, voluntary
  paye: number;
  totalDeductions: number;
  netPay: number;
  employerContributions: PayrollLine[]; // employer NSSF, SDL, WCF
  employerCost: number;
  warnings: string[];
  trace: TraceLine[];
}

function periodBounds(period: PayrollPeriod): { start: string; end: string } {
  const mm = String(period.month).padStart(2, '0');
  const lastDay = new Date(Date.UTC(period.year, period.month, 0)).getUTCDate();
  return { start: `${period.year}-${mm}-01`, end: `${period.year}-${mm}-${lastDay}` };
}

function round(value: number, method: ComplianceRuleRow['rounding_method']): number {
  switch (method) {
    case 'round_half_up':
      return Math.round(value * 100) / 100;
    case 'round_down':
      return Math.floor(value * 100) / 100;
    case 'round_up':
      return Math.ceil(value * 100) / 100;
    default:
      return value;
  }
}

/**
 * Select the applicable rule per rule_type for the period: effective during
 * the period, highest priority then latest version wins. Retired rules never
 * apply.
 */
export function selectRules(
  rules: ComplianceRuleRow[],
  period: PayrollPeriod,
): Map<string, ComplianceRuleRow> {
  const { start, end } = periodBounds(period);
  const selected = new Map<string, ComplianceRuleRow>();
  for (const rule of rules) {
    if (rule.status === 'retired') continue;
    if (rule.effective_from > end) continue;
    if (rule.effective_to && rule.effective_to < start) continue;
    const current = selected.get(rule.rule_type);
    if (
      !current ||
      rule.priority > current.priority ||
      (rule.priority === current.priority && rule.version > current.version)
    ) {
      selected.set(rule.rule_type, rule);
    }
  }
  return selected;
}

function ruleRef(rule: ComplianceRuleRow): TraceLine['rule'] {
  return {
    name: rule.name,
    version: rule.version,
    status: rule.status,
    legalSource: rule.legal_source,
  };
}

interface Band {
  upTo: number | null;
  rate: number;
  base: number;
  over?: number;
}

function progressiveTax(taxable: number, bands: Band[]): { tax: number; band: Band } {
  for (const band of bands) {
    if (band.upTo === null || taxable <= band.upTo) {
      return { tax: band.base + band.rate * Math.max(0, taxable - (band.over ?? 0)), band };
    }
  }
  const last = bands[bands.length - 1];
  return { tax: last.base + last.rate * Math.max(0, taxable - (last.over ?? 0)), band: last };
}

function percentageBase(
  of: string,
  bases: { basic: number; gross: number; pensionable: number },
): number {
  switch (of) {
    case 'basic':
      return bases.basic;
    case 'pensionable':
      return bases.pensionable;
    case 'gross':
    case 'gross_payroll':
    default:
      return bases.gross;
  }
}

/** Compute one employee's gross-to-net for a period. Pure and deterministic. */
export function calculatePayroll(
  employee: PayrollEmployeeInput,
  period: PayrollPeriod,
  rules: ComplianceRuleRow[],
): PayrollResult {
  const trace: TraceLine[] = [];
  const warnings: string[] = [];
  const selected = selectRules(rules, period);

  for (const rule of selected.values()) {
    if (rule.status === 'draft') {
      warnings.push(
        `Rule '${rule.name}' (v${rule.version}) is DRAFT — verify and approve before live payroll.`,
      );
    }
  }

  // 1. Earnings.
  const earnings: PayrollLine[] = [];
  trace.push({ step: 'basic', detail: 'Basic salary', amount: employee.basicSalary });
  let grossPay = employee.basicSalary;
  let taxableEarnings = employee.basicSalary;
  let pensionableBase = employee.basicSalary;

  for (const component of employee.components) {
    if (component.componentType !== 'earning') continue;
    const amount =
      component.calcType === 'percent_of_basic'
        ? Math.round(employee.basicSalary * (component.amount / 100) * 100) / 100
        : component.amount;
    earnings.push({ code: component.code, name: component.name, amount });
    grossPay += amount;
    if (component.taxable) taxableEarnings += amount;
    if (component.pensionable) pensionableBase += amount;
    trace.push({
      step: 'earning',
      detail: `${component.name}${component.calcType === 'percent_of_basic' ? ` (${component.amount}% of basic)` : ''}${component.taxable ? '' : ' [non-taxable]'}`,
      amount,
    });
  }
  trace.push({ step: 'gross', detail: 'Gross pay (basic + earnings)', amount: grossPay });

  // 2. Employee statutory pension (deductible before PAYE).
  const statutoryDeductions: PayrollLine[] = [];
  let employeePension = 0;
  const pensionEmpRule = selected.get('pension_employee');
  if (pensionEmpRule) {
    const formula = pensionEmpRule.formula as { rate?: number; of?: string };
    const base = percentageBase(formula.of ?? 'gross', {
      basic: employee.basicSalary,
      gross: grossPay,
      pensionable: pensionableBase,
    });
    employeePension = round((formula.rate ?? 0) * base, pensionEmpRule.rounding_method);
    statutoryDeductions.push({
      code: 'PENSION_EE',
      name: pensionEmpRule.name,
      amount: employeePension,
      ruleId: pensionEmpRule.id,
    });
    trace.push({
      step: 'pension_employee',
      detail: `${((formula.rate ?? 0) * 100).toFixed(1)}% of ${formula.of ?? 'gross'} (${base})`,
      amount: employeePension,
      rule: ruleRef(pensionEmpRule),
    });
  }

  // 3. Taxable income and PAYE.
  const taxableIncome = Math.max(0, taxableEarnings - employeePension);
  trace.push({
    step: 'taxable_income',
    detail: `Taxable earnings (${taxableEarnings}) − employee pension (${employeePension})`,
    amount: taxableIncome,
  });

  let paye = 0;
  const payeRule = selected.get('paye');
  if (payeRule) {
    const formula = payeRule.formula as { bands?: Band[] };
    const bands = formula.bands ?? [];
    const { tax, band } = progressiveTax(taxableIncome, bands);
    paye = round(tax, payeRule.rounding_method);
    statutoryDeductions.push({ code: 'PAYE', name: payeRule.name, amount: paye, ruleId: payeRule.id });
    trace.push({
      step: 'paye',
      detail: `Band ${band.upTo === null ? `above ${band.over ?? 0}` : `up to ${band.upTo}`}: ${band.base} + ${(band.rate * 100).toFixed(0)}% over ${band.over ?? 0}`,
      amount: paye,
      rule: ruleRef(payeRule),
    });
  }

  // 4. Other employee-side statutory (e.g. health) — percentage rules.
  const healthEmpRule = selected.get('health_employee');
  if (healthEmpRule) {
    const formula = healthEmpRule.formula as { rate?: number; of?: string };
    const base = percentageBase(formula.of ?? 'gross', {
      basic: employee.basicSalary,
      gross: grossPay,
      pensionable: pensionableBase,
    });
    const amount = round((formula.rate ?? 0) * base, healthEmpRule.rounding_method);
    statutoryDeductions.push({
      code: 'HEALTH_EE',
      name: healthEmpRule.name,
      amount,
      ruleId: healthEmpRule.id,
    });
    trace.push({
      step: 'health_employee',
      detail: `${((formula.rate ?? 0) * 100).toFixed(1)}% of ${formula.of ?? 'gross'}`,
      amount,
      rule: ruleRef(healthEmpRule),
    });
  }

  // 5. Non-statutory deductions (loans, union, voluntary) — after tax.
  const otherDeductions: PayrollLine[] = [];
  for (const component of employee.components) {
    if (component.componentType !== 'deduction') continue;
    const amount =
      component.calcType === 'percent_of_basic'
        ? Math.round(employee.basicSalary * (component.amount / 100) * 100) / 100
        : component.amount;
    otherDeductions.push({ code: component.code, name: component.name, amount });
    trace.push({ step: 'deduction', detail: component.name, amount });
  }

  const totalStatutory = statutoryDeductions.reduce((sum, d) => sum + d.amount, 0);
  const totalOther = otherDeductions.reduce((sum, d) => sum + d.amount, 0);
  const totalDeductions = Math.round((totalStatutory + totalOther) * 100) / 100;
  const netPay = Math.round((grossPay - totalDeductions) * 100) / 100;
  trace.push({ step: 'net', detail: 'Gross − all deductions', amount: netPay });
  if (netPay < 0) warnings.push('NEGATIVE NET PAY — review deductions.');

  // 6. Employer contributions.
  const employerContributions: PayrollLine[] = [];
  for (const [ruleType, code] of [
    ['pension_employer', 'PENSION_ER'],
    ['sdl', 'SDL'],
    ['wcf', 'WCF'],
    ['health_employer', 'HEALTH_ER'],
  ] as const) {
    const rule = selected.get(ruleType);
    if (!rule) continue;
    const formula = rule.formula as { rate?: number; of?: string };
    const base = percentageBase(formula.of ?? 'gross', {
      basic: employee.basicSalary,
      gross: grossPay,
      pensionable: pensionableBase,
    });
    const amount = round((formula.rate ?? 0) * base, rule.rounding_method);
    employerContributions.push({ code, name: rule.name, amount, ruleId: rule.id });
    trace.push({
      step: ruleType,
      detail: `${((formula.rate ?? 0) * 100).toFixed(2)}% of ${formula.of ?? 'gross'} (employer)`,
      amount,
      rule: ruleRef(rule),
    });
  }
  const employerCost =
    Math.round(
      (grossPay + employerContributions.reduce((sum, c) => sum + c.amount, 0)) * 100,
    ) / 100;
  trace.push({ step: 'employer_cost', detail: 'Gross + employer contributions', amount: employerCost });

  // 7. Minimum wage check (warning, never a silent block).
  const minWageRule = selected.get('minimum_wage');
  if (minWageRule) {
    const formula = minWageRule.formula as { generalFloor?: number };
    const floor = formula.generalFloor ?? 0;
    if (employee.basicSalary < floor) {
      warnings.push(
        `Basic salary ${employee.basicSalary} is below the general minimum wage floor ${floor} (${minWageRule.name}, v${minWageRule.version}).`,
      );
    }
  }

  return {
    employeeId: employee.employeeId,
    employeeName: employee.employeeName,
    period,
    basicSalary: employee.basicSalary,
    earnings,
    grossPay: Math.round(grossPay * 100) / 100,
    pensionableBase: Math.round(pensionableBase * 100) / 100,
    taxableIncome: Math.round(taxableIncome * 100) / 100,
    statutoryDeductions,
    otherDeductions,
    paye,
    totalDeductions,
    netPay,
    employerContributions,
    employerCost,
    warnings,
    trace,
  };
}
