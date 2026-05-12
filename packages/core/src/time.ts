/**
 * Time arithmetic that never touches the host timezone.
 *
 * Everything reduces to two representations:
 *  - an absolute instant: milliseconds since the Unix epoch (UTC), a plain number;
 *  - a worksite wall-clock: `YYYY-MM-DD` + minutes-since-local-midnight + the UTC offset in minutes.
 *
 * ISO inputs MUST carry an explicit offset (`+06:00`, `-05:00`) or `Z`. A bare
 * `2026-06-01T08:57:00` is rejected — guessing local time is the single biggest
 * source of attendance bugs.
 */

const ISO_RE =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const HHMM_RE = /^(\d{2}):(\d{2})$/;

export class TimeParseError extends Error {
  override name = 'TimeParseError';
}

/** Parsed view of an ISO-8601 instant with an explicit offset. */
export interface ParsedInstant {
  /** Milliseconds since the Unix epoch (UTC). */
  ms: number;
  /** UTC offset of the original string, in minutes (e.g. `+06:00` → 360). */
  offsetMinutes: number;
  /** Local calendar date of the original string, `YYYY-MM-DD`. */
  localDate: string;
  /** Minutes since local midnight of the original string (0..1439). */
  localMinutes: number;
}

function offsetToMinutes(token: string): number {
  if (token === 'Z') return 0;
  const sign = token[0] === '-' ? -1 : 1;
  const body = token.slice(1).replace(':', '');
  const h = Number(body.slice(0, 2));
  const m = Number(body.slice(2, 4));
  return sign * (h * 60 + m);
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Parse an ISO-8601 instant that includes an explicit offset. Throws {@link TimeParseError} otherwise. */
export function parseInstant(iso: string): ParsedInstant {
  const m = ISO_RE.exec(iso);
  if (!m) {
    throw new TimeParseError(
      `Invalid ISO timestamp: "${iso}". Expected an instant with an explicit offset, e.g. "2026-06-01T08:57:00+06:00".`,
    );
  }
  const [, ys, mos, ds, hs, mis, ss, off] = m as unknown as [
    string, string, string, string, string, string, string | undefined, string,
  ];
  const year = Number(ys);
  const month = Number(mos);
  const day = Number(ds);
  const hour = Number(hs);
  const minute = Number(mis);
  const second = ss === undefined ? 0 : Number(ss);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) {
    throw new TimeParseError(`Out-of-range component in ISO timestamp: "${iso}".`);
  }
  const offsetMinutes = offsetToMinutes(off);
  // Build the UTC instant: take the wall-clock as if UTC, then subtract the offset.
  const asUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  const ms = asUtc - offsetMinutes * 60_000;
  return {
    ms,
    offsetMinutes,
    localDate: `${ys}-${mos}-${ds}`,
    localMinutes: hour * 60 + minute,
  };
}

/** Validate a `YYYY-MM-DD` date string; returns `[year, month, day]`. Throws otherwise. */
export function parseDate(date: string): [number, number, number] {
  const m = DATE_RE.exec(date);
  if (!m) throw new TimeParseError(`Invalid date: "${date}". Expected "YYYY-MM-DD".`);
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) throw new TimeParseError(`Out-of-range date: "${date}".`);
  return [y, mo, d];
}

/** Parse `HH:MM` into minutes since midnight (0..1439). Throws otherwise. */
export function parseHhmm(hhmm: string): number {
  const m = HHMM_RE.exec(hhmm);
  if (!m) throw new TimeParseError(`Invalid time-of-day: "${hhmm}". Expected "HH:MM".`);
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) throw new TimeParseError(`Out-of-range time-of-day: "${hhmm}".`);
  return h * 60 + mi;
}

/** Format a `+HH:MM` / `-HH:MM` / `Z`-ish offset token from minutes. (`Z` is rendered as `+00:00`.) */
export function offsetToken(offsetMinutes: number): string {
  const sign = offsetMinutes < 0 ? '-' : '+';
  const abs = Math.abs(offsetMinutes);
  return `${sign}${pad2(Math.floor(abs / 60))}:${pad2(abs % 60)}`;
}

/**
 * Build an absolute instant (epoch ms) from a worksite local date, minutes-since-midnight,
 * a day offset (0 = same day, 1 = next day), and the worksite UTC offset.
 */
export function instantFromLocal(
  date: string,
  minutesSinceMidnight: number,
  dayOffset: number,
  tzOffsetMinutes: number,
): number {
  const [y, mo, d] = parseDate(date);
  const base = Date.UTC(y, mo - 1, d + dayOffset, 0, 0, 0);
  return base + minutesSinceMidnight * 60_000 - tzOffsetMinutes * 60_000;
}

/** Render an epoch-ms instant as an ISO-8601 string in the given UTC offset. */
export function instantToIso(ms: number, offsetMinutes: number): string {
  const shifted = new Date(ms + offsetMinutes * 60_000);
  const y = shifted.getUTCFullYear();
  const mo = pad2(shifted.getUTCMonth() + 1);
  const d = pad2(shifted.getUTCDate());
  const h = pad2(shifted.getUTCHours());
  const mi = pad2(shifted.getUTCMinutes());
  const s = pad2(shifted.getUTCSeconds());
  return `${y}-${mo}-${d}T${h}:${mi}:${s}${offsetToken(offsetMinutes)}`;
}

/** Local calendar date (`YYYY-MM-DD`) of an epoch-ms instant in the given UTC offset. */
export function localDateOf(ms: number, offsetMinutes: number): string {
  const shifted = new Date(ms + offsetMinutes * 60_000);
  return `${shifted.getUTCFullYear()}-${pad2(shifted.getUTCMonth() + 1)}-${pad2(shifted.getUTCDate())}`;
}

/** Whole minutes between two epoch-ms instants (`b - a`), rounded to nearest. */
export function minutesBetween(aMs: number, bMs: number): number {
  return Math.round((bMs - aMs) / 60_000);
}

/** Round a minute count to the nearest `unit` (>= 1). */
export function roundToUnit(minutes: number, unit: number): number {
  if (unit <= 1) return Math.round(minutes);
  return Math.round(minutes / unit) * unit;
}

/** Add `days` to a `YYYY-MM-DD` string, returning a `YYYY-MM-DD` string. */
export function addDays(date: string, days: number): string {
  const [y, mo, d] = parseDate(date);
  const t = Date.UTC(y, mo - 1, d + days);
  const dt = new Date(t);
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}
