// The billing module's records. Pure; safe on client and server.
//
// A business's documents to its customers. Today: quotations, which the
// customer accepts or declines through a link. Invoices, payments and
// receipts come next (Phase 4b). Amounts are whole units of the tenant's
// currency; calendar dates are "yyyy-mm-dd" in the tenant's time zone.

import type { LineDiscount } from "@repo/lib/discounts/core";

/** One line as the business fills it in: copied from a package or service, or typed. */
export interface LineInput {
  /** The package or service it was copied from, for reference only. */
  offeringId: string | null;
  description: string;
  inclusions: string[];
  quantity: number;
  /** Before discount. */
  unitPrice: number;
  discount: LineDiscount | null;
}

export interface QuotationInput {
  customerId: string;
  /** Last day it can be accepted; null = no limit. */
  validUntil: string | null;
  notes: string | null;
  lines: LineInput[];
}

/** What the customer answered (or "open": not yet). */
export type QuotationResponse = "open" | "accepted" | "declined";

/** As shown: an open quotation past its valid-until date is "expired". */
export type QuotationStatus = QuotationResponse | "expired";

export interface Line extends LineInput {
  /** After discount, each. */
  netUnitPrice: number;
  /** netUnitPrice × quantity. */
  total: number;
}

export interface BillTo {
  name: string;
  phone: string | null;
  email: string | null;
}

/** A quotation in lists. */
export interface QuotationSummary {
  id: string;
  number: string;
  customerId: string;
  billTo: BillTo;
  issuedAt: string;
  validUntil: string | null;
  status: QuotationStatus;
  total: number;
}

export interface Totals {
  /** Σ list price × quantity. */
  subtotal: number;
  /** Σ what the line discounts took off. */
  discount: number;
  total: number;
}

/** A whole quotation, for its page and its public link. */
export interface Quotation extends QuotationSummary, Totals {
  notes: string | null;
  respondedAt: string | null;
  declineReason: string | null;
  shareToken: string;
  lines: Line[];
}

/** The business's own details, printed on its documents. */
export interface Issuer {
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
}

export const QUOTATION_STATUS_LABELS: Record<QuotationStatus, string> = {
  open: "Open",
  accepted: "Accepted",
  declined: "Declined",
  expired: "Expired",
};
