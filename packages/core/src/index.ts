/**
 * @attendance-engine/core
 *
 * Pure-function workforce attendance resolver. See the project README, VISION.md and USE-CASES.md.
 *
 * Public surface (v0.1): {@link resolveDay}, {@link resolveRange}, {@link generateRoster},
 * {@link summarize}, plus the type vocabulary. Compliance helpers (overtime classification,
 * meal/rest, Fair Workweek, rounding-neutrality, anomaly detection) land in later minor versions.
 */

export { resolveDay } from './resolve-day.js';
export { resolveRange } from './resolve-range.js';
export { generateRoster } from './roster.js';
export { summarize } from './summarize.js';

export { TimeParseError } from './time.js';

export type {
  Punch,
  BreakWindow,
  ShiftConfig,
  PunchPairing,
  MissingOutHandling,
  MidnightCutover,
  LateHandling,
  OvertimeMode,
  AttendancePolicy,
  Segment,
  DayStatus,
  Flag,
  LeaveDay,
  ResolveDayInput,
  DayResult,
  RosterPattern,
  RosterDay,
  ShiftAssignment,
  PeriodSummary,
} from './types.js';
