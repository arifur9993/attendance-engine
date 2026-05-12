/**
 * Public type vocabulary for @attendance-engine/core.
 *
 * Design rule: timestamps are ISO-8601 strings *with an explicit offset* (e.g.
 * `2026-06-01T08:57:00+06:00`) or UTC (`...Z`). The engine never reads the host
 * timezone, never calls `Date.now()`. See `docs/timezones.md`.
 */

/** A single raw clock event from a device, app, or manual entry. */
export interface Punch {
  /** ISO-8601 instant with an explicit offset, e.g. `2026-06-01T08:57:00+06:00`. */
  at: string;
  /** Optional provenance — affects nothing in the core, surfaced for your reconciliation logic. */
  source?: 'biometric' | 'mobile' | 'manual' | 'web' | (string & {});
  /** Optional location/site identifier — used by anomaly detection (later milestones). */
  location?: string;
}

/** A break window within a shift, in `HH:MM` wall-clock of the worksite. */
export interface BreakWindow {
  /** `HH:MM` */
  start: string;
  /** `HH:MM`. If `<= start`, the break is treated as ending the next day (rare). */
  end: string;
  /** Paid breaks are never deducted from worked time; unpaid breaks are deducted when the employee was on-clock across them. */
  paid: boolean;
}

/** Definition of the shift the employee was assigned for the duty date. */
export interface ShiftConfig {
  /** `HH:MM` wall-clock start. */
  start: string;
  /** `HH:MM` wall-clock end. If `<= start`, the shift is overnight and ends on the *next* calendar day. */
  end: string;
  /** Defined break windows within the shift. */
  breaks?: BreakWindow[];
  /** Minutes after `start` an arrival is still "on time". Default 0. */
  graceIn?: number;
  /** Minutes before `end` a departure is still "on time". Default 0. */
  graceOut?: number;
  /** If net worked minutes are below this, the day is classified `half-day`. Default: never. */
  minHalfDayMinutes?: number;
  /** Flexible shift: any contiguous block counts; lateness/early-out are not evaluated. Default false. */
  flexible?: boolean;
}

export type PunchPairing = 'first-last' | 'in-out-pairs';
export type MissingOutHandling = 'absent' | 'shift-end' | 'half-day' | 'flag-only';
export type MidnightCutover = 'shift-anchored' | 'calendar-day';
export type LateHandling = 'mark-late' | 'deduct' | 'ignore';
export type OvertimeMode = 'shift-based' | 'fixed-hours' | 'daily-cap';

/** Company/jurisdiction-tunable rules applied when resolving a single day. */
export interface AttendancePolicy {
  /** How to interpret the punch list. Default `'first-last'`. */
  pairing?: PunchPairing;
  /** What to do when a punch-out is missing (odd punch count, or no out at all). Default `'flag-only'`. */
  treatMissingOutAs?: MissingOutHandling;
  /** How to attribute punches around midnight for overnight shifts. Default `'shift-anchored'`. */
  midnightCutover?: MidnightCutover;
  /** What lateness past the grace window means. Default `'mark-late'`. */
  lateAfterGrace?: LateHandling;
  /** Overtime only counts after this many minutes past shift end. Default 0. */
  otThresholdMinutes?: number;
  /** Round overtime to the nearest N minutes. Default 1 (no rounding). */
  otRoundingUnit?: number;
  /** How overtime is computed. Default `'shift-based'` (anything past shift end, beyond threshold). */
  otMode?: OvertimeMode;
  /** For `otMode: 'fixed-hours'` / `'daily-cap'`: minutes of regular time before OT begins. Default 480. */
  standardDayMinutes?: number;
  /** Two punches within this many seconds are treated as a duplicate. Default 60. */
  dedupeSeconds?: number;
  /**
   * Worksite UTC offset in minutes for the duty date (e.g. +360 for `+06:00`).
   * If omitted, derived from the offset embedded in the first punch's ISO string.
   * Provide it explicitly when there are no punches (e.g. absence days) or to be unambiguous around DST.
   */
  tzOffsetMinutes?: number;
}

