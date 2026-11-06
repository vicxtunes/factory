// Money we owe: lenders, loans and repayments. Pure; safe on client and server.

// --- Money we owe -----------------------------------------------------------

/** owner: the owners' own money; supplier: materials on credit; lender: banks, SACCOs, mobile loans; project: another project's money. */
export type LenderKind = "owner" | "supplier" | "lender" | "project";

export type MoneyChannel = "cash" | "bank_transfer" | "mobile_money" | "other";

/** Where borrowed money went: a channel, or materials (supplier credit, no cash came in). */
export type ReceivedInto = MoneyChannel | "materials";

export interface Lender {
  id: string;
  name: string;
  phone: string | null;
  kind: LenderKind;
}

export type InterestPer = "day" | "month" | "year";

export interface Loan {
  id: string;
  lenderId: string;
  lenderName: string;
  lenderKind: LenderKind;
  amount: number;
  /** The amount plus any interest or extra. With a rate: what's been repaid plus what's owed today. */
  toRepay: number;
  /** Percent per `interestPer`; null when the amount to pay back is fixed. */
  interestRate: number | null;
  interestPer: InterestPer | null;
  /** With a rate: the interest not yet paid, as of today. */
  interestDue: number;
  receivedOn: string;
  receivedInto: ReceivedInto;
  /** Supplier credit: the purchase it came with. */
  purchaseId: string | null;
  dueOn: string | null;
  note: string | null;
  actorName: string;
  repaid: number;
  interestPaid: number;
  voidedAt: string | null;
  voidReason: string | null;
}

export interface Repayment {
  id: string;
  loanId: string;
  amount: number;
  interest: number;
  paidOn: string;
  paidFrom: MoneyChannel;
  reference: string | null;
  note: string | null;
  actorName: string;
  voidedAt: string | null;
  voidReason: string | null;
}

/** A lender with the totals of their live loans, for Money we owe. */
export interface LenderAccount extends Lender {
  borrowed: number;
  toRepay: number;
  repaid: number;
  interestPaid: number;
  owed: number;
  overdue: number;
  /** Their next due date among loans not yet paid back. */
  nextDue: string | null;
}

export interface LenderDetail {
  lender: LenderAccount;
  loans: (Loan & { repayments: Repayment[] })[];
}
