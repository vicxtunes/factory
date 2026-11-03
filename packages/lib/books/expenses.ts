// Expenses: what they are and what state they're in. Pure.

import { addDays } from "@repo/lib/accounting/core/period";

export const EXPENSE_DOCUMENTS_BUCKET = "expense-documents";

export type ExpenseEvery = "week" | "month" | "year";

export const EVERY_LABELS: Record<ExpenseEvery, string> = { week: "Every week", month: "Every month", year: "Every year" };

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
  scheduleEvery: ExpenseEvery | null;
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

export interface ExpenseDetail {
  payments: ExpensePayment[];
  documents: ExpenseDocument[];
}

export interface ExpenseSchedule {
  id: string;
  name: string;
  categoryName: string;
  recipient: string | null;
  amount: number;
  varies: boolean;
  every: ExpenseEvery;
  firstDueOn: string;
  recordedBy: string;
  endedAt: string | null;
  endedBy: string | null;
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

/** A bill is mentioned this many days before it's due. */
const REMIND_WITHIN_DAYS = 3;
/** A phone notification stays short: the rest are on the page. */
const NAMED_IN_REMINDER = 4;

/** Bills, and debts put in the same shape. */
export type Reminded = Pick<ExpenseLine, "name" | "amount" | "paid" | "dueOn" | "voidedAt" | "approval" | "onCredit" | "amountIsEstimate">;

/**
 * The morning reminder: one message, whatever the number of bills, or null
 * when nothing needs attention. Every overdue or nearly due bill is counted
 * each day until it's paid or voided.
 */
export function expenseReminder(lines: Reminded[], today: string, money: (amount: number) => string): { title: string; body: string } | null {
  const soonBy = addDays(today, REMIND_WITHIN_DAYS);
  const open = lines.filter((e) => expenseBalance(e) > 0);
  const byDue = (a: Reminded, b: Reminded) => (a.dueOn ?? "").localeCompare(b.dueOn ?? "");
  const overdue = open.filter((e) => expenseStatus(e, today) === "overdue").sort(byDue);
  const waiting = open.filter((e) => e.approval === "waiting");
  const soon = open.filter((e) => e.approval === "approved" && e.dueOn !== null && e.dueOn >= today && e.dueOn <= soonBy).sort(byDue);
  if (overdue.length + soon.length + waiting.length === 0) return null;

  const named = (list: Reminded[]) => {
    const shown = list.slice(0, NAMED_IN_REMINDER).map((e) => `${e.name} ${e.amountIsEstimate ? "about " : ""}${money(expenseBalance(e))}`);
    const more = list.length - shown.length;
    return shown.join(", ") + (more > 0 ? ` and ${more} more` : "");
  };
  const parts = [
    overdue.length ? `Overdue: ${named(overdue)}.` : "",
    soon.length ? `Due soon: ${named(soon)}.` : "",
    waiting.length ? `Waiting for approval: ${named(waiting)}.` : "",
  ];
  const counts = [
    overdue.length ? `${overdue.length} overdue` : "",
    soon.length ? `${soon.length} due soon` : "",
    waiting.length ? `${waiting.length} waiting for approval` : "",
  ];
  return { title: `To pay: ${counts.filter(Boolean).join(", ")}`, body: parts.filter(Boolean).join(" ") };
}
