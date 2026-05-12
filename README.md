# attendance-engine

> A pure-function workforce time resolver. Feed it raw punches + a shift config; get back resolved attendance — late, early-out, overtime, overnight handling, half-days, the lot. Zero dependencies. Framework-agnostic.

[![npm version](https://img.shields.io/npm/v/@attendance-engine/core.svg)](https://www.npmjs.com/package/@attendance-engine/core)
[![CI](https://github.com/arifur9993/attendance-engine/actions/workflows/ci.yml/badge.svg)](https://github.com/arifur9993/attendance-engine/actions)
[![coverage](https://img.shields.io/badge/coverage-100%25-brightgreen.svg)](#testing)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Every HR / workforce / time-tracking product reimplements this logic — and most get the edge cases wrong (shifts that cross midnight, someone who forgot to clock out, punches recorded out of order, rotating rosters, grace-period boundaries). `attendance-engine` is that logic, extracted, hardened, and exhaustively tested, with **no opinion about your database, your UI, or your framework**.

- **`@attendance-engine/core`** — TypeScript, zero deps. This package.
- **`@attendance-engine/react`** — headless hooks for timesheet/approval UIs *(planned)*.
- **`arits/attendance-engine`** — PHP port, identical API shape *(planned)*.

---

## Install

```bash
npm i @attendance-engine/core
# or: pnpm add / yarn add / bun add
```

## The one function

```ts
import { resolveDay } from '@attendance-engine/core';

const result = resolveDay({
  date: '2026-06-01',
  punches: [
    { at: '2026-06-01T08:57:00+06:00' },
    { at: '2026-06-01T13:02:00+06:00' },   // lunch out
    { at: '2026-06-01T13:48:00+06:00' },   // back
    { at: '2026-06-01T19:34:00+06:00' },   // left
  ],
  shift: {
    start: '09:00',
    end:   '18:00',
    breaks: [{ start: '13:00', end: '14:00', paid: false }],
    graceIn: 10,
    graceOut: 5,
    minHalfDayMinutes: 240,
  },
  policy: {
    pairing: 'first-last',          // or 'in-out-pairs'
    otThresholdMinutes: 15,
    otRoundingUnit: 15,
    lateAfterGrace: 'mark-late',
    treatMissingOutAs: 'shift-end',
    midnightCutover: 'shift-anchored',
  },
});

/* result:
{
  status: 'present',
  firstIn: '2026-06-01T08:57:00+06:00',
  lastOut: '2026-06-01T19:34:00+06:00',
  workedMinutes: 577,            // 8h57m on-clock minus 1h unpaid break ≈ 09:34 net
  lateByMinutes: 0,              // arrived before grace cutoff
  earlyOutMinutes: 0,
  otMinutes: 90,                 // 18:00 → 19:34, threshold + rounding applied
  spansMidnight: false,
  breaksDeducted: 60,
  flags: [],
  segments: [ { in: '...08:57', out: '...13:02', minutes: 245 }, { in: '...13:48', out: '...19:34', minutes: 346 } ]
}
*/
```

## Why this exists — the edge cases ARE the library

Every one of these has a test in [`cases/`](cases/):

- **Overnight shifts** — `start: '22:00', end: '06:00'`. The clock-out lands on the next calendar day but belongs to *this* duty date. Policy chooses `shift-anchored` vs `calendar-day` cutover.
- **Missing punch** — odd number of punches (forgot to clock out). `treatMissingOutAs: 'absent' | 'shift-end' | 'half-day' | 'flag-only'`.
- **Inverted clocks** — punch-out timestamped before punch-in. Flagged (`'inverted-clock'`), never crashes.
- **Duplicate punches** — two reads within N seconds (biometric double-tap). Deduped.
- **Punch before shift start** — early arrival. Counts as work? Counts toward OT? Policy decides.
- **Multiple in/out pairs** — lunch, prayer break, stepped out for a call. Segment-based accounting.
- **Flexible shifts** — any 8h window counts; the engine slides the window.
- **Grace boundary** — arrived at *exactly* the grace cutoff. Defined behaviour, tested.
- **Half-day threshold** — worked 3h59m vs 4h00m. One is half-day, one isn't.
- **Break overlapping actual punches** — punched out during a defined paid break, or worked through an unpaid one.
- **On approved leave but also punched** — conflict resolution policy.
- **Holiday work** — does it all become OT? Policy.
- **Rotating rosters** — `generateRoster('2-2-3', startDate, days)`, `'4-on-4-off'`, `'dupont'`, or a custom pattern.

> **Time-zone rule:** feed timestamps as ISO 8601 with an explicit offset (or UTC). The engine never guesses local time and never reads the host's timezone. DST transition days are handled because the offsets are explicit. See [`docs/timezones.md`](docs/timezones.md).

## API surface

```ts
resolveDay(input: ResolveDayInput): DayResult
resolveRange(inputs: ResolveDayInput[]): DayResult[]            // convenience over a pay period
generateRoster(pattern: RosterPattern, startDate: string, days: number): ShiftAssignment[]
summarize(results: DayResult[]): PeriodSummary                  // totals: worked, OT, late count, absences, ...
```

Full types: [`docs/api.md`](docs/api.md). Every field of `ShiftConfig`, `AttendancePolicy`, and `DayResult` is documented with its default.

## What it does *not* do

- No database, no ORM, no migrations.
- No UI components (a headless React package is planned, separately).
- No leave-balance accounting, no payroll-amount math — it gives you minutes; you price them.
- No biometric device protocol — pair it with [`adms-server`](https://github.com/arifur9993/adms-server) *(planned)* if you need the ingest side.

This narrowness is the point. It's a calculator, not a platform.

## Testing

```bash
pnpm test          # unit + the cases/ fixture matrix
pnpm test:cov      # enforced 100% line + branch coverage
pnpm bench         # microbenchmarks — resolveDay is hot-path code
```

Adding a new scenario? Drop a JSON file in [`cases/`](cases/) — `{ name, input, expected }` — and the runner picks it up. PRs that add real-world edge cases are the most valuable contributions here.

## Compatibility

| | |
|---|---|
| Runtime | Node 18+, Deno, Bun, browsers (ESM + CJS builds) |
| TypeScript | 5.0+ — strict, fully typed, `.d.ts` shipped |
| Dependencies | none |

## Credits

Built by [Md. Arifur Rahman](https://www.linkedin.com/in/md-arifur-rahman-mar/) — extracted and generalised from a production HRMS attendance pipeline that processes biometric events for thousands of employees across rotating shifts.

## License

MIT — see [LICENSE](LICENSE).
