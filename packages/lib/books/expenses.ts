// Expenses: what they are and what state they're in. Pure.

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

/** What the tiles show. A waiting expense still counts as owed. */
export function expenseTotals(lines: ExpenseLine[], today: string) {
  const month = today.slice(0, 7);
  let toPay = 0;
  let overdue = 0;
  let spentThisMonth = 0;
  for (const e of lines) {
    if (e.voidedAt || e.approval === "rejected") continue;
    const left = expenseBalance(e);
    toPay += left;
    if (expenseStatus(e, today) === "overdue") overdue += left;
    if (e.spentOn.startsWith(month)) spentThisMonth += e.amount;
  }
  return { toPay, overdue, spentThisMonth };
}
