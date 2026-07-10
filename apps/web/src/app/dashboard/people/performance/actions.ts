'use server';

import { revalidatePath } from 'next/cache';
import { requirePermission } from '@/lib/authz';
import { logAudit } from '@/lib/audit';

export interface PerformanceFormState {
  error?: string;
  success?: boolean;
}

const PATH = '/dashboard/people/performance';

function str(f: FormData, key: string): string {
  return String(f.get(key) ?? '').trim();
}
function opt(f: FormData, key: string): string | null {
  const v = str(f, key);
  return v === '' ? null : v;
}
function num(f: FormData, key: string): number | null {
  const v = str(f, key);
  if (v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function saveCycle(_p: PerformanceFormState, f: FormData): Promise<PerformanceFormState> {
  const auth = await requirePermission('people.action.approve');
  if ('error' in auth) return { error: auth.error };
  const { supabase, tenantId, user } = auth;

  const id = opt(f, 'id');
  const values = {
    name: str(f, 'name'),
    starts_on: str(f, 'starts_on'),
    ends_on: str(f, 'ends_on'),
    status: str(f, 'status') || 'open',
  };
  if (!values.name || !values.starts_on || !values.ends_on) {
    return { error: 'Name and period are required.' };
  }

  const { error } = id
    ? await supabase.from('performance_cycles').update(values).eq('id', id)
    : await supabase.from('performance_cycles').insert({ tenant_id: tenantId, ...values });
  if (error) {
    return { error: error.message.includes('duplicate') ? 'A cycle with this name exists.' : error.message };
  }
  await logAudit(supabase, {
    tenantId, actorUserId: user.id,
    action: `performance_cycle.${id ? 'updated' : 'created'}`,
    entityType: 'performance_cycle', entityId: id, after: values,
  });
  revalidatePath(PATH);
  return { success: true };
}

export async function saveGoal(_p: PerformanceFormState, f: FormData): Promise<PerformanceFormState> {
  // Managing performance goals is a manager/HR function — base employees
  // (people.employee.self only) must not create or edit anyone's goals.
  const auth = await requirePermission('people.employee.read');
  if ('error' in auth) return { error: auth.error };
  const { supabase, tenantId, user } = auth;

  const id = opt(f, 'id');
  const values = {
    cycle_id: str(f, 'cycle_id'),
    employee_id: str(f, 'employee_id'),
    title: str(f, 'title'),
    description: opt(f, 'description'),
    weight: num(f, 'weight') ?? 25,
    status: str(f, 'status') || 'on_track',
  };
  if (!values.cycle_id || !values.employee_id || !values.title) {
    return { error: 'Cycle, employee and goal title are required.' };
  }

  const { error } = id
    ? await supabase
        .from('performance_goals')
        .update({ title: values.title, description: values.description, weight: values.weight, status: values.status })
        .eq('id', id)
        .eq('tenant_id', tenantId)
    : await supabase
        .from('performance_goals')
        .insert({ tenant_id: tenantId, created_by: user.id, ...values });
  if (error) return { error: error.message };

  revalidatePath(PATH);
  return { success: true };
}

export async function submitReview(_p: PerformanceFormState, f: FormData): Promise<PerformanceFormState> {
  const auth = await requirePermission('time.leave.request');
  if ('error' in auth) return { error: auth.error };
  const { supabase, tenantId, user } = auth;

  const reviewType = str(f, 'review_type');
  const rating = num(f, 'rating');
  const employeeId = str(f, 'employee_id');
  const cycleId = str(f, 'cycle_id');
  if (!['self', 'manager'].includes(reviewType)) return { error: 'Invalid review type.' };
  if (!rating || rating < 1 || rating > 5) return { error: 'Rating must be 1–5.' };

  // Self reviews only for your own record; manager reviews need approve rights.
  if (reviewType === 'self') {
    const { data: me } = await supabase
      .from('employees')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();
    if (me?.id !== employeeId) return { error: 'Self reviews can only be written for yourself.' };
  } else if (!auth.permissions.has('people.action.approve') && !auth.permissions.has('time.leave.approve')) {
    return { error: 'Manager reviews need manager or HR permissions.' };
  }

  const { error } = await supabase.from('performance_reviews').upsert(
    {
      tenant_id: tenantId,
      cycle_id: cycleId,
      employee_id: employeeId,
      reviewer_user_id: user.id,
      review_type: reviewType,
      rating,
      strengths: opt(f, 'strengths'),
      improvements: opt(f, 'improvements'),
      status: 'submitted',
    },
    { onConflict: 'cycle_id,employee_id,review_type' },
  );
  if (error) return { error: error.message };

  await logAudit(supabase, {
    tenantId, actorUserId: user.id, action: `performance_review.${reviewType}`,
    entityType: 'performance_review',
    after: { cycle_id: cycleId, employee_id: employeeId, rating },
  });
  revalidatePath(PATH);
  return { success: true };
}
