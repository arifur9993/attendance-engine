# Use Cases — from a calculator to a compliance engine

`attendance-engine` started as "turn messy punches into clean per-day numbers." But once you have a deterministic, exhaustively-tested function that knows *exactly* what happened on a shift, a much bigger set of problems opens up — the ones that put companies in court. This document maps the high-value use cases, each grounded in real law and real litigation, and sketches the API for them. These are the reasons a payroll vendor, an HR platform, or a workforce-management product adopts this library instead of rolling their own.

> **The boundary, restated:** the engine deals in **time** — minutes, hours, classifications, violations, flags. It never prices anything into money. It tells you "this person worked 2.5 hours of daily overtime and is owed one meal-period premium"; *your* payroll layer multiplies by a rate. Keeping that line bright is what keeps the engine small, testable, and trustworthy. But "2.5 hours of *daily* overtime" vs "2.5 hours of *weekly* overtime" vs "a meal-premium hour" are legally distinct buckets, and getting that bucketing right is exactly where everyone else gets sued.

---

## 1. Time-clock rounding compliance (the lawsuit magnet)

**The problem.** US employers have long rounded punches to the nearest quarter-hour (the "7-minute rule"). Courts have turned hostile. *Donohue v. AMN Services* (Cal. 2021) banned rounding of meal periods. *Camp v. Home Depot* (Cal. 2022) held that if you *can* capture exact time, you must pay to the minute. Home Depot dropped quarter-hour rounding in 2023 after a class action; California settlements for improper rounding have exceeded **$3 million** for a single employer. Federally, rounding is still allowed *if it's provably neutral* — i.e. over time it doesn't systematically favor the employer — and the burden of proving neutrality is on the employer.

**What the engine does.** It already computes exact-to-the-minute worked time. Add a rounding layer that is *auditable*:

```ts
import { resolveDay, applyRounding, roundingNeutralityReport } from '@attendance-engine/core';

const exact   = resolveDay({ ...input, policy: { ...policy } });            // to the minute
const rounded = applyRounding(exact, { unit: 15, mode: 'nearest', breakRounding: 'none' });

// over a population / pay period:
const report = roundingNeutralityReport(exactResults, roundedResults);
// → { totalExactMinutes, totalRoundedMinutes, deltaMinutes, deltaPctOfPopulation,
//     favorsEmployer: boolean, byEmployee: [...], conclusion: 'neutral' | 'favors-employer' }
```

So a vendor can: (a) default to exact-minute and stay safe; (b) if a customer insists on rounding, *continuously prove neutrality* and get an alert the moment it tips employer-favorable. That report is the thing a wage-and-hour defense lawyer dreams about.

