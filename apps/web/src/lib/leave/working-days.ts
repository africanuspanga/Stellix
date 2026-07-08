// Working-day arithmetic for leave requests. Weekends (Sat/Sun) and holidays
// are excluded. Framework-free and pure — the E2E suite tests it directly.

export function eachDate(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

export function isWeekend(date: string): boolean {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 0 || day === 6;
}

/**
 * Count working days in [startDate, endDate], excluding weekends and the
 * given holiday dates. A half-day request on a single working day counts 0.5.
 */
export function calcWorkingDays(
  startDate: string,
  endDate: string,
  holidays: Set<string>,
  isHalfDay = false,
): number {
  const working = eachDate(startDate, endDate).filter(
    (d) => !isWeekend(d) && !holidays.has(d),
  ).length;
  if (isHalfDay) return working > 0 ? 0.5 : 0;
  return working;
}
