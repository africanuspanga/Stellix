import type { SupabaseClient } from '@supabase/supabase-js';
import {
  calculatePayroll,
  type ComplianceRuleRow,
  type PayComponentInput,
  type PayrollResult,
} from './engine';
import { compareRuns, type VarianceFinding } from './variance';

// Run calculation orchestration: gathers inputs, drives the pure engine,
// snapshots results (including payment details) into payroll_run_lines, and
// computes variances vs the previous period. Framework-free — the server
// actions and the E2E suite share this exact code.

export interface RunRow {
  id: string;
  tenant_id: string;
  legal_entity_id: string;
  period_year: number;
  period_month: number;
  status: string;
}

async function loadRules(
  supabase: SupabaseClient,
  legalEntityId: string,
): Promise<ComplianceRuleRow[]> {
  const { data: link } = await supabase
    .from('legal_entity_compliance')
    .select('pack_id')
    .eq('legal_entity_id', legalEntityId)
    .order('effective_from', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!link) return [];
  const { data: rules } = await supabase
    .from('compliance_rules')
    .select('*')
    .eq('pack_id', link.pack_id);
  return (rules ?? []) as ComplianceRuleRow[];
}

interface EmployeeBundle {
  employeeId: string;
  employeeName: string;
  employeeNumber: string;
  basicSalary: number;
  components: PayComponentInput[];
  payment: Record<string, unknown> | null;
}

async function loadEmployeeBundles(
  supabase: SupabaseClient,
  run: RunRow,
): Promise<EmployeeBundle[]> {
  // Salary/components/hire status must reflect the state in force AT THE PERIOD
  // END — not "whatever is currently open". Otherwise a raise entered mid-month
  // effective next month is paid this month, and an employee hired next month is
  // paid this month. The effective-dated invariant (non-overlapping rows, one
  // open) means exactly one row per employee satisfies the period filter.
  const mm = String(run.period_month).padStart(2, '0');
  const lastDay = new Date(Date.UTC(run.period_year, run.period_month, 0)).getUTCDate();
  const periodEnd = `${run.period_year}-${mm}-${String(lastDay).padStart(2, '0')}`;
  const inForceAtPeriodEnd = `effective_to.is.null,effective_to.gte.${periodEnd}`;

  const [{ data: employees }, { data: compensation }, { data: assignments }, { data: banks }, { data: runInputs }] =
    await Promise.all([
      supabase
        .from('employees')
        .select('id, first_name, middle_name, last_name, employee_number')
        .eq('legal_entity_id', run.legal_entity_id)
        .not('status', 'in', '("exited","exiting")')
        .lte('hire_date', periodEnd),
      supabase
        .from('employee_compensation')
        .select('employee_id, basic_salary')
        .lte('effective_from', periodEnd)
        .or(inForceAtPeriodEnd),
      supabase
        .from('employee_pay_components')
        .select('employee_id, amount, pay_components(code, name, component_type, calc_type, default_amount, taxable, pensionable, is_active)')
        .lte('effective_from', periodEnd)
        .or(inForceAtPeriodEnd),
      supabase
        .from('employee_bank_accounts')
        .select('employee_id, payment_method, bank_name, account_name, account_number, mobile_money_provider, mobile_money_number')
        .eq('is_primary', true),
      supabase
        .from('payroll_run_inputs')
        .select('employee_id, code, name, input_type, amount, taxable, pensionable')
        .eq('run_id', run.id),
    ]);

  const salaryByEmployee = new Map(
    (compensation ?? []).map((c) => [c.employee_id as string, Number(c.basic_salary)]),
  );
  const bankByEmployee = new Map(
    (banks ?? []).map((b) => [
      b.employee_id as string,
      {
        method: b.payment_method,
        bankName: b.bank_name,
        accountName: b.account_name,
        accountNumber: b.account_number,
        mmProvider: b.mobile_money_provider,
        mmNumber: b.mobile_money_number,
      },
    ]),
  );

  type ComponentRow = {
    code: string; name: string; component_type: string; calc_type: string;
    default_amount: number | null; taxable: boolean; pensionable: boolean; is_active: boolean;
  };
  const componentsByEmployee = new Map<string, PayComponentInput[]>();
  for (const row of assignments ?? []) {
    const embedded = row.pay_components as ComponentRow | ComponentRow[] | null;
    const component = Array.isArray(embedded) ? embedded[0] : embedded;
    if (!component || !component.is_active) continue;
    const list = componentsByEmployee.get(row.employee_id as string) ?? [];
    list.push({
      code: component.code,
      name: component.name,
      componentType: component.component_type as 'earning' | 'deduction',
      calcType: component.calc_type as 'fixed' | 'percent_of_basic',
      amount: Number(row.amount ?? component.default_amount ?? 0),
      taxable: component.taxable,
      pensionable: component.pensionable,
    });
    componentsByEmployee.set(row.employee_id as string, list);
  }
  // One-off run inputs join the same component stream.
  for (const input of runInputs ?? []) {
    const list = componentsByEmployee.get(input.employee_id as string) ?? [];
    list.push({
      code: input.code as string,
      name: input.name as string,
      componentType: input.input_type as 'earning' | 'deduction',
      calcType: 'fixed',
      amount: Number(input.amount),
      taxable: input.taxable as boolean,
      pensionable: input.pensionable as boolean,
    });
    componentsByEmployee.set(input.employee_id as string, list);
  }

  return (employees ?? [])
    .filter((e) => salaryByEmployee.has(e.id as string))
    .map((e) => ({
      employeeId: e.id as string,
      employeeName: [e.first_name, e.middle_name, e.last_name].filter(Boolean).join(' '),
      employeeNumber: e.employee_number as string,
      basicSalary: salaryByEmployee.get(e.id as string)!,
      components: (componentsByEmployee.get(e.id as string) ?? []).sort((a, b) =>
        a.code.localeCompare(b.code),
      ),
      payment: bankByEmployee.get(e.id as string) ?? null,
    }))
    .sort((a, b) => a.employeeNumber.localeCompare(b.employeeNumber));
}