Sources: [California Time Clock Rounding (KBHL)](https://www.kbhllp.com/blog/california-time-clock-rounding-laws/), [ADP — Time Clock Rounding in California Continues to Evolve](https://www.adp.com/spark/articles/2023/12/time-clock-rounding-in-california-continues-to-evolve.aspx), [FindLaw — 7-Minute Rule](https://www.findlaw.com/employment/wages-and-benefits/7-minute-rule-for-time-keeping.html).

---

## 2. Meal & rest break compliance (the per-shift penalty machine)

**The problem.** California (and a growing list of states) require a 30-minute *uninterrupted, off-duty* meal period before the end of the 5th hour of work, a second meal before the end of the 10th hour, and a paid 10-minute rest period per 4 hours "or major fraction thereof." Miss one and the employer owes a **one-hour premium at the regular rate** (max one meal premium + one rest premium per day). Waivers exist but have strict conditions (first meal can be waived only if the day is ≤6 hours; second meal only if the day is ≤12 hours *and* the first wasn't waived; best practice is signed, in the personnel file). And critically: **a time record showing a non-compliant meal period creates a rebuttable presumption that a violation occurred** — the burden flips to the employer.

**What the engine does.** It sees the punches and the shift; it can detect every meal/rest situation and classify it:

```ts
import { evaluateBreakCompliance } from '@attendance-engine/core';

const breaks = evaluateBreakCompliance(dayResult, {
  jurisdiction: 'CA',                       // or a custom BreakRuleSet
  waivers: [{ type: 'first-meal', signed: true, fileRef: '...' }],
});
/* → {
  mealPeriods: [{ index: 1, startedAtHour: 5.4, durationMin: 22, status: 'late-and-short',
                  violation: 'late-meal' | 'short-meal' | 'on-duty-meal' | 'missing-meal', premiumOwed: true }],
  restPeriods: [{ expected: 2, taken: 1, status: 'missing-rest', premiumOwed: true }],
  premiumsOwed: { meal: 1, rest: 1 },       // hours, at regular rate — payroll prices it
  waiverIssues: [],
  presumptionRisk: 'high'                    // time record on its face shows a violation
} */
```

A WFM product can now surface "shifts at risk" in a dashboard, auto-compute premiums for payroll, validate waiver coverage, and warn managers *during* the shift ("employee has worked 4h50m with no meal logged — meal must start in the next 10 minutes"). That's a feature customers in California will pay real money for, because the alternative is class-action exposure.

Sources: [CalChamber — Meal and Rest Break Laws](https://www.calchamber.com/california-labor-law/meal-and-rest-breaks), [DIR — Meal Periods FAQ](https://www.dir.ca.gov/dlse/faq_mealperiods.htm), [Epstein Becker Green — CA Meal & Rest Period Requirements](https://www.wagehourblog.com/time-is-money-a-quick-wage-hour-tip-on-california-meal-and-rest-period-requirements-revisited).

---

## 3. Predictive scheduling / Fair Workweek (the roster-side rules)

**The problem.** San Francisco (2014) started it; Oregon, Seattle, NYC, Chicago, Philadelphia, Los Angeles and more now have "Fair Workweek" / predictive-scheduling laws covering retail, food service, and hospitality. Core obligations: publish schedules weeks in advance; pay **predictability pay** for last-minute changes; **right to rest** — a minimum gap between shifts (often 10–11 hours) or a premium if the employee consents to less; and restrictions on **"clopening"** shifts (a closing shift followed by an opening shift with too little rest between). NYC fast-food employers can't schedule a clopening at all unless the worker consents and is paid a **$100 premium**; NYC Fair Workweek fines run $500 / $750 / $1,000 for repeat violations.

**What the engine does.** The roster generator already models multi-day shift assignments. Add a schedule-evaluation layer:

```ts
import { evaluateSchedule } from '@attendance-engine/core';

const findings = evaluateSchedule(assignments, originalPostedSchedule, {
  jurisdiction: 'NYC-fast-food',            // preset rule pack
  consents: [{ employeeId, date, type: 'clopening' }],
});
/* → {
  clopenings: [{ employeeId, closeDate, openDate, restHours: 8.5, allowed: false,
                 premiumOwed: 100 /* currency-agnostic units */, requiresConsent: true, consentOnFile: false }],
  restViolations: [{ employeeId, betweenShifts: [...], restHours: 9, minRequired: 11, premiumOwed: true }],
  predictabilityPay: [{ employeeId, change: 'shift-shortened', noticeHours: 18, payTriggered: true }],
  advanceNoticeOk: false
} */
```

Now a scheduling product can *block* an illegal clopening at draft time, compute predictability pay automatically when a manager edits a posted schedule, and produce the compliance report regulators ask for. Pair this with `resolveDay` (what actually happened) vs the posted schedule (what was promised) and you cover both halves of Fair Workweek.

Sources: [Workforce.com — Fair Workweek Laws Explained](https://www.workforce.com/news/predictive-scheduling-laws), [GovDocs — Predictive Scheduling Laws](https://www.govdocs.com/predictive-scheduling-laws-what-employers-need-to-know/), [DOL Fact Sheet #56B — Scheduling Penalties and the Regular Rate](https://www.dol.gov/agencies/whd/fact-sheets/56b-scheduling-penalties-regular-rate).

---

## 4. Overtime classification (the buckets payroll can't get wrong)

**The problem.** "Overtime" isn't one thing. Federal FLSA: over 40 hours/week at 1.5×. California: over 8/day at 1.5×, over 12/day at **2×** (double time), the 7th consecutive workday triggers premiums, *and* weekly over-40 — and you don't double-count. Healthcare can elect the **"8 and 80" rule**: overtime for hours over 8 in a day *or* over 80 in a 14-day period. And the **regular rate** that overtime multiplies isn't just base wage — shift differentials, nondiscretionary bonuses, and multi-rate work (the **weighted-average / blended rate** under 29 CFR 778.115) all fold in. A huge share of wage-and-hour judgments against healthcare employers come from *exactly* this: forgetting to put the shift differential into the regular rate.

**What the engine does.** It won't compute dollars — but it produces the **hour buckets** correctly, which is the part everyone botches:

```ts
import { classifyHours } from '@attendance-engine/core';

const buckets = classifyHours(weekOrPeriodResults, {
  ruleSet: 'CA',                            // or 'FLSA', 'healthcare-8-80', custom
  workweekStart: 'Sunday',
  consecutiveDayRule: true,
});
/* → {
  regular: 32.0,
  dailyOvertime: 6.0,        // CA: hours 8–12 on a day
  doubleTime: 1.5,           // CA: hours over 12 on a day, or 7th-consecutive-day rules
  weeklyOvertime: 0.0,       // FLSA over-40, net of hours already counted as daily OT
  seventhDayPremium: 4.0,
  total: 43.5
} */
```

And separately, a helper to assemble the **regular-rate basis** (still just hours and pay-component *labels*, not amounts — payroll attaches the numbers):

```ts
regularRateInputs(periodResults, { differentials: ['night', 'weekend'], includeBonuses: true })
// → per-workweek: { hoursAtEachRate: {...}, differentialHours: {...}, weightedAverageBasis: {...} }
```

This is the difference between a payroll integration that survives an audit and one that generates back-pay liability. Vendors will adopt the library *for this alone*.

Sources: [DOL Fact Sheet #54 — Healthcare Industry & Calculating Overtime](https://www.dol.gov/agencies/whd/fact-sheets/54-healthcare-overtime), [DOL Fact Sheet #23 — Overtime Pay Requirements of the FLSA](https://www.dol.gov/agencies/whd/fact-sheets/23-flsa-overtime-pay), [29 CFR § 778.115 — Employees working at two or more rates](https://www.law.cornell.edu/cfr/text/29/778.115), [Lore Law — Shift Differential Pay and Overtime in Healthcare](https://www.overtime-flsa.com/blog/shift-differential-pay-and-overtime-are-healthcare-employers-correctly-calculating-your-wages/).

---

## 5. Time-fraud & data-integrity detection (buddy punching and friends)

**The problem.** Buddy punching, padded shifts, "ghost" punches from drifted device clocks, and impossible-travel records (clocked out in Location A at 17:00, clocked in at Location B 20 minutes away at 17:05) cost employers real money and corrupt every downstream number.

**What the engine does.** Extend the existing `flags` system with cross-record and cross-location checks:

```ts
import { detectAnomalies } from '@attendance-engine/core';

detectAnomalies(punchStream, { locations, minTravelMinutes, maxPlausibleShiftHours });
// → flags: 'simultaneous-presence' | 'impossible-travel' | 'implausible-shift-length'
//          | 'device-clock-drift-suspected' | 'round-number-bias' (every punch on :00/:30 — manual entry?)
```

Pairs naturally with the rounding-neutrality work (§1): if every punch is suspiciously round, your "exact" times aren't exact.

---

## 6. Multi-jurisdiction rule packs (the architecture that makes the above shippable)

None of §§1–4 work if the rules are hardcoded. The engine ships **rule packs** — declarative presets — and lets users define their own:

```ts
import { ruleSets } from '@attendance-engine/core';

ruleSets.FLSA            // federal: 40/wk OT, no daily OT, rounding-if-neutral
ruleSets.CA              // 8/day, 12/day double-time, 7th-day, meal before 5th hour, no meal rounding
ruleSets['healthcare-8-80']
ruleSets.NYC_FairWorkweek
ruleSets.Oregon_PredictiveScheduling
ruleSets.EU_WorkingTimeDirective   // 11h daily rest, 48h weekly avg over reference period, 20-min break > 6h

// compose / override:
const myCompany = defineRuleSet({ extends: 'CA', overrides: { graceMinutes: 5, otRoundingUnit: 1 } });
```

A rule pack is just data — which means contributors in other jurisdictions can submit theirs as a PR, with `cases/` fixtures proving it. Over time the library accumulates a tested, community-maintained map of "how time-and-attendance law actually works, in code." That's a moat nobody else has.

---

## Updated roadmap (compliance milestones folded in)

| Stage | Deliverable |
|---|---|
| **v0.1** | `@attendance-engine/core` — `resolveDay`, `resolveRange`, `summarize`; full `cases/` matrix; 100% coverage. *(the calculator)* |
| **v0.2** | `generateRoster` patterns + `evaluateSchedule` skeleton; FLSA + CA rule packs. |
| **v0.3** | `classifyHours` (daily/weekly/double-time/7th-day/8-80) + `regularRateInputs` basis assembler. |
| **v0.4** | `evaluateBreakCompliance` (CA meal/rest, premiums, waivers, presumption risk). |
| **v0.5** | `evaluateSchedule` full (clopening, predictability pay, right-to-rest) + NYC / Oregon Fair Workweek packs. |
| **v0.6** | `applyRounding` + `roundingNeutralityReport`. `detectAnomalies` (buddy-punch / impossible-travel). |
| **v0.7** | `@attendance-engine/react` — headless hooks for timesheets, exception triage, compliance dashboards. |
| **v0.8** | EU Working Time Directive pack; rule-pack contribution guide + `cases/` requirements for new packs. |
| **v0.x** | `arits/attendance-engine` — PHP port, API-compatible (so payroll backends and frontends agree to the minute). |
| **v1.0** | Schema/contract frozen; rule-pack API stable; PHP port at parity; docs site; a body of community-contributed jurisdiction packs with tests. |

## Who actually uses this (the adoption story)

- **Payroll providers** — for §4 (overtime buckets + regular-rate basis): the part that, done wrong, creates back-pay liability.
- **Workforce-management / scheduling apps** (retail, hospitality, healthcare staffing) — for §§2, 3: meal/rest premiums and Fair Workweek are existential compliance risks in their markets.
- **Time-clock / biometric vendors** — for §§1, 5: rounding-neutrality proof and time-fraud detection are selling points to their enterprise buyers.
- **HRIS / HR platforms** — for §1 (calculator) + a compliance dashboard built on §§2–4.
- **In-house teams** at any company with hourly workers in California, New York, Oregon, Chicago, Philadelphia, the EU... — because building this correctly in-house, with tests, for every jurisdiction, is a project nobody wants and everybody needs.
- **Wage-and-hour consultants / auditors** — to run a population's time records through `roundingNeutralityReport` / `evaluateBreakCompliance` and produce findings.

The pitch in one line: **the deceptively-hard, lawsuit-adjacent, perpetually-rebuilt math of "what happened on this shift and what does the law say about it" — extracted into one small, deterministic, exhaustively-tested, jurisdiction-aware library.** Nobody has built that. It should exist.
