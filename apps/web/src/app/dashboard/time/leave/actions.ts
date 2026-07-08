'use server';

import { revalidatePath } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requirePermission } from '@/lib/authz';
import { logAudit } from '@/lib/audit';
import { actOnStep, delegateStep, startWorkflow } from '@/lib/workflow/engine';
import { calcWorkingDays } from '@/lib/leave/working-days';

export interface LeaveFormState {
  error?: string;
  success?: boolean;
}

const PATH = '/dashboard/time/leave';

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

async function getHolidaySet(
  supabase: SupabaseClient,
  jurisdiction: string,
  start: string,
  end: string,
): Promise<Set<string>> {
  const [{ data: pub }, { data: own }] = await Promise.all([
    supabase
      .from('public_holidays')
      .select('holiday_date')
      .in('jurisdiction', ['both', jurisdiction])
      .gte('holiday_date', start)
      .lte('holiday_date', end),
    supabase
      .from('tenant_holidays')
      .select('holiday_date')
      .gte('holiday_date', start)
      .lte('holiday_date', end),
  ]);
  return new Set([
    ...(pub ?? []).map((h) => h.holiday_date as string),
    ...(own ?? []).map((h) => h.holiday_date as string),
  ]);
}

async function ledgerBalance(
  supabase: SupabaseClient,
  employeeId: string,
  leaveTypeId: string,
): Promise<number> {
  const { data } = await supabase
    .from('leave_balances')
    .select('balance_days')
    .eq('employee_id', employeeId)
    .eq('leave_type_id', leaveTypeId)
    .maybeSingle();
  return Number(data?.balance_days ?? 0);
}

// ── Leave types ──────────────────────────────────────────────────────────
export async function saveLeaveType(_p: LeaveFormState, f: FormData): Promise<LeaveFormState> {
  const auth = await requirePermission('time.leave.approve');
  if ('error' in auth) return { error: auth.error };
  const { supabase, tenantId, user } = auth;

  const id = opt(f, 'id');
  const values = {
    name: str(f, 'name'),
    name_sw: opt(f, 'name_sw'),
    code: str(f, 'code').toUpperCase(),
    is_paid: str(f, 'is_paid') !== 'false',
    annual_entitlement_days: num(f, 'annual_entitlement_days') ?? 0,
    accrual_method: str(f, 'accrual_method') || 'annual_grant',
    max_carry_forward_days: num(f, 'max_carry_forward_days') ?? 0,
    allow_negative_balance: str(f, 'allow_negative_balance') === 'true',
    requires_document: str(f, 'requires_document') === 'true',
    gender_restriction: opt(f, 'gender_restriction'),
    is_active: str(f, 'is_active') !== 'false',
  };
  if (!values.name || !values.code) return { error: 'Name and code are required.' };

  const { error } = id
    ? await supabase.from('leave_types').update(values).eq('id', id)
    : await supabase.from('leave_types').insert({ tenant_id: tenantId, ...values });
  if (error) {
    return { error: error.message.includes('duplicate') ? 'A leave type with this code exists.' : error.message };
  }

  await logAudit(supabase, {
    tenantId, actorUserId: user.id,
    action: `leave_type.${id ? 'updated' : 'created'}`,
    entityType: 'leave_type', entityId: id, after: values,
  });
  revalidatePath(PATH, 'layout');
  return { success: true };
}

