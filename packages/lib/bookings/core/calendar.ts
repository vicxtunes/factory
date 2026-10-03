// Calendar day maths on "yyyy-mm-dd" strings. Pure and time-zone free: a
// calendar day is the same day everywhere, so these work in UTC.

import type { CalendarView } from "./model";

const DAY = 86_400_000;
const toTime = (date: string) => Date.parse(`${date}T00:00:00Z`);
const toDate = (time: number) => new Date(time).toISOString().slice(0, 10);

export function addDays(date: string, days: number): string {
  return toDate(toTime(date) + days * DAY);
}

/** The Monday on or before `date`. */
export function startOfWeek(date: string): string {
  const weekday = (new Date(toTime(date)).getUTCDay() + 6) % 7; // Monday = 0
  return addDays(date, -weekday);
}

export function startOfMonth(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

export function addMonths(date: string, months: number): string {
  const d = new Date(toTime(startOfMonth(date)));
  d.setUTCMonth(d.getUTCMonth() + months);
  return toDate(d.getTime());
}

/** The days a view shows around `anchor`, inclusive. Month: whole weeks, Monday first. */
export function viewRange(view: CalendarView, anchor: string): { from: string; to: string } {
  if (view === "day") return { from: anchor, to: anchor };
  if (view === "week") {
    const from = startOfWeek(anchor);
    return { from, to: addDays(from, 6) };
  }
  if (view === "list") return { from: anchor, to: addDays(anchor, 59) };
  const from = startOfWeek(startOfMonth(anchor));
  const lastOfMonth = addDays(addMonths(anchor, 1), -1);
  return { from, to: addDays(startOfWeek(lastOfMonth), 6) };
}

/** Where "previous" / "next" go from `anchor` in a view. */
export function stepAnchor(view: CalendarView, anchor: string, direction: 1 | -1): string {
  if (view === "month") return addMonths(anchor, direction);
  if (view === "week") return addDays(anchor, 7 * direction);
  if (view === "list") return addDays(anchor, 60 * direction);
  return addDays(anchor, direction);
}

/** Every day from `from` to `to`, inclusive. */
export function daysBetween(from: string, to: string): string[] {
  const days: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
  return days;
}
