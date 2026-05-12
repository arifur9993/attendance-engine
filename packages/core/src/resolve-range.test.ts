import { describe, expect, it } from 'vitest';
import { resolveRange } from './resolve-range.js';
import type { ResolveDayInput } from './types.js';

describe('resolveRange', () => {
  it('maps resolveDay over a list, preserving order', () => {
    const inputs: ResolveDayInput[] = [
      {
        date: '2026-06-01',
        punches: [{ at: '2026-06-01T08:58:00+06:00' }, { at: '2026-06-01T18:02:00+06:00' }],
        shift: { start: '09:00', end: '18:00', graceIn: 10 },
        policy: { pairing: 'first-last' },
      },
      {
        date: '2026-06-02',
        punches: [],
        shift: { start: '09:00', end: '18:00' },
        policy: { tzOffsetMinutes: 360 },
      },
    ];
    const out = resolveRange(inputs);
    expect(out.map((r) => r.date)).toEqual(['2026-06-01', '2026-06-02']);
    expect(out[0]!.status).toBe('present');
    expect(out[1]!.status).toBe('absent');
  });

  it('returns an empty array for empty input', () => {
    expect(resolveRange([])).toEqual([]);
  });
});
