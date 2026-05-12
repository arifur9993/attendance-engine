import { bench, describe } from 'vitest';
import { resolveDay, generateRoster, resolveRange, summarize } from '../src/index.js';
import type { ResolveDayInput } from '../src/index.js';

const simple: ResolveDayInput = {
  date: '2026-06-01',
  punches: [
    { at: '2026-06-01T08:57:00+06:00' },
    { at: '2026-06-01T18:04:00+06:00' },
  ],
  shift: { start: '09:00', end: '18:00', graceIn: 10 },
  policy: { pairing: 'first-last' },
};

const multiSegment: ResolveDayInput = {
  date: '2026-06-01',
  punches: [
    { at: '2026-06-01T08:58:00+06:00' },
    { at: '2026-06-01T13:01:00+06:00' },
    { at: '2026-06-01T13:48:00+06:00' },
    { at: '2026-06-01T19:34:00+06:00' },
  ],
  shift: { start: '09:00', end: '18:00', breaks: [{ start: '13:00', end: '14:00', paid: false }], graceIn: 10 },
  policy: { pairing: 'in-out-pairs', otThresholdMinutes: 15, otRoundingUnit: 15 },
};

const month: ResolveDayInput[] = Array.from({ length: 30 }, (_, i) => ({
  ...simple,
  date: `2026-06-${String(i + 1).padStart(2, '0')}`,
}));

describe('resolveDay', () => {
  bench('single in/out pair', () => {
    resolveDay(simple);
  });
  bench('multi-segment day with an unpaid break', () => {
    resolveDay(multiSegment);
  });
});

describe('period operations', () => {
  bench('resolveRange + summarize over a 30-day month', () => {
    summarize(resolveRange(month));
  });
});

describe('generateRoster', () => {
  bench('dupont 28-day pattern over a year', () => {
    generateRoster('dupont', '2026-01-01', 365);
  });
});
