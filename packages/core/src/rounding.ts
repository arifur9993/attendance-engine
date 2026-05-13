/**
 * Time-clock rounding — apply a unit rounding to a {@link DayResult}'s minute fields.
 *
 * Why this exists separately:
 *   In California (Donohue v. AMN, Camp v. Home Depot 2022) employers must compensate
 *   to-the-minute when they can capture exact time. Federally, rounding is still
 *   permitted *if it's provably neutral*. This helper lets you produce a rounded
 *   view of a resolved day **without losing the exact one** — keep both, and use
 *   {@link roundingNeutralityReport} (when it lands) to prove your rounding doesn't
 *   systematically favour the employer.
 *
 * It only rounds minute *quantities* (`workedMinutes`, `otMinutes`, ...); it does
 * not adjust `firstIn` / `lastOut` ISO timestamps or `segments`.
 */

import type { DayResult } from './types.js';

export type RoundingMode = 'nearest' | 'up' | 'down';

/** Which minute fields on a `DayResult` to round. */
export type RoundableField =
  | 'workedMinutes'
  | 'otMinutes'
  | 'lateByMinutes'
  | 'earlyOutMinutes'
  | 'breaksDeducted';

export interface RoundingOptions {
  /** Rounding unit in minutes. Must be a positive integer. `1` is a no-op. */
  unit: number;
  /** Rounding direction. Default `'nearest'`. */
  mode?: RoundingMode;
  /**
   * Fields to round. Default `['workedMinutes', 'otMinutes']`.
   * `lateByMinutes` / `earlyOutMinutes` are intentionally excluded by default —
   * many policies require employee-favourable handling of lateness even when worked
   * time is rounded.
   */
  applyTo?: RoundableField[];
}

const DEFAULT_FIELDS: RoundableField[] = ['workedMinutes', 'otMinutes'];

function round(minutes: number, unit: number, mode: RoundingMode): number {
  if (unit <= 1) return Math.round(minutes);
  const ratio = minutes / unit;
  switch (mode) {
    case 'up':
      return Math.ceil(ratio) * unit;
    case 'down':
      return Math.floor(ratio) * unit;
    case 'nearest':
      return Math.round(ratio) * unit;
  }
}

/**
 * Return a copy of `result` with the selected minute fields rounded.
 *
 * @throws when `opts.unit` is not a positive integer.
 */
export function applyRounding(result: DayResult, opts: RoundingOptions): DayResult {
  if (!Number.isInteger(opts.unit) || opts.unit < 1) {
    throw new Error(`applyRounding: "unit" must be a positive integer, got ${opts.unit}.`);
  }
  const mode: RoundingMode = opts.mode ?? 'nearest';
  const fields = opts.applyTo ?? DEFAULT_FIELDS;
  const out: DayResult = { ...result };
  for (const f of fields) {
    out[f] = round(result[f], opts.unit, mode);
  }
  return out;
}
