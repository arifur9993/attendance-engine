/**
 * Meal & rest break compliance analysis on top of a resolved {@link DayResult}.
 *
 * Limitations of v0.4:
 *  - Best results require `policy.pairing: 'in-out-pairs'` so the engine sees actual
 *    punch-out → punch-in gaps as candidate meals. With `'first-last'` pairing there's
 *    one big segment and no meal events to analyse; we return `'unknown'` for that case
 *    and flag it. (Rest periods don't typically punch out anywhere, so they are inferred
 *    from required-count vs detected-gaps and flagged conservatively.)
 *  - Worked hours used for thresholds are derived from `DayResult.workedMinutes`,
 *    which already deducts unpaid configured breaks.
 *
 * Reference: California Labor Code §§ 226.7, 512; IWC wage orders;
 *            Donohue v. AMN Services, Cal. 2021 (rebuttable-presumption doctrine).
 */

import type { DayResult, Segment } from './types.js';
import type { BreakRuleSet } from './rule-packs.js';
import { parseInstant } from './time.js';

export interface MealPeriodAnalysis {
  /** 1 = first meal, 2 = second meal. */
  index: 1 | 2;
  /** Worked-hour into the shift at which the meal started, e.g. 4.95 for "started before the 5th hour". */
  startedAtWorkedHour: number | null;
  /** Off-duty duration in minutes. `null` when no candidate gap exists (i.e. no meal taken). */
  durationMin: number | null;
  /**
   * `compliant` | `late` (after the start-by hour) | `short` (< minDurationMin) |
   * `missing` (no gap of sufficient size and required) | `not-required` |
   * `waived` (covered by a valid waiver) | `unknown` (single-segment day; cannot tell).
   */
  status:
    | 'compliant'
    | 'late'
    | 'short'
    | 'missing'
    | 'not-required'
    | 'waived'
    | 'unknown';
  /** Whether a one-hour premium is owed because of this meal. */
  premiumOwed: boolean;
}

export interface RestPeriodAnalysis {
  /** How many rest periods the rule set requires for this day's worked hours. */
  expected: number;
  /** Whether all required rest periods are presumed to have occurred. */
  status: 'compliant' | 'possibly-missing' | 'not-required' | 'unknown';
  /** True if the rule set's premium for missed rest applies. */
  premiumOwed: boolean;
}

export interface WaiverRef {
  /** Which meal the waiver applies to. */
  applies: 'first-meal' | 'second-meal';
  /** Optional: a date the waiver is valid for (defaults to all dates). */
  date?: string;
  /** Whether the waiver agreement is on file in signed form. */
  signed: boolean;
  /** Caller-supplied reference (e.g. a personnel-file URL or doc id). */
  fileRef?: string;
}

export interface EvaluateBreakComplianceInput {
  /** Result of `resolveDay` for the day under review. */
  result: DayResult;
  /** Rule pack to apply. */
  rules: BreakRuleSet;
  /** Active waivers covering this day's employee. */
  waivers?: WaiverRef[];
}

export interface BreakComplianceResult {
  /** Per-meal analysis (always two entries: first and second). */
  meals: MealPeriodAnalysis[];
  rest: RestPeriodAnalysis;
  /** Hours owed at the regular rate (caller prices them into money). */
  premiumsOwed: { meal: number; rest: number };
  /** Notes on waiver applicability (e.g. "second-meal waiver invalid because first was waived"). */
  waiverIssues: string[];
  /**
   * Rebuttable-presumption risk per *Donohue v. AMN* and similar doctrines:
   * `high` — time record on its face shows a violation (late/short/missing meal);
   * `medium` — meal taken but boundary cases (e.g. exactly at the threshold);
   * `low` — fully compliant or not required.
   */
  presumptionRisk: 'low' | 'medium' | 'high';
  /** Concise notes for reporting; safe to surface in admin UIs. */
  notes: string[];
}

// ── helpers ────────────────────────────────────────────────────────────────

function minutesBetweenIso(a: string, b: string): number {
  return Math.round((parseInstant(b).ms - parseInstant(a).ms) / 60_000);
}

