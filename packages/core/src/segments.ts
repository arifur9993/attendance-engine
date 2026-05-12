/** Pairing raw punches into in/out segments: sorting, de-duplication, inversion handling. */

import type { Flag, PunchPairing } from './types.js';
import { minutesBetween } from './time.js';

/** A punch reduced to what segment-building needs. */
export interface PunchInstant {
  ms: number;
  offsetMinutes: number;
}

/** Internal segment representation (epoch ms). */
export interface RawSegment {
  inMs: number;
  outMs: number;
  inOffset: number;
  outOffset: number;
  minutes: number;
}

export interface SegmentBuildResult {
  segments: RawSegment[];
  flags: Flag[];
  /** True when an unpaired punch-in remained after pairing (an odd punch count). */
  oddPunchUnresolved: boolean;
  /** The dangling punch-in instant, if `oddPunchUnresolved`. */
  danglingInMs: number | null;
  danglingInOffset: number | null;
}

/** Sort ascending by instant, then drop near-duplicates (within `dedupeSeconds`). */
export function dedupeAndSort(punches: PunchInstant[], dedupeSeconds: number): {
  punches: PunchInstant[];
  hadDuplicates: boolean;
} {
  const sorted = [...punches].sort((a, b) => a.ms - b.ms);
  const out: PunchInstant[] = [];
  let hadDuplicates = false;
  for (const p of sorted) {
    const prev = out[out.length - 1];
    if (prev && Math.abs(p.ms - prev.ms) <= dedupeSeconds * 1000) {
      hadDuplicates = true;
      continue;
    }
    out.push(p);
  }
  return { punches: out, hadDuplicates };
}

function makeSegment(a: PunchInstant, b: PunchInstant): { seg: RawSegment; inverted: boolean } {
  const inverted = b.ms < a.ms;
  const inMs = inverted ? b.ms : a.ms;
  const outMs = inverted ? a.ms : b.ms;
  // When inverted we still record the *intended* in/out order (a→b) but clamp minutes to 0.
  const minutes = inverted ? 0 : Math.max(0, minutesBetween(inMs, outMs));
  return {
    seg: {
      inMs: a.ms,
      outMs: b.ms,
      inOffset: a.offsetMinutes,
      outOffset: b.offsetMinutes,
      minutes,
    },
    inverted,
  };
}

/** Build segments from de-duplicated, sorted punches according to the pairing strategy. */
export function buildSegments(sorted: PunchInstant[], pairing: PunchPairing): SegmentBuildResult {
  const flags: Flag[] = [];

  if (sorted.length === 0) {
    return { segments: [], flags, oddPunchUnresolved: false, danglingInMs: null, danglingInOffset: null };
  }

  if (pairing === 'first-last') {
    if (sorted.length === 1) {
      const only = sorted[0]!;
      return {
        segments: [],
        flags,
        oddPunchUnresolved: true,
        danglingInMs: only.ms,
        danglingInOffset: only.offsetMinutes,
      };
    }
    const first = sorted[0]!;
    const last = sorted[sorted.length - 1]!;
    const { seg, inverted } = makeSegment(first, last);
    if (inverted) flags.push('inverted-clock');
    return { segments: [seg], flags, oddPunchUnresolved: false, danglingInMs: null, danglingInOffset: null };
  }

  // pairing === 'in-out-pairs'
  const segments: RawSegment[] = [];
  for (let i = 0; i + 1 < sorted.length; i += 2) {
    const { seg, inverted } = makeSegment(sorted[i]!, sorted[i + 1]!);
    if (inverted && !flags.includes('inverted-clock')) flags.push('inverted-clock');
    segments.push(seg);
  }
  const oddPunchUnresolved = sorted.length % 2 === 1;
  const dangling = oddPunchUnresolved ? sorted[sorted.length - 1]! : null;
  return {
    segments,
    flags,
    oddPunchUnresolved,
    danglingInMs: dangling ? dangling.ms : null,
    danglingInOffset: dangling ? dangling.offsetMinutes : null,
  };
}
