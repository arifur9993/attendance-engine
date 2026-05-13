# @attendance-engine/core

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
