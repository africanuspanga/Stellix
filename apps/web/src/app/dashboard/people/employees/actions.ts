'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { randomUUID } from 'node:crypto';
import { requirePermission, type ActionContext } from '@/lib/authz';
import { logAudit } from '@/lib/audit';

export interface PeopleFormState {
  error?: string;
  success?: boolean;
}

const PEOPLE_PATH = '/dashboard/people/employees';

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

/** effective_to for the closed row: the day before the new effective_from. */
function dayBefore(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

async function nextEmployeeNumber(auth: ActionContext): Promise<string> {
  const { count } = await auth.supabase
    .from('employees')
    .select('id', { count: 'exact', head: true });
  return `EMP-${String((count ?? 0) + 1).padStart(4, '0')}`;
}

// ── Hire ─────────────────────────────────────────────────────────────────
export async function createEmployee(
  _prev: PeopleFormState,
  f: FormData,
): Promise<PeopleFormState> {
  const auth = await requirePermission('people.employee.write');
  if ('error' in auth) return { error: auth.error };
  const { supabase, tenantId, user } = auth;

  const firstName = str(f, 'first_name');
  const lastName = str(f, 'last_name');
  const legalEntityId = str(f, 'legal_entity_id');
  const hireDate = str(f, 'hire_date');
  if (!firstName || !lastName) return { error: 'First and last name are required.' };
  if (!legalEntityId) return { error: 'Legal entity is required.' };
  if (!hireDate) return { error: 'Hire date is required.' };

  const positionId = opt(f, 'position_id');
  const basicSalary = num(f, 'basic_salary');

  let employeeNumber = opt(f, 'employee_number') ?? (await nextEmployeeNumber(auth));

  // Insert employee; retry once with a bumped number on duplicate.
  let employeeId = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data, error } = await supabase
      .from('employees')
      .insert({
        tenant_id: tenantId,
        legal_entity_id: legalEntityId,
        employee_number: employeeNumber,
        first_name: firstName,
        middle_name: opt(f, 'middle_name'),
        last_name: lastName,
        gender: opt(f, 'gender'),
        date_of_birth: opt(f, 'date_of_birth'),
        national_id: opt(f, 'national_id'),
        tin: opt(f, 'tin'),
        nssf_number: opt(f, 'nssf_number'),
        personal_email: opt(f, 'personal_email'),
        work_email: opt(f, 'work_email'),
        phone: opt(f, 'phone'),
        physical_address: opt(f, 'physical_address'),
        status: str(f, 'status') || 'onboarding',
        employment_type: str(f, 'employment_type') || 'permanent',
        hire_date: hireDate,
        probation_end_date: opt(f, 'probation_end_date'),
      })
      .select('id')
      .single();
    if (!error) {
      employeeId = data.id as string;
      break;
    }
    if (error.message.includes('duplicate key') && attempt === 0) {
      employeeNumber = `${employeeNumber}-${Math.random().toString(36).slice(2, 5)}`;
      continue;
    }
    return { error: error.message };
  }

  // Hire action (record of the event, effected immediately).
  const details = {
    position_id: positionId,
    department_id: opt(f, 'department_id'),
    branch_id: opt(f, 'branch_id'),
    manager_employee_id: opt(f, 'manager_employee_id'),
    basic_salary: basicSalary,
  };
  const { data: action } = await supabase
    .from('employment_actions')
    .insert({
      tenant_id: tenantId,
      employee_id: employeeId,
      action_type: 'hire',
      status: 'effected',
      effective_date: hireDate,
      details,
      requested_by: user.id,
      approved_by: user.id,
      approved_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  const { error: assignError } = await supabase.from('employee_assignments').insert({
    tenant_id: tenantId,
    employee_id: employeeId,
    position_id: positionId,
    department_id: details.department_id,
    branch_id: details.branch_id,
    manager_employee_id: details.manager_employee_id,
    effective_from: hireDate,
    created_by_action_id: action?.id ?? null,
  });
  if (assignError) return { error: `Assignment failed: ${assignError.message}` };

  if (basicSalary !== null && basicSalary > 0) {
    await supabase.from('employee_compensation').insert({
      tenant_id: tenantId,
      employee_id: employeeId,
      basic_salary: basicSalary,
      currency: str(f, 'currency') || 'TZS',
      pay_frequency: 'monthly',
      effective_from: hireDate,
      created_by_action_id: action?.id ?? null,
    });
  }

  if (positionId) {
    await supabase.from('positions').update({ status: 'occupied' }).eq('id', positionId);
  }

  await logAudit(supabase, {
    tenantId,
    actorUserId: user.id,
    action: 'employee.created',
    entityType: 'employee',
    entityId: employeeId,
    after: { employee_number: employeeNumber, first_name: firstName, last_name: lastName, hire_date: hireDate, ...details },
  });

  revalidatePath(PEOPLE_PATH, 'layout');
  redirect(`${PEOPLE_PATH}/${employeeId}`);
}

// ── Update personal details ──────────────────────────────────────────────
export async function updateEmployeePersonal(
  _prev: PeopleFormState,
  f: FormData,
): Promise<PeopleFormState> {
  const auth = await requirePermission('people.employee.write');
  if ('error' in auth) return { error: auth.error };
  const { supabase, tenantId, user } = auth;

  const id = str(f, 'id');
  const { data: before } = await supabase
    .from('employees')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (!before) return { error: 'Employee not found.' };

  const values = {
    first_name: str(f, 'first_name') || before.first_name,
    middle_name: opt(f, 'middle_name'),
    last_name: str(f, 'last_name') || before.last_name,
    gender: opt(f, 'gender'),
    date_of_birth: opt(f, 'date_of_birth'),
    national_id: opt(f, 'national_id'),
    tin: opt(f, 'tin'),
    nssf_number: opt(f, 'nssf_number'),
    personal_email: opt(f, 'personal_email'),
    work_email: opt(f, 'work_email'),
    phone: opt(f, 'phone'),
    physical_address: opt(f, 'physical_address'),
    status: str(f, 'status') || before.status,
  };
  const { error } = await supabase.from('employees').update(values).eq('id', id);
  if (error) return { error: error.message };

  await logAudit(supabase, {
    tenantId,
    actorUserId: user.id,
    action: 'employee.updated',
    entityType: 'employee',
    entityId: id,
    before,
    after: values,
  });
  revalidatePath(`${PEOPLE_PATH}/${id}`);
  return { success: true };
}

// ── Employment actions (effective-dated changes) ─────────────────────────
const ACTION_TYPES = [
  'promotion', 'transfer', 'salary_adjustment', 'acting_appointment',
  'contract_renewal', 'probation_extension', 'probation_confirmation',
  'suspension', 'return_from_suspension', 'demotion', 'branch_transfer',
  'department_transfer', 'manager_change', 'cost_centre_change',
];

export async function createEmploymentAction(
  _prev: PeopleFormState,
  f: FormData,
): Promise<PeopleFormState> {
  const auth = await requirePermission('people.action.approve');
  if ('error' in auth) return { error: auth.error };
  const { supabase, tenantId, user } = auth;

  const employeeId = str(f, 'employee_id');
  const actionType = str(f, 'action_type');
  const effectiveDate = str(f, 'effective_date');
  if (!ACTION_TYPES.includes(actionType)) return { error: 'Invalid action type.' };
  if (!effectiveDate) return { error: 'Effective date is required.' };

  const newPositionId = opt(f, 'position_id');
  const newDepartmentId = opt(f, 'department_id');
  const newBranchId = opt(f, 'branch_id');
  const newManagerId = opt(f, 'manager_employee_id');
  const newSalary = num(f, 'basic_salary');
  const reason = opt(f, 'reason');

  const changesAssignment = Boolean(newPositionId || newDepartmentId || newBranchId || newManagerId);
  if (!changesAssignment && newSalary === null) {
    // Status-style actions (suspension, confirmation…) are still recorded.
    if (actionType === 'suspension') {
      await supabase.from('employees').update({ status: 'suspended' }).eq('id', employeeId);
    } else if (actionType === 'return_from_suspension' || actionType === 'probation_confirmation') {
      await supabase.from('employees').update({ status: 'active' }).eq('id', employeeId);
    }
  }

  const details = {
    position_id: newPositionId,
    department_id: newDepartmentId,
    branch_id: newBranchId,
    manager_employee_id: newManagerId,
    basic_salary: newSalary,
  };

  const { data: action, error: actionError } = await supabase
    .from('employment_actions')
    .insert({
      tenant_id: tenantId,
      employee_id: employeeId,
      action_type: actionType,
      status: 'effected',
      effective_date: effectiveDate,
      details,
      reason,
      requested_by: user.id,
      approved_by: user.id,
      approved_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (actionError) return { error: actionError.message };

  // Effectuate assignment change: close the current row, insert the merged one.
  if (changesAssignment) {
    const { data: current } = await supabase
      .from('employee_assignments')
      .select('*')
      .eq('employee_id', employeeId)
      .is('effective_to', null)
      .maybeSingle();

    if (current) {
      await supabase
        .from('employee_assignments')
        .update({ effective_to: dayBefore(effectiveDate) })
        .eq('id', current.id);
    }
    const { error: insertErr } = await supabase.from('employee_assignments').insert({
      tenant_id: tenantId,
      employee_id: employeeId,
      position_id: newPositionId ?? current?.position_id ?? null,
      department_id: newDepartmentId ?? current?.department_id ?? null,
      branch_id: newBranchId ?? current?.branch_id ?? null,
      cost_centre_id: current?.cost_centre_id ?? null,
      manager_employee_id: newManagerId ?? current?.manager_employee_id ?? null,
      effective_from: effectiveDate,
      created_by_action_id: action.id,
    });
    if (insertErr) return { error: `Assignment change failed: ${insertErr.message}` };

    // Position occupancy swap.
    if (newPositionId && current?.position_id && newPositionId !== current.position_id) {
      await supabase.from('positions').update({ status: 'vacant' }).eq('id', current.position_id);
    }
    if (newPositionId) {
      await supabase.from('positions').update({ status: 'occupied' }).eq('id', newPositionId);
    }
  }

  // Effectuate salary change: same pattern on compensation.
  if (newSalary !== null) {
    const { data: currentComp } = await supabase
      .from('employee_compensation')
      .select('*')
      .eq('employee_id', employeeId)
      .is('effective_to', null)
      .maybeSingle();
    if (currentComp) {
      await supabase
        .from('employee_compensation')
        .update({ effective_to: dayBefore(effectiveDate) })
        .eq('id', currentComp.id);
    }
    const { error: compErr } = await supabase.from('employee_compensation').insert({
      tenant_id: tenantId,
      employee_id: employeeId,
      basic_salary: newSalary,
      currency: currentComp?.currency ?? 'TZS',
      pay_frequency: currentComp?.pay_frequency ?? 'monthly',
      effective_from: effectiveDate,
      created_by_action_id: action.id,
    });
    if (compErr) return { error: `Salary change failed: ${compErr.message}` };
  }

  await logAudit(supabase, {
    tenantId,
    actorUserId: user.id,
    action: `employment_action.${actionType}`,
    entityType: 'employment_action',
    entityId: action.id,
    after: { employee_id: employeeId, effective_date: effectiveDate, ...details },
    reason: reason ?? undefined,
  });

  revalidatePath(`${PEOPLE_PATH}/${employeeId}`);
  return { success: true };
}

// ── Contracts / bank accounts / dependants (shared save pattern) ─────────
async function saveChild(input: {
  table: string;
  entityType: string;
  permission: string;
  id: string | null;
  employeeId: string;
  values: Record<string, unknown>;
}): Promise<PeopleFormState> {
  const auth = await requirePermission(input.permission);
  if ('error' in auth) return { error: auth.error };
  const { supabase, tenantId, user } = auth;

  let entityId = input.id;
  let before: unknown = null;
  if (input.id) {
    const { data: existing } = await supabase
      .from(input.table)
      .select('*')
      .eq('id', input.id)
      .maybeSingle();
    if (!existing) return { error: 'Record not found.' };
    before = existing;
    const { error } = await supabase.from(input.table).update(input.values).eq('id', input.id);
    if (error) return { error: error.message };
  } else {
    const { data, error } = await supabase
      .from(input.table)
      .insert({ tenant_id: tenantId, employee_id: input.employeeId, ...input.values })
      .select('id')
      .single();
    if (error) return { error: error.message };
    entityId = data.id as string;
  }

  await logAudit(supabase, {
    tenantId,
    actorUserId: user.id,
    action: `${input.entityType}.${input.id ? 'updated' : 'created'}`,
    entityType: input.entityType,
    entityId,
    before,
    after: input.values,
  });
  revalidatePath(`${PEOPLE_PATH}/${input.employeeId}`);
  return { success: true };
}

export async function saveContract(_p: PeopleFormState, f: FormData): Promise<PeopleFormState> {
  const startsOn = str(f, 'starts_on');
  if (!startsOn) return { error: 'Start date is required.' };
  return saveChild({
    table: 'employee_contracts',
    entityType: 'contract',
    permission: 'people.employee.write',
    id: opt(f, 'id'),
    employeeId: str(f, 'employee_id'),
    values: {
      contract_type: str(f, 'contract_type') || 'permanent',
      starts_on: startsOn,
      ends_on: opt(f, 'ends_on'),
      probation_months: num(f, 'probation_months'),
      status: str(f, 'status') || 'draft',
    },
  });
}

export async function saveBankAccount(_p: PeopleFormState, f: FormData): Promise<PeopleFormState> {
  const method = str(f, 'payment_method') || 'bank';
  if (method === 'bank' && !str(f, 'account_number'))
    return { error: 'Account number is required for bank payment.' };
  if (method === 'mobile_money' && !str(f, 'mobile_money_number'))
    return { error: 'Mobile money number is required.' };
  return saveChild({
    table: 'employee_bank_accounts',
    entityType: 'bank_account',
    permission: 'people.employee.write',
    id: opt(f, 'id'),
    employeeId: str(f, 'employee_id'),
    values: {
      payment_method: method,
      bank_name: opt(f, 'bank_name'),
      bank_branch: opt(f, 'bank_branch'),
      account_name: opt(f, 'account_name'),
      account_number: opt(f, 'account_number'),
      mobile_money_provider: opt(f, 'mobile_money_provider'),
      mobile_money_number: opt(f, 'mobile_money_number'),
      is_primary: str(f, 'is_primary') !== 'false',
      split_percentage: num(f, 'split_percentage') ?? 100,
    },
  });
}

export async function saveDependant(_p: PeopleFormState, f: FormData): Promise<PeopleFormState> {
  if (!str(f, 'full_name')) return { error: 'Full name is required.' };
  return saveChild({
    table: 'employee_dependants',
    entityType: 'dependant',
    permission: 'people.employee.write',
    id: opt(f, 'id'),
    employeeId: str(f, 'employee_id'),
    values: {
      full_name: str(f, 'full_name'),
      relationship: str(f, 'relationship') || 'other',
      date_of_birth: opt(f, 'date_of_birth'),
      is_emergency_contact: str(f, 'is_emergency_contact') === 'true',
      phone: opt(f, 'phone'),
    },
  });
}

// ── Documents ────────────────────────────────────────────────────────────
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export async function uploadDocument(
  _prev: PeopleFormState,
  f: FormData,
): Promise<PeopleFormState> {
  const auth = await requirePermission('people.employee.write');
  if ('error' in auth) return { error: auth.error };
  const { supabase, tenantId, user } = auth;

  const employeeId = str(f, 'employee_id');
  const file = f.get('file') as File | null;
  if (!file || file.size === 0) return { error: 'Choose a file to upload.' };
  if (file.size > MAX_UPLOAD_BYTES) return { error: 'File is larger than 10 MB.' };

  const safeName = file.name.replace(/[^\w.\-]+/g, '_').slice(-80);
  const storagePath = `${tenantId}/${employeeId}/${randomUUID()}-${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from('employee-documents')
    .upload(storagePath, file, { contentType: file.type || 'application/octet-stream' });
  if (uploadError) return { error: `Upload failed: ${uploadError.message}` };

  const { data: doc, error: insertError } = await supabase
    .from('employee_documents')
    .insert({
      tenant_id: tenantId,
      employee_id: employeeId,
      category: str(f, 'category') || 'other',
      name: str(f, 'name') || file.name,
      storage_path: storagePath,
      mime_type: file.type || null,
      size_bytes: file.size,
      expiry_date: opt(f, 'expiry_date'),
      uploaded_by: user.id,
    })
    .select('id')
    .single();
  if (insertError) {
    await supabase.storage.from('employee-documents').remove([storagePath]);
    return { error: insertError.message };
  }

  await logAudit(supabase, {
    tenantId,
    actorUserId: user.id,
    action: 'document.uploaded',
    entityType: 'employee_document',
    entityId: doc.id,
    after: { employee_id: employeeId, name: file.name, category: str(f, 'category') },
  });
  revalidatePath(`${PEOPLE_PATH}/${employeeId}`);
  return { success: true };
}
