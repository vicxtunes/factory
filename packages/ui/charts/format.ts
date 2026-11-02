// Number and date labels for charts. Axis ticks are compact (7.9M); values in
// tooltips, labels and tables are in full. Pure.

import { format } from "d3-format";

const compact = format("~s");

/** "7.9M", "250K", "900": for axis ticks of money and counts. */
export function compactNumber(n: number): string {
  return Math.abs(n) < 1000 ? String(Math.round(n)) : compact(n).replace("G", "B");
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-10" → "Oct"; January, and the first month shown, carry the year ("Jan 26"). */
export function monthLabel(month: string, first = false): string {
  const [y, m] = month.split("-").map(Number);
  const name = MONTHS[m - 1] ?? month;
  return m === 1 || first ? `${name} ${String(y).slice(2)}` : name;
}

/** "2026-10" → the first of that month, for time axes. */
export function monthDate(month: string): Date {
  return new Date(`${month}-01T00:00:00Z`);
}

/** A date on a time axis: "12 Oct" (and the year when it isn't this year's). */
export function dayLabel(d: Date): string {
  const sameYear = d.getUTCFullYear() === new Date().getUTCFullYear();
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(sameYear ? {} : { year: "2-digit" }), timeZone: "UTC" });
}

/** "12.5%" */
export const percent = (n: number) => `${Math.round(n * 10) / 10}%`;

/** The middle value (0 for none). */
export function median(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
