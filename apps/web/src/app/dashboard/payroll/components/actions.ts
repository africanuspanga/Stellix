'use server';

import { revalidatePath } from 'next/cache';
import { requirePermission } from '@/lib/authz';
import { logAudit } from '@/lib/audit';

export interface PayrollFormState {
  error?: string;
  success?: boolean;
}

const PATH = '/dashboard/payroll';

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

export async function savePayComponent(
  _p: PayrollFormState,
  f: FormData,
): Promise<PayrollFormState> {
  const auth = await requirePermission('payroll.compensation.manage');
  if ('error' in auth) return { error: auth.error };
  const { supabase, tenantId, user } = auth;

  const id = opt(f, 'id');
  const values = {
    name: str(f, 'name'),
    code: str(f, 'code').toUpperCase(),
    component_type: str(f, 'component_type') || 'earning',
    calc_type: str(f, 'calc_type') || 'fixed',
    default_amount: num(f, 'default_amount'),
    taxable: str(f, 'taxable') !== 'false',
    pensionable: str(f, 'pensionable') === 'true',
    is_active: str(f, 'is_active') !== 'false',
  };
  if (!values.name || !values.code) return { error: 'Name and code are required.' };
  if (!['earning', 'deduction'].includes(values.component_type)) return { error: 'Invalid type.' };

  const { error } = id
    ? await supabase.from('pay_components').update(values).eq('id', id)
    : await supabase.from('pay_components').insert({ tenant_id: tenantId, ...values });
  if (error) {
    return { error: error.message.includes('duplicate') ? 'A component with this code exists.' : error.message };
  }

  await logAudit(supabase, {
    tenantId, actorUserId: user.id,
    action: `pay_component.${id ? 'updated' : 'created'}`,
    entityType: 'pay_component', entityId: id, after: values,
  });
  revalidatePath(PATH, 'layout');
  return { success: true };
}

export async function assignPayComponent(
  _p: PayrollFormState,
  f: FormData,
): Promise<PayrollFormState> {
  const auth = await requirePermission('payroll.compensation.manage');
  if ('error' in auth) return { error: auth.error };
  const { supabase, tenantId, user } = auth;

  const employeeId = str(f, 'employee_id');
  const componentId = str(f, 'pay_component_id');
  const effectiveFrom = str(f, 'effective_from');
  if (!employeeId || !componentId || !effectiveFrom) {
    return { error: 'Employee, component and effective date are required.' };
  }

  // Close any open assignment of the same component (effective-dated history).
  const { data: open } = await supabase
    .from('employee_pay_components')
    .select('id, effective_from')
    .eq('employee_id', employeeId)
    .eq('pay_component_id', componentId)
    .is('effective_to', null)
    .maybeSingle();
  if (open) {
    if (open.effective_from >= effectiveFrom) {
      return { error: 'An assignment already starts on or after this date.' };
    }
    const dayBefore = new Date(`${effectiveFrom}T00:00:00Z`);
    dayBefore.setUTCDate(dayBefore.getUTCDate() - 1);
    await supabase
      .from('employee_pay_components')
      .update({ effective_to: dayBefore.toISOString().slice(0, 10) })
      .eq('id', open.id);
  }

  const { error } = await supabase.from('employee_pay_components').insert({
    tenant_id: tenantId,
    employee_id: employeeId,
    pay_component_id: componentId,
    amount: num(f, 'amount'),
    effective_from: effectiveFrom,
  });
  if (error) return { error: error.message };

  await logAudit(supabase, {
    tenantId, actorUserId: user.id, action: 'pay_component.assigned',
    entityType: 'employee_pay_component',
    after: { employee_id: employeeId, pay_component_id: componentId, effective_from: effectiveFrom },
  });
  revalidatePath(PATH, 'layout');
  return { success: true };
}

export async function endPayComponentAssignment(
  _p: PayrollFormState,
  f: FormData,
): Promise<PayrollFormState> {
  const auth = await requirePermission('payroll.compensation.manage');
  if ('error' in auth) return { error: auth.error };
  const { supabase, tenantId, user } = auth;

  const id = str(f, 'id');
  const effectiveTo = str(f, 'effective_to');
  if (!id || !effectiveTo) return { error: 'End date is required.' };

  const { error } = await supabase
    .from('employee_pay_components')
    .update({ effective_to: effectiveTo })
    .eq('id', id)
    .is('effective_to', null);
  if (error) return { error: error.message };

  await logAudit(supabase, {
    tenantId, actorUserId: user.id, action: 'pay_component.assignment_ended',
    entityType: 'employee_pay_component', entityId: id, after: { effective_to: effectiveTo },
  });
  revalidatePath(PATH, 'layout');
  return { success: true };
}
