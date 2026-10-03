// The accounting core's records. Any business (any host app, any tenant)
// maps its own data into these through an AccountingSource (../ports.ts);
// everything in core/ works only on these shapes.
//
// Amounts are whole units of the tenant's currency (TenantScope.currency).
// Instants are ISO 8601 strings; calendar dates are "yyyy-mm-dd".

/** How money arrived. */
export type Channel = "cash" | "bank_transfer" | "mobile_money" | "card" | "other";

export const CHANNELS: Channel[] = ["cash", "bank_transfer", "mobile_money", "card", "other"];

/** A sale: one invoice (for Aming, an invoiced order). Recorded as a sale on its issue date. */
export interface SaleDocument {
  id: string;
  /** The invoice number, e.g. "INV-2026-3956". */
  number: string;
  /** The order it bills, when it bills one (a studio's invoices don't). */
  orderId: string | null;
  orderNo: string | null;
  /** Null for a walk-in sale with no customer account. */
  customerId: string | null;
  customerName: string;
  issuedAt: string;
  dueDate: string | null;
  /** What the customer owes for it, after discount. */
  total: number;
  /** Discount given on it (list price − sold price). */
  discount: number;
  /** Paid so far, net of refunds. */
  paid: number;
  cancelled: boolean;
  /** Product names, for display and search. */
  products: string;
}

/**
 * Money that actually arrived. `sale_receipt` was paid against a sale;
 * `prepayment` is a top-up held for the customer until they spend it — money
 * received, but not a sale.
 */
export interface MoneyIn {
  id: string;
  receivedAt: string;
  customerId: string;
  channel: Channel;
  amount: number;
  kind: "sale_receipt" | "prepayment";
  orderNo: string | null;
  reference: string | null;
}

/**
 * Movements of money already held for a customer: spending it on a sale,
 * a refund back into it, or a manual correction. Not money received.
 */
export interface HeldMovement {
  id: string;
  at: string;
  customerId: string;
  kind: "spent" | "refund" | "adjustment";
  /** Signed: + adds to what's held, − takes from it. */
  amount: number;
  orderNo: string | null;
  note: string | null;
}

export interface Customer {
  id: string;
  name: string;
  phone: string | null;
  active: boolean;
  /** Orders placed, excluding cancelled ones (invoiced or not). */
  orderCount: number;
  /** Money held for them (prepaid balance). */
  held: number;
}

export type DocumentStatus = "unpaid" | "partially_paid" | "paid" | "cancelled";
