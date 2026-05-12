import { describe, expect, it } from 'vitest';
import { resolveDay } from './resolve-day.js';
import { summarize } from './summarize.js';
import type { DayResult, DayStatus, ResolveDayInput } from './types.js';

const shift = { start: '09:00', end: '18:00', graceIn: 10 } as const;

function day(date: string, punches: string[] | null, extra: Partial<ResolveDayInput> = {}) {
  return resolveDay({
    date,
    punches: (punches ?? []).map((at) => ({ at })),
    shift,
    policy: { pairing: 'first-last' },
    ...extra,
  });
}

describe('summarize', () => {
  it('aggregates a mixed week', () => {
    const results = [
      day('2026-06-01', ['2026-06-01T08:58:00+06:00', '2026-06-01T18:02:00+06:00']), // present
      day('2026-06-02', ['2026-06-02T09:23:00+06:00', '2026-06-02T18:00:00+06:00']), // late
      day('2026-06-03', null), // absent
      day('2026-06-04', null, { holiday: true }), // holiday
      day('2026-06-05', null, { leave: { type: 'annual' } }), // leave
      day('2026-06-06', null, { weekend: true }), // weekend
    ];
    const s = summarize(results);
    expect(s.days).toBe(6);
    expect(s.presentDays).toBe(1);
    expect(s.lateDays).toBe(1);
    expect(s.absentDays).toBe(1);
    expect(s.holidayDays).toBe(1);
    expect(s.leaveDays).toBe(1);
    expect(s.weekendDays).toBe(1);
    expect(s.totalLateMinutes).toBe(13);
    // attended (present + late) / (days - leave - holiday - weekend) = 2 / 3
    expect(s.attendanceRate).toBeCloseTo(2 / 3);
    expect(s.flagCounts['no-punches']).toBe(4);
  });

  it('returns null attendanceRate when nothing is expected', () => {
    const s = summarize([day('2026-06-04', null, { holiday: true })]);
    expect(s.attendanceRate).toBeNull();
  });

  it('handles an empty list', () => {
    const s = summarize([]);
    expect(s.days).toBe(0);
    expect(s.attendanceRate).toBeNull();
    expect(s.flagCounts).toEqual({});
  });

  it('counts half-day and incomplete statuses', () => {
    const mk = (status: DayStatus): DayResult => ({
      date: '2026-06-01',
      status,
      firstIn: null,
      lastOut: null,
      workedMinutes: 0,
      lateByMinutes: 0,
      earlyOutMinutes: 0,
      otMinutes: 0,
      spansMidnight: false,
      breaksDeducted: 0,
      flags: [],
      segments: [],
    });
    const s = summarize([mk('half-day'), mk('incomplete'), mk('incomplete')]);
    expect(s.halfDays).toBe(1);
    expect(s.incompleteDays).toBe(2);
    // half-day counts as attended; incomplete does not — attended 1 / expected 3
    expect(s.attendanceRate).toBeCloseTo(1 / 3);
  });
});
