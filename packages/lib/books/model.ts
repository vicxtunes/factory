// The business's own books: money in that isn't from a client. Pure.

export type OtherMoneyKind = "owner" | "other_income" | "other";
/** Money borrowed shows here too; it's recorded on Money we owe. */
export type OtherMoneyLineKind = OtherMoneyKind | "loan";

export const OTHER_MONEY_LABELS: Record<OtherMoneyLineKind, string> = {
  owner: "Owners' money",
  other_income: "Other income",
  other: "Other",
  loan: "Money borrowed",
};

export interface OtherMoneyLine {
  id: string;
  kind: OtherMoneyLineKind;
  amount: number;
  senderName: string;
  senderPhone: string | null;
  method: string;
  reference: string | null;
  receivedOn: string;
  accountName: string | null;
  note: string | null;
  recordedBy: string;
}

// --- The day book ------------------------------------------------------------

export const DAY_CLOSED_MESSAGE = "That day is closed, so it can't change. Record it on an open day and say what happened in the note.";

/** One account on one day: opening + in − out = expected; a count adds any difference. */
export interface DayAccount {
  id: string;
  name: string;
  kind: "cash" | "bank" | "mobile_money" | "hivepay";
  /** Null when no opening balance covers this day: the first count came later, or hasn't happened. */
  opening: number | null;
  moneyIn: number;
  moneyOut: number;
  expected: number | null;
  counted: number | null;
  difference: number | null;
  closing: number | null;
}

export interface DayClose {
  closedAt: string;
  closedBy: string;
  note: string | null;
}

export type DayLineKind =
  | "sale_receipt"
  | "prepayment"
  | OtherMoneyLineKind
  | "materials"
  | "loan_repayment"
  | "business_withdrawal"
  | "vendor_withdrawal"
  | "wallet_money_back"
  | "expense"
  | "move";

export const DAY_LINE_LABELS: Record<DayLineKind, string> = {
  ...OTHER_MONEY_LABELS,
  sale_receipt: "Client payment",
  prepayment: "Wallet top-up",
  materials: "Materials",
  loan_repayment: "Loan repayment",
  business_withdrawal: "Studio withdrawal",
  vendor_withdrawal: "Vendor withdrawal",
  wallet_money_back: "Money back from a wallet",
  expense: "Expense",
  move: "Moved between accounts",
};

export interface DayLine {
  id: string;
  direction: "in" | "out";
  kind: DayLineKind;
  at: string;
  amount: number;
  /** Null: the method doesn't say which account, and nobody chose one. */
  accountId: string | null;
  method: string;
  /** The client or person it's for. */
  party: string;
  /** Who really sent it, when recorded. */
  senderName: string | null;
  phone: string | null;
  reference: string | null;
  detail: string | null;
  recordedBy: string | null;
  recordedAt: string;
  /** Came after the day was closed: it isn't in the count, and carries into the next day's opening. */
  late: boolean;
}

export interface DayBook {
  day: string;
  today: string;
  accounts: DayAccount[];
  lines: DayLine[];
  close: DayClose | null;
  /** The last day closed: days up to it can't be closed any more. */
  lastClosedDay: string | null;
}

/**
 * Totals of the day's lines, including money in no account. A move between the
 * business's own accounts isn't money in or out: it only changes where it sits.
 */
export function dayTotals(lines: Pick<DayLine, "direction" | "amount" | "accountId" | "kind">[]) {
  let moneyIn = 0;
  let moneyOut = 0;
  let inNoAccount = 0;
  for (const l of lines) {
    if (l.kind === "move") continue;
    if (l.direction === "in") moneyIn += l.amount;
    else moneyOut += l.amount;
    if (l.accountId === null) inNoAccount += l.amount;
  }
  return { moneyIn, moneyOut, net: moneyIn - moneyOut, inNoAccount };
}

/** What one account moved to and from the business's other accounts that day. */
export function accountMoves(lines: Pick<DayLine, "direction" | "amount" | "accountId" | "kind">[], accountId: string) {
  let movedIn = 0;
  let movedOut = 0;
  for (const l of lines) {
    if (l.kind !== "move" || l.accountId !== accountId) continue;
    if (l.direction === "in") movedIn += l.amount;
    else movedOut += l.amount;
  }
  return { movedIn, movedOut };
}
