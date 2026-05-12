/** Heuristic data-integrity flags computed from the raw punch set. */

import type { Flag } from './types.js';
import type { PunchInstant } from './segments.js';

/**
 * `round-number-bias`: every punch lands exactly on a 5-minute boundary with zero seconds.
 * Often a sign of manual entry rather than a real device read — worth surfacing for reconciliation,
 * and a precondition check before trusting "exact" times for rounding-neutrality analysis.
 */
export function detectRoundNumberBias(punches: PunchInstant[]): Flag[] {
  if (punches.length < 2) return [];
  const allRound = punches.every((p) => {
    const totalSeconds = Math.floor(p.ms / 1000);
    const minuteOfHour = Math.floor(totalSeconds / 60) % 60;
    const seconds = totalSeconds % 60;
    return seconds === 0 && minuteOfHour % 5 === 0;
  });
  return allRound ? ['round-number-bias'] : [];
}

/** De-duplicate a flag list while preserving first-seen order. */
export function uniqueFlags(flags: Flag[]): Flag[] {
  const seen = new Set<Flag>();
  const out: Flag[] = [];
  for (const f of flags) {
    if (!seen.has(f)) {
      seen.add(f);
      out.push(f);
    }
  }
  return out;
}
