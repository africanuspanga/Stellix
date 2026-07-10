import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  ComplianceRuleRow,
  PayComponentInput,
  PayrollEmployeeInput,
  PayrollPeriod,
} from './engine';

// Loads engine inputs from the database. The engine itself never touches I/O.

export async function getRulesForEntity(
  supabase: SupabaseClient,
  legalEntityId: string,
  period: PayrollPeriod,
): Promise<ComplianceRuleRow[]> {
  const mm = String(period.month).padStart(2, '0');
  const periodStart = `${period.year}-${mm}-01`;

  const { data: link } = await supabase
    .from('legal_entity_compliance')
    .select('pack_id')
    .eq('legal_entity_id', legalEntityId)
    .lte('effective_from', periodStart)
    .or(`effective_to.is.null,effective_to.gte.${periodStart}`)
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

export interface EntityPayrollInputs {
  legalEntityId: string;
  employees: PayrollEmployeeInput[];
}

/**
 * Assemble per-employee engine inputs for a period: current effective-dated
 * compensation plus active recurring pay components, grouped by legal entity.
 */
export async function getPayrollInputs(
  supabase: SupabaseClient,
  period: PayrollPeriod,
): Promise<EntityPayrollInputs[]> {
  const mm = String(period.month).padStart(2, '0');
  const lastDay = new Date(Date.UTC(period.year, period.month, 0)).getUTCDate();
  const periodEnd = `${period.year}-${mm}-${String(lastDay).padStart(2, '0')}`;
  // Compensation/components in force at period end (see run-calc.ts) — not
  // "whatever is open now", which would pay future-dated raises early.
  const inForceAtPeriodEnd = `effective_to.is.null,effective_to.gte.${periodEnd}`;

  const [{ data: employees }, { data: compensation }, { data: assignments }] =
    await Promise.all([
      supabase
        .from('employees')
        .select('id, first_name, middle_name, last_name, legal_entity_id, status, hire_date')
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
    ]);

  const salaryByEmployee = new Map(
    (compensation ?? []).map((c) => [c.employee_id as string, Number(c.basic_salary)]),
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

  const byEntity = new Map<string, PayrollEmployeeInput[]>();
  for (const employee of employees ?? []) {
    const basicSalary = salaryByEmployee.get(employee.id as string);
    if (basicSalary === undefined) continue; // no compensation record yet
    const list = byEntity.get(employee.legal_entity_id as string) ?? [];
    list.push({
      employeeId: employee.id as string,
      employeeName: [employee.first_name, employee.middle_name, employee.last_name]
        .filter(Boolean)
        .join(' '),
      basicSalary,
      components: (componentsByEmployee.get(employee.id as string) ?? []).sort((a, b) =>
        a.code.localeCompare(b.code),
      ),
    });
    byEntity.set(employee.legal_entity_id as string, list);
  }

  return [...byEntity.entries()].map(([legalEntityId, list]) => ({
    legalEntityId,
    employees: list.sort((a, b) => a.employeeId.localeCompare(b.employeeId)),
  }));
}
