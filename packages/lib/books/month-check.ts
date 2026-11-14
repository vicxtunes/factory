// The month-end check (owner, 2026-11-14): what each account really holds at
// the end of a month against what the books say. Pure.

import { CLOSE_FROM_HOUR } from "./model";

export type MonthCheckStatus = "not_started" | "draft" | "waiting" | "approved";

export const MONTH_CHECK_STATUS_LABELS: Record<MonthCheckStatus, string> = {
  not_started: "Not started",
  draft: "Being entered",
  waiting: "Waiting for the boss",
  approved: "Approved",
};

export type MonthCheckBooking = "shortage" | "surplus" | "opening";

export const BOOKING_LABELS: Record<MonthCheckBooking, string> = {
  shortage: "Shortage (an expense)",
  surplus: "Surplus (other income)",
  opening: "Starting balance was wrong",
};

export interface MonthCheckLine {
  accountId: string;
  accountName: string;
  /** At the month's start, or the day the account's opening balance starts if later. */
  opening: number;
  moneyIn: number;
  moneyOut: number;
  /** Differences found when days were closed with a count. */
  dayCounts: number;
  /** What the books say at the end of the month's last day. */
  books: number;
  actual: number | null;
  reason: string | null;
  enteredBy: string | null;
  bookedAs: MonthCheckBooking | null;
}

export interface MonthCheck {
  /** The month's first day, YYYY-MM-01. */
  month: string;
  status: MonthCheckStatus;
  /** From 20:00 on the month's last day. */
  open: boolean;
  submittedBy: string | null;
  submittedAt: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  lines: MonthCheckLine[];
}

export interface MonthCheckSummary {
  month: string;
  status: MonthCheckStatus;
  open: boolean;
}

/** Real − books: below zero is money missing. Null until the real balance is entered. */
export function difference(l: Pick<MonthCheckLine, "actual" | "books">): number | null {
  return l.actual === null ? null : l.actual - l.books;
}

/** The bookings a difference can take: a shortage only when money is missing, a surplus only when there's more. */
export function bookingsFor(diff: number): MonthCheckBooking[] {
  return diff < 0 ? ["shortage", "opening"] : ["surplus", "opening"];
}

/** What stops the check being sent to the boss, or null when it's ready. */
export function notReady(lines: Pick<MonthCheckLine, "actual" | "books" | "reason">[]): string | null {
  if (lines.some((l) => l.actual === null)) return "Enter the real balance of every account.";
  if (lines.some((l) => l.actual !== l.books && !l.reason?.trim())) return "Say why each account that differs is different.";
  return null;
}

export function monthTotals(lines: MonthCheckLine[]) {
  const entered = lines.filter((l) => l.actual !== null);
  return {
    books: lines.reduce((s, l) => s + l.books, 0),
    actual: entered.reduce((s, l) => s + (l.actual ?? 0), 0),
    difference: entered.reduce((s, l) => s + (l.actual! - l.books), 0),
    differing: entered.filter((l) => l.actual !== l.books).length,
  };
}

/** "November 2026" for 2026-11-01. */
export function monthName(month: string): string {
  return new Date(`${month}T12:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** The month's last day, YYYY-MM-DD. */
export function monthEnd(month: string): string {
  const d = new Date(`${month}T12:00:00Z`);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 12)).toISOString().slice(0, 10);
}

export function addMonths(month: string, n: number): string {
  const d = new Date(`${month}T12:00:00Z`);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1, 12)).toISOString().slice(0, 10);
}

/** Whether a month's check is open on this local day and hour (as month_check_is_open). */
export function isMonthOpen(month: string, today: string, hour: number): boolean {
  const last = monthEnd(month);
  return today > last || (today === last && hour >= CLOSE_FROM_HOUR);
}

/** The month the reminder is about on this local day and hour: tonight's month on its last day from 20:00, last month on the 1st and 3rd. */
export function reminderMonth(today: string, hour: number): string | null {
  const thisMonth = `${today.slice(0, 8)}01`;
  if (today === monthEnd(thisMonth)) return hour >= CLOSE_FROM_HOUR ? thisMonth : null;
  const day = Number(today.slice(8, 10));
  return day === 1 || day === 3 ? addMonths(thisMonth, -1) : null;
}

/** The reminder's words, or null when nothing's left to do. */
export function monthCheckReminder(month: string, status: MonthCheckStatus, today: string): { title: string; body: string } | null {
  if (status === "approved") return null;
  const name = monthName(month);
  if (status === "waiting") return { title: `${name}: month-end check waiting`, body: "The real balances are in. Approve the month-end check under Accounts → Month end." };
  return {
    title: `${name}: month-end check`,
    body:
      today === monthEnd(month)
        ? "Tonight, enter what each account really holds (cash, bank, mobile money, HivePay, petty cash) under Accounts → Month end."
        : "It isn't done yet. Enter what each account really held at the end of the month under Accounts → Month end.",
  };
}
