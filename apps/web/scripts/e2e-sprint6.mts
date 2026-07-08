/**
 * Sprint 6 end-to-end test: attendance day processing (production code),
 * geofence evaluation, shifts/roster DB flows, raw-event immutability,
 * corrections and timesheets.
 * Run from apps/web:  pnpm dlx tsx --env-file=.env.local scripts/e2e-sprint6.mts
 */
import { createClient } from '@supabase/supabase-js';
import { provisionTenant } from '../src/lib/tenancy/provision';
import { processDay } from '../src/lib/attendance/process';
import { evaluateGeofence } from '../src/lib/attendance/geofence';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  console.log(`${ok ? '✓' : '✗'} ${label}${ok || !detail ? '' : ` — ${detail}`}`);
  if (!ok) failures++;
}

const stamp = Math.random().toString(36).slice(2, 8);
const password = `E2e!${stamp}Aa11`;
let userId = '';
let tenantId = '';

const DAY_SHIFT = {
  startTime: '08:00', endTime: '17:00', graceMinutes: 15,
  unpaidBreakMinutes: 60, requiredHours: 8, overtimeEligible: true,
};

try {
  // ── 1. processDay — pure attendance arithmetic ─────────────────────────
  const base = { workDate: '2026-07-13', shift: DAY_SHIFT, isHoliday: false, isOnApprovedLeave: false, isWeekend: false };

  const normal = processDay(
    [
      { eventType: 'check_in', eventTime: '2026-07-13T08:10:00Z' },
      { eventType: 'check_out', eventTime: '2026-07-13T19:30:00Z' },
    ],
    base,
  );
  check('normal day: present, 620min worked, 140min OT, on-time within grace',
    normal.status === 'present' && normal.workedMinutes === 620 &&
    normal.overtimeMinutes === 140 && normal.lateMinutes === 0,
    JSON.stringify(normal));

  const late = processDay(
    [
      { eventType: 'check_in', eventTime: '2026-07-13T09:00:00Z' },
      { eventType: 'check_out', eventTime: '2026-07-13T17:00:00Z' },
    ],
    base,
  );
  check('late arrival: 45min late, status late',
    late.status === 'late' && late.lateMinutes === 45 && late.overtimeMinutes === 0);

  const missingOut = processDay(
    [{ eventType: 'check_in', eventTime: '2026-07-13T08:00:00Z' }],
    base,
  );
  check('missing check-out detected', missingOut.status === 'missing_out');

  check('approved leave wins → on_leave',
    processDay([], { ...base, isOnApprovedLeave: true }).status === 'on_leave');
  check('holiday with no events → holiday',
    processDay([], { ...base, shift: null, isHoliday: true }).status === 'holiday');
  check('no shift + weekend → rest_day',
    processDay([], { ...base, shift: null, isWeekend: true }).status === 'rest_day');
  check('rostered but no events → absent', processDay([], base).status === 'absent');

  const night = processDay(
    [
      { eventType: 'check_in', eventTime: '2026-07-13T22:05:00Z' },
      { eventType: 'check_out', eventTime: '2026-07-14T06:00:00Z' },
    ],
    {
      ...base,
      shift: { startTime: '22:00', endTime: '06:00', graceMinutes: 15, unpaidBreakMinutes: 30, requiredHours: 7.5, overtimeEligible: true },
    },
  );
  check('cross-midnight shift: present, 445min, no early departure',
    night.status === 'present' && night.workedMinutes === 445 && night.earlyDepartureMinutes === 0,
    JSON.stringify(night));

  // ── 2. Geofence ─────────────────────────────────────────────────────────
  const site = { id: 's1', name: 'HQ', latitude: -6.8, longitude: 39.28, radiusM: 150 };
  const inside = evaluateGeofence({ latitude: -6.8009, longitude: 39.28 }, [site]);
  const outside = evaluateGeofence({ latitude: -6.81, longitude: 39.28 }, [site]);
  const noCoords = evaluateGeofence(null, [site]);
  check('~100m from site with 150m radius → inside',
    inside.result === 'inside' && (inside.distanceM ?? 0) < 150, JSON.stringify(inside));
  check('~1.1km from site → outside', outside.result === 'outside' && (outside.distanceM ?? 0) > 1000);
  check('no coordinates → no_geofence', noCoords.result === 'no_geofence');

  // ── 3. Live DB: shift, roster, events, immutability ────────────────────
  const { data: u, error: uErr } = await admin.auth.admin.createUser({
    email: `e2e-s6-${stamp}@stellix-test.example.com`, password, email_confirm: true,
  });
  if (uErr || !u.user) throw uErr ?? new Error('user failed');
  userId = u.user.id;
  const { tenantId: tid, legalEntityId } = await provisionTenant(admin, {
    userId, companyName: `E2E S6 Co ${stamp}`, jurisdiction: 'tz_mainland', sector: 'private',
  });
  tenantId = tid;
  const client = createClient(url, anonKey);
  await client.auth.signInWithPassword({
    email: `e2e-s6-${stamp}@stellix-test.example.com`, password,
  });

  const { data: emp } = await client.from('employees')
    .insert({
      tenant_id: tenantId, legal_entity_id: legalEntityId, employee_number: 'EMP-0001',
      first_name: 'Rehema', last_name: 'Chande', hire_date: '2026-01-01', status: 'active',
    }).select('id').single();

  const { data: shift, error: shiftErr } = await client.from('shifts')
    .insert({
      tenant_id: tenantId, name: 'Day shift', code: 'DAY',
      start_time: '08:00', end_time: '17:00', grace_minutes: 15,
      unpaid_break_minutes: 60, required_hours: 8,
    }).select('id').single();
  check('shift created', !shiftErr, shiftErr?.message);

  const { error: rosterErr } = await client.from('roster_assignments').insert({
    tenant_id: tenantId, employee_id: emp!.id, shift_id: shift!.id,
    work_date: '2026-07-13', created_by: userId,
  });
  const { error: rosterDupErr } = await client.from('roster_assignments').insert({
    tenant_id: tenantId, employee_id: emp!.id, shift_id: shift!.id,
    work_date: '2026-07-13', created_by: userId,
  });
  check('roster assigned; duplicate day rejected by constraint',
    !rosterErr && Boolean(rosterDupErr), rosterErr?.message);

  const { data: event, error: eventErr } = await client.from('attendance_events')
    .insert({
      tenant_id: tenantId, employee_id: emp!.id, event_type: 'check_in',
      event_time: '2026-07-13T08:10:00Z', method: 'mobile_web',
      latitude: -6.8009, longitude: 39.28, geofence_result: 'inside', created_by: userId,
    }).select('id').single();
  check('raw event recorded', !eventErr, eventErr?.message);

  // Immutability: update/delete must not change the row (no RLS policy for them).
  await client.from('attendance_events').update({ event_time: '2026-07-13T07:00:00Z' }).eq('id', event!.id);
  await client.from('attendance_events').delete().eq('id', event!.id);
  const { data: still } = await client.from('attendance_events')
    .select('event_time').eq('id', event!.id).maybeSingle();
  check('raw events are immutable (update+delete blocked by RLS)',
    still?.event_time === '2026-07-13T08:10:00+00:00', JSON.stringify(still));

  // Processed day upsert (as the server action would after processing).
  await client.from('attendance_events').insert({
    tenant_id: tenantId, employee_id: emp!.id, event_type: 'check_out',
    event_time: '2026-07-13T19:30:00Z', method: 'mobile_web', created_by: userId,
  });
  const computed = processDay(
    [
      { eventType: 'check_in', eventTime: '2026-07-13T08:10:00Z' },
      { eventType: 'check_out', eventTime: '2026-07-13T19:30:00Z' },
    ],
    base,
  );
  const { error: dayErr } = await client.from('attendance_days').upsert(
    {
      tenant_id: tenantId, employee_id: emp!.id, work_date: '2026-07-13',
      shift_id: shift!.id, first_in: computed.firstIn, last_out: computed.lastOut,
      worked_minutes: computed.workedMinutes, late_minutes: computed.lateMinutes,
      early_departure_minutes: computed.earlyDepartureMinutes,
      overtime_minutes: computed.overtimeMinutes, status: computed.status,
    },
    { onConflict: 'tenant_id,employee_id,work_date' },
  );
  check('processed day upserted', !dayErr, dayErr?.message);

  // Overtime approval bounded by computed value (140).
  const { data: day } = await client.from('attendance_days')
    .select('id, overtime_minutes').eq('employee_id', emp!.id).eq('work_date', '2026-07-13').single();
  await client.from('attendance_days').update({
    overtime_approved_minutes: 120, overtime_approved_by: userId,
    overtime_approved_at: new Date().toISOString(),
  }).eq('id', day!.id);
  const { data: approvedDay } = await client.from('attendance_days')
    .select('overtime_approved_minutes').eq('id', day!.id).single();
  check('overtime approved (120 of 140 computed)',
    approvedDay?.overtime_approved_minutes === 120 && day?.overtime_minutes === 140);

  // Correction flow: correction events + reprocess semantics.
  const { data: correction, error: corrErr } = await client.from('attendance_corrections')
    .insert({
      tenant_id: tenantId, employee_id: emp!.id, work_date: '2026-07-14',
      corrected_in: '2026-07-14T08:00:00Z', corrected_out: '2026-07-14T17:00:00Z',
      reason: 'Forgot to check in', requested_by: userId,
    }).select('id').single();
  check('correction requested', !corrErr, corrErr?.message);
  await client.from('attendance_corrections').update({
    status: 'approved', decided_by: userId, decided_at: new Date().toISOString(),
  }).eq('id', correction!.id);
  await client.from('attendance_events').insert([
    { tenant_id: tenantId, employee_id: emp!.id, event_type: 'check_in', event_time: '2026-07-14T08:00:00Z', method: 'correction', created_by: userId },
    { tenant_id: tenantId, employee_id: emp!.id, event_type: 'check_out', event_time: '2026-07-14T17:00:00Z', method: 'correction', created_by: userId },
  ]);
  const corrected = processDay(
    [
      { eventType: 'check_in', eventTime: '2026-07-14T08:00:00Z' },
      { eventType: 'check_out', eventTime: '2026-07-14T17:00:00Z' },
    ],
    { ...base, workDate: '2026-07-14' },
  );
  check('corrected day reprocesses to present, 480min, no OT',
    corrected.status === 'present' && corrected.workedMinutes === 480 && corrected.overtimeMinutes === 0);

  // Timesheets: valid entry ok; >24h rejected by constraint.
  const { error: tsErr } = await client.from('timesheet_entries').insert({
    tenant_id: tenantId, employee_id: emp!.id, work_date: '2026-07-13',
    activity: 'Client installation', hours: 6.5, billable: true, created_by: userId,
  });
  const { error: tsBadErr } = await client.from('timesheet_entries').insert({
    tenant_id: tenantId, employee_id: emp!.id, work_date: '2026-07-13',
    activity: 'Impossible', hours: 30, created_by: userId,
  });
  check('timesheet entry created; 30h entry rejected', !tsErr && Boolean(tsBadErr));
} finally {
  if (tenantId) {
    await admin.from('attendance_events').delete().eq('tenant_id', tenantId);
    await admin.from('tenants').delete().eq('id', tenantId);
  }
  if (userId) await admin.auth.admin.deleteUser(userId);
  console.log('cleanup done');
}

if (failures > 0) {
  console.error(`\n${failures} check(s) FAILED`);
  process.exit(1);
}
console.log('\nAll Sprint 6 checks passed.');