/** Convert a worked-minutes count into a count of required rest periods under the rule. */
function expectedRestPeriods(workedMinutes: number, rules: BreakRuleSet['rest']): number {
  const workedHours = workedMinutes / 60;
  const block = rules.perWorkedHours;
  if (workedHours < block) {
    // CA's "major fraction" rule: a partial period counts if more than half the block was worked.
    if (rules.majorFractionRule && workedHours > block / 2) return 1;
    return 0;
  }
  const full = Math.floor(workedHours / block);
  const remainder = workedHours - full * block;
  if (rules.majorFractionRule && remainder > block / 2) return full + 1;
  return full;
}

/** Gaps between successive segments, sorted chronologically. */
interface Gap {
  /** Worked hours that had accumulated *before* this gap started. */
  startedAtWorkedHour: number;
  /** Duration in minutes (off-duty). */
  durationMin: number;
}

function gapsBetweenSegments(segments: Segment[]): Gap[] {
  if (segments.length < 2) return [];
  const sorted = [...segments].sort(
    (a, b) => parseInstant(a.in).ms - parseInstant(b.in).ms,
  );
  const out: Gap[] = [];
  let workedSoFar = 0;
  for (let i = 0; i < sorted.length - 1; i += 1) {
    workedSoFar += sorted[i]!.minutes;
    const gapMin = minutesBetweenIso(sorted[i]!.out, sorted[i + 1]!.in);
    if (gapMin > 0) {
      out.push({ startedAtWorkedHour: workedSoFar / 60, durationMin: gapMin });
    }
  }
  return out;
}

// ── main ───────────────────────────────────────────────────────────────────

/**
 * Analyse meal- and rest-period compliance for a resolved day under a given rule pack.
 *
 * Pure function. Returns a structured result; does not throw on policy issues.
 * Does throw on malformed inputs (e.g. unparsable ISO timestamps via `parseInstant`).
 */
