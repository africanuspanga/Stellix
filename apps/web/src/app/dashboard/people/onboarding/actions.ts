'use server';

import { revalidatePath } from 'next/cache';
import { requirePermission } from '@/lib/authz';
import { logAudit } from '@/lib/audit';

export interface OnboardingFormState {
  error?: string;
  success?: boolean;
}

const PATH = '/dashboard/people/onboarding';

function str(f: FormData, key: string): string {
  return String(f.get(key) ?? '').trim();
}
function opt(f: FormData, key: string): string | null {
  const v = str(f, key);
  return v === '' ? null : v;
}

export async function saveTemplate(
  _p: OnboardingFormState,
  f: FormData,
): Promise<OnboardingFormState> {
  const auth = await requirePermission('people.employee.write');
  if ('error' in auth) return { error: auth.error };
  const { supabase, tenantId, user } = auth;

  const name = str(f, 'name');
  if (!name) return { error: 'Template name is required.' };
  const id = opt(f, 'id');

  if (id) {
    const { error } = await supabase
      .from('onboarding_templates')
      .update({ name, description: opt(f, 'description'), is_active: str(f, 'is_active') !== 'false' })
      .eq('id', id);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase
      .from('onboarding_templates')
      .insert({ tenant_id: tenantId, name, description: opt(f, 'description') });
    if (error) {
      return { error: error.message.includes('duplicate') ? 'A template with this name exists.' : error.message };
    }
  }

  await logAudit(supabase, {
    tenantId,
    actorUserId: user.id,
    action: `onboarding_template.${id ? 'updated' : 'created'}`,
    entityType: 'onboarding_template',
    entityId: id,
    after: { name },
  });
  revalidatePath(PATH);
  return { success: true };
}

export async function saveTemplateTask(
  _p: OnboardingFormState,
  f: FormData,
): Promise<OnboardingFormState> {
  const auth = await requirePermission('people.employee.write');
  if ('error' in auth) return { error: auth.error };
  const { supabase, tenantId } = auth;

  const templateId = str(f, 'template_id');
  const title = str(f, 'title');
  if (!title) return { error: 'Task title is required.' };
  const id = opt(f, 'id');

  const values = {
    title,
    description: opt(f, 'description'),
    assignee_role: str(f, 'assignee_role') || 'hr',
    due_days_after_start: Number(str(f, 'due_days_after_start') || '0'),
    sort_order: Number(str(f, 'sort_order') || '0'),
  };

  const { error } = id
    ? await supabase.from('onboarding_template_tasks').update(values).eq('id', id)
    : await supabase
        .from('onboarding_template_tasks')
        .insert({ tenant_id: tenantId, template_id: templateId, ...values });
  if (error) return { error: error.message };

  revalidatePath(PATH);
  return { success: true };
}

/** Assign a template to an employee: creates one task instance per template task. */
export async function assignTemplate(
  _p: OnboardingFormState,
  f: FormData,
): Promise<OnboardingFormState> {
  const auth = await requirePermission('people.employee.write');
  if ('error' in auth) return { error: auth.error };
  const { supabase, tenantId, user } = auth;

  const employeeId = str(f, 'employee_id');
  const templateId = str(f, 'template_id');
  if (!employeeId || !templateId) return { error: 'Employee and template are required.' };

  const [{ data: employee }, { data: tasks }] = await Promise.all([
    supabase.from('employees').select('id, hire_date').eq('id', employeeId).maybeSingle(),
    supabase
      .from('onboarding_template_tasks')
      .select('*')
      .eq('template_id', templateId)
      .order('sort_order'),
  ]);
  if (!employee) return { error: 'Employee not found.' };
  if (!tasks || tasks.length === 0) return { error: 'This template has no tasks yet.' };

  const baseDate = new Date(`${employee.hire_date}T00:00:00Z`);
  const instances = tasks.map((task) => {
    const due = new Date(baseDate);
    due.setUTCDate(due.getUTCDate() + (task.due_days_after_start as number));
    return {
      tenant_id: tenantId,
      employee_id: employeeId,
      template_id: templateId,
      title: task.title,
      description: task.description,
      assignee_role: task.assignee_role,
      due_date: due.toISOString().slice(0, 10),
      sort_order: task.sort_order,
    };
  });

  const { error } = await supabase.from('employee_onboarding_tasks').insert(instances);
  if (error) return { error: error.message };

  await logAudit(supabase, {
    tenantId,
    actorUserId: user.id,
    action: 'onboarding.assigned',
    entityType: 'employee_onboarding',
    entityId: employeeId,
    after: { template_id: templateId, tasks: instances.length },
  });
  revalidatePath(PATH);
  return { success: true };
}

export async function setTaskStatus(taskId: string, status: 'completed' | 'pending'): Promise<void> {
  const auth = await requirePermission('people.employee.write');
  if ('error' in auth) return;
  const { supabase, user } = auth;

  await supabase
    .from('employee_onboarding_tasks')
    .update(
      status === 'completed'
        ? { status, completed_by: user.id, completed_at: new Date().toISOString() }
        : { status, completed_by: null, completed_at: null },
    )
    .eq('id', taskId);
  revalidatePath(PATH);
}
