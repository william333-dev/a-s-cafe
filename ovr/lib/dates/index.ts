// Calendar-date helpers. Every date in OVR is a local calendar date string
// (YYYY-MM-DD) in the user's timezone — never an instant — so DST switches
// and timezone changes can't create or lose a day.

export type LocalDate = string;

const MS_DAY = 86_400_000;

/** Days since 1970-01-01 for a YYYY-MM-DD string. */
export function dayNumber(d: LocalDate): number {
  const [y, m, day] = d.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, day) / MS_DAY);
}

export function fromDayNumber(n: number): LocalDate {
  return new Date(n * MS_DAY).toISOString().slice(0, 10);
}

export function addDays(d: LocalDate, n: number): LocalDate {
  return fromDayNumber(dayNumber(d) + n);
}

export function diffDays(a: LocalDate, b: LocalDate): number {
  return dayNumber(a) - dayNumber(b);
}

/** ISO weekday: 1 = Monday … 7 = Sunday. */
export function isoDow(d: LocalDate): number {
  return ((((dayNumber(d) + 3) % 7) + 7) % 7) + 1;
}

export function weekStart(d: LocalDate): LocalDate {
  return addDays(d, -(isoDow(d) - 1));
}

/** ISO week label, e.g. 2026-W45. */
export function isoWeek(d: LocalDate): string {
  const thursday = addDays(weekStart(d), 3);
  const year = Number(thursday.slice(0, 4));
  const jan4 = `${year}-01-04`;
  const week1Start = weekStart(jan4);
  const week = Math.floor(diffDays(thursday, week1Start) / 7) + 1;
  return `${year}-W${String(week).padStart(2, "0")}`;
}

/** Local calendar date of an instant in a timezone. */
export function localDate(instant: Date, timeZone: string): LocalDate {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Local wall-clock HH:MM of an instant in a timezone. */
export function localTime(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(instant);
}

export function rangeDays(from: LocalDate, to: LocalDate): LocalDate[] {
  const out: LocalDate[] = [];
  for (let n = dayNumber(from); n <= dayNumber(to); n++) out.push(fromDayNumber(n));
  return out;
}

export function maxDate(a: LocalDate, b: LocalDate): LocalDate {
  return a > b ? a : b;
}
export function minDate(a: LocalDate, b: LocalDate): LocalDate {
  return a < b ? a : b;
}

export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Pacific/Auckland";
  } catch {
    return "Pacific/Auckland";
  }
}

/** d:h:m between two instants (for quit counters). */
export function splitDuration(ms: number): { d: number; h: number; m: number; s: number } {
  const t = Math.max(0, Math.floor(ms / 1000));
  return { d: Math.floor(t / 86400), h: Math.floor((t % 86400) / 3600), m: Math.floor((t % 3600) / 60), s: t % 60 };
}
