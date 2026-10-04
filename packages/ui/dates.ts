// Calendar-date maths on ISO "YYYY-MM-DD" strings, done in UTC so a date
// never shifts with the viewer's timezone or DST. Shared by the project
// drafts (Timeline, DueDatePicker, CalendarMonth).

const DAY = 86_400_000;

const toDate = (iso: string) => new Date(`${iso}T00:00:00Z`);
const toISO = (d: Date) => d.toISOString().slice(0, 10);

export const addDays = (iso: string, days: number) => toISO(new Date(toDate(iso).getTime() + days * DAY));

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export const daysBetween = (from: string, to: string) => Math.round((toDate(to).getTime() - toDate(from).getTime()) / DAY);

/** 0 = Monday … 6 = Sunday. */
export const weekdayIndex = (iso: string) => (toDate(iso).getUTCDay() + 6) % 7;

export const formatDate = (iso: string, options: Intl.DateTimeFormatOptions) =>
  toDate(iso).toLocaleDateString("en-GB", { ...options, timeZone: "UTC" });

/** "YYYY-MM" moved by `delta` months. */
export function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return toISO(d).slice(0, 7);
}

/** The month as whole Monday-to-Sunday weeks, padded with the neighbouring months' days. */
export function monthWeeks(month: string): string[][] {
  const first = `${month}-01`;
  const start = addDays(first, -weekdayIndex(first));
  const last = addDays(`${shiftMonth(month, 1)}-01`, -1);
  const end = addDays(last, 6 - weekdayIndex(last));
  const weeks: string[][] = [];
  for (let day = start; day <= end; day = addDays(day, 7)) weeks.push(Array.from({ length: 7 }, (_, i) => addDays(day, i)));
  return weeks;
}
