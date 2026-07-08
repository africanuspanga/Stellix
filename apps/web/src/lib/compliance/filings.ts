import type { SupabaseClient } from '@supabase/supabase-js';

// Statutory filing generation from an approved payroll run (blueprint §5.5).
// Amounts come from the run's immutable line snapshots. Due dates follow
// common Tanzania practice — VERIFY against current filing calendars before
// relying on them: PAYE/SDL/WCF by the 7th of the following month, NSSF by
// the end of the following month.

export interface FilingDraft {
  filing_type: 'paye' | 'nssf' | 'sdl' | 'wcf';
  amount: number;
  due_date: string;
}

function nextMonth(year: number, month: number): { year: number; month: number } {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
}

function endOfMonth(year: number, month: number): string {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, '0')}-${lastDay}`;
}

export function buildFilingDrafts(
  period: { year: number; month: number },
  lines: Array<{
    paye: number;
    pension_employee: number;
    employer_contributions: Array<{ code: string; amount: number }>;
  }>,
): FilingDraft[] {
  let paye = 0;
  let nssf = 0;
  let sdl = 0;
  let wcf = 0;
  for (const line of lines) {
    paye += Number(line.paye);
    nssf += Number(line.pension_employee);
    for (const contribution of line.employer_contributions ?? []) {
      if (contribution.code === 'PENSION_ER') nssf += Number(contribution.amount);
      if (contribution.code === 'SDL') sdl += Number(contribution.amount);
      if (contribution.code === 'WCF') wcf += Number(contribution.amount);
    }
  }
  const round = (n: number) => Math.round(n * 100) / 100;
  const next = nextMonth(period.year, period.month);
  const seventh = `${next.year}-${String(next.month).padStart(2, '0')}-07`;

  return [
    { filing_type: 'paye', amount: round(paye), due_date: seventh },
    { filing_type: 'nssf', amount: round(nssf), due_date: endOfMonth(next.year, next.month) },
    { filing_type: 'sdl', amount: round(sdl), due_date: seventh },
    { filing_type: 'wcf', amount: round(wcf), due_date: seventh },
  ];
}

export interface GenerateFilingsResult {
  created: number;
  skipped: number; // already existed for the period
}

export async function generateFilingsFromRun(
  supabase: SupabaseClient,
  runId: string,
  responsibleUserId: string,
): Promise<GenerateFilingsResult> {
  const { data: run } = await supabase
    .from('payroll_runs')
    .select('id, tenant_id, legal_entity_id, period_year, period_month, status')
    .eq('id', runId)
    .maybeSingle();
  if (!run) throw new Error('Run not found.');
  if (!['approved', 'paid', 'closed'].includes(run.status as string)) {
    throw new Error('Filings are generated from approved runs only.');
  }

  const { data: lines } = await supabase
    .from('payroll_run_lines')
    .select('paye, pension_employee, employer_contributions')
    .eq('run_id', runId);
  if (!lines || lines.length === 0) throw new Error('The run has no lines.');

  const drafts = buildFilingDrafts(
    { year: run.period_year as number, month: run.period_month as number },
    lines as never,
  );

  let created = 0;
  let skipped = 0;
  for (const draft of drafts) {
    const { error } = await supabase.from('statutory_filings').insert({
      tenant_id: run.tenant_id,
      legal_entity_id: run.legal_entity_id,
      payroll_run_id: runId,
      filing_type: draft.filing_type,
      period_year: run.period_year,
      period_month: run.period_month,
      due_date: draft.due_date,
      amount: draft.amount,
      responsible_user_id: responsibleUserId,
    });
    if (error) {
      if (error.message.includes('duplicate')) skipped++;
      else throw new Error(error.message);
    } else {
      created++;
    }
  }
  return { created, skipped };
}
