// Payment-file and statutory-schedule builders (blueprint §4.11/§5.5).
// Pure functions over immutable run-line snapshots.

export interface ExportLine {
  employeeName: string;
  employeeNumber: string;
  grossPay: number;
  taxableIncome: number;
  paye: number;
  pensionEmployee: number;
  netPay: number;
  employerContributions: Array<{ code: string; amount: number }>;
  payment: {
    method?: string;
    bankName?: string | null;
    accountName?: string | null;
    accountNumber?: string | null;
    mmProvider?: string | null;
    mmNumber?: string | null;
  } | null;
}

function csvEscape(value: string | number | null | undefined): string {
  const s = String(value ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(headers: string[], rows: Array<Array<string | number | null>>): string {
  return [headers.join(','), ...rows.map((r) => r.map(csvEscape).join(','))].join('\n');
}

/** Bank transfer file: employees paid by bank, with snapshot account details. */
export function buildBankCsv(lines: ExportLine[]): string {
  const rows = lines
    .filter((l) => (l.payment?.method ?? 'bank') === 'bank' && l.payment?.accountNumber)
    .map((l) => [
      l.employeeNumber,
      l.employeeName,
      l.payment?.bankName ?? '',
      l.payment?.accountName ?? l.employeeName,
      l.payment?.accountNumber ?? '',
      l.netPay,
    ]);
  return toCsv(
    ['employee_number', 'employee_name', 'bank_name', 'account_name', 'account_number', 'amount_tzs'],
    rows,
  );
}

/** Mobile-money payment file (M-Pesa, Tigo Pesa, Airtel Money…). */
export function buildMobileMoneyCsv(lines: ExportLine[]): string {
  const rows = lines
    .filter((l) => l.payment?.method === 'mobile_money' && l.payment?.mmNumber)
    .map((l) => [
      l.employeeNumber,
      l.employeeName,
      l.payment?.mmProvider ?? '',
      l.payment?.mmNumber ?? '',
      l.netPay,
    ]);
  return toCsv(
    ['employee_number', 'employee_name', 'provider', 'phone_number', 'amount_tzs'],
    rows,
  );
}

export type StatutoryScheduleType = 'paye' | 'pension' | 'sdl_wcf';

/** Statutory schedules: per-employee PAYE, pension (employee+employer), SDL/WCF. */
export function buildStatutoryCsv(type: StatutoryScheduleType, lines: ExportLine[]): string {
  if (type === 'paye') {
    return toCsv(
      ['employee_number', 'employee_name', 'gross_pay', 'taxable_income', 'paye'],
      lines.map((l) => [l.employeeNumber, l.employeeName, l.grossPay, l.taxableIncome, l.paye]),
    );
  }
  if (type === 'pension') {
    return toCsv(
      ['employee_number', 'employee_name', 'gross_pay', 'employee_share', 'employer_share', 'total'],
      lines.map((l) => {
        const employer = l.employerContributions.find((c) => c.code === 'PENSION_ER')?.amount ?? 0;
        return [
          l.employeeNumber, l.employeeName, l.grossPay, l.pensionEmployee, employer,
          Math.round((l.pensionEmployee + employer) * 100) / 100,
        ];
      }),
    );
  }
  return toCsv(
    ['employee_number', 'employee_name', 'gross_pay', 'sdl', 'wcf'],
    lines.map((l) => [
      l.employeeNumber,
      l.employeeName,
      l.grossPay,
      l.employerContributions.find((c) => c.code === 'SDL')?.amount ?? 0,
      l.employerContributions.find((c) => c.code === 'WCF')?.amount ?? 0,
    ]),
  );
}
