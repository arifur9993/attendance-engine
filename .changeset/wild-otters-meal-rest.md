---
"@attendance-engine/core": minor
---

Add `evaluateBreakCompliance` — meal & rest period compliance analysis for a resolved day under a jurisdiction rule pack. Ships the **California** rule pack (Labor Code §§ 226.7, 512; IWC wage orders) covering: meal-start-by-5th-hour rule, second-meal-by-10th-hour, 30-min minimum duration, waiver validity (first ≤6h, second ≤12h-and-first-not-waived), 10-min paid rest per 4h with major-fraction rule, one-hour premiums capped at 1 meal + 1 rest per day, and **rebuttable presumption risk** per Donohue v. AMN.

Also exports the rule-pack registry: `BREAK_RULE_SETS`, `CA_BREAK_RULES`, and `defineBreakRuleSet({ extends, overrides })` for custom packs. Contributors can add new jurisdictions as pure data plus fixtures — no engine code change required (see CONTRIBUTING.md → rule packs).

Limitations: meal detection requires `policy.pairing: 'in-out-pairs'` so the engine sees real meal gaps; rest detection is heuristic (most rests aren't punched). Overtime classification and Fair Workweek scheduling land in subsequent minor versions.
