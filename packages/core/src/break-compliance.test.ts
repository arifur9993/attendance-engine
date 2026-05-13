import { describe, expect, it } from 'vitest';
import { resolveDay } from './resolve-day.js';
import { evaluateBreakCompliance } from './break-compliance.js';
import { BREAK_RULE_SETS, defineBreakRuleSet } from './rule-packs.js';
import type { DayResult, ResolveDayInput, ShiftConfig } from './types.js';

const SHIFT_8H: ShiftConfig = { start: '09:00', end: '18:00', graceIn: 10 };
const SHIFT_12H: ShiftConfig = { start: '09:00', end: '22:00', graceIn: 10 };

function run(
  punches: string[],
  shift: ShiftConfig = SHIFT_8H,
  extra: Partial<ResolveDayInput> = {},
): DayResult {
  return resolveDay({
    date: '2026-06-01',
    punches: punches.map((at) => ({ at: `2026-06-01T${at}+06:00` })),
    shift,
    policy: { pairing: 'in-out-pairs' },
    ...extra,
  });
}

describe('evaluateBreakCompliance — CA pack', () => {
  it('full compliance: 30-min meal taken before the 5th hour', () => {
    const result = run([
      '09:00:00', '13:00:00',  // 4h work
      '13:35:00', '18:00:00',  // 4h25m work; 35-min meal at hour 4
    ]);
    const out = evaluateBreakCompliance({ result, rules: BREAK_RULE_SETS.CA });
    expect(out.meals[0]!.status).toBe('compliant');
    expect(out.meals[1]!.status).toBe('not-required'); // workday < 10h
    expect(out.premiumsOwed.meal).toBe(0);
    expect(out.presumptionRisk).toBe('low');
  });

  it('late meal: started after the 5th hour → premium owed, presumption risk high', () => {
    const result = run([
      '09:00:00', '14:30:00',  // 5h30m worked before meal
      '15:00:00', '18:00:00',  // 30-min meal at hour 5.5
    ]);
    const out = evaluateBreakCompliance({ result, rules: BREAK_RULE_SETS.CA });
    expect(out.meals[0]!.status).toBe('late');
    expect(out.meals[0]!.premiumOwed).toBe(true);
    expect(out.premiumsOwed.meal).toBe(1);
    expect(out.presumptionRisk).toBe('high');
  });

  it('short meal: under 30 minutes → short status, premium owed', () => {
    const result = run([
      '09:00:00', '13:00:00',  // 4h
      '13:25:00', '18:00:00',  // 25-min meal — at edge of detection threshold
    ]);
    const out = evaluateBreakCompliance({ result, rules: BREAK_RULE_SETS.CA });
    expect(out.meals[0]!.status).toBe('short');
    expect(out.premiumsOwed.meal).toBe(1);
  });

  it('missing meal: no qualifying gap on a >5h day', () => {
    const result = run([
      '09:00:00', '15:00:00',  // continuous 6h
      '15:05:00', '18:00:00',  // only a 5-min gap (rest, not meal)
    ]);
    const out = evaluateBreakCompliance({ result, rules: BREAK_RULE_SETS.CA });
    expect(out.meals[0]!.status).toBe('missing');
    expect(out.premiumsOwed.meal).toBe(1);
  });

  it('second meal required on a >10h day, and detected when taken', () => {
    const result = run(
      [
        '09:00:00', '13:00:00',  // 4h
        '13:35:00', '19:00:00',  // 5h25m → 9h25m total
        '19:35:00', '22:00:00',  // 2h25m → 11h50m total; second 35-min meal at hour ~9.4
      ],
      SHIFT_12H,
    );
    const out = evaluateBreakCompliance({ result, rules: BREAK_RULE_SETS.CA });
    expect(out.meals[0]!.status).toBe('compliant');
    expect(out.meals[1]!.status).toBe('compliant');
    expect(out.premiumsOwed.meal).toBe(0);
  });

  it('second meal missing on an 11h day → one premium (capped at 1 per day)', () => {
    const result = run(
      [
        '09:00:00', '13:00:00',
        '13:35:00', '21:00:00',  // total 11h25m worked, no second meal
      ],
      SHIFT_12H,
    );
    const out = evaluateBreakCompliance({ result, rules: BREAK_RULE_SETS.CA });
    expect(out.meals[0]!.status).toBe('compliant');
    expect(out.meals[1]!.status).toBe('missing');
    expect(out.premiumsOwed.meal).toBe(1); // capped at maxPremiumsPerDay=1
  });

  it('valid first-meal waiver on a 5.5h day → first meal "waived", no premium', () => {
    // Two-segment day (3h + 2h30m = 5h30m) so the engine has gaps to analyse.
    const result = run([
      '09:00:00', '12:00:00',
      '12:05:00', '14:35:00',
    ]);
    const out = evaluateBreakCompliance({
      result,
      rules: BREAK_RULE_SETS.CA,
      waivers: [{ applies: 'first-meal', signed: true }],
    });
    expect(out.meals[0]!.status).toBe('waived');
    expect(out.premiumsOwed.meal).toBe(0);
    expect(out.waiverIssues).toEqual([]);
  });

  it('invalid first-meal waiver on a >6h day → waiver issue, treated as not-waived', () => {
    const result = run([
      '09:00:00', '15:00:00',
      '15:05:00', '18:00:00',  // 9h work, only 5-min gap
    ]);
    const out = evaluateBreakCompliance({
      result,
      rules: BREAK_RULE_SETS.CA,
      waivers: [{ applies: 'first-meal', signed: true }],
    });
    expect(out.waiverIssues[0]).toMatch(/first-meal waiver invalid/);
    expect(out.meals[0]!.status).toBe('missing');
  });

  it('not required: short day below 5h threshold', () => {
    const result = run([
      '09:00:00', '11:00:00',
      '11:10:00', '12:30:00',  // ~3h20m → meals not required; CA "major fraction" → 1 rest expected & taken (compliant)
    ]);
    const out = evaluateBreakCompliance({ result, rules: BREAK_RULE_SETS.CA });
    expect(out.meals[0]!.status).toBe('not-required');
    expect(out.meals[1]!.status).toBe('not-required');
    expect(out.rest.status).toBe('compliant');
    expect(out.premiumsOwed.meal).toBe(0);
    expect(out.premiumsOwed.rest).toBe(0);
  });

  it('single-segment day on a long shift → meal status "unknown", note attached', () => {
    const result = resolveDay({
      date: '2026-06-01',
      punches: [
        { at: '2026-06-01T09:00:00+06:00' },
        { at: '2026-06-01T18:00:00+06:00' },
      ],
      shift: SHIFT_8H,
      policy: { pairing: 'first-last' },
    });
    const out = evaluateBreakCompliance({ result, rules: BREAK_RULE_SETS.CA });
    expect(out.meals[0]!.status).toBe('unknown');
    expect(out.rest.status).toBe('unknown');
    expect(out.notes.some((n) => n.includes('single-segment'))).toBe(true);
    expect(out.presumptionRisk).toBe('medium');
  });

  it('very short day → rest also not required (worked <= 2h, no major fraction)', () => {
    const result = run([
      '09:00:00', '10:30:00',
      '10:40:00', '10:50:00',  // total 1h40m worked
    ]);
    const out = evaluateBreakCompliance({ result, rules: BREAK_RULE_SETS.CA });
    expect(out.rest.expected).toBe(0);
    expect(out.rest.status).toBe('not-required');
  });

  it('meal both late AND short → still flagged, premium owed', () => {
    const result = run([
      '09:00:00', '14:30:00',   // 5h30m before meal
      '14:55:00', '18:00:00',   // 25-min meal at hour 5.5 (both late and short)
    ]);
    const out = evaluateBreakCompliance({ result, rules: BREAK_RULE_SETS.CA });
    expect(out.meals[0]!.status).toBe('late'); // late wins in the resolution ladder
    expect(out.meals[0]!.premiumOwed).toBe(true);
    expect(out.premiumsOwed.meal).toBe(1);
  });

  it('rest periods: counts heuristically by gap size 5–24 minutes', () => {
    const result = run([
      '09:00:00', '11:00:00',
      '11:10:00', '13:00:00',  // 10-min rest
      '13:35:00', '15:00:00',  // 35-min meal
      '15:10:00', '18:00:00',  // 10-min rest
    ]);
    const out = evaluateBreakCompliance({ result, rules: BREAK_RULE_SETS.CA });
    expect(out.rest.expected).toBeGreaterThanOrEqual(2);
    expect(out.rest.status).toBe('compliant');
  });

  it('waiver filtering: only signed waivers with matching/empty date apply', () => {
    // 5h30m two-segment day — first meal required, no meal taken
    const result = run([
      '09:00:00', '12:00:00',
      '12:05:00', '14:35:00',
    ]);
    const out = evaluateBreakCompliance({
      result,
      rules: BREAK_RULE_SETS.CA,
      waivers: [
        { applies: 'first-meal', signed: false },                       // unsigned → ignored
        { applies: 'first-meal', signed: true, date: '2099-01-01' },    // wrong date → ignored
        { applies: 'first-meal', signed: true, date: '2026-06-01' },    // matches → applies
        { applies: 'second-meal', signed: false },                      // exercises second-meal predicate branches
        { applies: 'second-meal', signed: true, date: '2099-01-01' },
        { applies: 'second-meal', signed: true, date: '2026-06-01' },
      ],
    });
    expect(out.meals[0]!.status).toBe('waived');
    // Both first & second meal waivers match → conflict flagged (first must not be waived).
    expect(out.waiverIssues.some((w) => w.includes('first meal to NOT be waived'))).toBe(true);
  });

  it('second-meal waiver invalid when workday exceeds 12h', () => {
    const SHIFT_13H: ShiftConfig = { start: '08:00', end: '22:00', graceIn: 10 };
    const result = run(
      [
        '08:00:00', '13:00:00',
        '13:35:00', '21:30:00', // 5h + 7h55m = 12h55m worked, > 12h
      ],
      SHIFT_13H,
    );
    const out = evaluateBreakCompliance({
      result,
      rules: BREAK_RULE_SETS.CA,
      waivers: [{ applies: 'second-meal', signed: true }],
    });
    expect(out.waiverIssues.some((w) => w.includes('second-meal waiver invalid') && w.includes('waiver limit'))).toBe(true);
  });

  it('second-meal waiver invalid when first was also waived', () => {
    const result = run(
      [
        '09:00:00', '15:00:00',
        '15:35:00', '20:00:00', // 10h25m, no second meal
      ],
      SHIFT_12H,
    );
    const out = evaluateBreakCompliance({
      result,
      rules: BREAK_RULE_SETS.CA,
      waivers: [
        { applies: 'first-meal', signed: true },
        { applies: 'second-meal', signed: true },
      ],
    });
    expect(out.waiverIssues.some((w) => w.includes('second-meal waiver invalid'))).toBe(true);
  });
});

