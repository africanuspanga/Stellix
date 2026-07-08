'use server';

import { revalidatePath } from 'next/cache';
import { requirePermission } from '@/lib/authz';
import { logAudit } from '@/lib/audit';

export interface TalentFormState {
  error?: string;
  success?: boolean;
}

const PATH = '/dashboard/people/recruitment';
const STAGES = [
  'applied', 'screening', 'shortlisted', 'assessment', 'interview',
  'reference_check', 'offer', 'hired', 'rejected',
];

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

export async function saveRequisition(_p: TalentFormState, f: FormData): Promise<TalentFormState> {
  const auth = await requirePermission('people.employee.write');
  if ('error' in auth) return { error: auth.error };
  const { supabase, tenantId, user } = auth;

  const id = opt(f, 'id');
  const values = {
    title: str(f, 'title'),
    description: opt(f, 'description'),
    position_id: opt(f, 'position_id'),
    openings: num(f, 'openings') ?? 1,
    status: str(f, 'status') || 'open',
  };
  if (!values.title) return { error: 'Title is required.' };

  const { error } = id
    ? await supabase.from('job_requisitions').update(values).eq('id', id)
    : await supabase
        .from('job_requisitions')
        .insert({ tenant_id: tenantId, created_by: user.id, ...values });
  if (error) return { error: error.message };

  await logAudit(supabase, {
    tenantId, actorUserId: user.id,
    action: `requisition.${id ? 'updated' : 'created'}`,
    entityType: 'job_requisition', entityId: id, after: values,
  });
  revalidatePath(PATH);
  return { success: true };
}

export async function saveCandidate(_p: TalentFormState, f: FormData): Promise<TalentFormState> {
  const auth = await requirePermission('people.employee.write');
  if ('error' in auth) return { error: auth.error };
  const { supabase, tenantId, user } = auth;

  const requisitionId = str(f, 'requisition_id');
  const firstName = str(f, 'first_name');
  const lastName = str(f, 'last_name');
  if (!requisitionId || !firstName || !lastName) {
    return { error: 'Requisition, first and last name are required.' };
  }

  const { error } = await supabase.from('candidates').insert({
    tenant_id: tenantId,
    requisition_id: requisitionId,
    first_name: firstName,
    last_name: lastName,
    email: opt(f, 'email'),
    phone: opt(f, 'phone'),
    source: str(f, 'source') || 'direct',
    notes: opt(f, 'notes'),
  });
  if (error) return { error: error.message };

  await logAudit(supabase, {
    tenantId, actorUserId: user.id, action: 'candidate.created',
    entityType: 'candidate', after: { requisition_id: requisitionId, name: `${firstName} ${lastName}` },
  });
  revalidatePath(PATH);
  return { success: true };
}

export async function moveCandidate(_p: TalentFormState, f: FormData): Promise<TalentFormState> {
  const auth = await requirePermission('people.employee.write');
  if ('error' in auth) return { error: auth.error };
  const { supabase, tenantId, user } = auth;

  const id = str(f, 'id');
  const stage = str(f, 'stage');
  if (!STAGES.includes(stage)) return { error: 'Invalid stage.' };
  if (stage === 'hired') return { error: "Use 'Hire as employee' to complete a hire." };

  const { data: before } = await supabase
    .from('candidates')
    .select('stage, first_name, last_name')
    .eq('id', id)
    .maybeSingle();
  if (!before) return { error: 'Candidate not found.' };
  if (['hired'].includes(before.stage as string)) return { error: 'Candidate is already hired.' };

  const { error } = await supabase
    .from('candidates')
    .update({ stage, notes: opt(f, 'notes') ?? undefined })
    .eq('id', id);
  if (error) return { error: error.message };

  await logAudit(supabase, {
    tenantId, actorUserId: user.id, action: 'candidate.stage_changed',
    entityType: 'candidate', entityId: id,
    before: { stage: before.stage }, after: { stage },
  });
  revalidatePath(PATH);
  return { success: true };
}