export function evaluateBreakCompliance(
  input: EvaluateBreakComplianceInput,
): BreakComplianceResult {
  const { result, rules, waivers = [] } = input;
  const workedMinutes = result.workedMinutes;
  const workedHours = workedMinutes / 60;
  const notes: string[] = [];
  const waiverIssues: string[] = [];

  const firstWaiver = waivers.find(
    (w) => w.applies === 'first-meal' && (!w.date || w.date === result.date) && w.signed,
  );
  const secondWaiver = waivers.find(
    (w) => w.applies === 'second-meal' && (!w.date || w.date === result.date) && w.signed,
  );

  // Validate waiver applicability under CA-style rules.
  if (firstWaiver && workedHours > rules.meal.waiverMaxHoursForFirst) {
    waiverIssues.push(
      `first-meal waiver invalid: workday is ${workedHours.toFixed(2)}h > waiver limit ${rules.meal.waiverMaxHoursForFirst}h`,
    );
  }
  if (secondWaiver && workedHours > rules.meal.waiverMaxHoursForSecond) {
    waiverIssues.push(
      `second-meal waiver invalid: workday is ${workedHours.toFixed(2)}h > waiver limit ${rules.meal.waiverMaxHoursForSecond}h`,
    );
  }
  if (secondWaiver && firstWaiver) {
    waiverIssues.push(
      'second-meal waiver invalid: requires the first meal to NOT be waived',
    );
  }

  const firstWaiverActive =
    !!firstWaiver && workedHours <= rules.meal.waiverMaxHoursForFirst;
  const secondWaiverActive =
    !!secondWaiver &&
    !firstWaiverActive &&
    workedHours <= rules.meal.waiverMaxHoursForSecond;

  const singleSegmentDay = result.segments.length < 2;
  if (singleSegmentDay && workedHours > rules.meal.requiredAfterWorkedHours) {
    notes.push(
      'single-segment day: cannot detect meal events from time records — recommend `pairing: "in-out-pairs"` for compliance analysis',
    );
  }

  const gaps = gapsBetweenSegments(result.segments);

  // ── Meal analysis ────────────────────────────────────────────────────────
  const meals: MealPeriodAnalysis[] = [];
  const mealRequired1 = workedHours > rules.meal.requiredAfterWorkedHours;
  const mealRequired2 = workedHours > rules.meal.secondRequiredAfterWorkedHours;

  function analyseMeal(
    index: 1 | 2,
    required: boolean,
    waived: boolean,
    mustStartBy: number,
    afterWorkedHour: number,
  ): MealPeriodAnalysis {
    if (!required) {
      return {
        index,
        startedAtWorkedHour: null,
        durationMin: null,
        status: 'not-required',
        premiumOwed: false,
      };
    }
    if (waived) {
      return {
        index,
        startedAtWorkedHour: null,
        durationMin: null,
        status: 'waived',
        premiumOwed: false,
      };
    }
    if (singleSegmentDay) {
      return {
        index,
        startedAtWorkedHour: null,
        durationMin: null,
        status: 'unknown',
        premiumOwed: false, // can't determine; caller should investigate
      };
    }
    // Pick the earliest gap of >= 25min that starts after `afterWorkedHour` as the meal candidate.
    // (25 = a forgiving threshold below the 30-min minimum that still distinguishes "meal" from "rest".)
    const candidate = gaps
      .filter((g) => g.startedAtWorkedHour >= afterWorkedHour && g.durationMin >= 25)
      .at(0);
    if (!candidate) {
      return {
        index,
        startedAtWorkedHour: null,
        durationMin: null,
        status: 'missing',
        premiumOwed: true,
      };
    }
    const late = candidate.startedAtWorkedHour > mustStartBy;
    const short = candidate.durationMin < rules.meal.minDurationMin;
    let status: MealPeriodAnalysis['status'];
    if (late && short) status = 'late';
    else if (late) status = 'late';
    else if (short) status = 'short';
    else status = 'compliant';
    return {
      index,
      startedAtWorkedHour: candidate.startedAtWorkedHour,
      durationMin: candidate.durationMin,
      status,
      premiumOwed: status !== 'compliant',
    };
  }

  meals.push(
    analyseMeal(
      1,
      mealRequired1,
      firstWaiverActive,
      rules.meal.mustStartByWorkedHour,
      0,
    ),
  );
  meals.push(
    analyseMeal(
      2,
      mealRequired2,
      secondWaiverActive,
      rules.meal.secondMustStartByWorkedHour,
      rules.meal.requiredAfterWorkedHours,
    ),
  );

  // ── Rest analysis ───────────────────────────────────────────────────────
  const expectedRest = expectedRestPeriods(workedMinutes, rules.rest);
  let rest: RestPeriodAnalysis;
  if (expectedRest === 0) {
    rest = { expected: 0, status: 'not-required', premiumOwed: false };
  } else if (singleSegmentDay) {
    // Can't infer rest from a single contiguous segment; assume taken (paid breaks usually aren't punched).
    rest = { expected: expectedRest, status: 'unknown', premiumOwed: false };
  } else {
    // Heuristic: count "short" gaps (< 25min, >= 5min) as potential rest events.
    const possibleRests = gaps.filter((g) => g.durationMin >= 5 && g.durationMin < 25).length;
    if (possibleRests >= expectedRest) {
      rest = { expected: expectedRest, status: 'compliant', premiumOwed: false };
    } else {
      rest = {
        expected: expectedRest,
        status: 'possibly-missing',
        premiumOwed: true,
      };
      notes.push(
        `rest: detected ${possibleRests} of ${expectedRest} expected paid rest periods — many policies don't punch rest, so this is heuristic`,
      );
    }
  }

  // ── Premiums ────────────────────────────────────────────────────────────
  const mealPremiumsRaw = meals.filter((m) => m.premiumOwed).length * rules.meal.premiumHoursPerViolation;
  const restPremiumsRaw = rest.premiumOwed ? rules.rest.premiumHoursPerViolation : 0;
  const premiumsOwed = {
    meal: Math.min(mealPremiumsRaw, rules.meal.maxPremiumsPerDay * rules.meal.premiumHoursPerViolation),
    rest: Math.min(restPremiumsRaw, rules.rest.maxPremiumsPerDay * rules.rest.premiumHoursPerViolation),
  };

  // ── Presumption risk ────────────────────────────────────────────────────
  let presumptionRisk: BreakComplianceResult['presumptionRisk'] = 'low';
  const anyClearViolation = meals.some((m) =>
    m.status === 'missing' || m.status === 'late' || m.status === 'short',
  );
  if (anyClearViolation) {
    presumptionRisk = 'high';
  } else if (meals.some((m) => m.status === 'unknown')) {
    presumptionRisk = 'medium';
  }

  return { meals, rest, premiumsOwed, waiverIssues, presumptionRisk, notes };
}
