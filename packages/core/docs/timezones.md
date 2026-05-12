# Time zones — the rules

Time zones are where attendance code goes to die. `@attendance-engine/core` takes one hard line that rules out the whole bug class: **you supply unambiguous instants; the engine never guesses local time and never reads the host timezone.**

## What you pass in

- **Punch timestamps (`Punch.at`)** must be ISO-8601 instants *with an explicit offset*:
  - `2026-06-01T08:57:00+06:00` ✅
  - `2026-06-01T08:57:00Z` ✅ (UTC)
  - `2026-06-01T08:57:00` ❌ → throws `TimeParseError`. A bare local time is ambiguous; the engine refuses to assume.
  - Seconds and fractional seconds are optional (`...T08:57+06:00` is fine; fractions are truncated to the second).
- **Duty `date`** (`ResolveDayInput.date`) is `YYYY-MM-DD` in the **worksite's local wall-clock** — the day the shift "belongs to".
- **Shift `start`/`end`** and **break windows** are `HH:MM` in the worksite's local wall-clock.
- **`policy.tzOffsetMinutes`** — the worksite's UTC offset for that duty date, in minutes (e.g. `+06:00` → `360`, `-05:00` → `-300`, `+05:30` → `330`). If you omit it, the engine uses the offset embedded in the **first punch's** ISO string. Pass it explicitly when:
  - there are **no punches** (an absence/leave/holiday day) — there's no punch to read an offset from;
  - you want to be **unambiguous around a DST transition** (see below).

## How it works internally

Everything is reduced to two representations:

1. an **absolute instant** — milliseconds since the Unix epoch (UTC), a plain number;
2. a **worksite wall-clock** — `YYYY-MM-DD` + minutes-since-local-midnight + the UTC offset.

Punches are parsed straight to absolute instants. The shift's `start`/`end` and break windows are turned into absolute instants by combining the duty `date` + the `HH:MM` + `tzOffsetMinutes` (plus a +1-day bump for overnight ends). All comparisons — lateness, early-out, overtime, break overlap, "did this segment cross midnight" — happen on the absolute timeline. No `Date` local-time methods are ever called.

## Overnight shifts

If `shift.end <= shift.start`, the shift is overnight: `end` is taken on the **next** calendar day. A punch-out timestamped on June 2nd for a shift whose duty `date` is June 1st is handled correctly because both are just instants on the same timeline. `DayResult.spansMidnight` tells you whether any worked segment actually crossed local midnight.

## DST transitions — what to do

On a "spring forward" / "fall back" day, the worksite's UTC offset *changes mid-day*. The engine works in absolute instants, so durations are still correct — but the *single* `tzOffsetMinutes` you pass describes the offset you want used when turning the shift's `HH:MM` boundaries into instants. Recommendations:

- For most shifts, pass the offset in effect **at the shift's start**. The shift-boundary instants will be right; durations across the transition come out correct because the punches carry their own (post-transition) offsets.
- If you need exactness on a graveyard shift that straddles the change, split the duty into two `resolveDay` calls at the transition, or (preferred) just rely on the punches: as long as each `Punch.at` carries the offset that was actually in effect when it was recorded, the worked-minute math is exact regardless of what `tzOffsetMinutes` you chose for the shift boundaries.
- The engine will never silently apply a "wrong" offset — but it also can't infer a transition you didn't tell it about. Garbage offsets in, garbage boundaries out.

## Rendering

`DayResult.firstIn` / `lastOut` and each `Segment.in`/`out` are rendered as ISO-8601 strings in the offset they were observed in (for punches) or in `tzOffsetMinutes` (for engine-synthesised boundaries like a `shift-end`-resolved punch-out). They're round-trippable: feeding a `Segment.in` back into `parseInstant` gives the same instant.

## TL;DR

- Always send offsets on punches. `Z` is fine. Bare local time is rejected.
- `date`, `shift.start/end`, breaks = worksite wall-clock.
- Pass `tzOffsetMinutes` whenever there are no punches, and whenever you care about DST-day shift boundaries.
- Durations are always computed on the absolute timeline, so they're correct as long as your inputs are honest.
