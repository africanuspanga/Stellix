'use server';

import { revalidatePath } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requirePermission } from '@/lib/authz';
import { getTenancyContext } from '@/lib/tenancy/context';
import { createClient } from '@/lib/supabase/server';
import { logAudit } from '@/lib/audit';
import { processDay, type AttendanceEventInput, type ShiftSpec } from '@/lib/attendance/process';
import { evaluateGeofence } from '@/lib/attendance/geofence';
import { isWeekend } from '@/lib/leave/working-days';

export interface AttendanceFormState {
  error?: string;
  success?: boolean;
  message?: string;
}

const PATH = '/dashboard/time/attendance';

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

// ── Shifts ──────────────────────────────────────────────────────────────
export async function saveShift(_p: AttendanceFormState, f: FormData): Promise<AttendanceFormState> {
  const auth = await requirePermission('time.roster.manage');
  if ('error' in auth) return { error: auth.error };
  const { supabase, tenantId, user } = auth;

  const id = opt(f, 'id');
  const values = {
    name: str(f, 'name'),
    code: str(f, 'code').toUpperCase(),
    start_time: str(f, 'start_time'),
    end_time: str(f, 'end_time'),
    grace_minutes: num(f, 'grace_minutes') ?? 0,
    unpaid_break_minutes: num(f, 'unpaid_break_minutes') ?? 0,
    required_hours: num(f, 'required_hours') ?? 8,
    is_night: str(f, 'is_night') === 'true',
    overtime_eligible: str(f, 'overtime_eligible') !== 'false',
    is_active: str(f, 'is_active') !== 'false',
  };
  if (!values.name || !values.code || !values.start_time || !values.end_time) {
    return { error: 'Name, code, start and end time are required.' };
  }

  const { error } = id
    ? await supabase.from('shifts').update(values).eq('id', id)
    : await supabase.from('shifts').insert({ tenant_id: tenantId, ...values });
  if (error) {
    return { error: error.message.includes('duplicate') ? 'A shift with this code exists.' : error.message };
  }
  await logAudit(supabase, {
    tenantId, actorUserId: user.id, action: `shift.${id ? 'updated' : 'created'}`,
    entityType: 'shift', entityId: id, after: values,
  });
  revalidatePath('/dashboard/time', 'layout');
  return { success: true };
}

