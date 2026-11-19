// A business's books (packages/lib/business-books/README.md). Pure types.

export type AccountKind = "cash" | "mobile_money" | "bank";

/** Where the business keeps money. */
export interface BookAccount {
  id: string;
  name: string;
  kind: AccountKind;
  openingBalance: number;
  openingOn: string;
}

/**
 * An account by key: one of the business's own (its id), "system" (System
 * payments: the business card), "aming_card" (the owner's Aming card) or
 * "unassigned" (money the system knows of, before the business has an
 * account of that kind).
 */
export type AccountKey = string;
export const SYSTEM = "system";
export const AMING_CARD = "aming_card";
export const UNASSIGNED = "unassigned";

export type Direction = "in" | "out" | "move";

/** Where a line was recorded: by hand, or by the part of the system that knows it. */
export type LineSource = "manual" | "invoice_payment" | `system_${string}` | `aming_card_${string}`;

/** One line of the books, from wherever it was recorded. */
export interface BookLine {
  source: LineSource;
  /** The entry's id for a manual line (what's edited); the record's otherwise. */
  sourceId: string;
  occurredOn: string;
  createdAt: string;
  direction: Direction;
  amount: number;
  account: AccountKey;
  toAccount: AccountKey | null;
  category: string | null;
  description: string | null;
  projectId: string | null;
  employeeId: string | null;
  actorName: string | null;
}

export type PayKind = "monthly" | "daily" | "none";

export interface Employee {
  id: string;
  name: string;
  phone: string | null;
  role: string | null;
  payKind: PayKind;
  payRate: number | null;
  startedOn: string | null;
  leftOn: string | null;
}

/** A change to a hand-recorded entry, for its history. */
export interface BookChange {
  action: "created" | "edited" | "deleted";
  actorName: string;
  at: string;
}
