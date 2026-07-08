import type { SupabaseClient } from '@supabase/supabase-js';

// Reusable workflow engine v1 (blueprint §8.3). Sequential steps; approvers
// resolve to a specific user (the employee's manager, or a delegate) or to a
// role (any holder in the tenant may act). Framework-free so leave, expenses,
// payroll and the E2E suite all drive the same code.

export interface StartWorkflowInput {
  tenantId: string;
  entityType: string;   // e.g. 'leave_request'
  entityId: string;
  /** Employee the request concerns — used to resolve 'manager' steps. */
  employeeId?: string;
  createdBy: string;
}

export interface WorkflowResult {
  instanceId: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
}

async function resolveManagerUserId(
  supabase: SupabaseClient,
  employeeId: string,
): Promise<string | null> {
  const { data: assignment } = await supabase
    .from('employee_assignments')
    .select('manager_employee_id')
    .eq('employee_id', employeeId)
    .is('effective_to', null)
    .maybeSingle();
  if (!assignment?.manager_employee_id) return null;
  const { data: manager } = await supabase
    .from('employees')
    .select('user_id')
    .eq('id', assignment.manager_employee_id)
    .maybeSingle();
  return (manager?.user_id as string | null) ?? null;
}

async function fallbackRoleId(supabase: SupabaseClient, tenantId: string): Promise<string | null> {
  const { data } = await supabase
    .from('roles')
    .select('id, name')
    .eq('tenant_id', tenantId)
    .in('name', ['hr_manager', 'admin'])
    .order('name'); // admin first, hr_manager second
  const hr = data?.find((r) => r.name === 'hr_manager');
  return (hr?.id as string) ?? (data?.[0]?.id as string) ?? null;
}

/**
 * Create a workflow instance for an entity. Uses the tenant's active
 * definition for the entity type; when none exists, falls back to a single
 * manager-approval step (role fallback when the employee has no manager
 * with a portal account).
 */
export async function startWorkflow(
  supabase: SupabaseClient,
  input: StartWorkflowInput,
): Promise<WorkflowResult> {
  const { data: definition } = await supabase
    .from('workflow_definitions')
    .select('id, workflow_steps(step_order, approver_type, approver_role_id, sla_hours)')
    .eq('tenant_id', input.tenantId)
    .eq('entity_type', input.entityType)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  type StepDef = {
    step_order: number;
    approver_type: 'manager' | 'role';
    approver_role_id: string | null;
    sla_hours: number | null;
  };
  let steps = ((definition?.workflow_steps ?? []) as StepDef[]).sort(
    (a, b) => a.step_order - b.step_order,
  );
  if (steps.length === 0) {
    steps = [{ step_order: 1, approver_type: 'manager', approver_role_id: null, sla_hours: null }];
  }

  const { data: instance, error: instanceError } = await supabase
    .from('workflow_instances')
    .insert({
      tenant_id: input.tenantId,
      definition_id: definition?.id ?? null,
      entity_type: input.entityType,
      entity_id: input.entityId,
      status: 'pending',
      current_step: 1,
      total_steps: steps.length,
      created_by: input.createdBy,
    })
    .select('id')
    .single();
  if (instanceError) throw new Error(`Workflow start failed: ${instanceError.message}`);

  const roleFallback = await fallbackRoleId(supabase, input.tenantId);
  const actions = [];
  for (const step of steps) {
    let assignedUserId: string | null = null;
    let assignedRoleId: string | null = null;
    if (step.approver_type === 'manager') {
      assignedUserId = input.employeeId
        ? await resolveManagerUserId(supabase, input.employeeId)
        : null;
      // Self-approval guard and missing-manager fallback → role.
      if (!assignedUserId || assignedUserId === input.createdBy) {
        assignedUserId = null;
        assignedRoleId = roleFallback;
      }
    } else {
      assignedRoleId = step.approver_role_id ?? roleFallback;
    }
    actions.push({
      tenant_id: input.tenantId,
      instance_id: instance.id,
      step_order: step.step_order,
      approver_type: step.approver_type,
      assigned_user_id: assignedUserId,
      assigned_role_id: assignedRoleId,
      sla_hours: step.sla_hours,
      status: step.step_order === 1 ? 'pending' : 'waiting',
    });
  }
  const { error: actionsError } = await supabase.from('workflow_step_actions').insert(actions);
  if (actionsError) throw new Error(`Workflow steps failed: ${actionsError.message}`);

  return { instanceId: instance.id as string, status: 'pending' };
}

