# Vision — attendance-engine

## The problem nobody wants to own

"Figure out if this person was late" sounds trivial. It is not. It is one of the most quietly treacherous calculations in business software, and almost every HR product, ERP module, and time-tracking app reimplements it — badly, in a controller, mixed with database calls, untested, and subtly wrong in ways that only surface on payday when someone's overtime is short by 45 minutes.

Consider what "was this person late on June 1st?" actually requires you to know:

- **What shift were they on?** Fixed 9–6? A rotating 2-2-3 roster? A flexible "any 8 hours"? A night shift that started at 22:00 *the day before*?
- **What counts as "their punches" for that day?** If they work 22:00→06:00, the clock-out at 06:14 is timestamped on June 2nd but belongs to the June 1st duty. If you bucket punches by calendar day, you've already got it wrong.
- **Which punches are even real?** Biometric devices double-tap. People badge in, realise they forgot something, badge out, badge back in. Someone's clock shows an "out" event *before* the "in" event because two devices weren't time-synced. Manual corrections get entered backwards.
- **What's the grace policy?** 10 minutes? Does arriving at *exactly* 09:10 count as on-time or late? Is "late" a flag, a deduction, or ignored entirely below some threshold?
- **What about breaks?** A one-hour unpaid lunch is deducted — but only if they were actually clocked in across it. A paid prayer break isn't deducted. Did they work *through* the unpaid break?
- **When does overtime start?** At 18:00 sharp, or only after 15 minutes past? Rounded to the nearest 15? Capped daily? Is holiday work *all* overtime?
- **Were they even supposed to be there?** On approved leave but the turnstile logged a punch — now what? It's a holiday but they worked — now what?
- **And do it across 5,000 employees, 20 shift patterns, two time zones, and a DST transition, fast enough to not blow up your PHP-FPM workers.**

Every team that hits this rebuilds it from scratch, inside their app, tangled up with their ORM and their UI. The logic gets copy-pasted between the payroll report, the attendance dashboard, and the mobile app — and they drift. There is **no standalone, framework-agnostic, exhaustively-tested library** for it. That is the gap `attendance-engine` fills.

## What it is

A **pure-function calculator**. You hand it raw punch timestamps, a shift definition, and a policy. It hands you back a resolved day: status, worked minutes, late-by, early-out, overtime minutes, whether it spanned midnight, which segments it found, and a list of flags for anything suspicious. No database. No HTTP. No UI. No opinion about your stack. A function in, a struct out — the kind of thing you can unit-test to death and trust forever.

```
raw punches  ──┐
shift config ──┼──▶  resolveDay()  ──▶  { status, workedMinutes, lateBy, otMinutes, spansMidnight, segments, flags, ... }
policy       ──┘
```

It is deliberately *narrow*. It does not track leave balances. It does not price overtime into money. It does not talk to ZKTeco devices. It does not render a timesheet. Each of those is a different concern (and some are separate companion packages). What it does, it does completely and correctly: turn messy real-world clock data into clean, accountable, per-day numbers.

## The complexity it actually tames — real scenarios

**Scenario: the night-shift nurse.** Shift is 22:00→06:00, defined on June 1st. She badges in at 21:54 (early), takes an unpaid 30-min break at 02:00, badges out at 06:18 (a bit of overtime). Her four punches span two calendar dates. A naïve "group by date" gives June 1st one punch and June 2nd one punch — both look like incomplete days. `attendance-engine` with `midnightCutover: 'shift-anchored'` correctly attributes all of it to the June 1st duty: present, 7h54m worked (8h24m on-clock minus 30m break), 0 late, 18m overtime (subject to threshold/rounding), `spansMidnight: true`.

**Scenario: the forgotten clock-out.** Day shift 9–6. He badges in at 09:03, then... nothing. Did he leave at lunch? Work a half day? Pull a double and forget? You can't know — but you must produce *something*. `treatMissingOutAs` makes it an explicit, auditable policy decision: `'absent'` (no out = no credit), `'shift-end'` (assume he left at 18:00), `'half-day'`, or `'flag-only'` (credit nothing, raise `'odd-punch-count'`, let a human decide). The library never silently guesses; it does what you told it to and tells you it did.

**Scenario: the unsynced turnstiles.** Entry turnstile's clock drifted 90 seconds fast. Exit turnstile is correct. For a quick in-and-out, you can end up with an "out" timestamp *earlier* than the "in". `attendance-engine` doesn't divide by zero or produce negative worked-minutes — it raises `'inverted-clock'`, clamps the segment to zero, and keeps going. Your reconciliation queue gets a clean signal instead of a crash.

