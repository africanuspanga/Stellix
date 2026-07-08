'use server';

import { revalidatePath } from 'next/cache';
import { requirePermission } from '@/lib/authz';
import { logAudit } from '@/lib/audit';

export interface WorkflowSettingsState {
  error?: string;
  success?: boolean;
}

const PATH = '/dashboard/settings/workflows';
const ENTITY_TYPES = ['leave_request']; // expenses, payroll_run… join in later sprints

function str(f: FormData, key: string): string {
  return String(f.get(key) ?? '').trim();
}
function opt(f: FormData, key: string): string | null {
  const v = str(f, key);
  return v === '' ? null : v;
}

export async function saveWorkflowDefinition(
  _p: WorkflowSettingsState,
  f: FormData,
): Promise<WorkflowSettingsState> {
  const auth = await requirePermission('settings.tenant.manage');
  if ('error' in auth) return { error: auth.error };
  const { supabase, tenantId, user } = auth;

  const id = opt(f, 'id');
  const entityType = str(f, 'entity_type') || 'leave_request';
  const name = str(f, 'name');
  if (!name) return { error: 'Name is required.' };
  if (!ENTITY_TYPES.includes(entityType)) return { error: 'Invalid entity type.' };
  const isActive = str(f, 'is_active') !== 'false';

  if (isActive) {
    // One active definition per entity type keeps resolution deterministic.
    await supabase
      .from('workflow_definitions')
      .update({ is_active: false })
      .eq('tenant_id', tenantId)
      .eq('entity_type', entityType)
      .neq('id', id ?? '00000000-0000-0000-0000-000000000000');
  }

  const { error } = id
    ? await supabase
        .from('workflow_definitions')
        .update({ name, entity_type: entityType, is_active: isActive })
        .eq('id', id)
    : await supabase
        .from('workflow_definitions')
        .insert({ tenant_id: tenantId, name, entity_type: entityType, is_active: isActive });
  if (error) return { error: error.message };

  await logAudit(supabase, {
    tenantId, actorUserId: user.id,
    action: `workflow_definition.${id ? 'updated' : 'created'}`,
    entityType: 'workflow_definition', entityId: id,
    after: { name, entity_type: entityType, is_active: isActive },
  });
  revalidatePath(PATH);
  return { success: true };
}

export async function saveWorkflowStep(
  _p: WorkflowSettingsState,
  f: FormData,
): Promise<WorkflowSettingsState> {
  const auth = await requirePermission('settings.tenant.manage');
  if ('error' in auth) return { error: auth.error };
  const { supabase, tenantId } = auth;

  const definitionId = str(f, 'definition_id');
  const id = opt(f, 'id');
  const approverType = str(f, 'approver_type');
  if (!['manager', 'role'].includes(approverType)) return { error: 'Invalid approver type.' };
  const roleId = opt(f, 'approver_role_id');
  if (approverType === 'role' && !roleId) return { error: 'Choose the approving role.' };

  const values = {
    step_order: Number(str(f, 'step_order') || '1'),
    approver_type: approverType,
    approver_role_id: approverType === 'role' ? roleId : null,
    sla_hours: str(f, 'sla_hours') ? Number(str(f, 'sla_hours')) : null,
  };

  const { error } = id
    ? await supabase.from('workflow_steps').update(values).eq('id', id)
    : await supabase
        .from('workflow_steps')
        .insert({ tenant_id: tenantId, definition_id: definitionId, ...values });
  if (error) {
    return {
      error: error.message.includes('duplicate')
        ? 'A step with this order already exists in the definition.'
        : error.message,
    };
  }
  revalidatePath(PATH);
  return { success: true };
}
