/** Resolve a sequence of duty days (a pay period, a week, a month). */

import type { DayResult, ResolveDayInput } from './types.js';
import { resolveDay } from './resolve-day.js';

/** Map {@link resolveDay} over many days. Pure; order is preserved. */
export function resolveRange(inputs: ResolveDayInput[]): DayResult[] {
  return inputs.map(resolveDay);
}