function lineFromResult(
  run: RunRow,
  bundle: EmployeeBundle,
  result: PayrollResult,
): Record<string, unknown> {
  return {
    tenant_id: run.tenant_id,
    run_id: run.id,
    employee_id: bundle.employeeId,
    employee_name: bundle.employeeName,
    employee_number: bundle.employeeNumber,
    basic_salary: result.basicSalary,
    gross_pay: result.grossPay,
    taxable_income: result.taxableIncome,
    paye: result.paye,
    pension_employee:
      result.statutoryDeductions.find((d) => d.code === 'PENSION_EE')?.amount ?? 0,
    total_deductions: result.totalDeductions,
    net_pay: result.netPay,
    employer_cost: result.employerCost,
    earnings: result.earnings,
    statutory_deductions: result.statutoryDeductions,
    other_deductions: result.otherDeductions,
    employer_contributions: result.employerContributions,
    payment: bundle.payment,
    warnings: result.warnings,
    trace: result.trace,
  };
}

export interface CalculateRunOutcome {
  employees: number;
  totals: { gross: number; paye: number; net: number; employerCost: number; employees: number };
  variances: VarianceFinding[];
}

/** Full-run calculation: replaces all lines, sets totals + variances. */
export async function calculateRunCore(
  supabase: SupabaseClient,
  run: RunRow,
): Promise<CalculateRunOutcome> {
  if (['approved', 'paid', 'closed'].includes(run.status)) {
    throw new Error(`Run is ${run.status} and immutable.`);
  }
  const rules = await loadRules(supabase, run.legal_entity_id);
  if (rules.length === 0) throw new Error('No compliance pack attached to this legal entity.');

  const bundles = await loadEmployeeBundles(supabase, run);
  if (bundles.length === 0) throw new Error('No employees with compensation records found.');

  const period = { year: run.period_year, month: run.period_month };
  const results = bundles.map((b) => ({
    bundle: b,
    result: calculatePayroll(
      { employeeId: b.employeeId, employeeName: b.employeeName, basicSalary: b.basicSalary, components: b.components },
      period,
      rules,
    ),
  }));

  // The DB immutability triggers (migration 0012) reject changes to an
  // approved/paid/closed run's lines; check the delete error rather than
  // swallowing it, so a concurrent approval can't leave the run line-less.
  const { error: deleteError } = await supabase
    .from('payroll_run_lines')
    .delete()
    .eq('run_id', run.id);
  if (deleteError) throw new Error(`Could not clear existing lines: ${deleteError.message}`);
  const { error: insertError } = await supabase
    .from('payroll_run_lines')
    .insert(results.map(({ bundle, result }) => lineFromResult(run, bundle, result)));
  if (insertError) throw new Error(`Line write failed: ${insertError.message}`);

  // Variances vs previous period run of the same entity/type.
  const prevMonth = run.period_month === 1 ? 12 : run.period_month - 1;
  const prevYear = run.period_month === 1 ? run.period_year - 1 : run.period_year;
  const { data: prevRun } = await supabase
    .from('payroll_runs')
    .select('id')
    .eq('legal_entity_id', run.legal_entity_id)
    .eq('period_year', prevYear)
    .eq('period_month', prevMonth)
    .eq('run_type', 'regular')
    .maybeSingle();
  let variances: VarianceFinding[] = [];
  const currentVarianceInput = results.map(({ result }) => ({
    employeeId: result.employeeId,
    employeeName: result.employeeName,
    grossPay: result.grossPay,
    paye: result.paye,
    netPay: result.netPay,
    warnings: result.warnings,
  }));
  if (prevRun) {
    const { data: prevLines } = await supabase
      .from('payroll_run_lines')
      .select('employee_id, employee_name, gross_pay, paye, net_pay')
      .eq('run_id', prevRun.id);
    variances = compareRuns(
      currentVarianceInput,
      (prevLines ?? []).map((l) => ({
        employeeId: l.employee_id as string,
        employeeName: l.employee_name as string,
        grossPay: Number(l.gross_pay),
        paye: Number(l.paye),
        netPay: Number(l.net_pay),
      })),
    );
  } else {
    variances = compareRuns(currentVarianceInput, []);
  }

  const totals = {
    gross: Math.round(results.reduce((s, r) => s + r.result.grossPay, 0) * 100) / 100,
    paye: Math.round(results.reduce((s, r) => s + r.result.paye, 0) * 100) / 100,
    net: Math.round(results.reduce((s, r) => s + r.result.netPay, 0) * 100) / 100,
    employerCost: Math.round(results.reduce((s, r) => s + r.result.employerCost, 0) * 100) / 100,
    employees: results.length,
  };

  const { error: updateError } = await supabase
    .from('payroll_runs')
    .update({
      status: 'calculated',
      totals,
      variances,
      calculated_at: new Date().toISOString(),
    })
    .eq('id', run.id)
    .in('status', ['draft', 'calculated']);
  if (updateError) throw new Error(updateError.message);

  return { employees: results.length, totals, variances };
}

