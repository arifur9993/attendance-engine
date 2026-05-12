/** Overnight-shift helpers. */

import { localDateOf } from './time.js';
import type { RawSegment } from './segments.js';

/** True if any worked segment starts and ends on different local calendar dates. */
export function spansMidnight(segments: RawSegment[]): boolean {
  for (const seg of segments) {
    const lo = Math.min(seg.inMs, seg.outMs);
    const hi = Math.max(seg.inMs, seg.outMs);
    if (localDateOf(lo, seg.inOffset) !== localDateOf(hi, seg.outOffset)) return true;
  }
  return false;
}
