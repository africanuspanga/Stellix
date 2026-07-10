'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requirePermission } from '@/lib/authz';
import { logAudit } from '@/lib/audit';
import { calculateRunCore, recalcEmployeeLine, type RunRow } from '@/lib/payroll/run-calc';

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
