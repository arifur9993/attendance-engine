/** {@link resolveDay} — the core function. Raw punches + a shift + a policy → a resolved {@link DayResult}. */

import type {
  AttendancePolicy,
  DayResult,
  DayStatus,
  Flag,
  ResolveDayInput,
  Segment,
} from './types.js';
import {
  instantFromLocal,
  instantToIso,
  minutesBetween,
  parseHhmm,
  parseInstant,
} from './time.js';
import {
  buildSegments,
  dedupeAndSort,
  type PunchInstant,
  type RawSegment,
} from './segments.js';
import { deductedBreakMinutes } from './breaks.js';
import { computeOvertimeMinutes } from './overtime.js';
import { spansMidnight } from './midnight.js';
import { detectRoundNumberBias, uniqueFlags } from './flags.js';

interface ResolvedPolicy {
  pairing: NonNullable<AttendancePolicy['pairing']>;
  treatMissingOutAs: NonNullable<AttendancePolicy['treatMissingOutAs']>;
  midnightCutover: NonNullable<AttendancePolicy['midnightCutover']>;
  lateAfterGrace: NonNullable<AttendancePolicy['lateAfterGrace']>;
  otThresholdMinutes: number;
  otRoundingUnit: number;
  otMode: NonNullable<AttendancePolicy['otMode']>;
  standardDayMinutes: number;
  dedupeSeconds: number;
  tzOffsetMinutes: number | undefined;
}

function resolvePolicy(p: AttendancePolicy | undefined, firstPunchOffset: number | undefined): ResolvedPolicy {
  return {
    pairing: p?.pairing ?? 'first-last',
    treatMissingOutAs: p?.treatMissingOutAs ?? 'flag-only',
    midnightCutover: p?.midnightCutover ?? 'shift-anchored',
    lateAfterGrace: p?.lateAfterGrace ?? 'mark-late',
    otThresholdMinutes: p?.otThresholdMinutes ?? 0,
    otRoundingUnit: p?.otRoundingUnit ?? 1,
    otMode: p?.otMode ?? 'shift-based',
    standardDayMinutes: p?.standardDayMinutes ?? 480,
    dedupeSeconds: p?.dedupeSeconds ?? 60,
    tzOffsetMinutes: p?.tzOffsetMinutes ?? firstPunchOffset,
  };
}

function toPublicSegments(segs: RawSegment[]): Segment[] {
  return [...segs]
    .sort((a, b) => Math.min(a.inMs, a.outMs) - Math.min(b.inMs, b.outMs))
    .map((s) => ({
      in: instantToIso(s.inMs, s.inOffset),
      out: instantToIso(s.outMs, s.outOffset),
      minutes: s.minutes,
    }));
}

/**
 * Resolve one duty day.
 *
 * @see {@link ResolveDayInput} for input shape and {@link AttendancePolicy} for the tunable defaults.
 */
