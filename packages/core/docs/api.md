# API — @attendance-engine/core (v0.1)

Everything is a pure function. No I/O, no `Date.now()`, no host-timezone reads. Feed it data, get data back.

## `resolveDay(input: ResolveDayInput): DayResult`

Resolve one duty day.

### `ResolveDayInput`

| field | type | required | meaning |
|---|---|---|---|
| `date` | `string` (`YYYY-MM-DD`) | yes | The duty date in the worksite's local wall-clock. |
| `punches` | `Punch[]` | yes (may be empty) | Raw clock events, any order. The engine sorts, de-duplicates, and pairs them. |
| `shift` | `ShiftConfig` | yes | The assigned shift. |
| `policy` | `AttendancePolicy` | no | Tunable rules. Documented defaults apply per field. |
| `leave` | `LeaveDay \| null` | no | Approved leave for this date. |
| `holiday` | `boolean` | no | Company holiday. |
| `weekend` | `boolean` | no | Non-working weekend day for this employee. |

`leave` / `holiday` / `weekend` set the day's `status` but **do not suppress** worked-time computation — if the person punched in on a holiday, you still get `workedMinutes`, `otMinutes`, etc. (so you can price holiday work). Precedence for `status`: `leave` > `holiday` > `weekend` > everything computed.

### `Punch`

| field | type | required | meaning |
|---|---|---|---|
| `at` | `string` | yes | ISO-8601 instant **with an explicit offset**, e.g. `2026-06-01T08:57:00+06:00` or `...Z`. A bare local time is rejected (`TimeParseError`). See [`timezones.md`](./timezones.md). |
| `source` | `'biometric' \| 'mobile' \| 'manual' \| 'web' \| string` | no | Provenance. Surfaced, not interpreted (yet). |
| `location` | `string` | no | Site identifier. Used by anomaly detection in a later milestone. |

### `ShiftConfig`

| field | type | default | meaning |
|---|---|---|---|
| `start` | `string` (`HH:MM`) | — | Scheduled start, wall-clock. |
| `end` | `string` (`HH:MM`) | — | Scheduled end, wall-clock. If `end <= start`, the shift is **overnight** and ends on the next calendar day. |
| `breaks` | `BreakWindow[]` | `[]` | Defined break windows. |
| `graceIn` | `number` (minutes) | `0` | Arrival within this many minutes of `start` is "on time". |
| `graceOut` | `number` (minutes) | `0` | Departure within this many minutes before `end` is "on time". |
| `minHalfDayMinutes` | `number` | — | If net worked minutes are below this, `status` becomes `half-day`. |
| `flexible` | `boolean` | `false` | Any contiguous block counts; lateness and early-out are not evaluated. |

`BreakWindow`: `{ start: 'HH:MM'; end: 'HH:MM'; paid: boolean }`. **Paid** breaks are never deducted. **Unpaid** breaks are deducted by the overlap between the break window and the worked segments. A window with `end <= start` spills to the next day.

### `AttendancePolicy`

| field | type | default | meaning |
|---|---|---|---|
| `pairing` | `'first-last' \| 'in-out-pairs'` | `'first-last'` | `first-last`: one segment from the earliest punch to the latest. `in-out-pairs`: punches alternate in/out by chronological order; an odd count leaves a dangling in. |
| `treatMissingOutAs` | `'absent' \| 'shift-end' \| 'half-day' \| 'flag-only'` | `'flag-only'` | What to do with a dangling punch-in. `shift-end`: close it at scheduled end (if the in is before end) and flag `missing-out-resolved`. `absent`: if nothing else is usable, the day is `absent`; otherwise `incomplete`. `half-day`: status forced to `half-day`, only already-paired time credited. `flag-only`: status `incomplete`, flag `odd-punch-count`. |
| `midnightCutover` | `'shift-anchored' \| 'calendar-day'` | `'shift-anchored'` | How punches around midnight are attributed for overnight shifts. (v0.1 computes everything on the absolute timeline; the distinction matters for period bucketing in later milestones.) |
| `lateAfterGrace` | `'mark-late' \| 'deduct' \| 'ignore'` | `'mark-late'` | `deduct` also subtracts the late minutes from `workedMinutes`. `ignore` reports `lateByMinutes: 0`. |
| `otThresholdMinutes` | `number` | `0` | Overtime counts only beyond this many minutes past shift end (`shift-based`) or past the standard day. |
| `otRoundingUnit` | `number` | `1` | Round overtime to the nearest N minutes. |
| `otMode` | `'shift-based' \| 'fixed-hours' \| 'daily-cap'` | `'shift-based'` | `shift-based`: anything past `shift.end` beyond the threshold. `fixed-hours` / `daily-cap`: anything worked beyond `standardDayMinutes` beyond the threshold. |
| `standardDayMinutes` | `number` | `480` | Standard (non-OT) day length for the `fixed-hours` / `daily-cap` modes. |
| `dedupeSeconds` | `number` | `60` | Two punches within this many seconds are treated as one (the later is dropped) and flagged `duplicate-punch`. |
| `tzOffsetMinutes` | `number` | first punch's offset | Worksite UTC offset for the duty date. Provide it explicitly when there are no punches, or to be unambiguous around DST. |