// ── Roster: bulk assignment over a date range ────────────────────────────
export async function assignRoster(_p: AttendanceFormState, f: FormData): Promise<AttendanceFormState> {
  const auth = await requirePermission('time.roster.manage');
  if ('error' in auth) return { error: auth.error };
  const { supabase, tenantId, user } = auth;

  const employeeId = str(f, 'employee_id');
  const shiftId = str(f, 'shift_id');
  const startDate = str(f, 'start_date');
  const endDate = str(f, 'end_date');
  const skipWeekends = str(f, 'skip_weekends') !== 'false';
  if (!employeeId || !shiftId || !startDate || !endDate) {
    return { error: 'Employee, shift and date range are required.' };
  }
  if (endDate < startDate) return { error: 'End date must not be before start date.' };

  const rows = [];
  const cursor = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  while (cursor <= end && rows.length <= 92) {
    const date = cursor.toISOString().slice(0, 10);
    if (!skipWeekends || !isWeekend(date)) {
      rows.push({
        tenant_id: tenantId,
        employee_id: employeeId,
        shift_id: shiftId,
        work_date: date,
        work_site_id: opt(f, 'work_site_id'),
        created_by: user.id,
      });
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  if (rows.length === 0) return { error: 'No dates to assign.' };
  if (rows.length > 92) return { error: 'Assign at most ~3 months at a time.' };

  // Upsert on the one-shift-per-day constraint: replace existing days.
  const { error } = await supabase
    .from('roster_assignments')
    .upsert(rows, { onConflict: 'tenant_id,employee_id,work_date' });
  if (error) return { error: error.message };

  await logAudit(supabase, {
    tenantId, actorUserId: user.id, action: 'roster.assigned',
    entityType: 'roster', entityId: employeeId,
    after: { shift_id: shiftId, from: startDate, to: endDate, days: rows.length },
  });
  revalidatePath('/dashboard/time', 'layout');
  return { success: true };
}

// ── Self check-in / check-out with geolocation ───────────────────────────
export async function checkInOut(_p: AttendanceFormState, f: FormData): Promise<AttendanceFormState> {
  const context = await getTenancyContext();
  if (!context?.activeTenant) return { error: 'Not signed in.' };
  const supabase = await createClient();
  const tenantId = context.activeTenant.id;

  const { data: employee } = await supabase
    .from('employees')
    .select('id, first_name')
    .eq('user_id', context.user.id)
    .maybeSingle();
  if (!employee) {
    return { error: 'No employee record is linked to your account. Ask HR to link one.' };
  }

  const latitude = num(f, 'latitude');
  const longitude = num(f, 'longitude');
  const accuracy = num(f, 'accuracy');

  const { data: sites } = await supabase
    .from('work_sites')
    .select('id, name, latitude, longitude, geofence_radius_m')
    .eq('is_active', true)
    .not('latitude', 'is', null);
  const evaluation = evaluateGeofence(
    latitude !== null && longitude !== null ? { latitude, longitude } : null,
    (sites ?? []).map((s) => ({
      id: s.id as string,
      name: s.name as string,
      latitude: Number(s.latitude),
      longitude: Number(s.longitude),
      radiusM: Number(s.geofence_radius_m ?? 0),
    })),
  );

  // Toggle: last event of the local (EAT) day decides in vs out. Anchor the
  // day to +03:00 so early-morning events aren't attributed to the wrong day.
  const localDate = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const dayStart = new Date(`${localDate}T00:00:00+03:00`).toISOString();
  const { data: lastEvent } = await supabase
    .from('attendance_events')
    .select('event_type')
    .eq('employee_id', employee.id)
    .gte('event_time', dayStart)
    .order('event_time', { ascending: false })
    .limit(1)
    .maybeSingle();
  const eventType = lastEvent?.event_type === 'check_in' ? 'check_out' : 'check_in';

  const { error } = await supabase.from('attendance_events').insert({
    tenant_id: tenantId,
    employee_id: employee.id,
    event_type: eventType,
    event_time: new Date().toISOString(),
    method: 'mobile_web',
    latitude,
    longitude,
    accuracy_m: accuracy,
    work_site_id: evaluation.siteId,
    geofence_result: evaluation.result,
    created_by: context.user.id,
  });
  if (error) return { error: error.message };

  revalidatePath(PATH);
  const where =
    evaluation.result === 'inside'
      ? `at ${evaluation.siteName}`
      : evaluation.result === 'outside'
        ? `⚠ ${evaluation.distanceM}m outside ${evaluation.siteName}`
        : 'location not geofenced';
  return {
    success: true,
    message: `${eventType === 'check_in' ? 'Checked in' : 'Checked out'} ${where}.`,
  };
}

// ── Attendance processing (recalculable) ─────────────────────────────────
async function reprocessDay(
  supabase: SupabaseClient,
  tenantId: string,
  employeeId: string,
  workDate: string,
): Promise<void> {
  // The work "day" is a local (EAT, UTC+3) calendar day, and a night shift's
  // checkout lands the next morning — so fetch a 36h window from local midnight
  // (else night shifts always read as missing_out and everyone's minutes shift
  // by 3 hours).
  const dayStartMs = new Date(`${workDate}T00:00:00+03:00`).getTime();
  const dayStart = new Date(dayStartMs).toISOString();
  const dayEnd = new Date(dayStartMs + 36 * 60 * 60 * 1000).toISOString();

  const [{ data: events }, { data: roster }, { data: leave }, { data: employee }] =
    await Promise.all([
      supabase
        .from('attendance_events')
        .select('event_type, event_time')
        .eq('employee_id', employeeId)
        .gte('event_time', dayStart)
        .lte('event_time', dayEnd)
        .order('event_time'),
      supabase
        .from('roster_assignments')
        .select('shift_id, shifts(start_time, end_time, grace_minutes, unpaid_break_minutes, required_hours, overtime_eligible)')
        .eq('employee_id', employeeId)
        .eq('work_date', workDate)
        .maybeSingle(),
      supabase
        .from('leave_requests')
        .select('id')
        .eq('employee_id', employeeId)
        .eq('status', 'approved')
        .lte('start_date', workDate)
        .gte('end_date', workDate)
        .limit(1),
      supabase
        .from('employees')
        .select('legal_entities(jurisdiction)')
        .eq('id', employeeId)
        .maybeSingle(),
    ]);

  const entity = employee?.legal_entities as { jurisdiction?: string } | { jurisdiction?: string }[] | null;
  const jurisdiction =
    (Array.isArray(entity) ? entity[0]?.jurisdiction : entity?.jurisdiction) ?? 'tz_mainland';
  const [{ data: pubHolidays }, { data: ownHolidays }] = await Promise.all([
    supabase
      .from('public_holidays')
      .select('holiday_date')
      .eq('holiday_date', workDate)
      .in('jurisdiction', ['both', jurisdiction]),
    supabase.from('tenant_holidays').select('holiday_date').eq('holiday_date', workDate),
  ]);

  const shiftRow = roster?.shifts as
    | { start_time: string; end_time: string; grace_minutes: number; unpaid_break_minutes: number; required_hours: number; overtime_eligible: boolean }
    | { start_time: string; end_time: string; grace_minutes: number; unpaid_break_minutes: number; required_hours: number; overtime_eligible: boolean }[]
    | null;
  const shiftData = Array.isArray(shiftRow) ? shiftRow[0] : shiftRow;
  const shift: ShiftSpec | null = shiftData
    ? {
        startTime: shiftData.start_time,
        endTime: shiftData.end_time,
        graceMinutes: shiftData.grace_minutes,
        unpaidBreakMinutes: shiftData.unpaid_break_minutes,
        requiredHours: Number(shiftData.required_hours),
        overtimeEligible: shiftData.overtime_eligible,
      }
    : null;

  const result = processDay(
    (events ?? []).map(
      (e): AttendanceEventInput => ({
        eventType: e.event_type as 'check_in' | 'check_out',
        eventTime: e.event_time as string,
      }),
    ),
    {
      workDate,
      shift,
      isHoliday: (pubHolidays?.length ?? 0) > 0 || (ownHolidays?.length ?? 0) > 0,
      isOnApprovedLeave: (leave?.length ?? 0) > 0,
      isWeekend: isWeekend(workDate),
    },
  );

  await supabase.from('attendance_days').upsert(
    {
      tenant_id: tenantId,
      employee_id: employeeId,
      work_date: workDate,
      shift_id: roster?.shift_id ?? null,
      first_in: result.firstIn,
      last_out: result.lastOut,
      worked_minutes: result.workedMinutes,
      late_minutes: result.lateMinutes,
      early_departure_minutes: result.earlyDepartureMinutes,
      overtime_minutes: result.overtimeMinutes,
      status: result.status,
      processed_at: new Date().toISOString(),
    },
    { onConflict: 'tenant_id,employee_id,work_date' },
  );
}

export async function processAttendance(
  _p: AttendanceFormState,
  f: FormData,
): Promise<AttendanceFormState> {
  const auth = await requirePermission('time.attendance.manage');
  if ('error' in auth) return { error: auth.error };
  const { supabase, tenantId, user } = auth;

  const workDate = str(f, 'work_date');
  if (!workDate) return { error: 'Choose the date to process.' };

  const { data: employees } = await supabase
    .from('employees')
    .select('id')
    .not('status', 'in', '("exited")');
  if (!employees || employees.length === 0) return { error: 'No employees to process.' };

  for (const employee of employees) {
    await reprocessDay(supabase, tenantId, employee.id as string, workDate);
  }

  await logAudit(supabase, {
    tenantId, actorUserId: user.id, action: 'attendance.processed',
    entityType: 'attendance_day', after: { work_date: workDate, employees: employees.length },
  });
  revalidatePath(PATH);
  return { success: true, message: `Processed ${employees.length} employees for ${workDate}.` };
}

// ── Corrections ──────────────────────────────────────────────────────────
export async function requestCorrection(
  _p: AttendanceFormState,
  f: FormData,
): Promise<AttendanceFormState> {
  const auth = await requirePermission('time.attendance.read');
  if ('error' in auth) return { error: auth.error };
  const { supabase, tenantId, user } = auth;

  const employeeId = str(f, 'employee_id');
  const workDate = str(f, 'work_date');
  const reason = str(f, 'reason');
  const correctedIn = opt(f, 'corrected_in');
  const correctedOut = opt(f, 'corrected_out');
  if (!employeeId || !workDate || !reason) {
    return { error: 'Employee, date and reason are required.' };
  }
  if (!correctedIn && !correctedOut) {
    return { error: 'Provide a corrected check-in and/or check-out time.' };
  }

  const { error } = await supabase.from('attendance_corrections').insert({
    tenant_id: tenantId,
    employee_id: employeeId,
    work_date: workDate,
    corrected_in: correctedIn ? new Date(`${workDate}T${correctedIn}:00+03:00`).toISOString() : null,
    corrected_out: correctedOut ? new Date(`${workDate}T${correctedOut}:00+03:00`).toISOString() : null,
    reason,
    requested_by: user.id,
  });
  if (error) return { error: error.message };
  revalidatePath(PATH);
  return { success: true };
}

export async function decideCorrection(
  _p: AttendanceFormState,
  f: FormData,
): Promise<AttendanceFormState> {
  const auth = await requirePermission('time.attendance.manage');
  if ('error' in auth) return { error: auth.error };
  const { supabase, tenantId, user } = auth;

  const id = str(f, 'id');
  const decision = str(f, 'decision');
  if (!['approved', 'rejected'].includes(decision)) return { error: 'Invalid decision.' };

  const { data: correction } = await supabase
    .from('attendance_corrections')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (!correction) return { error: 'Correction not found.' };
  if (correction.status !== 'pending') return { error: 'Already decided.' };

  await supabase
    .from('attendance_corrections')
    .update({ status: decision, decided_by: user.id, decided_at: new Date().toISOString() })
    .eq('id', id);

  if (decision === 'approved') {
    const events = [];
    if (correction.corrected_in) {
      events.push({
        tenant_id: tenantId, employee_id: correction.employee_id, event_type: 'check_in',
        event_time: correction.corrected_in, method: 'correction',
        note: `Correction ${id}: ${correction.reason}`, created_by: user.id,
      });
    }
    if (correction.corrected_out) {
      events.push({
        tenant_id: tenantId, employee_id: correction.employee_id, event_type: 'check_out',
        event_time: correction.corrected_out, method: 'correction',
        note: `Correction ${id}: ${correction.reason}`, created_by: user.id,
      });
    }
    if (events.length > 0) {
      const { error } = await supabase.from('attendance_events').insert(events);
      if (error) return { error: error.message };
    }
    await reprocessDay(supabase, tenantId, correction.employee_id, correction.work_date);
  }

  await logAudit(supabase, {
    tenantId, actorUserId: user.id, action: `attendance_correction.${decision}`,
    entityType: 'attendance_correction', entityId: id,
    after: { employee_id: correction.employee_id, work_date: correction.work_date },
  });
  revalidatePath(PATH);
  return { success: true };
}

// ── Overtime approval (human-only) ───────────────────────────────────────
export async function approveOvertime(
  _p: AttendanceFormState,
  f: FormData,
): Promise<AttendanceFormState> {
  const auth = await requirePermission('time.attendance.manage');
  if ('error' in auth) return { error: auth.error };
  const { supabase, tenantId, user } = auth;

  const id = str(f, 'id');
  const minutes = num(f, 'approved_minutes');
  if (minutes === null || minutes < 0) return { error: 'Approved minutes are required.' };

  const { data: day } = await supabase
    .from('attendance_days')
    .select('overtime_minutes, employee_id, work_date')
    .eq('id', id)
    .maybeSingle();
  if (!day) return { error: 'Attendance day not found.' };
  if (minutes > day.overtime_minutes) {
    return { error: `Cannot approve more than the computed ${day.overtime_minutes} minutes.` };
  }

  const { error } = await supabase
    .from('attendance_days')
    .update({
      overtime_approved_minutes: minutes,
      overtime_approved_by: user.id,
      overtime_approved_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) return { error: error.message };

  await logAudit(supabase, {
    tenantId, actorUserId: user.id, action: 'overtime.approved',
    entityType: 'attendance_day', entityId: id,
    after: { employee_id: day.employee_id, work_date: day.work_date, approved_minutes: minutes },
  });
  revalidatePath(PATH);
  return { success: true };
}

// ── Timesheets v1 ────────────────────────────────────────────────────────
export async function saveTimesheetEntry(
  _p: AttendanceFormState,
  f: FormData,
): Promise<AttendanceFormState> {
  const auth = await requirePermission('time.attendance.read');
  if ('error' in auth) return { error: auth.error };
  const { supabase, tenantId, user } = auth;

  const values = {
    employee_id: str(f, 'employee_id'),
    work_date: str(f, 'work_date'),
    project_id: opt(f, 'project_id'),
    activity: str(f, 'activity'),
    hours: num(f, 'hours') ?? 0,
    billable: str(f, 'billable') === 'true',
    note: opt(f, 'note'),
  };
  if (!values.employee_id || !values.work_date || !values.activity) {
    return { error: 'Employee, date and activity are required.' };
  }
  if (values.hours <= 0 || values.hours > 24) return { error: 'Hours must be between 0 and 24.' };

  const { error } = await supabase
    .from('timesheet_entries')
    .insert({ tenant_id: tenantId, created_by: user.id, ...values });
  if (error) return { error: error.message };
  revalidatePath('/dashboard/time/timesheets');
  return { success: true };
}

export async function decideTimesheet(
  _p: AttendanceFormState,
  f: FormData,
): Promise<AttendanceFormState> {
  const auth = await requirePermission('time.attendance.manage');
  if ('error' in auth) return { error: auth.error };
  const { supabase, user } = auth;

  const id = str(f, 'id');
  const decision = str(f, 'decision');
  if (!['approved', 'rejected'].includes(decision)) return { error: 'Invalid decision.' };

  const { error } = await supabase
    .from('timesheet_entries')
    .update({ status: decision, decided_by: user.id, decided_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'submitted');
  if (error) return { error: error.message };
  revalidatePath('/dashboard/time/timesheets');
  return { success: true };
}
