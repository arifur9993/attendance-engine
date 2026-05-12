import { describe, expect, it } from 'vitest';
import {
  addDays,
  instantFromLocal,
  instantToIso,
  localDateOf,
  minutesBetween,
  offsetToken,
  parseDate,
  parseHhmm,
  parseInstant,
  roundToUnit,
  TimeParseError,
} from './time.js';

describe('parseInstant', () => {
  it('parses an ISO instant with a positive offset', () => {
    const p = parseInstant('2026-06-01T08:57:00+06:00');
    expect(p.offsetMinutes).toBe(360);
    expect(p.localDate).toBe('2026-06-01');
    expect(p.localMinutes).toBe(8 * 60 + 57);
    // 08:57 +06:00 === 02:57 UTC
    expect(p.ms).toBe(Date.UTC(2026, 5, 1, 2, 57, 0));
  });

  it('parses Z and negative offsets', () => {
    expect(parseInstant('2026-01-02T00:00:00Z').ms).toBe(Date.UTC(2026, 0, 2));
    expect(parseInstant('2026-01-02T00:00:00-05:00').ms).toBe(Date.UTC(2026, 0, 2, 5));
    expect(parseInstant('2026-01-02 00:00-05:00').offsetMinutes).toBe(-300);
  });

  it('rejects a timestamp without an offset', () => {
    expect(() => parseInstant('2026-06-01T08:57:00')).toThrow(TimeParseError);
  });

  it('rejects out-of-range components', () => {
    expect(() => parseInstant('2026-13-01T00:00:00Z')).toThrow(TimeParseError);
    expect(() => parseInstant('2026-06-01T25:00:00Z')).toThrow(TimeParseError);
  });
});

describe('parseDate / parseHhmm', () => {
  it('parses valid values', () => {
    expect(parseDate('2026-06-01')).toEqual([2026, 6, 1]);
    expect(parseHhmm('09:30')).toBe(570);
  });
  it('rejects invalid values', () => {
    expect(() => parseDate('2026/06/01')).toThrow(TimeParseError);
    expect(() => parseDate('2026-00-01')).toThrow(TimeParseError);
    expect(() => parseHhmm('9:30')).toThrow(TimeParseError);
    expect(() => parseHhmm('09:99')).toThrow(TimeParseError);
  });
});

describe('instant <-> local round-trips', () => {
  it('builds and renders an instant in a fixed offset', () => {
    const ms = instantFromLocal('2026-06-01', 9 * 60, 0, 360);
    expect(instantToIso(ms, 360)).toBe('2026-06-01T09:00:00+06:00');
    expect(localDateOf(ms, 360)).toBe('2026-06-01');
  });
  it('handles a day offset (overnight end)', () => {
    const ms = instantFromLocal('2026-06-01', 6 * 60, 1, 360);
    expect(instantToIso(ms, 360)).toBe('2026-06-02T06:00:00+06:00');
  });
  it('renders negative offsets', () => {
    const ms = instantFromLocal('2026-06-01', 0, 0, -300);
    expect(instantToIso(ms, -300)).toBe('2026-06-01T00:00:00-05:00');
  });
});

describe('helpers', () => {
  it('minutesBetween rounds to the nearest minute', () => {
    expect(minutesBetween(0, 90_000)).toBe(2); // 90s
    expect(minutesBetween(0, 60_000)).toBe(1);
  });
  it('roundToUnit', () => {
    expect(roundToUnit(7, 1)).toBe(7);
    expect(roundToUnit(7, 15)).toBe(0);
    expect(roundToUnit(8, 15)).toBe(15);
    expect(roundToUnit(22, 15)).toBe(15);
    expect(roundToUnit(23, 15)).toBe(30);
  });
  it('offsetToken', () => {
    expect(offsetToken(360)).toBe('+06:00');
    expect(offsetToken(-330)).toBe('-05:30');
    expect(offsetToken(0)).toBe('+00:00');
  });
  it('addDays crosses month boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});
