// Staff pay (owner, 2026-11-15): salaries, allowances and advances for
// everyone Aming pays. What they are and what state they're in. Pure.

import { WEEKDAYS, expenseBalance, type ExpenseLine } from "./expenses";

export type PayEvery = "month" | "week";

export interface PayLine {
  name: string;
  amount: number;
}

export interface StaffPayPerson {
  id: string;
  name: string;
  workerId: string | null;
  profileId: string | null;
  designerId: string | null;
  /** Who they are in the app: "Worker", "Supervisor", "Designer". */
  roles: string[];
  payEvery: PayEvery;
  /** The rate is per day worked. */
  dayRate: boolean;
  rate: number;
  payDay: number;
  nextPayOn: string;
  phone: string | null;
  sendsItself: boolean;
  allowances: PayLine[];
  /** One-offs waiting for the next payslip. */
  extras: (PayLine & { id: string })[];
  /** Advances given that payslips haven't taken yet. */
  advanceOwed: number;
  stopped: boolean;
}

export interface StaffPaySlip {
  id: string;
  personId: string;
  payOn: string;
  rate: number;
  dayRate: boolean;
  days: number | null;
  /** Null until a day rate's days are entered. */
  basic: number | null;
  allowances: (PayLine & { once: boolean })[];
  advance: number;
  net: number | null;
  /** What they get, as an expense; null until worked out, or when an advance took it all. */
  expense: ExpenseLine | null;
  movedFromBill: boolean;
}

export interface StaffAdvance {
  id: string;
  personId: string;
  amount: number;
  givenOn: string;
  expense: ExpenseLine | null;
}

/** Someone in the app who can be added: a worker, an office staff member or a designer. */
export interface StaffPayCandidate {
  kind: "worker" | "profile" | "designer";
  id: string;
  name: string;
  detail: string;
}

export interface StaffPaySettings {
  sendsOn: boolean;
  sendAt: string;
}

const ordinal = (n: number) => {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
};

/** "on the 27th of each month" / "every Friday". */
export function payDayLabel(every: PayEvery, day: number): string {
  if (every === "week") return `every ${WEEKDAYS[day]}`;
  return day >= 29 ? `on the ${ordinal(day)} (or the month's last day)` : `on the ${ordinal(day)} of each month`;
}

/** "a month", "a week", "a day". */
export function rateUnit(p: Pick<StaffPayPerson, "payEvery" | "dayRate">): string {
  return p.dayRate ? "a day" : p.payEvery === "week" ? "a week" : "a month";
}

export function slipGross(s: Pick<StaffPaySlip, "basic" | "allowances">): number {
  return (s.basic ?? 0) + s.allowances.reduce((sum, a) => sum + a.amount, 0);
}

export type SlipState = "needs_days" | "to_pay" | "sending" | "paid" | "nothing_to_pay" | "cancelled";

export const SLIP_STATE_LABELS: Record<SlipState, string> = {
  needs_days: "Enter days",
  to_pay: "To pay",
  sending: "Being sent",
  paid: "Paid",
  nothing_to_pay: "Advance took it all",
  cancelled: "Cancelled",
};

export function slipState(s: Pick<StaffPaySlip, "net" | "expense">): SlipState {
  if (s.net === null) return "needs_days";
  if (s.net === 0 || !s.expense) return "nothing_to_pay";
  if (s.expense.voidedAt) return "cancelled";
  if (s.expense.payoutSending) return "sending";
  return expenseBalance(s.expense) > 0 ? "to_pay" : "paid";
}

/** Still to do for the boss: days to enter or money to pay. */
export const slipOpen = (s: StaffPaySlip) => ["needs_days", "to_pay", "sending"].includes(slipState(s));

export type AdvanceState = "paid" | "sending" | "not_sent" | "cancelled";

export function advanceState(a: StaffAdvance): AdvanceState {
  if (!a.expense || a.expense.voidedAt) return "cancelled";
  if (a.expense.payoutSending) return "sending";
  return expenseBalance(a.expense) > 0 ? "not_sent" : "paid";
}
