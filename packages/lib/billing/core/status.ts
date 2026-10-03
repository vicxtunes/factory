// Where a quotation stands, and what can still be done with it. Pure.

import type { QuotationResponse, QuotationStatus } from "./model";

/**
 * "expired" when still open after its valid-until date. `today` is the
 * calendar date in the business's time zone (accounting's localDate()).
 */
export function quotationStatus(q: { status: QuotationResponse; validUntil: string | null }, today: string): QuotationStatus {
  if (q.status === "open" && q.validUntil !== null && q.validUntil < today) return "expired";
  return q.status;
}

/** Only an unanswered quotation can be edited. An expired one can, to give it a new date. */
export function canEditQuotation(status: QuotationStatus): boolean {
  return status === "open" || status === "expired";
}

/** The customer can answer only while it's open and in date. */
export function canRespondToQuotation(status: QuotationStatus): boolean {
  return status === "open";
}
