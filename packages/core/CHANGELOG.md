# @attendance-engine/core

## 0.4.0

### Minor Changes

- c6a86ca: Add `evaluateBreakCompliance` — meal & rest period compliance analysis for a resolved day under a jurisdiction rule pack. Ships the **California** rule pack (Labor Code §§ 226.7, 512; IWC wage orders) covering: meal-start-by-5th-hour rule, second-meal-by-10th-hour, 30-min minimum duration, waiver validity (first ≤6h, second ≤12h-and-first-not-waived), 10-min paid rest per 4h with major-fraction rule, one-hour premiums capped at 1 meal + 1 rest per day, and **rebuttable presumption risk** per Donohue v. AMN.

  Also exports the rule-pack registry: `BREAK_RULE_SETS`, `CA_BREAK_RULES`, and `defineBreakRuleSet({ extends, overrides })` for custom packs. Contributors can add new jurisdictions as pure data plus fixtures — no engine code change required (see CONTRIBUTING.md → rule packs).

  Limitations: meal detection requires `policy.pairing: 'in-out-pairs'` so the engine sees real meal gaps; rest detection is heuristic (most rests aren't punched). Overtime classification and Fair Workweek scheduling land in subsequent minor versions.

## 0.3.0

### Minor Changes

- 2c8e388: Add `applyRounding(result, opts)` — first compliance helper. Produces a rounded view of a resolved day (worked / OT / late / early-out / breaks-deducted minutes) without mutating or losing the exact-minute result. Configurable `unit`, `mode` (`'nearest' | 'up' | 'down'`), and per-field `applyTo`. Designed for the California "exact-minute is the baseline; rounding must be provably neutral" pattern (Donohue v. AMN, Camp v. Home Depot) — keep both views, prove neutrality across populations in a future `roundingNeutralityReport` helper.

  Also: switched the `release.yml` workflow to **version-only** mode (opens the "chore: version packages" PR but does not publish). Publishing for now is manual: `cd packages/core && npm publish --access public`.

## 0.2.1

### Patch Changes

- 12958d4: fix repository.url normalisation

## 0.2.0

### Minor Changes

- 1161078: Initial release. Pure-function workforce attendance resolver:

  - `resolveDay(input)` — raw punches + a shift + a policy → a resolved `DayResult` (status, worked minutes, lateness, early-out, overtime, overnight handling, break deduction, data-integrity flags, segments).
  - `resolveRange(inputs)` — map `resolveDay` over a pay period.
  - `summarize(results)` — period totals and an attendance rate.
  - `generateRoster(pattern, startDate, days)` — rotating-roster generation (`2-2-3`, `4-on-4-off`, `dupont`, `pitman`, or a custom cycle).

  Zero runtime dependencies. Time-zone-safe: timestamps are ISO-8601 with explicit offsets; the engine never reads the host timezone. While on `0.x`, treat minor releases as potentially breaking.
