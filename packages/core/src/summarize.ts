/** Aggregate many {@link DayResult}s into a {@link PeriodSummary}. */

import type { DayResult, Flag, PeriodSummary } from './types.js';

export function summarize(results: DayResult[]): PeriodSummary {
  const flagCounts: Partial<Record<Flag, number>> = {};
  const s: PeriodSummary = {
    days: results.length,
    presentDays: 0,
    lateDays: 0,
    absentDays: 0,
    halfDays: 0,
    leaveDays: 0,
    holidayDays: 0,
    weekendDays: 0,
    incompleteDays: 0,
    totalWorkedMinutes: 0,
    totalOtMinutes: 0,
    totalLateMinutes: 0,
    totalEarlyOutMinutes: 0,
    attendanceRate: null,
    flagCounts,
  };

  for (const r of results) {
    switch (r.status) {
      case 'present': s.presentDays += 1; break;
      case 'late': s.lateDays += 1; break;
      case 'absent': s.absentDays += 1; break;
      case 'half-day': s.halfDays += 1; break;
      case 'leave': s.leaveDays += 1; break;
      case 'holiday': s.holidayDays += 1; break;
      case 'weekend': s.weekendDays += 1; break;
      case 'incomplete': s.incompleteDays += 1; break;
    }
    s.totalWorkedMinutes += r.workedMinutes;
    s.totalOtMinutes += r.otMinutes;
    s.totalLateMinutes += r.lateByMinutes;
    s.totalEarlyOutMinutes += r.earlyOutMinutes;
    for (const f of r.flags) {
      flagCounts[f] = (flagCounts[f] ?? 0) + 1;
    }
  }

  // Count "late" and "half-day" days as attended (the person showed up).
  const attended = s.presentDays + s.lateDays + s.halfDays;
  const expected = s.days - s.leaveDays - s.holidayDays - s.weekendDays;
  s.attendanceRate = expected > 0 ? attended / expected : null;

  return s;
}
