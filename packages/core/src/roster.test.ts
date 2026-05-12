import { describe, expect, it } from 'vitest';
import { generateRoster } from './roster.js';

describe('generateRoster', () => {
  it('cycles a 4-on-4-off pattern', () => {
    const r = generateRoster('4-on-4-off', '2026-06-01', 10);
    expect(r).toHaveLength(10);
    expect(r[0]).toEqual({ date: '2026-06-01', shift: { label: 'day', start: '07:00', end: '19:00' } });
    expect(r[3]!.shift).not.toBeNull();
    expect(r[4]!.shift).toBeNull();
    expect(r[7]!.shift).toBeNull();
    expect(r[8]).toEqual({ date: '2026-06-09', shift: { label: 'day', start: '07:00', end: '19:00' } });
  });

  it('supports a custom pattern', () => {
    const r = generateRoster({ custom: [{ label: 'A', start: '06:00', end: '14:00' }, 'off'] }, '2026-06-01', 4);
    expect(r.map((d) => d.shift?.label ?? null)).toEqual(['A', null, 'A', null]);
    expect(r.map((d) => d.date)).toEqual(['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04']);
  });

  it('exposes the named patterns', () => {
    for (const p of ['2-2-3', 'pitman', 'dupont'] as const) {
      expect(generateRoster(p, '2026-06-01', 1)).toHaveLength(1);
    }
  });

  it('rejects bad input', () => {
    expect(() => generateRoster({ custom: [] }, '2026-06-01', 1)).toThrow();
    expect(() => generateRoster('4-on-4-off', '2026-06-01', -1)).toThrow();
    expect(() => generateRoster('4-on-4-off', 'nope', 1)).toThrow();
    expect(generateRoster('4-on-4-off', '2026-06-01', 0)).toEqual([]);
  });
});
