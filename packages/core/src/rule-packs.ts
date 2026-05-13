/**
 * Jurisdiction rule packs — declarative data describing how meal/rest periods, overtime,
 * and scheduling protections work under a given law. Designed to be a community-extensible
 * registry: contributors add a pack as data plus fixtures + citations (no engine code change).
 *
 * v0.4 ships only the {@link BreakRuleSet} surface and the **California** pack. Overtime and
 * Fair-Workweek surfaces land in subsequent minor versions (see USE-CASES.md).
 */

/** Rules that govern when meal & rest periods are required and what missing one is worth. */
export interface BreakRuleSet {
  /** Identifier shown in violations / reports. */
  id: string;
  /** Human-readable label. */
  label: string;
  /** Authority — statute / regulation / fact-sheet URL, attached to every published rule pack. */
  source: string;
  meal: {
    /**
     * A meal period is required if the workday exceeds this many hours.
     * In CA the first meal is required for shifts > 5h; the rule is that it must
     * be *provided before the end of the 5th hour*.
     */
    requiredAfterWorkedHours: number;
    /** Meal must begin no later than this many worked hours into the shift. */
    mustStartByWorkedHour: number;
    /** Minimum off-duty, uninterrupted duration. */
    minDurationMin: number;
    /** A second meal is required if the workday exceeds this many hours. */
    secondRequiredAfterWorkedHours: number;
    /** Second meal must begin no later than this many worked hours into the shift. */
    secondMustStartByWorkedHour: number;
    /** First meal may be waived by signed agreement if the workday is at most this many hours. */
    waiverMaxHoursForFirst: number;
    /**
     * Second meal may be waived if the workday is at most this many hours
     * **and** the first meal was *not* waived.
     */
    waiverMaxHoursForSecond: number;
    /** Premium owed when a meal violation occurs, in **hours at the regular rate**. */
    premiumHoursPerViolation: number;
    /** Max meal-period premiums per day, regardless of how many meals were missed. */
    maxPremiumsPerDay: number;
  };
  rest: {
    /** Paid rest period duration (minutes). */
    paidDurationMin: number;
    /** One rest period per this many worked hours, "or major fraction thereof". */
    perWorkedHours: number;
    /**
     * Whether a partial period rounds *up* if more than half of `perWorkedHours` was worked.
     * CA: yes ("major fraction" rule — 2h+ counts as a 4h block).
     */
    majorFractionRule: boolean;
    /** Premium owed per rest violation, in hours at the regular rate. */
    premiumHoursPerViolation: number;
    /** Max rest-period premiums per day. */
    maxPremiumsPerDay: number;
  };
}

/**
 * California Industrial Welfare Commission wage orders + Labor Code §§ 226.7, 512.
 * Donohue v. AMN (Cal. 2021) — rounding banned for meal periods; non-compliant time
 * records create a rebuttable presumption.
 *
 * Sources:
 *  - https://www.dir.ca.gov/dlse/faq_mealperiods.htm
 *  - https://www.calchamber.com/california-labor-law/meal-and-rest-breaks
 */
export const CA_BREAK_RULES: BreakRuleSet = {
  id: 'CA',
  label: 'California (Labor Code §§ 226.7, 512; IWC wage orders)',
  source: 'https://www.dir.ca.gov/dlse/faq_mealperiods.htm',
  meal: {
    requiredAfterWorkedHours: 5,
    mustStartByWorkedHour: 5,
    minDurationMin: 30,
    secondRequiredAfterWorkedHours: 10,
    secondMustStartByWorkedHour: 10,
    waiverMaxHoursForFirst: 6,
    waiverMaxHoursForSecond: 12,
    premiumHoursPerViolation: 1,
    maxPremiumsPerDay: 1,
  },
  rest: {
    paidDurationMin: 10,
    perWorkedHours: 4,
    majorFractionRule: true,
    premiumHoursPerViolation: 1,
    maxPremiumsPerDay: 1,
  },
};

/** Registry of bundled rule packs. Use {@link defineBreakRuleSet} for custom packs. */
export const BREAK_RULE_SETS = {
  CA: CA_BREAK_RULES,
} as const satisfies Record<string, BreakRuleSet>;

export type BundledBreakRuleSetId = keyof typeof BREAK_RULE_SETS;

/**
 * Build a custom break rule set, optionally extending a bundled one.
 *
 * ```ts
 * const myCompany = defineBreakRuleSet({
 *   id: 'acme-ca',
 *   label: 'ACME (CA-derived, longer meal grace)',
 *   source: 'internal policy v3',
 *   extends: 'CA',
 *   overrides: { meal: { mustStartByWorkedHour: 5.5 } },
 * });
 * ```
 */
export function defineBreakRuleSet(spec: {
  id: string;
  label: string;
  source: string;
  extends?: BundledBreakRuleSetId;
  overrides?: {
    meal?: Partial<BreakRuleSet['meal']>;
    rest?: Partial<BreakRuleSet['rest']>;
  };
}): BreakRuleSet {
  const base = spec.extends ? BREAK_RULE_SETS[spec.extends] : null;
  if (!base) {
    // No base means caller must supply complete meal + rest sections via overrides.
    if (!spec.overrides?.meal || !spec.overrides.rest) {
      throw new Error(
        `defineBreakRuleSet: when "extends" is omitted, both "overrides.meal" and "overrides.rest" must be fully specified.`,
      );
    }
    return {
      id: spec.id,
      label: spec.label,
      source: spec.source,
      meal: spec.overrides.meal as BreakRuleSet['meal'],
      rest: spec.overrides.rest as BreakRuleSet['rest'],
    };
  }
  return {
    id: spec.id,
    label: spec.label,
    source: spec.source,
    meal: { ...base.meal, ...spec.overrides?.meal },
    rest: { ...base.rest, ...spec.overrides?.rest },
  };
}
