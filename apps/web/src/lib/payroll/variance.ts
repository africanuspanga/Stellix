// Variance engine (blueprint §4.9): pure comparison of a run's lines against
// the previous period. Every finding is explainable and typed.

export interface VarianceLineInput {
  employeeId: string;
  employeeName: string;
  grossPay: number;
  paye: number;
  netPay: number;
  warnings?: string[];
}

export interface VarianceFinding {
  type:
    | 'new_employee'
    | 'missing_employee'
    | 'net_increase'
    | 'net_decrease'
    | 'paye_change'
    | 'zero_net'
    | 'negative_net'
    | 'below_minimum_wage';
  employeeId: string;
  employeeName: string;
  detail: string;
  amount: number;
}

export interface VarianceOptions {
  /** Relative net-pay change that triggers a finding (default 10%). */
  netChangeThreshold?: number;
}

export function compareRuns(
  current: VarianceLineInput[],
  previous: VarianceLineInput[],
  options: VarianceOptions = {},
): VarianceFinding[] {
  const threshold = options.netChangeThreshold ?? 0.1;
  const findings: VarianceFinding[] = [];
  const previousById = new Map(previous.map((l) => [l.employeeId, l]));
  const currentIds = new Set(current.map((l) => l.employeeId));

  for (const line of current) {
    const before = previousById.get(line.employeeId);

    if (line.netPay < 0) {
      findings.push({
        type: 'negative_net', employeeId: line.employeeId, employeeName: line.employeeName,
        detail: 'Net pay is negative', amount: line.netPay,
      });
    } else if (line.netPay === 0) {
      findings.push({
        type: 'zero_net', employeeId: line.employeeId, employeeName: line.employeeName,
        detail: 'Net pay is zero', amount: 0,
      });
    }

    if ((line.warnings ?? []).some((w) => w.includes('minimum wage'))) {
      findings.push({
        type: 'below_minimum_wage', employeeId: line.employeeId, employeeName: line.employeeName,
        detail: 'Basic salary below the minimum wage floor', amount: line.grossPay,
      });
    }

    if (!before) {
      findings.push({
        type: 'new_employee', employeeId: line.employeeId, employeeName: line.employeeName,
        detail: 'Not present in the previous period', amount: line.netPay,
      });
      continue;
    }

    if (before.netPay > 0) {
      const change = (line.netPay - before.netPay) / before.netPay;
      if (Math.abs(change) >= threshold) {
        findings.push({
          type: change > 0 ? 'net_increase' : 'net_decrease',
          employeeId: line.employeeId,
          employeeName: line.employeeName,
          detail: `Net pay ${change > 0 ? 'rose' : 'fell'} ${(Math.abs(change) * 100).toFixed(1)}% (${before.netPay} → ${line.netPay})`,
          amount: line.netPay - before.netPay,
        });
      }
    }
    if (before.paye !== line.paye) {
      findings.push({
        type: 'paye_change', employeeId: line.employeeId, employeeName: line.employeeName,
        detail: `PAYE changed ${before.paye} → ${line.paye}`,
        amount: line.paye - before.paye,
      });
    }
  }

  for (const line of previous) {
    if (!currentIds.has(line.employeeId)) {
      findings.push({
        type: 'missing_employee', employeeId: line.employeeId, employeeName: line.employeeName,
        detail: 'Present last period but absent from this run', amount: -line.netPay,
      });
    }
  }

  return findings;
}