/**
 * Real-time single-employee recalculation: after an input change, only the
 * affected employee's line is recomputed and totals are adjusted — no batch
 * wait (blueprint §4.1). Returns previous and new key figures for display.
 */
export async function recalcEmployeeLine(
  supabase: SupabaseClient,
  run: RunRow,
  employeeId: string,
): Promise<{ previous: { gross: number; paye: number; net: number } | null; next: { gross: number; paye: number; net: number } }> {
  if (['approved', 'paid', 'closed'].includes(run.status)) {
    throw new Error(`Run is ${run.status} and immutable.`);
  }
  const rules = await loadRules(supabase, run.legal_entity_id);
  const bundles = await loadEmployeeBundles(supabase, run);
  const bundle = bundles.find((b) => b.employeeId === employeeId);
  if (!bundle) throw new Error('Employee not part of this run.');

  const { data: previousLine } = await supabase
    .from('payroll_run_lines')
    .select('gross_pay, paye, net_pay')
    .eq('run_id', run.id)
    .eq('employee_id', employeeId)
    .maybeSingle();

  const result = calculatePayroll(
    { employeeId: bundle.employeeId, employeeName: bundle.employeeName, basicSalary: bundle.basicSalary, components: bundle.components },
    { year: run.period_year, month: run.period_month },
    rules,
  );

  await supabase
    .from('payroll_run_lines')
    .upsert(lineFromResult(run, bundle, result) as never, { onConflict: 'run_id,employee_id' });

  // Refresh totals from lines (cheap and always consistent).
  const { data: allLines } = await supabase
    .from('payroll_run_lines')
    .select('gross_pay, paye, net_pay, employer_cost')
    .eq('run_id', run.id);
  const totals = {
    gross: Math.round((allLines ?? []).reduce((s, l) => s + Number(l.gross_pay), 0) * 100) / 100,
    paye: Math.round((allLines ?? []).reduce((s, l) => s + Number(l.paye), 0) * 100) / 100,
    net: Math.round((allLines ?? []).reduce((s, l) => s + Number(l.net_pay), 0) * 100) / 100,
    employerCost:
      Math.round((allLines ?? []).reduce((s, l) => s + Number(l.employer_cost), 0) * 100) / 100,
    employees: (allLines ?? []).length,
  };
  await supabase.from('payroll_runs').update({ totals }).eq('id', run.id);

  return {
    previous: previousLine
      ? { gross: Number(previousLine.gross_pay), paye: Number(previousLine.paye), net: Number(previousLine.net_pay) }
      : null,
    next: { gross: result.grossPay, paye: result.paye, net: result.netPay },
  };
}
