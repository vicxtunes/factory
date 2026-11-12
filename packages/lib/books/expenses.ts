// Expenses: what they are and what state they're in. Pure.

import { addDays } from "@repo/lib/accounting/core/period";

export const EXPENSE_DOCUMENTS_BUCKET = "expense-documents";

export type ExpenseEvery = "day" | "week" | "month" | "year";

const UNITS: Record<ExpenseEvery, [string, string]> = { day: ["day", "days"], week: ["week", "weeks"], month: ["month", "months"], year: ["year", "years"] };
export const EVERY_UNITS: ExpenseEvery[] = ["day", "week", "month", "year"];
export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function everyUnit(every: ExpenseEvery, count: number): string {
  return UNITS[every][count === 1 ? 0 : 1];
}

/** The day of the week of a date, 0 Sunday. */
export function weekdayOf(iso: string): number {
  return new Date(`${iso}T00:00:00Z`).getUTCDay();
}

/** The first date on or after `from` that falls on `weekday`. */
export function onOrAfterWeekday(from: string, weekday: number): string {
  return addDays(from, (weekday - weekdayOf(from) + 7) % 7);
}

/** "Every month", "Every 2 weeks on Friday". `on`: a due date, for the weekday of weekly ones. */
export function repeatLabel(every: ExpenseEvery, count: number, on?: string | null): string {
  const base = count === 1 ? `Every ${UNITS[every][0]}` : `Every ${count} ${UNITS[every][1]}`;
  if (every !== "week" || !on) return base;
  return count === 1 ? `Every ${WEEKDAYS[weekdayOf(on)]}` : `${base} on ${WEEKDAYS[weekdayOf(on)]}`;
}

export interface ExpenseCategory {
  key: string;
  name: string;
  /** Materials and interest record themselves; nobody picks them on the form. */
  automatic: boolean;
}

export interface ExpenseLine {
  id: string;
  category: string;
  categoryName: string;
  name: string;
  description: string | null;
  recipient: string | null;
  amount: number;
  /** Only expected for now: the real amount is entered when paying. */
  amountIsEstimate: boolean;
  spentOn: string;
  dueOn: string | null;
  scheduleId: string | null;
  scheduleEvery: ExpenseEvery | null;
  scheduleEveryCount: number | null;
  automatic: boolean;
  /** Bought on credit: paid later, through Money we owe. */
  onCredit: boolean;
  paid: number;
  approval: "approved" | "waiting" | "rejected";
  approvedBy: string | null;
  approvedAt: string | null;
  approvalNote: string | null;
  recordedBy: string;
  recordedAt: string;
  voidedAt: string | null;
  voidReason: string | null;
  voidedBy: string | null;
  /** Voided with its recurring expense's pause or cancel: can be restored. */
  voidedWithSchedule: boolean;
  restoredAt: string | null;
  restoredBy: string | null;
  /** The accounts its payments came out of. */
  paidFrom: string[];
  /** Where it's paid by mobile money: a recurring bill takes its schedule's number. */
  payPhone: string | null;
  /** A HivePay payout for it is on its way: it can't be paid again until that settles. */
  payoutSending: boolean;
  /** Autopay: when it goes by itself, set when the boss was warned of it. */
  autopayAt: string | null;
  /** Held: it waits for Approve and send (the boss held it, or a send failed). */
  autopayHeldAt: string | null;
  autopayHeldBy: string | null;
  autopayHoldReason: string | null;
}

/** A recurring expense belongs to its due day; anything else to the day it was spent. */
export function expenseBelongsOn(e: Pick<ExpenseLine, "scheduleId" | "dueOn" | "spentOn">): string {
  return e.scheduleId ? (e.dueOn ?? e.spentOn) : e.spentOn;
}

export interface ExpensePayment {
  id: string;
  amount: number;
  paidOn: string;
  accountName: string;
  method: string;
  phone: string | null;
  reference: string | null;
  note: string | null;
  recordedBy: string;
  recordedAt: string;
  voidedAt: string | null;
  voidReason: string | null;
  voidedBy: string | null;
}

