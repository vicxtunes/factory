// Money we owe: what's left on a loan, what's overdue, and each repayment's
// interest share. Pure; the database works the share out the same way
// (production_record_repayment), this is for showing it before saving.

import type { InterestPer, Lender, LenderAccount, LenderKind, Loan, MoneyChannel, ReceivedInto } from "./model";

export const LENDER_KIND_LABELS: Record<LenderKind, string> = {
  owner: "Owners",
  supplier: "Suppliers",
  lender: "Banks & loans",
  project: "Other projects",
};

/** One lender of a kind, for forms ("an owner", "a supplier"…). */
export const LENDER_KIND_ONE: Record<LenderKind, string> = {
  owner: "Owner",
  supplier: "Supplier",
  lender: "Bank, SACCO or mobile loan",
  project: "Another project",
};

export const CHANNEL_LABELS: Record<MoneyChannel, string> = {
  cash: "Cash",
  bank_transfer: "Bank",
  mobile_money: "Mobile money",
  other: "Other",
};

export const RECEIVED_INTO_LABELS: Record<ReceivedInto, string> = { ...CHANNEL_LABELS, materials: "Materials on credit" };

export const INTEREST_PER_LABELS: Record<InterestPer, string> = { day: "a day", month: "a month", year: "a year" };

/** What's still to pay back on a live loan (0 once void). */
export function loanOwed(loan: Pick<Loan, "toRepay" | "repaid" | "voidedAt">): number {
  return loan.voidedAt ? 0 : Math.max(loan.toRepay - loan.repaid, 0);
}

/** Owed and past its due date (`today` is the business's date, YYYY-MM-DD). */
export function loanOverdue(loan: Pick<Loan, "toRepay" | "repaid" | "voidedAt" | "dueOn">, today: string): number {
  return loan.dueOn && loan.dueOn < today ? loanOwed(loan) : 0;
}

/**
 * The interest share of a repayment of `amount`, given what's already been
 * repaid and the interest already counted: pro rata (amount × extra ÷ to
 * repay), and the last repayment takes whatever's left so the shares add up
 * to exactly the extra. With a rate, a repayment clears the interest so far
 * first. Matches production_record_repayment().
 */
export function interestShare(loan: Pick<Loan, "amount" | "toRepay" | "repaid" | "interestPaid" | "interestRate" | "interestDue">, amount: number): number {
  if (loan.interestRate !== null) return Math.min(amount, loan.interestDue);
  const extra = loan.toRepay - loan.amount;
  if (extra <= 0) return 0;
  const left = extra - loan.interestPaid;
  if (loan.repaid + amount >= loan.toRepay) return left;
  return Math.min(Math.round((amount * extra) / loan.toRepay), left);
}

/** Each lender's totals over their live loans; most owed first, then by name. */
export function lenderAccounts(lenders: Lender[], loans: Loan[], today: string): LenderAccount[] {
  return lenders
    .map((lender) => {
      const live = loans.filter((l) => l.lenderId === lender.id && !l.voidedAt);
      const sum = (f: (l: Loan) => number) => live.reduce((s, l) => s + f(l), 0);
      const due = live.filter((l) => l.dueOn && loanOwed(l) > 0).map((l) => l.dueOn as string).sort();
      return {
        ...lender,
        borrowed: sum((l) => l.amount),
        toRepay: sum((l) => l.toRepay),
        repaid: sum((l) => l.repaid),
        interestPaid: sum((l) => l.interestPaid),
        owed: sum(loanOwed),
        overdue: sum((l) => loanOverdue(l, today)),
        nextDue: due[0] ?? null,
      };
    })
    .sort((a, b) => b.owed - a.owed || a.name.localeCompare(b.name));
}

/** What the business owes in all, and how much of it is overdue. */
export function weOwe(accounts: Pick<LenderAccount, "owed" | "overdue">[]): { owed: number; overdue: number; overdueCount: number } {
  return {
    owed: accounts.reduce((s, a) => s + a.owed, 0),
    overdue: accounts.reduce((s, a) => s + a.overdue, 0),
    overdueCount: accounts.filter((a) => a.overdue > 0).length,
  };
}
