import { describe, expect, it } from 'vitest';
import { resolveDay } from './resolve-day.js';
import { TimeParseError } from './time.js';
import type { AttendancePolicy, ResolveDayInput, ShiftConfig } from './types.js';

const D = '2026-06-01';
const TZ = '+06:00';

function at(hhmmss: string, day: string = D, tz: string = TZ): { at: string } {
  return { at: `${day}T${hhmmss}${tz}` };
}

function run(
  punches: { at: string }[],
  shift: ShiftConfig,
  policy: AttendancePolicy = { pairing: 'first-last' },
  extra: Partial<ResolveDayInput> = {},
) {
  return resolveDay({ date: D, punches, shift, policy, ...extra });
}

const NINE_TO_SIX: ShiftConfig = { start: '09:00', end: '18:00', graceIn: 10 };

describe('resolveDay — basics', () => {
  it('works with no policy (defaults applied)', () => {
    const r = resolveDay({ date: D, punches: [at('08:57:00'), at('18:04:00')], shift: NINE_TO_SIX });
    expect(r.status).toBe('present');
    expect(r.workedMinutes).toBe(547);
    expect(r.otMinutes).toBe(4);
    expect(r.lateByMinutes).toBe(0);
    expect(r.earlyOutMinutes).toBe(0);
    expect(r.spansMidnight).toBe(false);
    expect(r.segments).toHaveLength(1);
    expect(r.flags).toEqual([]);
    expect(r.firstIn).toBe('2026-06-01T08:57:00+06:00');
    expect(r.lastOut).toBe('2026-06-01T18:04:00+06:00');
  });

  it('derives the tz offset from the first punch when policy omits it (+05:30)', () => {
    const r = run([at('09:08:00', D, '+05:30'), at('18:00:00', D, '+05:30')], NINE_TO_SIX);
    expect(r.status).toBe('present');
    expect(r.firstIn).toBe('2026-06-01T09:08:00+05:30');
    expect(r.lastOut).toBe('2026-06-01T18:00:00+05:30');
  });
});

describe('resolveDay — lateness', () => {
  it('marks late past the grace window', () => {
    const r = run([at('09:23:00'), at('18:00:00')], NINE_TO_SIX);
    expect(r.status).toBe('late');
    expect(r.lateByMinutes).toBe(13);
  });

  it('lateAfterGrace: ignore → reports zero late and stays present', () => {
    const r = run([at('09:23:00'), at('18:00:00')], NINE_TO_SIX, { pairing: 'first-last', lateAfterGrace: 'ignore' });
    expect(r.lateByMinutes).toBe(0);
    expect(r.status).toBe('present');
  });

  it('lateAfterGrace: deduct → late minutes come off worked time', () => {
    const r = run([at('09:23:00'), at('18:00:00')], NINE_TO_SIX, { pairing: 'first-last', lateAfterGrace: 'deduct' });
    expect(r.lateByMinutes).toBe(13);
    expect(r.workedMinutes).toBe(517 - 13);
    expect(r.status).toBe('late');
  });
});

describe('resolveDay — early out', () => {
  it('computes early-out minutes', () => {
    const r = run([at('09:00:00'), at('17:31:00')], NINE_TO_SIX);
    expect(r.earlyOutMinutes).toBe(29);
    expect(r.status).toBe('present');
  });
});

describe('resolveDay — overtime', () => {
  it('applies threshold then rounding (shift-based)', () => {
    const r = run([at('09:00:00'), at('18:34:00')], NINE_TO_SIX, { pairing: 'first-last', otThresholdMinutes: 15, otRoundingUnit: 15 });
    expect(r.otMinutes).toBe(15);
  });

  it('fixed-hours mode counts everything past the standard day', () => {
    const r = run([at('09:01:00'), at('19:01:00')], NINE_TO_SIX, { pairing: 'first-last', otMode: 'fixed-hours', standardDayMinutes: 480, otThresholdMinutes: 0 });
    expect(r.workedMinutes).toBe(600);
    expect(r.otMinutes).toBe(120);
    expect(r.status).toBe('present');
  });

  it('no overtime when worked is below the standard day (fixed-hours)', () => {
    const r = run([at('09:01:00'), at('12:01:00')], { ...NINE_TO_SIX }, { pairing: 'first-last', otMode: 'daily-cap', standardDayMinutes: 480 });
    expect(r.otMinutes).toBe(0);
  });

  it('no overtime when finishing before shift end', () => {
    const r = run([at('09:00:00'), at('17:30:00')], NINE_TO_SIX);
    expect(r.otMinutes).toBe(0);
  });
});

