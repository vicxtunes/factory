// Staff pay (owner, 2026-11-15): salaries, allowances and advances for
// everyone Aming pays. What they are and what state they're in. Pure.

import { WEEKDAYS, expenseBalance, weekdayOf, type ExpenseLine } from "./expenses";

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
  /** Allowances (with every pay, or on days) and regular advances, still running. */
  regulars: StaffPayRegular[];
  /** One-offs waiting for the next payslip. */
  extras: (PayLine & { id: string })[];
  /** Advances given that payslips haven't taken yet. */
  advanceOwed: number;
  stopped: boolean;
}

export type RegularKind = "allowance" | "advance";
/** On the payslip, or given on its day: sent by itself or paid by hand. */
export type RegularHow = "payslip" | "send" | "hand";

/** An allowance or an advance that repeats (owner, 2026-11-17). */
export interface StaffPayRegular {
  id: string;
  kind: RegularKind;
  name: string;
  amount: number;
  /** The weekdays it falls on (0 Sunday); null: with every pay. */
  weekdays: number[] | null;
  how: RegularHow;
  startsOn: string;
}

/** An allowance or advance given on its day: its expense. */
export interface StaffPayGiven {
  id: string;
  personId: string;
  kind: RegularKind;
  name: string;
  dueOn: string;
  amount: number;
  expense: ExpenseLine | null;
}

/** Staff cost of one person in one month ("2026-11"). */
export interface StaffPayMonth {
  month: string;
  personId: string;
  basic: number;
  allowances: number;
  advances: number;
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
  /** An allowance on days carries its days and amount each. */
  allowances: (PayLine & { once: boolean; days?: number; each?: number })[];
  advance: number;
  net: number | null;
  /** What they get, as an expense; null until worked out, or when an advance took it all. */
  expense: ExpenseLine | null;
  movedFromBill: boolean;
  /** Who set the advance taken off by hand; until then advances owed come off by themselves. */
  advanceByName: string | null;
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

export const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];

/** "with every pay", "every day", "every Friday", "Mon, Wed, Fri". */
export function whenLabel(weekdays: number[] | null): string {
  if (!weekdays) return "with every pay";
  if (weekdays.length === 7) return "every day";
  if (weekdays.length === 1) return `every ${WEEKDAYS[weekdays[0]]}`;
  return [...weekdays].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((d) => WEEKDAYS[d].slice(0, 3)).join(", ");
}

export const HOW_LABELS: Record<RegularHow, string> = {
  payslip: "added to the payslip",
  send: "sent by itself",
  hand: "paid by hand",
};

export type GivenState = AdvanceState;

export function givenState(g: StaffPayGiven): GivenState {
  if (!g.expense || g.expense.voidedAt) return "cancelled";
  if (g.expense.payoutSending) return "sending";
  return expenseBalance(g.expense) > 0 ? "not_sent" : "paid";
}

const DAY_MS = 86_400_000;
const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10);
const dayNumber = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

/** Pay days of a person from `from` to `to`, both included. */
export function payDaysBetween(p: Pick<StaffPayPerson, "payEvery" | "payDay" | "nextPayOn">, from: string, to: string): string[] {
  const out: string[] = [];
  for (let t = dayNumber(p.nextPayOn > from ? p.nextPayOn : from); t <= dayNumber(to); t += DAY_MS) {
    const iso = isoDay(t);
    const d = new Date(t);
    const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    if (p.payEvery === "week" ? d.getUTCDay() === p.payDay : d.getUTCDate() === Math.min(p.payDay, last)) out.push(iso);
  }
  return out;
}

export interface WeekNeed {
  /** The week's first day. */
  from: string;
  to: string;
  pay: number;
  allowances: number;
  advances: number;
}

/**
 * What staff pay will need in each of the next `weeks` weeks from today:
 * payslips on their pay days (a day rate at the days of their last payslip,
 * allowances on the payslip at their days), and allowances and advances given
 * on their days. Advances taken off a payslip aren't subtracted: this is the
 * money that leaves, the advances leave earlier. Payslips already made (they
 * are made before the pay day) count at what's left to pay on them.
 */
export function weeksAhead(people: StaffPayPerson[], lastDays: Map<string, number>, today: string, slips: StaffPaySlip[], weeks = 4): WeekNeed[] {
  const out: WeekNeed[] = [];
  for (let w = 0; w < weeks; w++) {
    const from = isoDay(dayNumber(today) + w * 7 * DAY_MS);
    out.push({ from, to: isoDay(dayNumber(from) + 6 * DAY_MS), pay: 0, allowances: 0, advances: 0 });
  }
  const end = out[out.length - 1].to;
  const weekOf = (iso: string) => out[Math.floor((dayNumber(iso) - dayNumber(today)) / (7 * DAY_MS))];
  for (const s of slips) {
    if (s.payOn < today || s.payOn > end || !slipOpen(s) || !s.expense) continue;
    weekOf(s.payOn).pay += expenseBalance(s.expense);
  }
  for (const p of people) {
    if (p.stopped) continue;
    const days = (from: string, to: string, wd: number[], startsOn: string) => {
      let n = 0;
      for (let t = Math.max(dayNumber(from), dayNumber(startsOn)); t <= dayNumber(to); t += DAY_MS) if (wd.includes(new Date(t).getUTCDay())) n++;
      return n;
    };
    let previous: string | null = null;
    for (const on of payDaysBetween(p, today, end)) {
      const periodFrom = previous ? isoDay(dayNumber(previous) + DAY_MS) : isoDay(dayNumber(on) - (p.payEvery === "week" ? 6 : 30) * DAY_MS);
      previous = on;
      const basic = p.dayRate ? p.rate * (lastDays.get(p.id) ?? 0) : p.rate;
      const extras = p.regulars
        .filter((r) => r.how === "payslip")
        .reduce((sum, r) => sum + (r.weekdays ? r.amount * days(periodFrom, on, r.weekdays, r.startsOn) : r.amount), 0);
      weekOf(on).pay += basic + extras + (on === p.nextPayOn ? p.extras.reduce((sum, x) => sum + x.amount, 0) : 0);
    }
    for (const r of p.regulars) {
      if (r.how === "payslip" || !r.weekdays) continue;
      for (let t = dayNumber(today); t <= dayNumber(end); t += DAY_MS) {
        const iso = isoDay(t);
        if (iso < r.startsOn || !r.weekdays.includes(weekdayOf(iso))) continue;
        weekOf(iso)[r.kind === "advance" ? "advances" : "allowances"] += r.amount;
      }
    }
  }
  return out;
}

/** About what one person costs a month at today's settings (a day rate at `days` a month). */
export function monthlyCost(p: StaffPayPerson, days: number): number {
  const PER_MONTH = 52 / 12;
  const pays = p.payEvery === "week" ? PER_MONTH : 1;
  const basic = p.dayRate ? p.rate * days : p.rate * pays;
  return Math.round(
    basic +
      p.regulars
        .filter((r) => r.kind === "allowance")
        .reduce((sum, r) => sum + (r.weekdays ? r.amount * r.weekdays.length * PER_MONTH : r.amount * pays), 0),
  );
}
