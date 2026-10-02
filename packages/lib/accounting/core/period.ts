// Reporting periods, in the tenant's own time zone: "this month" for a
// business in Kampala starts at midnight Kampala time, whatever the server's
// zone. A period is a half-open range of instants [from, to).

export type PeriodPreset = "this_month" | "last_month" | "this_year" | "all" | "custom";

export const PERIOD_PRESETS: { value: Exclude<PeriodPreset, "custom">; label: string }[] = [
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "this_year", label: "This year" },
  { value: "all", label: "All time" },
];

export interface Period {
  preset: PeriodPreset;
  /** Inclusive start instant (ISO); null = from the beginning. */
  from: string | null;
  /** Exclusive end instant (ISO); null = up to now. */
  to: string | null;
  /** The same range as local calendar dates, inclusive, for display and the URL. */
  fromDate: string | null;
  toDate: string | null;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** The calendar date ("yyyy-mm-dd") an instant falls on in a time zone. */
export function localDate(instant: Date | string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(typeof instant === "string" ? new Date(instant) : instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Milliseconds the zone is ahead of UTC at that instant. */
function zoneOffsetMs(at: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  }).formatToParts(new Date(at));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(at / 1000) * 1000;
}

/** The instant a local calendar date begins in a time zone. */
export function startOfLocalDay(date: string, timeZone: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d);
  // Two passes settle the offset across a DST change on that day.
  const first = guess - zoneOffsetMs(guess, timeZone);
  return new Date(guess - zoneOffsetMs(first, timeZone));
}

/** "yyyy-mm-dd" shifted by whole days (calendar arithmetic, zone-free). */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function monthStart(year: number, month: number): string {
  const d = new Date(Date.UTC(year, month - 1, 1));
  return d.toISOString().slice(0, 10);
}

function range(preset: PeriodPreset, fromDate: string | null, toDate: string | null, timeZone: string): Period {
  return {
    preset,
    fromDate,
    toDate,
    from: fromDate ? startOfLocalDay(fromDate, timeZone).toISOString() : null,
    to: toDate ? startOfLocalDay(addDays(toDate, 1), timeZone).toISOString() : null,
  };
}

/**
 * Turns what's in the URL into a period. Anything unrecognised falls back
 * to this month; a custom range needs both dates, in order.
 */
export function resolvePeriod(
  input: { preset?: string | null; from?: string | null; to?: string | null },
  now: Date,
  timeZone: string,
): Period {
  const today = localDate(now, timeZone);
  const [year, month] = today.split("-").map(Number);

  switch (input.preset) {
    case "last_month": {
      const start = monthStart(year, month - 1);
      return range("last_month", start, addDays(monthStart(year, month), -1), timeZone);
    }
    case "this_year":
      return range("this_year", `${year}-01-01`, today, timeZone);
    case "all":
      return { preset: "all", from: null, to: null, fromDate: null, toDate: null };
    case "custom": {
      const from = input.from ?? "";
      const to = input.to ?? "";
      if (DATE_RE.test(from) && DATE_RE.test(to) && from <= to) return range("custom", from, to, timeZone);
      break;
    }
  }
  return range("this_month", monthStart(year, month), today, timeZone);
}

/** Whether an instant falls inside the period. */
export function inPeriod(instant: string, period: Period): boolean {
  const t = Date.parse(instant);
  if (period.from && t < Date.parse(period.from)) return false;
  if (period.to && t >= Date.parse(period.to)) return false;
  return true;
}

/** The last `count` months ("yyyy-mm"), oldest first, ending with the current one. */
export function lastMonths(now: Date, count: number, timeZone: string): string[] {
  const [year, month] = localDate(now, timeZone).split("-").map(Number);
  return Array.from({ length: count }, (_, i) => monthStart(year, month - (count - 1 - i)).slice(0, 7));
}
