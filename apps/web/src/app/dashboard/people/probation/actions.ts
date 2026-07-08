'use server';

import { revalidatePath } from 'next/cache';
import { requirePermission } from '@/lib/authz';
import { logAudit } from '@/lib/audit';

export interface ProbationFormState {
  error?: string;
  success?: boolean;
}

const PATH = '/dashboard/people/probation';

function str(f: FormData, key: string): string {
  return String(f.get(key) ?? '').trim();
}
function opt(f: FormData, key: string): string | null {
  const v = str(f, key);
  return v === '' ? null : v;
}

export async function scheduleReview(
  _p: ProbationFormState,
  f: FormData,
): Promise<ProbationFormState> {
  const auth = await requirePermission('people.employee.write');
  if ('error' in auth) return { error: auth.error };
  const { supabase, tenantId, user } = auth;

  const employeeId = str(f, 'employee_id');
  const reviewDate = str(f, 'review_date');
  if (!employeeId || !reviewDate) return { error: 'Employee and review date are required.' };

  const { error } = await supabase.from('probation_reviews').insert({
    tenant_id: tenantId,
    employee_id: employeeId,
    review_date: reviewDate,
    created_by: user.id,
  });
  if (error) return { error: error.message };

  revalidatePath(PATH);
  return { success: true };
}

/**
 * Complete a review. The recommendation drives the confirmation workflow:
 * confirm → probation_confirmation action + employee active;
 * extend → probation_extension action + new probation end date;
 * terminate → recorded for the offboarding process (Sprint 13 scope).
 */
export async function completeReview(
  _p: ProbationFormState,
  f: FormData,
): Promise<ProbationFormState> {
  const auth = await requirePermission('people.action.approve');
  if ('error' in auth) return { error: auth.error };
  const { supabase, tenantId, user } = auth;

  const id = str(f, 'id');
  const recommendation = str(f, 'recommendation');
  const newEndDate = opt(f, 'new_probation_end_date');
  if (!['confirm', 'extend', 'terminate'].includes(recommendation))
    return { error: 'Choose a recommendation.' };
  if (recommendation === 'extend' && !newEndDate)
    return { error: 'An extension needs the new probation end date.' };

  const { data: review } = await supabase
    .from('probation_reviews')
    .select('*, employees(id, probation_end_date)')
    .eq('id', id)
    .maybeSingle();
  if (!review) return { error: 'Review not found.' };
  if (review.status === 'completed') return { error: 'This review is already completed.' };
  const employeeId = review.employee_id as string;

  const { error: updateError } = await supabase
    .from('probation_reviews')
    .update({
      status: 'completed',
      manager_feedback: opt(f, 'manager_feedback'),
      employee_feedback: opt(f, 'employee_feedback'),
      recommendation,
      new_probation_end_date: newEndDate,
      completed_by: user.id,
      completed_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (updateError) return { error: updateError.message };

  const today = new Date().toISOString().slice(0, 10);

  if (recommendation === 'confirm') {
    await supabase.from('employment_actions').insert({
      tenant_id: tenantId,
      employee_id: employeeId,
      action_type: 'probation_confirmation',
      status: 'effected',
      effective_date: today,
      details: {},
      reason: opt(f, 'manager_feedback'),
      requested_by: user.id,
      approved_by: user.id,
      approved_at: new Date().toISOString(),
    });
    await supabase.from('employees').update({ status: 'active' }).eq('id', employeeId);
  } else if (recommendation === 'extend') {
    await supabase.from('employment_actions').insert({
      tenant_id: tenantId,
      employee_id: employeeId,
      action_type: 'probation_extension',
      status: 'effected',
      effective_date: today,
      details: { new_probation_end_date: newEndDate },
      reason: opt(f, 'manager_feedback'),
      requested_by: user.id,
      approved_by: user.id,
      approved_at: new Date().toISOString(),
    });
    await supabase
      .from('employees')
      .update({ probation_end_date: newEndDate, status: 'probation' })
      .eq('id', employeeId);
  }

  await logAudit(supabase, {
    tenantId,
    actorUserId: user.id,
    action: `probation_review.${recommendation}`,
    entityType: 'probation_review',
    entityId: id,
    after: { employee_id: employeeId, recommendation, new_probation_end_date: newEndDate },
  });

  revalidatePath(PATH);
  revalidatePath(`/dashboard/people/employees/${employeeId}`);
  return { success: true };
}
