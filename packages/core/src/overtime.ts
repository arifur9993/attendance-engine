/** Overtime computation for a single day. (Period-level OT classification — daily/weekly/double-time — is a later milestone.) */

import type { OvertimeMode } from './types.js';
import { roundToUnit } from './time.js';

export interface OvertimeInput {
  /** Net worked minutes for the day. */
  workedMinutes: number;
  /** Minutes the last punch-out is past the scheduled shift end (>= 0). 0 if not applicable / flexible. */
  minutesPastShiftEnd: number;
  mode: OvertimeMode;
  /** Only counts OT after this many minutes past shift end (`shift-based`) or past the standard day. */
  thresholdMinutes: number;
  /** Round the result to the nearest N minutes (>= 1). */
  roundingUnit: number;
  /** Length of a standard (non-OT) day, for `fixed-hours` / `daily-cap`. */
  standardDayMinutes: number;
}

export function computeOvertimeMinutes(i: OvertimeInput): number {
  let raw: number;
  switch (i.mode) {
    case 'shift-based': {
      raw = i.minutesPastShiftEnd - i.thresholdMinutes;
      break;
    }
    case 'fixed-hours':
    case 'daily-cap': {
      raw = i.workedMinutes - i.standardDayMinutes - i.thresholdMinutes;
      break;
    }
  }
  if (raw <= 0) return 0;
  return Math.max(0, roundToUnit(raw, i.roundingUnit));
}
