// The books' arithmetic: balances, a period's totals, nudges. Pure.

import { AMING_CARD, SYSTEM, UNASSIGNED, type AccountKey, type BookAccount, type BookLine } from "./model";

/** Ready-made categories for money out; anything else can be typed. */
export const OUT_CATEGORIES = ["Transport", "Rent", "Salaries", "Airtime & data", "Printing", "Equipment", "Fuel", "Food", "Utilities", "Marketing", "Repairs", "Other"] as const;
/** And for money in. */
export const IN_CATEGORIES = ["Sales", "Deposit", "Loan", "Owner's money", "Other"] as const;

/** The category a salary is recorded under, with the person. */
export const SALARIES = "Salaries";

/** How a line changes an account: + into it, − out of it, 0 untouched. */
export function effectOn(line: BookLine, account: AccountKey): number {
  if (line.direction === "move") return line.toAccount === account ? line.amount : line.account === account ? -line.amount : 0;
  if (line.account !== account) return 0;
  return line.direction === "in" ? line.amount : -line.amount;
}

/**
 * Each of the business's accounts' balance: its opening balance plus every
 * line from its opening day. The system's own accounts are what the system
 * holds (the real balances), never worked out.
 */
export function balances(accounts: BookAccount[], lines: BookLine[], held: { system: number | null; amingCard: number | null }): Map<AccountKey, number> {
  const out = new Map<AccountKey, number>();
  for (const a of accounts) {
    out.set(a.id, lines.filter((l) => l.occurredOn >= a.openingOn).reduce((sum, l) => sum + effectOn(l, a.id), a.openingBalance));
  }
  if (held.system !== null) out.set(SYSTEM, held.system);
  if (held.amingCard !== null) out.set(AMING_CARD, held.amingCard);
  const unassigned = lines.reduce((sum, l) => sum + effectOn(l, UNASSIGNED), 0);
  if (unassigned !== 0) out.set(UNASSIGNED, unassigned);
  return out;
}

export interface PeriodTotals {
  moneyIn: number;
  moneyOut: number;
  profit: number;
  /** Money out by category, largest first. */
  outByCategory: { category: string; amount: number }[];
  inByCategory: { category: string; amount: number }[];
}

const byCategory = (lines: BookLine[]) =>
  [...lines.reduce((m, l) => m.set(l.category ?? "Other", (m.get(l.category ?? "Other") ?? 0) + l.amount), new Map<string, number>())]
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);

/** Money in, money out and profit for the days from `from` to `to` (inclusive); moves count as neither. */
export function totals(lines: BookLine[], from: string, to: string): PeriodTotals {
  const inPeriod = lines.filter((l) => l.occurredOn >= from && l.occurredOn <= to);
  const ins = inPeriod.filter((l) => l.direction === "in");
  const outs = inPeriod.filter((l) => l.direction === "out");
  const moneyIn = ins.reduce((s, l) => s + l.amount, 0);
  const moneyOut = outs.reduce((s, l) => s + l.amount, 0);
  return { moneyIn, moneyOut, profit: moneyIn - moneyOut, outByCategory: byCategory(outs), inByCategory: byCategory(ins) };
}

/**
 * Plain notes on a period against the one before: a category of spending
 * that grew by a quarter or more (and at least 10,000), and profit's turn.
 */
export function notes(now: PeriodTotals, before: PeriodTotals): string[] {
  const out: string[] = [];
  for (const c of now.outByCategory) {
    const was = before.outByCategory.find((b) => b.category === c.category)?.amount ?? 0;
    if (was > 0 && c.amount - was >= 10_000 && c.amount >= was * 1.25) out.push(`${c.category} cost ${Math.round((c.amount / was - 1) * 100)}% more than the period before.`);
  }
  if (before.profit > 0 && now.profit < 0) out.push("Money out is more than money in for this period.");
  return out.slice(0, 3);
}

/** A hand entry that looks like one already recorded: same day, direction, amount and category. */
export function looksDuplicate(lines: BookLine[], entry: { id: string | null; direction: string; amount: number; occurredOn: string; category: string | null }): boolean {
  return lines.some(
    (l) =>
      l.source === "manual" &&
      l.sourceId !== entry.id &&
      l.direction === entry.direction &&
      l.amount === entry.amount &&
      l.occurredOn === entry.occurredOn &&
      (l.category ?? "").toLowerCase() === (entry.category ?? "").toLowerCase(),
  );
}

/** What each person was paid in the lines given (Salaries with them). */
export function paidByEmployee(lines: BookLine[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const l of lines) if (l.direction === "out" && l.employeeId) out.set(l.employeeId, (out.get(l.employeeId) ?? 0) + l.amount);
  return out;
}
