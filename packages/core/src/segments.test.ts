import { describe, expect, it } from 'vitest';
import { buildSegments, dedupeAndSort, type PunchInstant } from './segments.js';

const p = (ms: number, offsetMinutes = 0): PunchInstant => ({ ms, offsetMinutes });
const MIN = 60_000;

describe('dedupeAndSort', () => {
  it('sorts ascending and drops near-duplicates', () => {
    const { punches, hadDuplicates } = dedupeAndSort([p(3 * MIN), p(1 * MIN), p(1 * MIN + 20_000)], 60);
    expect(hadDuplicates).toBe(true);
    expect(punches.map((x) => x.ms)).toEqual([1 * MIN, 3 * MIN]);
  });

  it('keeps everything when nothing is within the window', () => {
    const { punches, hadDuplicates } = dedupeAndSort([p(0), p(5 * MIN)], 60);
    expect(hadDuplicates).toBe(false);
    expect(punches).toHaveLength(2);
  });
});

describe('buildSegments', () => {
  it('returns nothing for an empty list', () => {
    expect(buildSegments([], 'first-last')).toEqual({
      segments: [],
      flags: [],
      oddPunchUnresolved: false,
      danglingInMs: null,
      danglingInOffset: null,
    });
  });

  it('first-last with one punch leaves a dangling in', () => {
    const r = buildSegments([p(9 * MIN, 360)], 'first-last');
    expect(r.segments).toEqual([]);
    expect(r.oddPunchUnresolved).toBe(true);
    expect(r.danglingInMs).toBe(9 * MIN);
    expect(r.danglingInOffset).toBe(360);
  });

  it('first-last with many punches makes one spanning segment', () => {
    const r = buildSegments([p(0), p(2 * MIN), p(8 * MIN)], 'first-last');
    expect(r.segments).toEqual([{ inMs: 0, outMs: 8 * MIN, inOffset: 0, outOffset: 0, minutes: 8 }]);
    expect(r.oddPunchUnresolved).toBe(false);
  });

  it('in-out-pairs with an even count pairs them up', () => {
    const r = buildSegments([p(0), p(2 * MIN), p(5 * MIN), p(9 * MIN)], 'in-out-pairs');
    expect(r.segments.map((s) => s.minutes)).toEqual([2, 4]);
    expect(r.oddPunchUnresolved).toBe(false);
    expect(r.danglingInMs).toBeNull();
  });

  it('in-out-pairs with an odd count leaves a dangling in', () => {
    const r = buildSegments([p(0), p(2 * MIN), p(5 * MIN)], 'in-out-pairs');
    expect(r.segments.map((s) => s.minutes)).toEqual([2]);
    expect(r.oddPunchUnresolved).toBe(true);
    expect(r.danglingInMs).toBe(5 * MIN);
  });
});