export interface ExpenseDocument {
  id: string;
  fileName: string;
  /** A short-lived link: the files are private. */
  url: string | null;
  recordedBy: string;
  recordedAt: string;
}

export interface ExpensePayout {
  id: string;
  /** What the phone should receive. */
  amount: number;
  phone: string;
  status: "sending" | "paid" | "failed";
  error: string | null;
  sentBy: string;
  sentAt: string;
}

export interface ExpenseDetail {
  payouts: ExpensePayout[];
  payments: ExpensePayment[];
  documents: ExpenseDocument[];
}

export interface ExpenseSchedule {
  id: string;
  name: string;
  description: string | null;
  category: string;
  categoryName: string;
  recipient: string | null;
  amount: number;
  varies: boolean;
  every: ExpenseEvery;
  everyCount: number;
  endsOn: string | null;
  times: number | null;
  /** The next bill not yet created; null once it has ended. */
  nextCreatedOn: string | null;
  /** Bills it has made so far, voided ones included. */
  bills: number;
  paidTotal: number;
  recordedBy: string;
  recordedAt: string;
  pausedAt: string | null;
  pausedBy: string | null;
  editedAt: string | null;
  editedBy: string | null;
  endedAt: string | null;
  endedBy: string | null;
  /** Autopay: its due bills are sent by mobile money to this number, by themselves up to the boss's limit. */
  payPhone: string | null;
  /** The time of day ("12:00") its bills go by themselves. */
  sendAt: string;
}

export type ScheduleState = "running" | "paused" | "finished" | "cancelled";

export const SCHEDULE_STATE_LABELS: Record<ScheduleState, string> = { running: "Running", paused: "Paused", finished: "Finished", cancelled: "Cancelled" };

/** Who ends a schedule that reached its end date or number of bills. */
export const AUTOMATIC_ACTOR = "Aming (automatic)";

export function scheduleState(s: Pick<ExpenseSchedule, "pausedAt" | "endedAt" | "endedBy">): ScheduleState {
  if (s.endedAt) return s.endedBy === AUTOMATIC_ACTOR ? "finished" : "cancelled";
  return s.pausedAt ? "paused" : "running";
}

/** A bill a running schedule will make soon, not yet created. */
export interface UpcomingBill {
  scheduleId: string;
  dueOn: string;
}

export type ExpenseStatus = "voided" | "rejected" | "waiting" | "on_credit" | "paid" | "overdue" | "part_paid" | "unpaid";

export const EXPENSE_STATUS_LABELS: Record<ExpenseStatus, string> = {
  voided: "Voided",
  rejected: "Rejected",
  waiting: "Waiting for approval",
  on_credit: "On credit",
  paid: "Paid",
  overdue: "Overdue",
  part_paid: "Part paid",
  unpaid: "Unpaid",
};

export function expenseBalance(e: Pick<ExpenseLine, "amount" | "paid" | "voidedAt" | "approval" | "onCredit">): number {
  if (e.voidedAt || e.approval === "rejected" || e.onCredit) return 0;
  return Math.max(e.amount - e.paid, 0);
}

/** Comes only from the record and its payments, so it can't disagree with them. `today` is the business's date. */
export function expenseStatus(e: Pick<ExpenseLine, "amount" | "paid" | "dueOn" | "voidedAt" | "approval" | "onCredit">, today: string): ExpenseStatus {
  if (e.voidedAt) return "voided";
  if (e.approval === "rejected") return "rejected";
  if (e.onCredit) return "on_credit";
  if (e.paid >= e.amount) return "paid";
  if (e.approval === "waiting") return "waiting";
  if (e.dueOn && e.dueOn < today) return "overdue";
  return e.paid > 0 ? "part_paid" : "unpaid";
}

/**
 * Bills to send by mobile money now (owner, 2026-11-12): a number to pay to,
 * due today or before, something left, nothing already on its way. Those the
 * boss was warned of go by themselves at their time (owner, 2026-11-13); the
 * rest wait for Approve and send.
 */
