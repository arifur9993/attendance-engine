import { describe, expect, it } from 'vitest';
import { detectRoundNumberBias, uniqueFlags } from './flags.js';
import type { PunchInstant } from './segments.js';

const MIN = 60_000;
const punch = (ms: number): PunchInstant => ({ ms, offsetMinutes: 0 });

describe('detectRoundNumberBias', () => {
  it('returns nothing for fewer than two punches', () => {
    expect(detectRoundNumberBias([])).toEqual([]);
    expect(detectRoundNumberBias([punch(0)])).toEqual([]);
  });

  it('flags when every punch sits on a 5-minute boundary with zero seconds', () => {
    expect(detectRoundNumberBias([punch(0), punch(15 * MIN), punch(540 * MIN)])).toEqual(['round-number-bias']);
  });

  it('does not flag when any punch is off the boundary', () => {
    expect(detectRoundNumberBias([punch(0), punch(13 * MIN)])).toEqual([]);
    expect(detectRoundNumberBias([punch(0), punch(15 * MIN + 7_000)])).toEqual([]);
  });
});

describe('uniqueFlags', () => {
  it('drops repeats, preserves first-seen order', () => {
    expect(uniqueFlags(['odd-punch-count', 'no-punches', 'odd-punch-count', 'duplicate-punch'])).toEqual([
      'odd-punch-count',
      'no-punches',
      'duplicate-punch',
    ]);
  });

  it('passes a list with no repeats through unchanged', () => {
    expect(uniqueFlags(['duplicate-punch'])).toEqual(['duplicate-punch']);
  });
});