**Scenario: the rotating roster.** A 4-team continuous operation runs the "DuPont" 28-day pattern — days, nights, off, in a rotation that doesn't line up with weeks or months. `generateRoster('dupont', startDate, 28)` produces the per-day shift assignments; feed each day's assignment into `resolveDay`. The roster generator and the day resolver compose — you're never hand-rolling shift calendars in a spreadsheet again.

**Scenario: payday at scale.** Month-end. 5,000 employees × ~30 days = 150,000 day-resolutions, and the payroll job has a memory ceiling. Because `resolveDay` is a pure function with no allocations beyond its result and no I/O, it runs in microseconds and you can stream it — resolve, accumulate into a running summary, discard. The original HRMS this was extracted from learned that lesson the hard way (PHP-FPM OOM, queue blow-up); the engine is shaped so you don't have to.

**Scenario: the audit.** Three months later someone disputes their June overtime. You re-run `resolveDay` with the exact same inputs and get the exact same output — it's deterministic, and the `segments` array shows precisely which punch-pairs it counted and why. A pure function is an auditable function.

## Design principles

1. **Pure functions, no I/O.** Everything is `(input) → output`. No clock reads, no env reads, no database. This is what makes it testable, deterministic, fast, and embeddable anywhere.
2. **Policy is data, not code.** Every "it depends on the company" decision — grace, OT threshold, rounding, missing-punch handling, midnight cutover, punch-pairing strategy — is an explicit field on a `policy` object. The library has no hidden defaults you'll discover in production.
3. **Time zones are the caller's job, made unambiguous.** Timestamps come in as ISO 8601 with explicit offsets (or UTC). The engine never reads the host timezone, never guesses local time. DST days just work because the offsets are explicit. This rules out the single largest class of attendance bugs.
4. **Suspicious data gets flagged, never swallowed.** Inverted clocks, duplicate punches, odd punch counts, punches outside the shift window — all surface as `flags`, so your reconciliation workflow gets signal instead of silently-wrong numbers.
5. **The edge cases are the product.** A `cases/` directory of input→expected fixtures *is* the spec. Every weird real-world situation someone hits becomes a permanent test. 100% branch coverage isn't vanity — it's the promise.
6. **Narrow on purpose.** No scope creep into leave management, payroll pricing, device protocols, or UI. Adjacent concerns become adjacent packages (`@attendance-engine/react` for headless timesheet hooks; pair with `adms-server` for biometric ingest). The core stays a calculator.
7. **Same logic everywhere.** TypeScript first, then a PHP port with an identical API shape. Your backend and your frontend should compute attendance the *same* way — no more drift between the payroll report and the dashboard.

## Non-goals

- Not an HR system, not a payroll system, not a scheduling app.
- Doesn't store anything.
- Doesn't know about money, leave entitlements, or accruals — it gives you *minutes*; you decide what a minute is worth.
- Doesn't talk to biometric hardware.
- Doesn't render anything (the headless React package is a thin, separate layer over this).

## Roadmap

| Stage | Deliverable |
|---|---|
| **v0.1** | `@attendance-engine/core` — `resolveDay`, `resolveRange`, `summarize`, full `cases/` fixture matrix, 100% coverage. |
| **v0.2** | `generateRoster` patterns: 2-2-3, 4-on-4-off, DuPont, Pitman, custom. Roster ↔ resolver composition examples. |
| **v0.3** | Richer `summarize` — period totals, per-week OT caps, attendance-rate, exception report. Benchmarks published. |
| **v0.4** | `@attendance-engine/react` — headless hooks for timesheet display, approval queues, exception triage. |
| **v0.x** | `arits/attendance-engine` — PHP port, API-compatible. |
| **v1.0** | Schema/contract frozen, PHP port at parity, docs site live, real-world `cases/` contributed by users. |

## The bigger picture

When this exists and is good, "attendance calculation" stops being a thing every team rebuilds and starts being a thing they `npm install`. New HR products ship correct overtime on day one. Payroll disputes get resolved by re-running a deterministic function. The weird night-shift-across-DST bug gets fixed *once*, in one place, with a test, and everyone benefits. That's the win — taking a deceptively hard, universally-needed, perpetually-rebuilt calculation and turning it into a small, sharp, trustworthy tool.
