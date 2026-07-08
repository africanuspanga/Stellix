import type { SupabaseClient } from '@supabase/supabase-js';

// Offboarding effectuation (blueprint §2.11). Closing a case is the moment
// the exit becomes real: employee status, effective-dated history closure,
// position vacancy and the exit employment action all happen together.

export const STANDARD_OFFBOARDING_TASKS = [
  { title: 'HR review of exit terms', assignee_role: 'hr', sort_order: 1 },
  { title: 'Handover of duties documented', assignee_role: 'manager', sort_order: 2 },
  { title: 'Company assets returned', assignee_role: 'facilities', sort_order: 3 },
  { title: 'System access removed', assignee_role: 'it', sort_order: 4 },
  { title: 'Final payroll prepared (final settlement)', assignee_role: 'payroll', sort_order: 5 },
  { title: 'Exit interview conducted', assignee_role: 'hr', sort_order: 6 },
  { title: 'Certificate of service issued', assignee_role: 'hr', sort_order: 7 },
];

export interface CloseCaseResult {
  exitActionId: string;
}

/**
 * Close an offboarding case: requires all tasks completed/skipped. Writes the
 * exit action, exits the employee, closes current assignment/compensation on
 * the last working day, and vacates the position.
 */
export async function closeOffboardingCase(
  supabase: SupabaseClient,
  input: { caseId: string; actorUserId: string },
): Promise<CloseCaseResult> {
  const { data: offboardingCase } = await supabase
    .from('offboarding_cases')
    .select('*')
    .eq('id', input.caseId)
    .maybeSingle();
  if (!offboardingCase) throw new Error('Case not found.');
  if (['closed', 'cancelled'].includes(offboardingCase.status as string)) {
    throw new Error(`Case is already ${offboardingCase.status}.`);
  }

  const { data: openTasks } = await supabase
    .from('offboarding_tasks')
    .select('id')
    .eq('case_id', input.caseId)
    .eq('status', 'pending');
  if ((openTasks?.length ?? 0) > 0) {
    throw new Error(`${openTasks!.length} clearance task(s) still pending — complete or skip them first.`);
  }

  const employeeId = offboardingCase.employee_id as string;
  const tenantId = offboardingCase.tenant_id as string;
  const lastDay = offboardingCase.last_working_day as string;

  const { data: action, error: actionError } = await supabase
    .from('employment_actions')
    .insert({
      tenant_id: tenantId,
      employee_id: employeeId,
      action_type: 'exit',
      status: 'effected',
      effective_date: lastDay,
      details: { exit_type: offboardingCase.exit_type, case_id: input.caseId },
      reason: offboardingCase.reason,
      requested_by: offboardingCase.initiated_by,
      approved_by: input.actorUserId,
      approved_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (actionError) throw new Error(actionError.message);

  // Close effective-dated history; vacate the position.
  const { data: currentAssignment } = await supabase
    .from('employee_assignments')
    .select('id, position_id')
    .eq('employee_id', employeeId)
    .is('effective_to', null)
    .maybeSingle();
  if (currentAssignment) {
    await supabase
      .from('employee_assignments')
      .update({ effective_to: lastDay })
      .eq('id', currentAssignment.id);
    if (currentAssignment.position_id) {
      await supabase
        .from('positions')
        .update({ status: 'vacant' })
        .eq('id', currentAssignment.position_id);
    }
  }
  await supabase
    .from('employee_compensation')
    .update({ effective_to: lastDay })
    .eq('employee_id', employeeId)
    .is('effective_to', null);

  await supabase
    .from('employees')
    .update({ status: 'exited', exit_date: lastDay })
    .eq('id', employeeId);

  await supabase
    .from('offboarding_cases')
    .update({ status: 'closed', closed_at: new Date().toISOString() })
    .eq('id', input.caseId);

  return { exitActionId: action.id as string };
}
