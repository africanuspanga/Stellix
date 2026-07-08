import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  buildBankCsv,
  buildMobileMoneyCsv,
  buildStatutoryCsv,
  type ExportLine,
  type StatutoryScheduleType,
} from '@/lib/payroll/exports';

const PAYMENT_TYPES = new Set(['bank', 'mobile']);
const STATUTORY_TYPES = new Set(['paye', 'pension', 'sdl_wcf']);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; type: string }> },
) {
  const { id, type } = await params;
  if (!PAYMENT_TYPES.has(type) && !STATUTORY_TYPES.has(type)) {
    return NextResponse.json({ error: 'Unknown export type' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: run } = await supabase
    .from('payroll_runs')
    .select('id, status, period_year, period_month')
    .eq('id', id)
    .maybeSingle();
  if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 });

  // Payment files and statutory schedules only exist for finalized runs.
  if (!['approved', 'paid', 'closed'].includes(run.status)) {
    return NextResponse.json(
      { error: 'Exports are available after the run is approved.' },
      { status: 409 },
    );
  }

  const { data: rows } = await supabase
    .from('payroll_run_lines')
    .select('employee_name, employee_number, gross_pay, taxable_income, paye, pension_employee, net_pay, employer_contributions, payment')
    .eq('run_id', id)
    .order('employee_number');

  const lines: ExportLine[] = (rows ?? []).map((r) => ({
    employeeName: r.employee_name as string,
    employeeNumber: r.employee_number as string,
    grossPay: Number(r.gross_pay),
    taxableIncome: Number(r.taxable_income),
    paye: Number(r.paye),
    pensionEmployee: Number(r.pension_employee),
    netPay: Number(r.net_pay),
    employerContributions: (r.employer_contributions as Array<{ code: string; amount: number }>) ?? [],
    payment: r.payment as ExportLine['payment'],
  }));

  const csv =
    type === 'bank'
      ? buildBankCsv(lines)
      : type === 'mobile'
        ? buildMobileMoneyCsv(lines)
        : buildStatutoryCsv(type as StatutoryScheduleType, lines);

  const period = `${run.period_year}-${String(run.period_month).padStart(2, '0')}`;
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="stellix-${type}-${period}.csv"`,
    },
  });
}
