import type { SupabaseClient } from '@supabase/supabase-js';

// Compliance dashboard checks (blueprint §5.8). Shared by the dashboard page
// and the E2E suite. All queries run under the caller's RLS.

export interface ComplianceItem {
  employeeId: string;
  name: string;
  detail: string;
}

export interface ComplianceSnapshot {
  missingContracts: ComplianceItem[];
  expiringContracts: ComplianceItem[];
  expiringPermits: ComplianceItem[];
  belowMinimumWage: ComplianceItem[];
  incompleteFiles: ComplianceItem[];
  overdueFilings: Array<{ filingType: string; period: string; dueDate: string; amount: number }>;
  draftRuleCount: number;
}

function inDays(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function getComplianceSnapshot(
  supabase: SupabaseClient,
): Promise<ComplianceSnapshot> {
  const today = new Date().toISOString().slice(0, 10);

  const [
    { data: employees },
    { data: contracts },
    { data: compensation },
    { data: filings },
  ] = await Promise.all([
    supabase
      .from('employees')
      .select('id, first_name, middle_name, last_name, national_id, tin, nssf_number, work_permit_number, work_permit_expiry, nationality, status')
      .not('status', 'in', '("exited")'),
    supabase.from('employee_contracts').select('employee_id, ends_on, status'),
    supabase
      .from('employee_compensation')
      .select('employee_id, basic_salary')
      .is('effective_to', null),
    supabase
      .from('statutory_filings')
      .select('filing_type, period_year, period_month, due_date, amount, status')
      .eq('status', 'pending')
      .lt('due_date', today),
  ]);

  // Minimum-wage floor from the active pack's rule (first pack found).
  const { data: minWageRules } = await supabase
    .from('compliance_rules')
    .select('formula')
    .eq('rule_type', 'minimum_wage')
    .lte('effective_from', today)
    .order('effective_from', { ascending: false })
    .limit(1);
  const floor = Number(
    (minWageRules?.[0]?.formula as { generalFloor?: number } | undefined)?.generalFloor ?? 0,
  );

  const name = (e: { first_name: string; middle_name: string | null; last_name: string }) =>
    [e.first_name, e.middle_name, e.last_name].filter(Boolean).join(' ');

  const contractsByEmployee = new Map<string, Array<{ ends_on: string | null; status: string }>>();
  for (const contract of contracts ?? []) {
    const list = contractsByEmployee.get(contract.employee_id as string) ?? [];
    list.push(contract as never);
    contractsByEmployee.set(contract.employee_id as string, list);
  }
  const salaryByEmployee = new Map(
    (compensation ?? []).map((c) => [c.employee_id as string, Number(c.basic_salary)]),
  );

  const snapshot: ComplianceSnapshot = {
    missingContracts: [],
    expiringContracts: [],
    expiringPermits: [],
    belowMinimumWage: [],
    incompleteFiles: [],
    overdueFilings: (filings ?? []).map((f) => ({
      filingType: f.filing_type as string,
      period: `${f.period_year}-${String(f.period_month).padStart(2, '0')}`,
      dueDate: f.due_date as string,
      amount: Number(f.amount),
    })),
    draftRuleCount: 0,
  };

  const soonContracts = inDays(60);
  const soonPermits = inDays(90);

  for (const employee of employees ?? []) {
    const employeeContracts = contractsByEmployee.get(employee.id as string) ?? [];
    if (employeeContracts.length === 0) {
      snapshot.missingContracts.push({
        employeeId: employee.id as string,
        name: name(employee as never),
        detail: 'No contract on file',
      });
    } else {
      for (const contract of employeeContracts) {
        if (
          contract.ends_on &&
          contract.ends_on >= today &&
          contract.ends_on <= soonContracts &&
          !['expired', 'terminated'].includes(contract.status)
        ) {
          snapshot.expiringContracts.push({
            employeeId: employee.id as string,
            name: name(employee as never),
            detail: `Contract ends ${contract.ends_on}`,
          });
        }
      }
    }

    if (
      employee.work_permit_expiry &&
      (employee.work_permit_expiry as string) <= soonPermits
    ) {
      snapshot.expiringPermits.push({
        employeeId: employee.id as string,
        name: name(employee as never),
        detail: `Work permit expires ${employee.work_permit_expiry}`,
      });
    }

    const salary = salaryByEmployee.get(employee.id as string);
    if (floor > 0 && salary !== undefined && salary < floor) {
      snapshot.belowMinimumWage.push({
        employeeId: employee.id as string,
        name: name(employee as never),
        detail: `Basic ${salary} below floor ${floor}`,
      });
    }

    const missing: string[] = [];
    if (!employee.national_id) missing.push('NIDA');
    if (!employee.tin) missing.push('TIN');
    if (!employee.nssf_number) missing.push('NSSF');
    if (missing.length > 0) {
      snapshot.incompleteFiles.push({
        employeeId: employee.id as string,
        name: name(employee as never),
        detail: `Missing ${missing.join(', ')}`,
      });
    }
  }

  const { count: draftRules } = await supabase
    .from('compliance_rules')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'draft');
  snapshot.draftRuleCount = draftRules ?? 0;

  return snapshot;
}