describe('resolveDay — flexible shift', () => {
  it('ignores lateness, early-out and shift-end overtime', () => {
    const r = run([at('10:02:00'), at('14:07:00')], { start: '09:00', end: '18:00', flexible: true });
    expect(r.lateByMinutes).toBe(0);
    expect(r.earlyOutMinutes).toBe(0);
    expect(r.otMinutes).toBe(0);
    expect(r.workedMinutes).toBe(245);
    expect(r.status).toBe('present');
  });
});

describe('resolveDay — half-day threshold', () => {
  it('classifies a short day as half-day', () => {
    const r = run([at('09:02:00'), at('12:01:00')], { start: '09:00', end: '18:00', graceIn: 10, minHalfDayMinutes: 240 });
    expect(r.workedMinutes).toBeLessThan(240);
    expect(r.status).toBe('half-day');
  });
});

describe('resolveDay — leave / holiday / weekend context', () => {
  it('leave wins over computed status, but worked time is still computed', () => {
    const r = run([at('09:00:00'), at('18:00:00')], NINE_TO_SIX, { pairing: 'first-last' }, { leave: { type: 'annual' } });
    expect(r.status).toBe('leave');
    expect(r.workedMinutes).toBe(540);
    expect(r.firstIn).not.toBeNull();
  });

  it('holiday wins', () => {
    const r = run([at('09:00:00'), at('18:00:00')], NINE_TO_SIX, { pairing: 'first-last' }, { holiday: true });
    expect(r.status).toBe('holiday');
  });

  it('weekend wins', () => {
    const r = run([at('09:00:00'), at('18:00:00')], NINE_TO_SIX, { pairing: 'first-last' }, { weekend: true });
    expect(r.status).toBe('weekend');
  });

  it('no punches on a holiday → holiday status with no-punches flag', () => {
    const r = resolveDay({ date: D, punches: [], shift: NINE_TO_SIX, policy: { tzOffsetMinutes: 360 }, holiday: true });
    expect(r.status).toBe('holiday');
    expect(r.flags).toContain('no-punches');
    expect(r.firstIn).toBeNull();
  });
});

describe('resolveDay — no punches', () => {
  it('is absent with a no-punches flag', () => {
    const r = resolveDay({ date: D, punches: [], shift: NINE_TO_SIX, policy: { tzOffsetMinutes: 360 } });
    expect(r.status).toBe('absent');
    expect(r.flags).toEqual(['no-punches']);
    expect(r.firstIn).toBeNull();
    expect(r.lastOut).toBeNull();
    expect(r.segments).toEqual([]);
    expect(r.workedMinutes).toBe(0);
  });
});

describe('resolveDay — missing punch-out handling', () => {
  const threePunches = [at('08:58:00'), at('13:01:00'), at('14:02:00')];

  it("shift-end: closes the open segment at the scheduled end", () => {
    const r = run(threePunches, NINE_TO_SIX, { pairing: 'in-out-pairs', treatMissingOutAs: 'shift-end' });
    expect(r.flags).toContain('missing-out-resolved');
    expect(r.segments).toHaveLength(2);
    expect(r.lastOut).toBe('2026-06-01T18:00:00+06:00');
    expect(r.status).toBe('present');
  });

  it("shift-end: can't resolve when the dangling punch is at/after shift end → incomplete", () => {
    const r = run([at('09:00:00'), at('13:00:00'), at('19:00:00')], NINE_TO_SIX, { pairing: 'in-out-pairs', treatMissingOutAs: 'shift-end' });
    expect(r.flags).toContain('odd-punch-count');
    expect(r.status).toBe('incomplete');
  });

  it('flag-only (default): incomplete with an odd-punch-count flag', () => {
    const r = run([at('09:00:00'), at('13:00:00'), at('14:00:00')], NINE_TO_SIX, { pairing: 'in-out-pairs' });
    expect(r.flags).toContain('odd-punch-count');
    expect(r.status).toBe('incomplete');
  });

  it('half-day: forces half-day status', () => {
    const r = run(threePunches, NINE_TO_SIX, { pairing: 'in-out-pairs', treatMissingOutAs: 'half-day' });
    expect(r.flags).toContain('odd-punch-count');
    expect(r.status).toBe('half-day');
  });

  it('absent: with already-paired segments → incomplete', () => {
    const r = run(threePunches, NINE_TO_SIX, { pairing: 'in-out-pairs', treatMissingOutAs: 'absent' });
    expect(r.flags).toContain('odd-punch-count');
    expect(r.status).toBe('incomplete');
  });

  it('absent: with nothing usable → absent', () => {
    const r = run([at('09:00:00')], NINE_TO_SIX, { pairing: 'first-last', treatMissingOutAs: 'absent' });
    expect(r.status).toBe('absent');
    expect(r.flags).toContain('odd-punch-count');
    expect(r.firstIn).toBeNull();
    expect(r.segments).toEqual([]);
  });

  it('a single punch with first-last + flag-only → incomplete', () => {
    const r = run([at('09:00:00')], NINE_TO_SIX, { pairing: 'first-last' });
    expect(r.flags).toContain('odd-punch-count');
    expect(r.status).toBe('incomplete');
  });
});

