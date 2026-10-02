// Invoice rules, in one place. Pure; safe on client and server.

import type { InvoiceLine, InvoiceStatus } from "./types";

export const STATUS_LABELS: Record<InvoiceStatus, string> = {
  unpaid: "Unpaid",
  partially_paid: "Partially paid",
  paid: "Paid",
  cancelled: "Cancelled",
};

export const MAX_NOTES_LENGTH = 1000;

/** The invoice number for an order: "INV-" + the order number, so the two match at a glance. */
export function invoiceNumber(orderNo: string): string {
  return `INV-${orderNo}`;
}

/**
 * An invoice's status, from its total, what's been paid, and whether the
 * order was cancelled. The only place status is decided — it's never stored,
 * so it can't disagree with the payments.
 */
export function invoiceStatus(amount: number, paid: number, cancelled: boolean): InvoiceStatus {
  if (cancelled) return "cancelled";
  if (paid <= 0) return "unpaid";
  if (paid >= amount) return "paid";
  return "partially_paid";
}

/** Discount given on an invoice's lines: Σ (list − agreed price) × qty over discounted lines. */
export function invoiceDiscount(lines: Pick<InvoiceLine, "listUnitPrice" | "unitPrice" | "qty">[]): number {
  return lines.reduce(
    (sum, l) => sum + (l.listUnitPrice != null && l.unitPrice != null ? (l.listUnitPrice - l.unitPrice) * l.qty : 0),
    0,
  );
}

/** What's still owed; never negative. */
export function invoiceBalance(amount: number, paid: number): number {
  return Math.max(amount - paid, 0);
}

/**
 * Whether a share token is the right shape before looking it up — cheap
 * rejection of junk URLs. Tokens are 43-character base64url strings (32
 * random bytes).
 */
export function isWellFormedToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{32,64}$/.test(token);
}