### `DayResult`

| field | type | meaning |
|---|---|---|
| `date` | `string` | Echoed input date. |
| `status` | `'present' \| 'late' \| 'absent' \| 'half-day' \| 'leave' \| 'holiday' \| 'weekend' \| 'incomplete'` | The day's classification. |
| `firstIn` | `string \| null` | First punch-in, ISO; `null` when there are no usable punches. |
| `lastOut` | `string \| null` | Last punch-out (or a policy-derived value), ISO; `null` when there are no usable punches. |
| `workedMinutes` | `number` | Net worked minutes (segment total minus deducted unpaid breaks, minus late minutes if `lateAfterGrace: 'deduct'`). |
| `lateByMinutes` | `number` | Minutes after `start + graceIn` the first punch-in occurred. `0` if on time, flexible, or `lateAfterGrace: 'ignore'`. |
| `earlyOutMinutes` | `number` | Minutes before `end - graceOut` the last punch-out occurred. `0` if on time or flexible. |
| `otMinutes` | `number` | Overtime after threshold + rounding. |
| `spansMidnight` | `boolean` | True if any worked segment crosses local midnight. |
| `breaksDeducted` | `number` | Minutes deducted for unpaid breaks. |
| `flags` | `Flag[]` | Anomalies/notes: `inverted-clock`, `duplicate-punch`, `odd-punch-count`, `punch-before-shift`, `punch-after-shift`, `round-number-bias`, `missing-out-resolved`, `no-punches`. (Not all are emitted in v0.1 — see roadmap.) |
| `segments` | `Segment[]` | Resolved `{ in, out, minutes }` intervals, chronological. |

`status` derivation (when no `leave`/`holiday`/`weekend` context): no usable segments → `absent`; `treatMissingOutAs: 'half-day'` with a dangling in → `half-day`; unresolved odd punch → `incomplete`; `workedMinutes < minHalfDayMinutes` → `half-day`; `lateByMinutes > 0` → `late`; else `present`.

## `resolveRange(inputs: ResolveDayInput[]): DayResult[]`

`inputs.map(resolveDay)`. Order preserved. Convenience for a pay period / week / month.

## `summarize(results: DayResult[]): PeriodSummary`

Aggregate counts and totals: `days`, `presentDays`, `lateDays`, `absentDays`, `halfDays`, `leaveDays`, `holidayDays`, `weekendDays`, `incompleteDays`, `totalWorkedMinutes`, `totalOtMinutes`, `totalLateMinutes`, `totalEarlyOutMinutes`, `attendanceRate` (`(present + late + half) / (days - leave - holiday - weekend)`, or `null` if the denominator is 0), `flagCounts`.

## `applyRounding(result: DayResult, opts: RoundingOptions): DayResult`

Return a copy of `result` with selected minute fields rounded to a unit. Useful for producing a rounded view of an exact-minute result *without losing the exact one* — keep both, prove your rounding is neutral.

`RoundingOptions`:

| field | type | default | meaning |
|---|---|---|---|
| `unit` | `number` | — | Rounding unit in minutes (positive integer). `1` is a no-op. |
| `mode` | `'nearest' \| 'up' \| 'down'` | `'nearest'` | Direction. |
| `applyTo` | `('workedMinutes' \| 'otMinutes' \| 'lateByMinutes' \| 'earlyOutMinutes' \| 'breaksDeducted')[]` | `['workedMinutes', 'otMinutes']` | Which fields to round. `lateByMinutes` / `earlyOutMinutes` are excluded by default because many policies require employee-favourable handling of lateness even when worked time is rounded. |

