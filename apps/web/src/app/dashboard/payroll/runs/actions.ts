'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requirePermission } from '@/lib/authz';
import { logAudit } from '@/lib/audit';
import { calculateRunCore, recalcEmployeeLine, type RunRow } from '@/lib/payroll/run-calc';
import { parseSheet } from '@/lib/imports/employees';

export interface RunFormState {
  error?: string;
  success?: boolean;
  message?: string;
}

const PATH = '/dashboard/payroll/runs';

function str(f: FormData, key: string): string {
  return String(f.get(key) ?? '').trim();
}
function num(f: FormData, key: string): number | null {
  const v = str(f, key);
  if (v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function createRun(_p: RunFormState, f: FormData): Promise<RunFormState> {
  const auth = await requirePermission('payroll.run.prepare');
  if ('error' in auth) return { error: auth.error };
  const { supabase, tenantId, user } = auth;

  const legalEntityId = str(f, 'legal_entity_id');
  const year = num(f, 'period_year');
  const month = num(f, 'period_month');
  if (!legalEntityId || !year || !month) return { error: 'Entity, year and month are required.' };

  const { data, error } = await supabase
    .from('payroll_runs')
    .insert({
      tenant_id: tenantId,
      legal_entity_id: legalEntityId,
      period_year: year,
      period_month: month,
      created_by: user.id,
    })
    .select('id')
    .single();
  if (error) {
    return {
      error: error.message.includes('duplicate')
        ? 'A regular run already exists for this entity and period.'
        : error.message,
    };
  }

  await logAudit(supabase, {
    tenantId, actorUserId: user.id, action: 'payroll_run.created',
    entityType: 'payroll_run', entityId: data.id,
    after: { legal_entity_id: legalEntityId, period: `${year}-${month}` },
  });
  revalidatePath(PATH);
  redirect(`${PATH}/${data.id}`);
}

export async function calculateRun(_p: RunFormState, f: FormData): Promise<RunFormState> {
  const auth = await requirePermission('payroll.run.prepare');
  if ('error' in auth) return { error: auth.error };
  const { supabase, tenantId, user } = auth;

  const runId = str(f, 'run_id');
  const { data: run } = await supabase.from('payroll_runs').select('*').eq('id', runId).maybeSingle();
  if (!run) return { error: 'Run not found.' };

  let outcome;
  try {
    outcome = await calculateRunCore(supabase, run as RunRow);
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Calculation failed.' };
  }

  await logAudit(supabase, {
    tenantId, actorUserId: user.id, action: 'payroll_run.calculated',
    entityType: 'payroll_run', entityId: runId,
    after: { totals: outcome.totals, variances: outcome.variances.length },
  });
  revalidatePath(`${PATH}/${runId}`);
  return {
    success: true,
    message: `Calculated ${outcome.employees} employees · ${outcome.variances.length} variance findings.`,
  };
}

export async function addRunInput(_p: RunFormState, f: FormData): Promise<RunFormState> {
  const auth = await requirePermission('payroll.run.prepare');
  if ('error' in auth) return { error: auth.error };
  const { supabase, tenantId, user } = auth;

  const runId = str(f, 'run_id');
  const employeeId = str(f, 'employee_id');
  const name = str(f, 'name');
  const amount = num(f, 'amount');
  const inputType = str(f, 'input_type');
  if (!name || amount === null || amount <= 0) return { error: 'Name and a positive amount are required.' };
  if (!['earning', 'deduction'].includes(inputType)) return { error: 'Invalid input type.' };

  const { data: run } = await supabase.from('payroll_runs').select('*').eq('id', runId).maybeSingle();
  if (!run) return { error: 'Run not found.' };
  if (['approved', 'paid', 'closed'].includes(run.status)) {
    return { error: `Run is ${run.status} and immutable — use an adjustment run.` };
  }

  const { error: insertError } = await supabase.from('payroll_run_inputs').insert({
    tenant_id: tenantId,
    run_id: runId,
    employee_id: employeeId,
    code: name.toUpperCase().replace(/[^A-Z0-9]+/g, '_').slice(0, 24) || 'INPUT',
    name,
    input_type: inputType,
    amount,
    taxable: str(f, 'taxable') !== 'false',
    pensionable: false,
    created_by: user.id,
  });
  if (insertError) return { error: insertError.message };

  // Real-time impact: recalculate just this employee immediately.
  let impact;
  try {
    impact = await recalcEmployeeLine(supabase, run as RunRow, employeeId);
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Recalculation failed.' };
  }

  await logAudit(supabase, {
    tenantId, actorUserId: user.id, action: 'payroll_run.input_added',
    entityType: 'payroll_run', entityId: runId,
    before: impact.previous,
    after: { employee_id: employeeId, name, amount, input_type: inputType, ...impact.next },
  });
  revalidatePath(`${PATH}/${runId}`);
  const prev = impact.previous;
  return {
    success: true,
    message: prev
      ? `Net pay: ${prev.net.toLocaleString()} → ${impact.next.net.toLocaleString()} · PAYE: ${prev.paye.toLocaleString()} → ${impact.next.paye.toLocaleString()}`
      : `Line calculated: net ${impact.next.net.toLocaleString()}.`,
  };
}

/**
 * Bulk one-off inputs from a spreadsheet. Columns (header names, case/spacing
 * insensitive): employee number, item/name, type (earning|deduction), amount,
 * and optional taxable (yes/no). Inserts every valid row, then recalculates the
 * whole run once. Reports how many landed and why any were skipped.
 */
export async function bulkAddRunInputs(_p: RunFormState, f: FormData): Promise<RunFormState> {
  const auth = await requirePermission('payroll.run.prepare');
  if ('error' in auth) return { error: auth.error };
  const { supabase, tenantId, user } = auth;

  const runId = str(f, 'run_id');
  const file = f.get('file') as File | null;
  if (!file || file.size === 0) return { error: 'Choose a CSV or Excel file.' };
  if (file.size > 5 * 1024 * 1024) return { error: 'File is larger than 5 MB.' };

  const { data: run } = await supabase.from('payroll_runs').select('*').eq('id', runId).maybeSingle();
  if (!run) return { error: 'Run not found.' };
  if (['approved', 'paid', 'closed'].includes(run.status)) {
    return { error: `Run is ${run.status} and immutable — use an adjustment run.` };
  }

  let parsed;
  try {
    parsed = parseSheet(await file.arrayBuffer());
  } catch {
    return { error: 'Could not read that file. Use CSV or .xlsx.' };
  }
  if (parsed.rows.length === 0) return { error: 'The sheet has no data rows.' };

  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const col = (aliases: string[]) =>
    parsed.headers.findIndex((h) => aliases.includes(norm(h)));
  const idx = {
    employee: col(['employeenumber', 'employeeno', 'empno', 'staffnumber', 'number']),
    name: col(['item', 'name', 'description', 'label']),
    type: col(['type', 'inputtype', 'kind']),
    amount: col(['amount', 'value', 'kiasi']),
    taxable: col(['taxable']),
  };
  if (idx.employee < 0 || idx.name < 0 || idx.amount < 0) {
    return { error: 'Need at least columns: employee number, item, amount (and optional type, taxable).' };
  }

  // Map employee number → id within this run's legal entity.
  const { data: employees } = await supabase
    .from('employees')
    .select('id, employee_number')
    .eq('tenant_id', tenantId)
    .eq('legal_entity_id', run.legal_entity_id);
  const idByNumber = new Map(
    (employees ?? []).map((e) => [String(e.employee_number).trim(), e.id as string]),
  );

  const rows: Array<Record<string, unknown>> = [];
  const skipped: string[] = [];
  parsed.rows.forEach((r, i) => {
    const rowNo = i + 2; // header is row 1
    const empNo = String(r[idx.employee] ?? '').trim();
    const name = String(r[idx.name] ?? '').trim();
    const amount = Number(String(r[idx.amount] ?? '').replace(/[,\s]/g, ''));
    const rawType = idx.type >= 0 ? norm(String(r[idx.type] ?? '')) : 'earning';
    const type = rawType === 'deduction' || rawType === 'deductions' ? 'deduction' : 'earning';
    const taxable = idx.taxable >= 0 ? !['no', 'false', '0'].includes(norm(String(r[idx.taxable] ?? ''))) : true;

    if (!empNo && !name) return; // blank line
    const employeeId = idByNumber.get(empNo);
    if (!employeeId) return skipped.push(`Row ${rowNo}: no employee "${empNo}"`), undefined;
    if (!name) return skipped.push(`Row ${rowNo}: missing item name`), undefined;
    if (!Number.isFinite(amount) || amount <= 0) return skipped.push(`Row ${rowNo}: invalid amount`), undefined;

    rows.push({
      tenant_id: tenantId,
      run_id: runId,
      employee_id: employeeId,
      code: name.toUpperCase().replace(/[^A-Z0-9]+/g, '_').slice(0, 24) || 'INPUT',
      name,
      input_type: type,
      amount,
      taxable,
      pensionable: false,
      created_by: user.id,
    });
  });

  if (rows.length === 0) {
    return { error: `Nothing imported. ${skipped.slice(0, 3).join('; ')}` };
  }

  const { error: insertError } = await supabase.from('payroll_run_inputs').insert(rows);
  if (insertError) return { error: insertError.message };

  try {
    await calculateRunCore(supabase, run as RunRow);
  } catch (e) {
    return { error: `Inputs saved but recalculation failed: ${e instanceof Error ? e.message : 'unknown'}` };
  }

  await logAudit(supabase, {
    tenantId, actorUserId: user.id, action: 'payroll_run.inputs_bulk_added',
    entityType: 'payroll_run', entityId: runId,
    after: { added: rows.length, skipped: skipped.length },
  });
  revalidatePath(`${PATH}/${runId}`);

  const tail = skipped.length ? ` · ${skipped.length} skipped (${skipped.slice(0, 2).join('; ')}${skipped.length > 2 ? '…' : ''})` : '';
  return { success: true, message: `${rows.length} input(s) added and the run recalculated${tail}.` };
}

async function transition(
  f: FormData,
  permission: string,
  from: string[],
  to: string,
  extra: (userId: string) => Record<string, unknown>,
): Promise<RunFormState> {
  const auth = await requirePermission(permission);
  if ('error' in auth) return { error: auth.error };
  const { supabase, tenantId, user } = auth;

  const runId = str(f, 'run_id');
  const { data: run } = await supabase
    .from('payroll_runs')
    .select('id, status')
    .eq('id', runId)
    .maybeSingle();
  if (!run) return { error: 'Run not found.' };
  if (!from.includes(run.status)) {
    return { error: `Cannot move a ${run.status} run to ${to}.` };
  }

  // Guard the transition on the source status so two concurrent transitions
  // (e.g. approve + reverse, or a double mark-paid) cannot both apply.
  const { data: moved, error } = await supabase
    .from('payroll_runs')
    .update({ status: to, ...extra(user.id) })
    .eq('id', runId)
    .in('status', from)
    .select('id')
    .maybeSingle();
  if (error) return { error: error.message };
  if (!moved) return { error: 'This run was just updated elsewhere — refresh and try again.' };

  await logAudit(supabase, {
    tenantId, actorUserId: user.id, action: `payroll_run.${to}`,
    entityType: 'payroll_run', entityId: runId,
    before: { status: run.status }, after: { status: to },
  });
  revalidatePath(`${PATH}/${runId}`);
  return { success: true };
}

/** Human-only approval (non-negotiable #10). Freezes the run at DB level. */
export async function approveRun(_p: RunFormState, f: FormData): Promise<RunFormState> {
  return transition(f, 'payroll.run.approve', ['calculated'], 'approved', (userId) => ({
    approved_by: userId,
    approved_at: new Date().toISOString(),
  }));
}

/** Human-only payment release (non-negotiable #10). */
export async function markRunPaid(_p: RunFormState, f: FormData): Promise<RunFormState> {
  return transition(f, 'payroll.payment.release', ['approved'], 'paid', () => ({
    paid_at: new Date().toISOString(),
  }));
}

export async function closeRun(_p: RunFormState, f: FormData): Promise<RunFormState> {
  return transition(f, 'payroll.run.approve', ['paid'], 'closed', () => ({
    closed_at: new Date().toISOString(),
  }));
}

export async function reverseRun(_p: RunFormState, f: FormData): Promise<RunFormState> {
  return transition(f, 'payroll.run.approve', ['approved', 'paid', 'closed'], 'reversed', () => ({}));
}
