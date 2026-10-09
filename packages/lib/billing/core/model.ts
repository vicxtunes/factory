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

/**
 * The shoot or event a document is for, in the business's calendar: its day
 * ("yyyy-mm-dd") and clock times ("HH:MM"; both null = all day). It's what
 * books it (packages/lib/bookings).
 */
export interface Shoot {
  date: string;
  startTime: string | null;
  endTime: string | null;
}

export interface QuotationInput {
  customerId: string;
  /** Last day it can be accepted; null = no limit. */
  validUntil: string | null;
  /** When the shoot is, if known: booked (tentative) when the customer accepts. */
  shoot: Shoot | null;
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
  shoot: Shoot | null;
  notes: string | null;
  respondedAt: string | null;
  declineReason: string | null;
  shareToken: string;
  lines: Line[];
}

/** How the business's documents close: its Document settings. */
export interface DocumentSettings {
  /** One term per line, printed as bullets under "Terms & conditions". */
  terms: string | null;
  /** How to pay (mobile money, bank details…): printed on invoices. */
  paymentInstructions: string | null;
  /** Printed as "For, <name>" above the signature line; null: no signature block. */
  signatureName: string | null;
  /** The signature as a PNG data URL, printed on the line; null: left blank to sign by hand. */
  signature: string | null;
}

export const NO_DOCUMENT_SETTINGS: DocumentSettings = { terms: null, paymentInstructions: null, signatureName: null, signature: null };

/** The business's own details and look, printed on its documents. */
export interface Issuer extends DocumentSettings {
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  /** Its logo as a data URL (the documents are drawn in the browser), or null. */
  logo: string | null;
  /** Its brand color (hex): the documents' accents. */
  color: string;
}

export const QUOTATION_STATUS_LABELS: Record<QuotationStatus, string> = {
  open: "Open",
  accepted: "Accepted",
  declined: "Declined",
  expired: "Expired",
};

// ── Invoices, payments, receipts ──────────────────────────────────────────

export interface InvoiceInput {
  customerId: string;
  /** Unpaid after this day = overdue; null = no due date. */
  dueDate: string | null;
  /** When the shoot is, if any: saving the invoice books it (confirmed). */
  shoot: Shoot | null;
  notes: string | null;
  lines: LineInput[];
}

/** As shown. Void wins; then paid; then overdue (past due with something left); then partly or not paid. */
export type InvoiceStatus = "unpaid" | "partially_paid" | "paid" | "overdue" | "void";

export type PaymentMethod = "cash" | "mobile_money" | "bank_transfer" | "card" | "other";

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Cash",
  mobile_money: "Mobile money",
  bank_transfer: "Bank transfer",
  card: "Card",
  other: "Other",
};

export interface PaymentInput {
  amount: number;
  method: PaymentMethod;
  /** The day the money arrived. */
  receivedOn: string;
  reference: string | null;
  note: string | null;
}

export interface Payment extends PaymentInput {
  id: string;
  receiptNo: string;
  shareToken: string;
  /** Voided payments stay in the history but don't count. */
  voidedAt: string | null;
  voidReason: string | null;
  createdAt: string;
}

/** An invoice in lists. */
export interface InvoiceSummary {
  id: string;
  number: string;
  customerId: string;
  billTo: BillTo;
  issuedAt: string;
  dueDate: string | null;
  status: InvoiceStatus;
  total: number;
  /** Σ payments that aren't void. */
  paid: number;
  /** What's left (0 for a void invoice). */
  balance: number;
}

/** A whole invoice, for its page and its public link. */
export interface Invoice extends InvoiceSummary, Totals {
  shoot: Shoot | null;
  notes: string | null;
  /** The accepted quotation it was made from. */
  sourceId: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  shareToken: string;
  lines: Line[];
  /** Newest first, void ones included. */
  payments: Payment[];
}

/** A receipt, as its link shows it. */
export interface Receipt {
  payment: Payment;
  invoice: InvoiceSummary;
}

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  unpaid: "Unpaid",
  partially_paid: "Partially paid",
  paid: "Paid",
  overdue: "Overdue",
  void: "Void",
};