Throws if `unit` is not a positive integer. Does not touch `firstIn` / `lastOut` / `segments`.

```ts
import { resolveDay, applyRounding } from '@attendance-engine/core';

const exact = resolveDay(input);                                  // 547 min worked, 4 min OT
const rounded = applyRounding(exact, { unit: 15, mode: 'down' }); // 540 min worked, 0 min OT
```

## `evaluateBreakCompliance({ result, rules, waivers? }): BreakComplianceResult`

Analyse meal and rest period compliance for a resolved day under a jurisdiction rule pack. v0.4 ships the **California** pack (`BREAK_RULE_SETS.CA`). Define custom packs with `defineBreakRuleSet`.

Best results require `policy.pairing: 'in-out-pairs'` (so the engine sees actual gaps between segments as meal candidates). With `'first-last'` pairing the function returns `status: 'unknown'` and a note rather than guessing.

```ts
import { resolveDay, evaluateBreakCompliance, BREAK_RULE_SETS } from '@attendance-engine/core';

const result = resolveDay({ /* ... */, policy: { pairing: 'in-out-pairs' } });
const compliance = evaluateBreakCompliance({ result, rules: BREAK_RULE_SETS.CA });
// {
//   meals: [{ index: 1, status: 'late', startedAtWorkedHour: 5.5, durationMin: 30, premiumOwed: true }, { index: 2, status: 'not-required', ... }],
//   rest: { expected: 2, status: 'compliant', premiumOwed: false },
//   premiumsOwed: { meal: 1, rest: 0 },  // hours at regular rate — caller prices to money
//   waiverIssues: [],
//   presumptionRisk: 'high',             // CA rebuttable-presumption flag
//   notes: []
// }
```

Premium values are **hours at the regular rate** — the engine never deals in money. `presumptionRisk` is the Donohue v. AMN signal: `high` when the time record on its face shows a violation.

Rule pack types & registry:

```ts
import { BREAK_RULE_SETS, defineBreakRuleSet } from '@attendance-engine/core';

BREAK_RULE_SETS.CA;             // bundled
defineBreakRuleSet({            // custom (extends a bundled pack)
  id: 'acme-ca',
  label: 'ACME (CA-derived, 5.5h meal start)',
  source: 'internal policy v3',
  extends: 'CA',
  overrides: { meal: { mustStartByWorkedHour: 5.5 } },
});
```

Limitations of v0.4:
- Meal detection uses gaps between worked segments — accurate when employees punch in/out for meals.
- Rest detection is heuristic (most policies don't punch out for paid rest). Counts gaps of 5–24 minutes as candidate rests.
- Overtime classification (daily/weekly/double-time/7th-day) and Fair Workweek (clopening, predictability pay) are scheduled for subsequent minor versions.

## `generateRoster(pattern: RosterPattern, startDate: string, days: number): ShiftAssignment[]`

Produce one assignment per calendar date, cycling through `pattern`.

- `pattern`: `'2-2-3' | '4-on-4-off' | 'dupont' | 'pitman' | { custom: RosterDay[] }`. Built-in patterns use 12-hour `day` (07:00–19:00) / `night` (19:00–07:00) windows and a *conventional* cycle layout — real organisations vary, so use `{ custom: [...] }` for an exact pattern. A `RosterDay` is `'off'` or `{ label, start, end }`.
- Returns `{ date: 'YYYY-MM-DD'; shift: { label, start, end } | null }[]` (`shift: null` on rest days).
- Feed each non-rest assignment's `shift` into `resolveDay`'s `shift` to close the loop.

## Errors

`TimeParseError extends Error` — thrown for malformed ISO timestamps, dates, or `HH:MM` values. `generateRoster` throws a plain `Error` for an empty custom pattern or a negative `days`.

## Not in v0.1 (see project roadmap)

Overtime *classification* (`classifyHours` — daily/weekly/double-time/7th-day/8-80), `regularRateInputs`, meal/rest compliance (`evaluateBreakCompliance`), Fair Workweek (`evaluateSchedule`), rounding-neutrality (`applyRounding`, `roundingNeutralityReport`), anomaly detection (`detectAnomalies`), jurisdiction rule packs. These arrive as minor versions — see `USE-CASES.md` and `PLAN.md`.
