import { describe, expect, it } from 'vitest';
import { applyRounding } from './rounding.js';
import type { DayResult } from './types.js';

function mk(over: Partial<DayResult> = {}): DayResult {
  return {
    date: '2026-06-01',
    status: 'present',
    firstIn: '2026-06-01T09:00:00+06:00',
    lastOut: '2026-06-01T18:04:00+06:00',
    workedMinutes: 547,
    lateByMinutes: 3,
    earlyOutMinutes: 0,
    otMinutes: 4,
    spansMidnight: false,
    breaksDeducted: 0,
    flags: [],
    segments: [],
    ...over,
  };
}

describe('applyRounding', () => {
  it('rounds workedMinutes and otMinutes to the nearest unit by default', () => {
    const r = applyRounding(mk({ workedMinutes: 547, otMinutes: 4 }), { unit: 15 });
    expect(r.workedMinutes).toBe(540); // 547 → 36.46 * 15 → 540
    expect(r.otMinutes).toBe(0);       // 4 → rounds down to 0 at 15-min unit
  });

  it('does not modify the rest of the result', () => {
    const original = mk();
    const r = applyRounding(original, { unit: 15 });
    expect(r.firstIn).toBe(original.firstIn);
    expect(r.lastOut).toBe(original.lastOut);
    expect(r.segments).toEqual(original.segments);
    expect(r.flags).toEqual(original.flags);
    expect(original.workedMinutes).toBe(547); // input not mutated
  });

  it("respects mode: 'up' (always ceiling)", () => {
    const r = applyRounding(mk({ workedMinutes: 541, otMinutes: 1 }), { unit: 15, mode: 'up' });
    expect(r.workedMinutes).toBe(555);
    expect(r.otMinutes).toBe(15);
  });

  it("respects mode: 'down' (always floor)", () => {
    const r = applyRounding(mk({ workedMinutes: 554, otMinutes: 14 }), { unit: 15, mode: 'down' });
    expect(r.workedMinutes).toBe(540);
    expect(r.otMinutes).toBe(0);
  });

  it('honours an explicit applyTo list', () => {
    const r = applyRounding(mk({ workedMinutes: 547, otMinutes: 4, lateByMinutes: 3 }), {
      unit: 15,
      applyTo: ['lateByMinutes'],
    });
    expect(r.workedMinutes).toBe(547); // not rounded
    expect(r.otMinutes).toBe(4);       // not rounded
    expect(r.lateByMinutes).toBe(0);   // rounded
  });

  it('is a no-op at unit=1', () => {
    const original = mk({ workedMinutes: 547, otMinutes: 4 });
    const r = applyRounding(original, { unit: 1 });
    expect(r.workedMinutes).toBe(547);
    expect(r.otMinutes).toBe(4);
  });

  it('rejects a non-positive-integer unit', () => {
    expect(() => applyRounding(mk(), { unit: 0 })).toThrow();
    expect(() => applyRounding(mk(), { unit: -5 })).toThrow();
    expect(() => applyRounding(mk(), { unit: 1.5 })).toThrow();
  });
});
