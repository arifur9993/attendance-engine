/** Unpaid-break deduction: how many minutes the employee was on-clock across an unpaid break window. */

import type { BreakWindow } from './types.js';
import { instantFromLocal, minutesBetween, parseHhmm } from './time.js';
import type { RawSegment } from './segments.js';

/** [startMs, endMs) intervals; sum of overlaps. */
function overlapMinutes(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  const lo = Math.max(aStart, bStart);
  const hi = Math.min(aEnd, bEnd);
  if (hi <= lo) return 0;
  return minutesBetween(lo, hi);
}

/**
 * Total minutes to deduct: for each *unpaid* break window, how much of it falls inside any worked segment.
 * Break windows are wall-clock on the duty date; a window whose end <= start spills to the next day.
 */
export function deductedBreakMinutes(
  segments: RawSegment[],
  breaks: BreakWindow[] | undefined,
  dutyDate: string,
  tzOffsetMinutes: number,
): number {
  if (!breaks || breaks.length === 0 || segments.length === 0) return 0;
  let total = 0;
  for (const b of breaks) {
    if (b.paid) continue;
    const startMin = parseHhmm(b.start);
    const endMin = parseHhmm(b.end);
    const endDayOffset = endMin <= startMin ? 1 : 0;
    const bStart = instantFromLocal(dutyDate, startMin, 0, tzOffsetMinutes);
    const bEnd = instantFromLocal(dutyDate, endMin, endDayOffset, tzOffsetMinutes);
    for (const seg of segments) {
      const segLo = Math.min(seg.inMs, seg.outMs);
      const segHi = Math.max(seg.inMs, seg.outMs);
      total += overlapMinutes(segLo, segHi, bStart, bEnd);
    }
  }
  return total;
}