// ── Request leave ────────────────────────────────────────────────────────
export async function requestLeave(_p: LeaveFormState, f: FormData): Promise<LeaveFormState> {
  const auth = await requirePermission('time.leave.request');
  if ('error' in auth) return { error: auth.error };
  const { supabase, tenantId, user } = auth;

  const employeeId = str(f, 'employee_id');
  const leaveTypeId = str(f, 'leave_type_id');
  const startDate = str(f, 'start_date');
  const endDate = str(f, 'end_date');
  const isHalfDay = str(f, 'is_half_day') === 'true';
  if (!employeeId || !leaveTypeId || !startDate || !endDate) {
    return { error: 'Employee, leave type and dates are required.' };
  }
  if (endDate < startDate) return { error: 'End date must not be before the start date.' };

  const [{ data: employee }, { data: leaveType }] = await Promise.all([
    supabase
      .from('employees')
      .select('id, gender, hire_date, legal_entity_id, legal_entities(jurisdiction)')
      .eq('id', employeeId)
      .maybeSingle(),
    supabase.from('leave_types').select('*').eq('id', leaveTypeId).maybeSingle(),
  ]);
  if (!employee) return { error: 'Employee not found.' };
  if (!leaveType || !leaveType.is_active) return { error: 'Leave type not found or inactive.' };

  if (leaveType.gender_restriction && employee.gender !== leaveType.gender_restriction) {
    return { error: `This leave type is restricted to ${leaveType.gender_restriction} employees.` };
  }
  if (leaveType.min_service_months > 0) {
    const serviceMonths =
      (Date.now() - new Date(`${employee.hire_date}T00:00:00Z`).getTime()) / (30.44 * 86_400_000);
    if (serviceMonths < leaveType.min_service_months) {
      return { error: `Requires ${leaveType.min_service_months} months of service.` };
    }
  }

  const entity = employee.legal_entities as { jurisdiction?: string } | { jurisdiction?: string }[] | null;
  const jurisdiction =
    (Array.isArray(entity) ? entity[0]?.jurisdiction : entity?.jurisdiction) ?? 'tz_mainland';
  const holidays = await getHolidaySet(supabase, jurisdiction, startDate, endDate);
  const days = calcWorkingDays(startDate, endDate, holidays, isHalfDay);
  if (days <= 0) return { error: 'The selected dates contain no working days.' };

  if (!leaveType.allow_negative_balance) {
    const balance = await ledgerBalance(supabase, employeeId, leaveTypeId);
    if (balance < days) {
      return { error: `Insufficient balance: ${balance} day(s) available, ${days} requested.` };
    }
  }

  // Overlap guard against pending/approved requests.
  const { data: overlap } = await supabase
    .from('leave_requests')
    .select('id')
    .eq('employee_id', employeeId)
    .in('status', ['pending', 'approved'])
    .lte('start_date', endDate)
    .gte('end_date', startDate)
    .limit(1);
  if ((overlap?.length ?? 0) > 0) return { error: 'An overlapping leave request already exists.' };

  const { data: request, error: insertError } = await supabase
    .from('leave_requests')
    .insert({
      tenant_id: tenantId,
      employee_id: employeeId,
      leave_type_id: leaveTypeId,
      start_date: startDate,
      end_date: endDate,
      days,
      is_half_day: isHalfDay,
      reason: opt(f, 'reason'),
      requested_by: user.id,
    })
    .select('id')
    .single();
  if (insertError) return { error: insertError.message };

  try {
    const workflow = await startWorkflow(supabase, {
      tenantId,
      entityType: 'leave_request',
      entityId: request.id,
      employeeId,
      createdBy: user.id,
    });
    await supabase
      .from('leave_requests')
      .update({ workflow_instance_id: workflow.instanceId })
      .eq('id', request.id);
  } catch (e) {
    await supabase.from('leave_requests').delete().eq('id', request.id);
    return { error: e instanceof Error ? e.message : 'Workflow start failed.' };
  }

  await logAudit(supabase, {
    tenantId, actorUserId: user.id, action: 'leave_request.created',
    entityType: 'leave_request', entityId: request.id,
    after: { employee_id: employeeId, leave_type_id: leaveTypeId, start_date: startDate, end_date: endDate, days },
  });
  revalidatePath(PATH, 'layout');
  return { success: true };
}