/** Warned of and not held: it goes by itself at autopayAt (the database checks everything again then). */
export function goesByItself(e: Pick<ExpenseLine, "autopayAt" | "autopayHeldAt">): boolean {
  return e.autopayAt !== null && e.autopayHeldAt === null;
}

export function readyToSend<T extends Pick<ExpenseLine, "payPhone" | "payoutSending" | "dueOn" | "amount" | "paid" | "voidedAt" | "approval" | "onCredit">>(lines: T[], today: string): T[] {
  return lines
    .filter((e) => e.payPhone && !e.payoutSending && e.dueOn !== null && e.dueOn <= today && expenseBalance(e) > 0)
    .sort((a, b) => (a.dueOn ?? "").localeCompare(b.dueOn ?? ""));
}

/** What the dashboard shows: expense_dashboard in the database. */
export interface ExpenseSummary {
  toPay: number;
  overdue: number;
  overdueCount: number;
  /** Due in the next 14 days. */
  upcoming: number;
  upcomingCount: number;
  total: number;
  paid: number;
  owing: number;
  byCategory: { key: string; name: string; total: number; paid: number; owing: number }[];
}

/** One month on the month-by-month chart. `month` is its first day. */
export interface ExpenseMonth {
  month: string;
  total: number;
  paid: number;
}

/** A bill is mentioned this many days before it's due. */
const REMIND_WITHIN_DAYS = 3;
/** A phone notification stays short: the rest are on the page. */
const NAMED_IN_REMINDER = 4;

/** Bills, and debts put in the same shape. */
export type Reminded = Pick<ExpenseLine, "name" | "amount" | "paid" | "dueOn" | "voidedAt" | "approval" | "onCredit" | "amountIsEstimate" | "payPhone" | "payoutSending" | "autopayAt" | "autopayHeldAt">;

/**
 * The morning reminder: one message, whatever the number of bills, or null
 * when nothing needs attention. Every overdue or nearly due bill is counted
 * each day until it's paid or voided. Bills going by themselves are left out:
 * their own warning names them.
 */
export function expenseReminder(lines: Reminded[], today: string, money: (amount: number) => string): { title: string; body: string } | null {
  const soonBy = addDays(today, REMIND_WITHIN_DAYS);
  const open = lines.filter((e) => expenseBalance(e) > 0 && !goesByItself(e));
  const byDue = (a: Reminded, b: Reminded) => (a.dueOn ?? "").localeCompare(b.dueOn ?? "");
  // Each bill is named once: ready to send first, as it only needs the boss's yes.
  const ready = readyToSend(open, today);
  const rest = open.filter((e) => !ready.includes(e));
  const overdue = rest.filter((e) => expenseStatus(e, today) === "overdue").sort(byDue);
  const waiting = rest.filter((e) => e.approval === "waiting");
  const soon = rest.filter((e) => e.approval === "approved" && e.dueOn !== null && e.dueOn >= today && e.dueOn <= soonBy).sort(byDue);
  if (ready.length + overdue.length + soon.length + waiting.length === 0) return null;

  const named = (list: Reminded[]) => {
    const shown = list.slice(0, NAMED_IN_REMINDER).map((e) => `${e.name} ${e.amountIsEstimate ? "about " : ""}${money(expenseBalance(e))}`);
    const more = list.length - shown.length;
    return shown.join(", ") + (more > 0 ? ` and ${more} more` : "");
  };
  const parts = [
    ready.length ? `Ready to send by mobile money: ${named(ready)}.` : "",
    overdue.length ? `Overdue: ${named(overdue)}.` : "",
    soon.length ? `Due soon: ${named(soon)}.` : "",
    waiting.length ? `Waiting for approval: ${named(waiting)}.` : "",
  ];
  const counts = [
    ready.length ? `${ready.length} ready to send` : "",
    overdue.length ? `${overdue.length} overdue` : "",
    soon.length ? `${soon.length} due soon` : "",
    waiting.length ? `${waiting.length} waiting for approval` : "",
  ];
  return { title: `To pay: ${counts.filter(Boolean).join(", ")}`, body: parts.filter(Boolean).join(" ") };
}
