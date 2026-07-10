// Attendance day processing (blueprint §3.5): pure computation from raw
// events + shift + leave/holiday context. Recalculable at any time — raw
// events are never mutated. Framework-free; the E2E suite drives this code.

export interface ShiftSpec {
  startTime: string;          // 'HH:MM' | 'HH:MM:SS'
  endTime: string;            // < startTime ⇒ crosses midnight
  graceMinutes: number;
  unpaidBreakMinutes: number;
  requiredHours: number;
  overtimeEligible: boolean;
}

export interface AttendanceEventInput {
  eventType: 'check_in' | 'check_out';
  eventTime: string;          // ISO timestamp
}

export interface DayContext {
  workDate: string;           // YYYY-MM-DD
  shift: ShiftSpec | null;
  isHoliday: boolean;
  isOnApprovedLeave: boolean;
  isWeekend: boolean;
}

export interface ProcessedDay {
  status:
    | 'present' | 'late' | 'absent' | 'half_day' | 'on_leave' | 'holiday'
    | 'rest_day' | 'missing_in' | 'missing_out';
  firstIn: string | null;
  lastOut: string | null;
  workedMinutes: number;
  lateMinutes: number;
  earlyDepartureMinutes: number;
  overtimeMinutes: number;
}

// Tanzania observes East Africa Time (UTC+3) year-round with no DST, so shift
// wall-clock times ('08:00') are local and must be anchored to +03:00 before
// comparing to the UTC event instants — otherwise every late/early figure is
// off by three hours.
export const EAT_OFFSET = '+03:00';

function shiftBoundary(workDate: string, time: string, addDays = 0): number {
  const t = time.length === 5 ? `${time}:00` : time;
  const d = new Date(`${workDate}T${t}${EAT_OFFSET}`);
  d.setUTCDate(d.getUTCDate() + addDays);
  return d.getTime();
}

/** Process one employee-day from its raw events and context. */
export function processDay(
  events: AttendanceEventInput[],
  context: DayContext,
): ProcessedDay {
  const empty: Omit<ProcessedDay, 'status'> = {
    firstIn: null,
    lastOut: null,
    workedMinutes: 0,
    lateMinutes: 0,
    earlyDepartureMinutes: 0,
    overtimeMinutes: 0,
  };

  if (context.isOnApprovedLeave) return { status: 'on_leave', ...empty };

  const ins = events
    .filter((e) => e.eventType === 'check_in')
    .map((e) => new Date(e.eventTime).getTime())
    .sort((a, b) => a - b);
  const outs = events
    .filter((e) => e.eventType === 'check_out')
    .map((e) => new Date(e.eventTime).getTime())
    .sort((a, b) => a - b);

  const hasEvents = ins.length > 0 || outs.length > 0;
  if (!hasEvents) {
    if (context.isHoliday) return { status: 'holiday', ...empty };
    if (!context.shift && context.isWeekend) return { status: 'rest_day', ...empty };
    if (!context.shift) return { status: 'rest_day', ...empty };
    return { status: 'absent', ...empty };
  }

  const firstIn = ins[0] ?? null;
  const lastOut = outs.length > 0 ? outs[outs.length - 1] : null;

  if (firstIn === null) {
    return {
      status: 'missing_in',
      ...empty,
      lastOut: new Date(lastOut!).toISOString(),
    };
  }
  if (lastOut === null || lastOut <= firstIn) {
    return {
      status: 'missing_out',
      ...empty,
      firstIn: new Date(firstIn).toISOString(),
    };
  }

  const grossMinutes = Math.round((lastOut - firstIn) / 60_000);
  const breakMinutes = context.shift?.unpaidBreakMinutes ?? 0;
  const workedMinutes = Math.max(0, grossMinutes - breakMinutes);

  let lateMinutes = 0;
  let earlyDepartureMinutes = 0;
  let overtimeMinutes = 0;

  if (context.shift) {
    const crossesMidnight = context.shift.endTime < context.shift.startTime;
    const startMs = shiftBoundary(context.workDate, context.shift.startTime);
    const endMs = shiftBoundary(context.workDate, context.shift.endTime, crossesMidnight ? 1 : 0);
    const graceMs = context.shift.graceMinutes * 60_000;

    lateMinutes = Math.max(0, Math.round((firstIn - (startMs + graceMs)) / 60_000));
    earlyDepartureMinutes = Math.max(0, Math.round((endMs - lastOut) / 60_000));

    if (context.shift.overtimeEligible) {
      const requiredMinutes = Math.round(context.shift.requiredHours * 60);
      overtimeMinutes = Math.max(0, workedMinutes - requiredMinutes);
    }
  }

  // Half day: worked less than half the required time.
  const requiredMinutes = Math.round((context.shift?.requiredHours ?? 8) * 60);
  const status: ProcessedDay['status'] =
    workedMinutes < requiredMinutes / 2
      ? 'half_day'
      : lateMinutes > 0
        ? 'late'
        : 'present';

  return {
    status,
    firstIn: new Date(firstIn).toISOString(),
    lastOut: new Date(lastOut).toISOString(),
    workedMinutes,
    lateMinutes,
    earlyDepartureMinutes,
    overtimeMinutes,
  };
}