// ── Approve / reject a workflow step ─────────────────────────────────────
export async function decideLeaveStep(_p: LeaveFormState, f: FormData): Promise<LeaveFormState> {
  const auth = await requirePermission('time.leave.approve');
  if ('error' in auth) return { error: auth.error };
  const { supabase, tenantId, user } = auth;

  const stepActionId = str(f, 'step_action_id');
  const requestId = str(f, 'request_id');
  const decision = str(f, 'decision') as 'approved' | 'rejected';
  if (!['approved', 'rejected'].includes(decision)) return { error: 'Invalid decision.' };

  let result;
  try {
    result = await actOnStep(supabase, {
      stepActionId,
      decision,
      actorUserId: user.id,
      comment: opt(f, 'comment') ?? undefined,
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Decision failed.' };
  }

  if (result.status !== 'pending') {
    const { data: request } = await supabase
      .from('leave_requests')
      .select('*')
      .eq('id', requestId)
      .maybeSingle();
    if (request && request.status === 'pending') {
      await supabase
        .from('leave_requests')
        .update({ status: result.status, decided_at: new Date().toISOString() })
        .eq('id', requestId);

      if (result.status === 'approved') {
        // The ledger debit — the request only ever affects balance here.
        await supabase.from('leave_ledger').insert({
          tenant_id: tenantId,
          employee_id: request.employee_id,
          leave_type_id: request.leave_type_id,
          entry_type: 'request',
          days: -Number(request.days),
          effective_date: request.start_date,
          leave_request_id: requestId,
          created_by: user.id,
        });
      }
    }
  }

  await logAudit(supabase, {
    tenantId, actorUserId: user.id, action: `leave_request.step_${decision}`,
    entityType: 'leave_request', entityId: requestId,
    after: { workflow_status: result.status },
  });
  revalidatePath(PATH, 'layout');
  return { success: true };
}

export async function delegateLeaveStep(_p: LeaveFormState, f: FormData): Promise<LeaveFormState> {
  const auth = await requirePermission('time.leave.approve');
  if ('error' in auth) return { error: auth.error };
  const { supabase, tenantId, user } = auth;

  const stepActionId = str(f, 'step_action_id');
  const toUserId = str(f, 'to_user_id');
  if (!toUserId) return { error: 'Choose who to delegate to.' };

  try {
    await delegateStep(supabase, {
      stepActionId,
      toUserId,
      actorUserId: user.id,
      comment: opt(f, 'comment') ?? undefined,
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Delegation failed.' };
  }

  await logAudit(supabase, {
    tenantId, actorUserId: user.id, action: 'leave_request.step_delegated',
    entityType: 'workflow_step_action', entityId: stepActionId,
    after: { delegated_to: toUserId },
  });
  revalidatePath(PATH, 'layout');
  return { success: true };
}

// ── Cancel (pending: void; approved: compensating credit) ───────────────
export async function cancelLeaveRequest(_p: LeaveFormState, f: FormData): Promise<LeaveFormState> {
  const auth = await requirePermission('time.leave.request');
  if ('error' in auth) return { error: auth.error };
  const { supabase, tenantId, user } = auth;

  const requestId = str(f, 'request_id');
  const { data: request } = await supabase
    .from('leave_requests')
    .select('*')
    .eq('id', requestId)
    .maybeSingle();
  if (!request) return { error: 'Request not found.' };
  if (!['pending', 'approved'].includes(request.status)) {
    return { error: `A ${request.status} request cannot be cancelled.` };
  }

  if (request.status === 'approved') {
    await supabase.from('leave_ledger').insert({
      tenant_id: tenantId,
      employee_id: request.employee_id,
      leave_type_id: request.leave_type_id,
      entry_type: 'cancellation',
      days: Number(request.days),
      effective_date: request.start_date,
      leave_request_id: requestId,
      note: 'Approved leave cancelled — compensating credit',
      created_by: user.id,
    });
  }
  if (request.workflow_instance_id) {
    await supabase
      .from('workflow_instances')
      .update({ status: 'cancelled', completed_at: new Date().toISOString() })
      .eq('id', request.workflow_instance_id);
    await supabase
      .from('workflow_step_actions')
      .update({ status: 'skipped' })
      .eq('instance_id', request.workflow_instance_id)
      .in('status', ['pending', 'waiting']);
  }
  await supabase
    .from('leave_requests')
    .update({ status: 'cancelled', decided_at: new Date().toISOString() })
    .eq('id', requestId);

  await logAudit(supabase, {
    tenantId, actorUserId: user.id, action: 'leave_request.cancelled',
    entityType: 'leave_request', entityId: requestId,
    after: { previous_status: request.status },
  });
  revalidatePath(PATH, 'layout');
  return { success: true };
}

// ── Accrual run ──────────────────────────────────────────────────────────
export async function runAccrual(_p: LeaveFormState, f: FormData): Promise<LeaveFormState> {
  const auth = await requirePermission('time.leave.approve');
  if ('error' in auth) return { error: auth.error };
  const { supabase, tenantId, user } = auth;

  const leaveTypeId = str(f, 'leave_type_id');
  const year = num(f, 'year');
  const month = num(f, 'month'); // only for monthly accrual
  if (!leaveTypeId || !year) return { error: 'Leave type and year are required.' };

  const { data: leaveType } = await supabase
    .from('leave_types')
    .select('*')
    .eq('id', leaveTypeId)
    .maybeSingle();
  if (!leaveType) return { error: 'Leave type not found.' };
  const monthly = leaveType.accrual_method === 'monthly';
  if (monthly && (!month || month < 1 || month > 12)) {
    return { error: 'Monthly accrual needs the month (1–12).' };
  }

  const effectiveDate = monthly
    ? `${year}-${String(month).padStart(2, '0')}-01`
    : `${year}-01-01`;
  const grantDays = monthly
    ? Math.round((Number(leaveType.annual_entitlement_days) / 12) * 10) / 10
    : Number(leaveType.annual_entitlement_days);
  if (grantDays <= 0) return { error: 'This leave type has no entitlement days configured.' };

  let query = supabase
    .from('employees')
    .select('id, gender, hire_date')
    .not('status', 'in', '("exited","exiting")')
    .lte('hire_date', monthly ? effectiveDate : `${year}-12-31`);
  if (leaveType.gender_restriction) query = query.eq('gender', leaveType.gender_restriction);
  const { data: employees } = await query;
  if (!employees || employees.length === 0) return { error: 'No eligible employees found.' };

  // Idempotency: skip employees who already have this accrual entry.
  const { data: existing } = await supabase
    .from('leave_ledger')
    .select('employee_id')
    .eq('leave_type_id', leaveTypeId)
    .eq('entry_type', 'accrual')
    .eq('effective_date', effectiveDate);
  const done = new Set((existing ?? []).map((e) => e.employee_id as string));

  const entries = employees
    .filter((e) => !done.has(e.id))
    .map((e) => ({
      tenant_id: tenantId,
      employee_id: e.id,
      leave_type_id: leaveTypeId,
      entry_type: 'accrual',
      days: grantDays,
      effective_date: effectiveDate,
      note: monthly ? `Monthly accrual ${year}-${month}` : `Annual grant ${year}`,
      created_by: user.id,
    }));
  if (entries.length === 0) return { error: 'Accrual already run for every eligible employee.' };

  const { error } = await supabase.from('leave_ledger').insert(entries);
  if (error) return { error: error.message };

  await logAudit(supabase, {
    tenantId, actorUserId: user.id, action: 'leave.accrual_run',
    entityType: 'leave_type', entityId: leaveTypeId,
    after: { effective_date: effectiveDate, employees: entries.length, days: grantDays },
  });
  revalidatePath(PATH, 'layout');
  return { success: true };
}

// ── Carry-forward / expiry run ───────────────────────────────────────────
export async function runCarryForward(_p: LeaveFormState, f: FormData): Promise<LeaveFormState> {
  const auth = await requirePermission('time.leave.approve');
  if ('error' in auth) return { error: auth.error };
  const { supabase, tenantId, user } = auth;

  const leaveTypeId = str(f, 'leave_type_id');
  const fromYear = num(f, 'from_year');
  if (!leaveTypeId || !fromYear) return { error: 'Leave type and year are required.' };

  const { data: leaveType } = await supabase
    .from('leave_types')
    .select('*')
    .eq('id', leaveTypeId)
    .maybeSingle();
  if (!leaveType) return { error: 'Leave type not found.' };
  const cap = Number(leaveType.max_carry_forward_days);
  const cutoff = `${fromYear}-12-31`;
  const expiryDate = `${fromYear + 1}-01-01`;

  // Balance per employee as of the year end, from the ledger.
  const { data: entries } = await supabase
    .from('leave_ledger')
    .select('employee_id, days')
    .eq('leave_type_id', leaveTypeId)
    .lte('effective_date', cutoff);
  const balances = new Map<string, number>();
  for (const entry of entries ?? []) {
    balances.set(
      entry.employee_id as string,
      (balances.get(entry.employee_id as string) ?? 0) + Number(entry.days),
    );
  }

  // Idempotency: skip employees already expired for that date.
  const { data: already } = await supabase
    .from('leave_ledger')
    .select('employee_id')
    .eq('leave_type_id', leaveTypeId)
    .eq('entry_type', 'expiry')
    .eq('effective_date', expiryDate);
  const done = new Set((already ?? []).map((e) => e.employee_id as string));

  const expiries = [...balances.entries()]
    .filter(([employeeId, balance]) => balance > cap && !done.has(employeeId))
    .map(([employeeId, balance]) => ({
      tenant_id: tenantId,
      employee_id: employeeId,
      leave_type_id: leaveTypeId,
      entry_type: 'expiry',
      days: -(balance - cap),
      effective_date: expiryDate,
      note: `Carry-forward cap ${cap} — ${balance - cap} day(s) expired`,
      created_by: user.id,
    }));

  if (expiries.length === 0) {
    return { error: 'Nothing to expire — all balances are within the carry-forward cap.' };
  }
  const { error } = await supabase.from('leave_ledger').insert(expiries);
  if (error) return { error: error.message };

  await logAudit(supabase, {
    tenantId, actorUserId: user.id, action: 'leave.carry_forward_run',
    entityType: 'leave_type', entityId: leaveTypeId,
    after: { from_year: fromYear, cap, expired_for: expiries.length },
  });
  revalidatePath(PATH, 'layout');
  return { success: true };
}

// ── Seed standard Tanzania leave types ───────────────────────────────────
// Entitlements follow commonly applied Employment and Labour Relations Act
// values — verify against current law before production use.
const TZ_DEFAULT_LEAVE_TYPES = [
  { name: 'Annual leave', name_sw: 'Likizo ya mwaka', code: 'ANNUAL', annual_entitlement_days: 28, max_carry_forward_days: 7, accrual_method: 'annual_grant' },
  { name: 'Sick leave', name_sw: 'Likizo ya ugonjwa', code: 'SICK', annual_entitlement_days: 126, max_carry_forward_days: 0, accrual_method: 'annual_grant', requires_document: true },
  { name: 'Maternity leave', name_sw: 'Likizo ya uzazi', code: 'MATERNITY', annual_entitlement_days: 84, max_carry_forward_days: 0, accrual_method: 'annual_grant', gender_restriction: 'female' },
  { name: 'Paternity leave', name_sw: 'Likizo ya ubaba', code: 'PATERNITY', annual_entitlement_days: 3, max_carry_forward_days: 0, accrual_method: 'annual_grant', gender_restriction: 'male' },
  { name: 'Compassionate leave', name_sw: 'Likizo ya msiba', code: 'COMPASSIONATE', annual_entitlement_days: 4, max_carry_forward_days: 0, accrual_method: 'annual_grant' },
  { name: 'Unpaid leave', name_sw: 'Likizo bila malipo', code: 'UNPAID', annual_entitlement_days: 0, max_carry_forward_days: 0, accrual_method: 'annual_grant', is_paid: false, allow_negative_balance: true },
];

export async function seedTanzaniaLeaveTypes(
  _p: LeaveFormState,
  _f: FormData,
): Promise<LeaveFormState> {
  const auth = await requirePermission('time.leave.approve');
  if ('error' in auth) return { error: auth.error };
  const { supabase, tenantId, user } = auth;

  const { data: existing } = await supabase.from('leave_types').select('code');
  const have = new Set((existing ?? []).map((t) => t.code as string));
  const missing = TZ_DEFAULT_LEAVE_TYPES.filter((t) => !have.has(t.code));
  if (missing.length === 0) return { error: 'All standard Tanzania leave types already exist.' };

  const { error } = await supabase
    .from('leave_types')
    .insert(missing.map((t) => ({ tenant_id: tenantId, ...t })));
  if (error) return { error: error.message };

  await logAudit(supabase, {
    tenantId, actorUserId: user.id, action: 'leave_type.seeded',
    entityType: 'leave_type',
    after: { codes: missing.map((t) => t.code) },
  });
  revalidatePath(PATH, 'layout');
  return { success: true };
}

// ── Tenant holidays ──────────────────────────────────────────────────────
export async function saveTenantHoliday(_p: LeaveFormState, f: FormData): Promise<LeaveFormState> {
  const auth = await requirePermission('time.leave.approve');
  if ('error' in auth) return { error: auth.error };
  const { supabase, tenantId } = auth;

  const date = str(f, 'holiday_date');
  const name = str(f, 'name');
  if (!date || !name) return { error: 'Date and name are required.' };

  const { error } = await supabase
    .from('tenant_holidays')
    .insert({ tenant_id: tenantId, holiday_date: date, name });
  if (error) {
    return { error: error.message.includes('duplicate') ? 'This holiday already exists.' : error.message };
  }
  revalidatePath('/dashboard/time', 'layout');
  return { success: true };
}
