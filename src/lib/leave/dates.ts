/**
 * Date helpers for leave accounting. Leave is counted in whole calendar days,
 * so every conversion is pinned to UTC — using local time would shift a date by
 * a day for anyone west of Greenwich and mis-count a request.
 */

export const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

/**
 * Years this app will compute. A date picker lets someone type a year like 7,
 * which is never a real booking, and unbounded years produce dates the Date
 * constructor rejects.
 */
export const MIN_YEAR = 1970;
export const MAX_YEAR = 2200;

export function isSupportedYear(year: number): boolean {
  return Number.isInteger(year) && year >= MIN_YEAR && year <= MAX_YEAR;
}

export function parseISO(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

export function toISO(d: Date): string {
  // Surfaces the origin of a bad date instead of a bare RangeError from deep
  // inside toISOString, where the stack gives nothing to work with.
  if (Number.isNaN(d.getTime())) {
    throw new RangeError("toISO received an invalid Date");
  }
  return d.toISOString().slice(0, 10);
}

/**
 * Rejects malformed strings, impossible dates like 2026-02-30, and years
 * outside the supported range.
 */
export function isValidISO(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  if (!isSupportedYear(Number(iso.slice(0, 4)))) return false;
  const d = parseISO(iso);
  return !Number.isNaN(d.getTime()) && toISO(d) === iso;
}

export function makeISO(year: number, month: number, day: number): string {
  // The year must be padded too: "7-04-07" is not a date the Date constructor
  // accepts, and the resulting Invalid Date throws on the next conversion.
  const yyyy = String(year).padStart(4, "0");
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function addDays(iso: string, n: number): string {
  const d = parseISO(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return toISO(d);
}

/** 0 = Sunday … 6 = Saturday */
export function weekday(iso: string): number {
  return parseISO(iso).getUTCDay();
}

export function isWeekend(iso: string): boolean {
  const w = weekday(iso);
  return w === 0 || w === 6;
}

export function yearOf(iso: string): number {
  return parseISO(iso).getUTCFullYear();
}

export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/** `month` is 1-based. Day 0 of the next month is the last day of this one. */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function eachDay(startISO: string, endISO: string): string[] {
  const out: string[] = [];
  if (!isValidISO(startISO) || !isValidISO(endISO) || endISO < startISO) {
    return out;
  }
  for (let d = startISO; d <= endISO; d = addDays(d, 1)) out.push(d);
  return out;
}

/** The Monday on or after a date, used to shift weekend holidays. */
export function nextMondayOnOrAfter(iso: string): string {
  let d = iso;
  while (weekday(d) !== 1) d = addDays(d, 1);
  return d;
}

/** The nth given weekday of a month, e.g. the 2nd Monday of October. */
export function nthWeekdayOfMonth(
  year: number,
  month: number,
  targetWeekday: number,
  n: number,
): string {
  let d = makeISO(year, month, 1);
  while (weekday(d) !== targetWeekday) d = addDays(d, 1);
  return addDays(d, (n - 1) * 7);
}

/** The last given weekday strictly before a date, e.g. the Monday before May 25. */
export function lastWeekdayBefore(
  year: number,
  month: number,
  day: number,
  targetWeekday: number,
): string {
  let d = addDays(makeISO(year, month, day), -1);
  while (weekday(d) !== targetWeekday) d = addDays(d, -1);
  return d;
}

/** Anonymous Gregorian computus. Returns Easter Sunday for the given year. */
export function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return makeISO(year, month, day);
}

export function formatLong(iso: string): string {
  return parseISO(iso).toLocaleDateString("en-CA", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function formatMedium(iso: string): string {
  return parseISO(iso).toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** "Mar 3" — for compact range labels where the year is shown elsewhere. */
export function formatShort(iso: string): string {
  return parseISO(iso).toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function formatRange(startISO: string, endISO: string): string {
  if (startISO === endISO) return formatMedium(startISO);
  if (yearOf(startISO) === yearOf(endISO)) {
    return `${formatShort(startISO)} – ${formatMedium(endISO)}`;
  }
  return `${formatMedium(startISO)} – ${formatMedium(endISO)}`;
}

/** Formats 0.5 as "0.5" and 3 as "3", so balances read naturally. */
export function formatDays(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export function pluralDays(n: number): string {
  return `${formatDays(n)} ${n === 1 ? "day" : "days"}`;
}
