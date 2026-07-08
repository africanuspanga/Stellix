'use server';

import { revalidatePath } from 'next/cache';
import { requirePermission } from '@/lib/authz';
import { logAudit } from '@/lib/audit';
import {
  closeOffboardingCase,
  STANDARD_OFFBOARDING_TASKS,
} from '@/lib/people/offboarding';

export interface OffboardingFormState {
  error?: string;
  success?: boolean;
}

const PATH = '/dashboard/people/offboarding';

function str(f: FormData, key: string): string {
  return String(f.get(key) ?? '').trim();
}
function opt(f: FormData, key: string): string | null {
  const v = str(f, key);
  return v === '' ? null : v;
}

export async function initiateCase(_p: OffboardingFormState, f: FormData): Promise<OffboardingFormState> {
  const auth = await requirePermission('people.employee.write');
  if ('error' in auth) return { error: auth.error };
  const { supabase, tenantId, user } = auth;

  const employeeId = str(f, 'employee_id');
  const exitType = str(f, 'exit_type');
  const noticeDate = str(f, 'notice_date');
  const lastWorkingDay = str(f, 'last_working_day');
  if (!employeeId || !exitType || !noticeDate || !lastWorkingDay) {
    return { error: 'Employee, exit type and dates are required.' };
  }
  if (lastWorkingDay < noticeDate) return { error: 'Last working day cannot be before notice.' };

  const { data: existing } = await supabase
    .from('offboarding_cases')
    .select('id')
    .eq('employee_id', employeeId)
    .not('status', 'in', '("closed","cancelled")')
    .limit(1);
  if ((existing?.length ?? 0) > 0) return { error: 'An open offboarding case already exists.' };

  const { data: created, error } = await supabase
    .from('offboarding_cases')
    .insert({
      tenant_id: tenantId,
      employee_id: employeeId,
      exit_type: exitType,
      notice_date: noticeDate,
      last_working_day: lastWorkingDay,
      reason: opt(f, 'reason'),
      initiated_by: user.id,
      status: 'clearance',
    })
    .select('id')
    .single();
  if (error) return { error: error.message };

  await supabase.from('offboarding_tasks').insert(
    STANDARD_OFFBOARDING_TASKS.map((task) => ({
      tenant_id: tenantId,
      case_id: created.id,
      ...task,
    })),
  );
  await supabase.from('employees').update({ status: 'exiting' }).eq('id', employeeId);

  await logAudit(supabase, {
    tenantId, actorUserId: user.id, action: 'offboarding.initiated',
    entityType: 'offboarding_case', entityId: created.id,
    after: { employee_id: employeeId, exit_type: exitType, last_working_day: lastWorkingDay },
  });
  revalidatePath(PATH);
  return { success: true };
}

export async function setOffboardingTask(taskId: string, status: 'completed' | 'pending'): Promise<void> {
  const auth = await requirePermission('people.employee.write');
  if ('error' in auth) return;
  const { supabase, user } = auth;
  await supabase
    .from('offboarding_tasks')
    .update(
      status === 'completed'
        ? { status, completed_by: user.id, completed_at: new Date().toISOString() }
        : { status, completed_by: null, completed_at: null },
    )
    .eq('id', taskId);
  revalidatePath(PATH);
}

export async function closeCase(_p: OffboardingFormState, f: FormData): Promise<OffboardingFormState> {
  const auth = await requirePermission('people.action.approve');
  if ('error' in auth) return { error: auth.error };
  const { supabase, tenantId, user } = auth;

  const caseId = str(f, 'case_id');
  let result;
  try {
    result = await closeOffboardingCase(supabase, { caseId, actorUserId: user.id });
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Close failed.' };
  }

  await logAudit(supabase, {
    tenantId, actorUserId: user.id, action: 'offboarding.closed',
    entityType: 'offboarding_case', entityId: caseId,
    after: { exit_action_id: result.exitActionId },
  });
  revalidatePath(PATH, 'layout');
  return { success: true };
}

export async function cancelCase(_p: OffboardingFormState, f: FormData): Promise<OffboardingFormState> {
  const auth = await requirePermission('people.action.approve');
  if ('error' in auth) return { error: auth.error };
  const { supabase, tenantId, user } = auth;

  const caseId = str(f, 'case_id');
  const { data: offboardingCase } = await supabase
    .from('offboarding_cases')
    .select('id, employee_id, status')
    .eq('id', caseId)
    .maybeSingle();
  if (!offboardingCase) return { error: 'Case not found.' };
  if (['closed', 'cancelled'].includes(offboardingCase.status as string)) {
    return { error: `Case is already ${offboardingCase.status}.` };
  }

  await supabase.from('offboarding_cases').update({ status: 'cancelled' }).eq('id', caseId);
  await supabase.from('employees').update({ status: 'active' }).eq('id', offboardingCase.employee_id);

  await logAudit(supabase, {
    tenantId, actorUserId: user.id, action: 'offboarding.cancelled',
    entityType: 'offboarding_case', entityId: caseId,
  });
  revalidatePath(PATH, 'layout');
  return { success: true };
}
