/**
 * Rotating-roster generation.
 *
 * The built-in patterns use conventional 12-hour day/night windows
 * (`day` = 07:00–19:00, `night` = 19:00–07:00) and a *typical* cycle layout.
 * Real organisations vary — when you need an exact pattern, pass `{ custom: [...] }`.
 */

import type { RosterDay, RosterPattern, ShiftAssignment } from './types.js';
import { addDays, parseDate } from './time.js';

const DAY = { label: 'day', start: '07:00', end: '19:00' } as const;
const NIGHT = { label: 'night', start: '19:00', end: '07:00' } as const;
const O: RosterDay = 'off';

/** Conventional cycle layouts for the built-in patterns. */
const CYCLES: Record<Exclude<RosterPattern, { custom: RosterDay[] }>, RosterDay[]> = {
  // 8-day cycle: four 12h days on, four off.
  '4-on-4-off': [DAY, DAY, DAY, DAY, O, O, O, O],
  // 14-day "Panama" 2-2-3: blocks of 2 on / 2 off / 3 on, alternating day & night halves.
  '2-2-3': [DAY, DAY, O, O, DAY, DAY, DAY, O, O, NIGHT, NIGHT, O, O, O],
  // 14-day Pitman: 2-3-2 work distribution with rotating weekends.
  'pitman': [DAY, DAY, O, O, DAY, DAY, DAY, O, O, NIGHT, NIGHT, O, NIGHT, NIGHT],
  // 28-day classic DuPont: 4 nights, 3 off, 3 days, 1 off, 3 nights, 3 off, 4 days, 7 off.
  'dupont': [
    NIGHT, NIGHT, NIGHT, NIGHT, O, O, O,
    DAY, DAY, DAY, O,
    NIGHT, NIGHT, NIGHT, O, O, O,
    DAY, DAY, DAY, DAY, O, O, O, O, O, O, O,
  ],
};

function cycleFor(pattern: RosterPattern): RosterDay[] {
  if (typeof pattern === 'object') {
    if (pattern.custom.length === 0) {
      throw new Error('generateRoster: custom pattern must have at least one day.');
    }
    return pattern.custom;
  }
  return CYCLES[pattern];
}

/**
 * Produce one {@link ShiftAssignment} per calendar date starting at `startDate` (`YYYY-MM-DD`),
 * cycling through the chosen pattern.
 */
export function generateRoster(pattern: RosterPattern, startDate: string, days: number): ShiftAssignment[] {
  parseDate(startDate); // validate up front
  if (!Number.isInteger(days) || days < 0) {
    throw new Error(`generateRoster: "days" must be a non-negative integer, got ${days}.`);
  }
  const cycle = cycleFor(pattern);
  const out: ShiftAssignment[] = [];
  for (let i = 0; i < days; i += 1) {
    const day = cycle[i % cycle.length]!;
    out.push({
      date: addDays(startDate, i),
      shift: day === 'off' ? null : { label: day.label, start: day.start, end: day.end },
    });
  }
  return out;
}