export interface ActInput {
  stepActionId: string;
  decision: 'approved' | 'rejected';
  actorUserId: string;
  comment?: string;
}

/** May this user act on the step? Assigned directly, or holds the assigned role. */
export async function canAct(
  supabase: SupabaseClient,
  step: { tenant_id: string; assigned_user_id: string | null; assigned_role_id: string | null },
  userId: string,
): Promise<boolean> {
  if (step.assigned_user_id) return step.assigned_user_id === userId;
  if (!step.assigned_role_id) return false;
  const { data } = await supabase
    .from('user_roles')
    .select('role_id')
    .eq('tenant_id', step.tenant_id)
    .eq('user_id', userId)
    .eq('role_id', step.assigned_role_id);
  return (data?.length ?? 0) > 0;
}

/**
 * Approve or reject a pending step. Advances the instance to the next step,
 * or completes it (returning the final status) on the last step / rejection.
 */
export async function actOnStep(
  supabase: SupabaseClient,
  input: ActInput,
): Promise<WorkflowResult> {
  const { data: step } = await supabase
    .from('workflow_step_actions')
    .select('*')
    .eq('id', input.stepActionId)
    .maybeSingle();
  if (!step) throw new Error('Approval step not found.');
  if (step.status !== 'pending') throw new Error('This step is not awaiting a decision.');
  if (!(await canAct(supabase, step, input.actorUserId))) {
    throw new Error('You are not the assigned approver for this step.');
  }

  const { error: stepError } = await supabase
    .from('workflow_step_actions')
    .update({
      status: input.decision,
      acted_by: input.actorUserId,
      acted_at: new Date().toISOString(),
      comment: input.comment ?? null,
    })
    .eq('id', input.stepActionId);
  if (stepError) throw new Error(stepError.message);

  const instanceId = step.instance_id as string;
  const { data: instance } = await supabase
    .from('workflow_instances')
    .select('*')
    .eq('id', instanceId)
    .single();

  if (input.decision === 'rejected') {
    await supabase
      .from('workflow_instances')
      .update({ status: 'rejected', completed_at: new Date().toISOString() })
      .eq('id', instanceId);
    // Skip any remaining steps.
    await supabase
      .from('workflow_step_actions')
      .update({ status: 'skipped' })
      .eq('instance_id', instanceId)
      .eq('status', 'waiting');
    return { instanceId, status: 'rejected' };
  }

  const nextStep = (step.step_order as number) + 1;
  if (nextStep > (instance.total_steps as number)) {
    await supabase
      .from('workflow_instances')
      .update({ status: 'approved', completed_at: new Date().toISOString() })
      .eq('id', instanceId);
    return { instanceId, status: 'approved' };
  }

  await supabase
    .from('workflow_instances')
    .update({ current_step: nextStep })
    .eq('id', instanceId);
  await supabase
    .from('workflow_step_actions')
    .update({ status: 'pending' })
    .eq('instance_id', instanceId)
    .eq('step_order', nextStep);
  return { instanceId, status: 'pending' };
}

/** Delegate a pending step to another user (keeps the audit trail). */
export async function delegateStep(
  supabase: SupabaseClient,
  input: { stepActionId: string; toUserId: string; actorUserId: string; comment?: string },
): Promise<void> {
  const { data: step } = await supabase
    .from('workflow_step_actions')
    .select('*')
    .eq('id', input.stepActionId)
    .maybeSingle();
  if (!step) throw new Error('Approval step not found.');
  if (step.status !== 'pending') throw new Error('This step is not awaiting a decision.');
  if (!(await canAct(supabase, step, input.actorUserId))) {
    throw new Error('You are not the assigned approver for this step.');
  }

  // Record the delegation on the old row, then open a fresh pending row for
  // the delegate at the same step order is not possible (unique constraint) —
  // instead reassign in place and keep the trace in delegated_to/comment.
  const { error } = await supabase
    .from('workflow_step_actions')
    .update({
      assigned_user_id: input.toUserId,
      assigned_role_id: null,
      delegated_to: input.toUserId,
      comment: input.comment ?? `Delegated by ${input.actorUserId}`,
    })
    .eq('id', input.stepActionId);
  if (error) throw new Error(error.message);
}