/** Offer accepted → create the employee record and mark the pipeline hired. */
export async function hireCandidate(_p: TalentFormState, f: FormData): Promise<TalentFormState> {
  const auth = await requirePermission('people.employee.write');
  if ('error' in auth) return { error: auth.error };
  const { supabase, tenantId, user } = auth;

  const candidateId = str(f, 'candidate_id');
  const legalEntityId = str(f, 'legal_entity_id');
  const hireDate = str(f, 'hire_date');
  const basicSalary = num(f, 'basic_salary');
  if (!legalEntityId || !hireDate) return { error: 'Legal entity and hire date are required.' };

  const { data: candidate } = await supabase
    .from('candidates')
    .select('*, job_requisitions(position_id, openings, status)')
    .eq('id', candidateId)
    .maybeSingle();
  if (!candidate) return { error: 'Candidate not found.' };
  if (candidate.stage === 'hired') return { error: 'Already hired.' };
  const requisition = candidate.job_requisitions as {
    position_id: string | null; openings: number; status: string;
  } | null;
  // Vacancy control (blueprint §2.3): no offer completion on a closed requisition.
  if (requisition && ['closed', 'filled'].includes(requisition.status)) {
    return { error: 'The requisition is no longer open — reopen it or use an override requisition.' };
  }

  const { count } = await supabase
    .from('employees')
    .select('id', { count: 'exact', head: true });
  const employeeNumber = `EMP-${String((count ?? 0) + 1).padStart(4, '0')}`;

  const { data: employee, error: empError } = await supabase
    .from('employees')
    .insert({
      tenant_id: tenantId,
      legal_entity_id: legalEntityId,
      employee_number: employeeNumber,
      first_name: candidate.first_name,
      last_name: candidate.last_name,
      personal_email: candidate.email,
      phone: candidate.phone,
      hire_date: hireDate,
      status: 'onboarding',
      employment_type: 'permanent',
    })
    .select('id')
    .single();
  if (empError) return { error: empError.message };

  const positionId = requisition?.position_id ?? null;
  const { data: action } = await supabase
    .from('employment_actions')
    .insert({
      tenant_id: tenantId, employee_id: employee.id, action_type: 'hire',
      status: 'effected', effective_date: hireDate,
      details: { position_id: positionId, basic_salary: basicSalary, candidate_id: candidateId },
      requested_by: user.id, approved_by: user.id, approved_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  await supabase.from('employee_assignments').insert({
    tenant_id: tenantId, employee_id: employee.id, position_id: positionId,
    effective_from: hireDate, created_by_action_id: action?.id ?? null,
  });
  if (basicSalary !== null && basicSalary > 0) {
    await supabase.from('employee_compensation').insert({
      tenant_id: tenantId, employee_id: employee.id, basic_salary: basicSalary,
      effective_from: hireDate, created_by_action_id: action?.id ?? null,
    });
  }
  if (positionId) {
    await supabase.from('positions').update({ status: 'occupied' }).eq('id', positionId);
  }

  await supabase
    .from('candidates')
    .update({ stage: 'hired', hired_employee_id: employee.id })
    .eq('id', candidateId);

  // Requisition filled when hires reach openings.
  const { count: hires } = await supabase
    .from('candidates')
    .select('id', { count: 'exact', head: true })
    .eq('requisition_id', candidate.requisition_id)
    .eq('stage', 'hired');
  if (requisition && (hires ?? 0) >= requisition.openings) {
    await supabase
      .from('job_requisitions')
      .update({ status: 'filled' })
      .eq('id', candidate.requisition_id);
  }

  await logAudit(supabase, {
    tenantId, actorUserId: user.id, action: 'candidate.hired',
    entityType: 'candidate', entityId: candidateId,
    after: { employee_id: employee.id, employee_number: employeeNumber, hire_date: hireDate },
  });
  revalidatePath(PATH);
  revalidatePath('/dashboard/people/employees');
  return { success: true };
}