describe('defineBreakRuleSet', () => {
  it('extends a bundled pack and overrides selected fields', () => {
    const pack = defineBreakRuleSet({
      id: 'acme',
      label: 'ACME',
      source: 'internal',
      extends: 'CA',
      overrides: { meal: { mustStartByWorkedHour: 5.5 } },
    });
    expect(pack.meal.mustStartByWorkedHour).toBe(5.5);
    expect(pack.meal.minDurationMin).toBe(30); // inherited
    expect(pack.rest.paidDurationMin).toBe(10); // inherited
  });

  it('rejects a custom pack without a base when overrides are incomplete', () => {
    expect(() =>
      defineBreakRuleSet({
        id: 'broken',
        label: 'broken',
        source: 'n/a',
        overrides: { meal: {} },
      }),
    ).toThrow();
  });

  it('accepts a custom pack with no base when both sections are fully specified', () => {
    const pack = defineBreakRuleSet({
      id: 'custom',
      label: 'Custom',
      source: 'internal',
      overrides: {
        meal: {
          requiredAfterWorkedHours: 6,
          mustStartByWorkedHour: 6,
          minDurationMin: 45,
          secondRequiredAfterWorkedHours: 11,
          secondMustStartByWorkedHour: 11,
          waiverMaxHoursForFirst: 7,
          waiverMaxHoursForSecond: 13,
          premiumHoursPerViolation: 1,
          maxPremiumsPerDay: 1,
        },
        rest: {
          paidDurationMin: 15,
          perWorkedHours: 5,
          majorFractionRule: false,
          premiumHoursPerViolation: 1,
          maxPremiumsPerDay: 1,
        },
      },
    });
    expect(pack.meal.requiredAfterWorkedHours).toBe(6);
    expect(pack.rest.paidDurationMin).toBe(15);
  });
});