export function resolveDay(input: ResolveDayInput): DayResult {
  const { date, shift } = input;
  const rawPunches = input.punches ?? [];

  // Parse punches up front (throws on malformed ISO).
  const parsed: PunchInstant[] = rawPunches.map((p) => {
    const pi = parseInstant(p.at);
    return { ms: pi.ms, offsetMinutes: pi.offsetMinutes };
  });
  const firstPunchOffset = parsed.length > 0 ? parsed[0]!.offsetMinutes : undefined;
  const policy = resolvePolicy(input.policy, firstPunchOffset);
  const tz = policy.tzOffsetMinutes ?? 0;

  // Shift window as absolute instants.
  const startMin = parseHhmm(shift.start);
  const endMin = parseHhmm(shift.end);
  const overnight = endMin <= startMin;
  const shiftStartMs = instantFromLocal(date, startMin, 0, tz);
  const shiftEndMs = instantFromLocal(date, endMin, overnight ? 1 : 0, tz);
  const graceInMs = (shift.graceIn ?? 0) * 60_000;
  const graceOutMs = (shift.graceOut ?? 0) * 60_000;
  const flexible = shift.flexible === true;

  const flags: Flag[] = [];

  // Context days where the person isn't expected — still compute work if they punched (holiday OT, etc.).
  const contextStatus: DayStatus | null = input.leave
    ? 'leave'
    : input.holiday
      ? 'holiday'
      : input.weekend
        ? 'weekend'
        : null;

  if (parsed.length === 0) {
    flags.push('no-punches');
    const status: DayStatus = contextStatus ?? 'absent';
    return {
      date,
      status,
      firstIn: null,
      lastOut: null,
      workedMinutes: 0,
      lateByMinutes: 0,
      earlyOutMinutes: 0,
      otMinutes: 0,
      spansMidnight: false,
      breaksDeducted: 0,
      flags: uniqueFlags(flags),
      segments: [],
    };
  }

  // De-dup, sort, and pair into segments.
  const { punches: sorted, hadDuplicates } = dedupeAndSort(parsed, policy.dedupeSeconds);
  if (hadDuplicates) flags.push('duplicate-punch');
  flags.push(...detectRoundNumberBias(sorted));

  const built = buildSegments(sorted, policy.pairing);
  flags.push(...built.flags);
  let segments: RawSegment[] = built.segments;
  let incomplete = false;

  if (built.oddPunchUnresolved && built.danglingInMs !== null && built.danglingInOffset !== null) {
    const danglingMs = built.danglingInMs;
    const danglingOffset = built.danglingInOffset;
    switch (policy.treatMissingOutAs) {
      case 'shift-end': {
        if (danglingMs < shiftEndMs) {
          segments = [
            ...segments,
            {
              inMs: danglingMs,
              outMs: shiftEndMs,
              inOffset: danglingOffset,
              outOffset: tz,
              minutes: Math.max(0, minutesBetween(danglingMs, shiftEndMs)),
            },
          ];
          flags.push('missing-out-resolved');
        } else {
          flags.push('odd-punch-count');
          incomplete = true;
        }
        break;
      }
      case 'half-day': {
        flags.push('odd-punch-count');
        // Worked credited only from the already-paired segments; status forced to half-day below.
        break;
      }
      case 'absent': {
        flags.push('odd-punch-count');
        if (segments.length === 0) {
          // Nothing usable — treat as absence.
          return {
            date,
            status: contextStatus ?? 'absent',
            firstIn: null,
            lastOut: null,
            workedMinutes: 0,
            lateByMinutes: 0,
            earlyOutMinutes: 0,
            otMinutes: 0,
            spansMidnight: false,
            breaksDeducted: 0,
            flags: uniqueFlags(flags),
            segments: [],
          };
        }
        incomplete = true;
        break;
      }
      case 'flag-only':
      default: {
        flags.push('odd-punch-count');
        incomplete = true;
        break;
      }
    }
  }

  // Worked minutes = segment total minus unpaid-break overlap.
  const segMinutes = segments.reduce((acc, s) => acc + s.minutes, 0);
  const breaksDeducted = deductedBreakMinutes(segments, shift.breaks, date, tz);
  let workedMinutes = Math.max(0, segMinutes - breaksDeducted);

  // First in / last out across punches and synthesised segments.
  const allInstants: number[] = [
    ...sorted.map((p) => p.ms),
    ...segments.flatMap((s) => [s.inMs, s.outMs]),
  ];
  const firstInMs = Math.min(...allInstants);
  const lastOutMs = Math.max(...allInstants);

  // Lateness / early-out (skipped for flexible shifts).
  let lateByMinutes = 0;
  let earlyOutMinutes = 0;
  if (!flexible) {
    const lateRaw = minutesBetween(shiftStartMs + graceInMs, firstInMs);
    lateByMinutes = policy.lateAfterGrace === 'ignore' ? 0 : Math.max(0, lateRaw);
    if (policy.lateAfterGrace === 'deduct') {
      workedMinutes = Math.max(0, workedMinutes - Math.max(0, lateRaw));
    }
    const earlyRaw = minutesBetween(lastOutMs, shiftEndMs - graceOutMs);
    earlyOutMinutes = Math.max(0, earlyRaw);
  }

  // Overtime.
  const minutesPastShiftEnd = flexible ? 0 : Math.max(0, minutesBetween(shiftEndMs, lastOutMs));
  const otMinutes = computeOvertimeMinutes({
    workedMinutes,
    minutesPastShiftEnd,
    mode: policy.otMode,
    thresholdMinutes: policy.otThresholdMinutes,
    roundingUnit: policy.otRoundingUnit,
    standardDayMinutes: policy.standardDayMinutes,
  });

  // Status.
  let status: DayStatus;
  if (contextStatus) {
    status = contextStatus;
  } else if (segments.length === 0) {
    status = 'absent';
  } else if (policy.treatMissingOutAs === 'half-day' && built.oddPunchUnresolved) {
    status = 'half-day';
  } else if (incomplete) {
    status = 'incomplete';
  } else if (shift.minHalfDayMinutes !== undefined && workedMinutes < shift.minHalfDayMinutes) {
    status = 'half-day';
  } else if (lateByMinutes > 0) {
    status = 'late';
  } else {
    status = 'present';
  }

  return {
    date,
    status,
    firstIn: instantToIso(firstInMs, sorted[0]!.offsetMinutes),
    lastOut: instantToIso(lastOutMs, sorted[sorted.length - 1]!.offsetMinutes),
    workedMinutes,
    lateByMinutes,
    earlyOutMinutes,
    otMinutes,
    spansMidnight: spansMidnight(segments),
    breaksDeducted,
    flags: uniqueFlags(flags),
    segments: toPublicSegments(segments),
  };
}
