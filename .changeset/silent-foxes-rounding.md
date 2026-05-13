---
"@attendance-engine/core": minor
---

Add `applyRounding(result, opts)` — first compliance helper. Produces a rounded view of a resolved day (worked / OT / late / early-out / breaks-deducted minutes) without mutating or losing the exact-minute result. Configurable `unit`, `mode` (`'nearest' | 'up' | 'down'`), and per-field `applyTo`. Designed for the California "exact-minute is the baseline; rounding must be provably neutral" pattern (Donohue v. AMN, Camp v. Home Depot) — keep both views, prove neutrality across populations in a future `roundingNeutralityReport` helper.

Also: switched the `release.yml` workflow to **version-only** mode (opens the "chore: version packages" PR but does not publish). Publishing for now is manual: `cd packages/core && npm publish --access public`.