/** A resolved in/out interval. */
export interface Segment {
  /** ISO instant the segment started (a punch-in). */
  in: string;
  /** ISO instant the segment ended (a punch-out, or a policy-derived value). */
  out: string;
  /** Whole minutes between `in` and `out` (>= 0; inverted pairs are clamped to 0 and flagged). */
  minutes: number;
}

export type DayStatus =
  | 'present'
  | 'late'
  | 'absent'
  | 'half-day'
  | 'leave'
  | 'holiday'
  | 'weekend'
  | 'incomplete';

export type Flag =
  | 'inverted-clock'
  | 'duplicate-punch'
  | 'odd-punch-count'
  | 'punch-before-shift'
  | 'punch-after-shift'
  | 'round-number-bias'
  | 'missing-out-resolved'
  | 'no-punches';

/** Approved-leave context for the duty date. */
export interface LeaveDay {
  type?: string;
  /** If true and the employee also punched, the day is still classified `leave` but `flags` notes the conflict. */
  halfDay?: boolean;
}

/** Input to {@link resolveDay}. */
export interface ResolveDayInput {
  /** Duty date in worksite local wall-clock, `YYYY-MM-DD`. */
  date: string;
  /** Raw punches (any order; the engine sorts, dedupes, and pairs them). */
  punches: Punch[];
  /** The assigned shift. */
  shift: ShiftConfig;
  /** Tunable policy. All fields optional; documented defaults apply. */
  policy?: AttendancePolicy;
  /** Approved leave for this date, if any. */
  leave?: LeaveDay | null;
  /** Whether this date is a company holiday. */
  holiday?: boolean;
  /** Whether this date is a non-working weekend day for this employee. */
  weekend?: boolean;
}

/** Result of {@link resolveDay}. */
export interface DayResult {
  /** Echoed for convenience. */
  date: string;
  status: DayStatus;
  /** First punch-in, ISO; `null` when there are no usable punches. */
  firstIn: string | null;
  /** Last punch-out, ISO; `null` when there are no usable punches. */
  lastOut: string | null;
  /** Net worked minutes (segment total minus deducted unpaid breaks). */
  workedMinutes: number;
  /** Minutes the employee arrived after `start + graceIn` (0 if on time or flexible). */
  lateByMinutes: number;
  /** Minutes the employee left before `end - graceOut` (0 if on time or flexible). */
  earlyOutMinutes: number;
  /** Overtime minutes after threshold + rounding. */
  otMinutes: number;
  /** True if any segment crossed local midnight. */
  spansMidnight: boolean;
  /** Minutes deducted for unpaid breaks. */
  breaksDeducted: number;
  /** Anomalies / notes — see {@link Flag}. */
  flags: Flag[];
  /** The resolved in/out intervals, in chronological order. */
  segments: Segment[];
}

// ── Rosters ──────────────────────────────────────────────────────────────────

/** Built-in rotating-roster patterns plus a custom escape hatch. */
export type RosterPattern =
  | '2-2-3'
  | '4-on-4-off'
  | 'dupont'
  | 'pitman'
  | { custom: RosterDay[] };

/** One day of a roster cycle. `off` means a rest day; otherwise a shift label + window. */
export type RosterDay =
  | 'off'
  | { label: string; start: string; end: string };

/** A concrete shift assignment for a calendar date, produced by {@link generateRoster}. */
export interface ShiftAssignment {
  /** `YYYY-MM-DD` */
  date: string;
  /** `null` on a rest day. */
  shift: { label: string; start: string; end: string } | null;
}

// ── Period summary ───────────────────────────────────────────────────────────

/** Aggregate of many {@link DayResult}s over a pay period. */
export interface PeriodSummary {
  days: number;
  presentDays: number;
  lateDays: number;
  absentDays: number;
  halfDays: number;
  leaveDays: number;
  holidayDays: number;
  weekendDays: number;
  incompleteDays: number;
  totalWorkedMinutes: number;
  totalOtMinutes: number;
  totalLateMinutes: number;
  totalEarlyOutMinutes: number;
  /** presentDays / (days - leaveDays - holidayDays - weekendDays), 0..1; `null` if denominator is 0. */
  attendanceRate: number | null;
  /** Union of all flags seen, with counts. */
  flagCounts: Partial<Record<Flag, number>>;
}
