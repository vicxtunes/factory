// Where a quotation stands, and what can still be done with it. Pure.

import type { InvoiceStatus, QuotationResponse, QuotationStatus } from "./model";

/**
 * "expired" when still open after its valid-until date. `today` is the
 * calendar date in the business's time zone (accounting's localDate()).
 */
export function quotationStatus(q: { status: QuotationResponse; validUntil: string | null }, today: string): QuotationStatus {
  if (q.status === "open" && q.validUntil !== null && q.validUntil < today) return "expired";
  return q.status;
}

/** The customer can answer only while it's open and in date. */
export function canRespondToQuotation(status: QuotationStatus): boolean {
  return status === "open";
}

/** What's been paid (payments that aren't void) and what's left. A void invoice owes nothing. */
export function invoiceBalance(inv: { total: number; voided: boolean }, payments: { amount: number; voidedAt: string | null }[]) {
  const paid = payments.filter((p) => !p.voidedAt).reduce((sum, p) => sum + p.amount, 0);
  return { paid, balance: inv.voided ? 0 : Math.max(inv.total - paid, 0) };
}

/** `today` is the calendar date in the business's time zone. */
export function invoiceStatus(inv: { voided: boolean; dueDate: string | null; total: number; paid: number }, today: string): InvoiceStatus {
  if (inv.voided) return "void";
  if (inv.paid >= inv.total) return "paid";
  if (inv.dueDate !== null && inv.dueDate < today) return "overdue";
  return inv.paid > 0 ? "partially_paid" : "unpaid";
}

/** Anything can change until it's voided, payments or not (studios correct anything). */
export function canEditInvoice(inv: { voided: boolean; paid: number }): boolean {
  return !inv.voided;
}

export function canVoidInvoice(inv: { voided: boolean; paid: number }): boolean {
  return !inv.voided && inv.paid === 0;
}

export function canRecordPayment(inv: { voided: boolean; balance: number }): boolean {
  return !inv.voided && inv.balance > 0;
}