describe('resolveDay — data-integrity flags', () => {
  it('drops and flags a duplicate punch within the dedupe window', () => {
    const r = run([at('09:01:00'), at('09:01:20'), at('18:00:00')], NINE_TO_SIX, { pairing: 'first-last', dedupeSeconds: 60 });
    expect(r.flags).toContain('duplicate-punch');
    expect(r.workedMinutes).toBe(539);
  });

  it('flags round-number bias when every punch is on a 5-minute boundary', () => {
    const r = run([at('09:00:00'), at('18:00:00')], NINE_TO_SIX);
    expect(r.flags).toContain('round-number-bias');
  });
});

describe('resolveDay — breaks', () => {
  it('does not deduct a paid break', () => {
    const r = run([at('09:00:00'), at('18:00:00')], { start: '09:00', end: '18:00', graceIn: 10, breaks: [{ start: '13:00', end: '14:00', paid: true }] });
    expect(r.breaksDeducted).toBe(0);
    expect(r.workedMinutes).toBe(540);
  });

  it('deducts an unpaid break fully inside the worked segment', () => {
    const r = run([at('09:00:00'), at('18:00:00')], { start: '09:00', end: '18:00', graceIn: 10, breaks: [{ start: '13:00', end: '14:00', paid: false }] });
    expect(r.breaksDeducted).toBe(60);
    expect(r.workedMinutes).toBe(480);
  });

  it('deducts only the overlapping part of an unpaid break', () => {
    const r = run([at('13:30:00'), at('18:00:00')], { start: '09:00', end: '18:00', breaks: [{ start: '13:00', end: '14:00', paid: false }] });
    expect(r.breaksDeducted).toBe(30);
  });

  it('deducts nothing when an unpaid break falls between worked segments', () => {
    const r = run(
      [at('09:00:00'), at('11:00:00'), at('14:00:00'), at('18:00:00')],
      { start: '09:00', end: '18:00', graceIn: 10, breaks: [{ start: '12:00', end: '13:00', paid: false }] },
      { pairing: 'in-out-pairs' },
    );
    expect(r.breaksDeducted).toBe(0);
    expect(r.workedMinutes).toBe(120 + 240);
  });

  it('an empty breaks array deducts nothing', () => {
    const r = run([at('09:00:00'), at('18:00:00')], { start: '09:00', end: '18:00', graceIn: 10, breaks: [] });
    expect(r.breaksDeducted).toBe(0);
  });

  it('deducts nothing when there are no worked segments even if breaks are defined', () => {
    const r = run([at('09:00:00')], { start: '09:00', end: '18:00', graceIn: 10, breaks: [{ start: '13:00', end: '14:00', paid: false }] }, { pairing: 'first-last' });
    expect(r.breaksDeducted).toBe(0);
    expect(r.status).toBe('incomplete');
  });
});

describe('resolveDay — overnight', () => {
  it('spans midnight, attributes the post-midnight time to this duty, and counts overtime', () => {
    const r = run([at('21:54:00'), at('06:18:00', '2026-06-02')], { start: '22:00', end: '06:00' });
    expect(r.spansMidnight).toBe(true);
    expect(r.workedMinutes).toBe(504);
    expect(r.otMinutes).toBe(18);
    expect(r.status).toBe('present');
    expect(r.lastOut).toBe('2026-06-02T06:18:00+06:00');
  });

  it('deducts an unpaid break whose window crosses midnight', () => {
    const r = run([at('21:54:00'), at('06:18:00', '2026-06-02')], { start: '22:00', end: '06:00', breaks: [{ start: '23:30', end: '00:30', paid: false }] });
    expect(r.breaksDeducted).toBe(60);
    expect(r.workedMinutes).toBe(444);
  });
});

describe('resolveDay — input validation', () => {
  it('throws on a punch without an explicit offset', () => {
    expect(() => resolveDay({ date: D, punches: [{ at: '2026-06-01T08:00:00' }], shift: NINE_TO_SIX })).toThrow(TimeParseError);
  });

  it('throws on a malformed shift time', () => {
    expect(() => run([at('09:00:00'), at('18:00:00')], { start: '9am', end: '18:00' })).toThrow(TimeParseError);
  });
});
