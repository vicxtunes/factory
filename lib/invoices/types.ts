// Invoice view models — what the browser receives. Pure; safe on client and
// server. Amounts are whole shillings.

import type { OrderPaymentRecord, PaymentMethod } from "@/lib/wallet/types";

export type { OrderPaymentRecord, PaymentMethod };

/** Worked out from the order's price and the payments on it; never stored. */
export type InvoiceStatus = "unpaid" | "partially_paid" | "paid" | "cancelled";

export interface InvoiceLine {
  itemId: string;
  /** Product name, e.g. "A4 Normal board". */
  title: string;
  /** Variant and options, e.g. "Extra ordinary finishing · 12 by 12". */
  detail: string | null;
  /** The product's catalog description, e.g. "We charge per sheet…". */
  description: string | null;
  qty: number;
  /** "Pc", "Sheet", "Service"… */
  unit: string | null;
  /** The agreed price per unit; null until the invoice lines are priced. */
  unitPrice: number | null;
  lineTotal: number | null;
  /** Where this item is, in the client's words ("Production", "Ready for delivery"…). */
  progress: string;
}

/** Who the invoice is from — the boss edits these (Payments → Invoices → Invoice settings). */
export interface InvoiceIssuer {
  companyName: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  /** One term per entry, printed as bullets. */
  terms: string[];
  /** "For, <signatureCompany>" above the signature line. */
  signatureCompany: string | null;
}

/** The settings form's fields (terms as one line per term). */
export interface InvoiceSettingsInput {
  companyName: string;
  address: string;
  phone: string;
  email: string;
  terms: string;
  signatureCompany: string;
}

export interface InvoiceView {
  id: string;
  invoiceNo: string;
  issuedAt: string;
  dueDate: string | null;
  notes: string | null;
  status: InvoiceStatus;
  amount: number;
  paid: number;
  /** amount − paid, never below 0. */
  balance: number;
  order: {
    id: string;
    orderNo: string;
    placedAt: string;
    deliveryDate: string | null;
    cancelled: boolean;
    cancelReason: string | null;
  };
  client: { name: string; phone: string | null; email: string | null };
  issuer: InvoiceIssuer;
  lines: InvoiceLine[];
  /** Oldest first. */
  payments: OrderPaymentRecord[];
}

/** One line in the staff's price editor (generate / edit lines). */
export interface DraftLine {
  itemId: string;
  title: string;
  detail: string | null;
  qty: number;
  unit: string | null;
  /** The price already agreed for this line, else the catalog's, else null (staff must fill it in). */
  unitPrice: number | null;
}

/** The staff version adds the share link and the client's wallet balance. */
export interface StaffInvoiceView extends InvoiceView {
  shareUrl: string;
  /** The lines as the price editor needs them. */
  draftLines: DraftLine[];
  /** False when an item was added or re-quantified after invoicing: the lines no longer sum to the total. */
  linesMatchTotal: boolean;
  /** Null when the order has no client account. */
  walletBalance: number | null;
  createdByName: string;
}

export interface InvoiceListRow {
  id: string;
  invoiceNo: string;
  orderId: string;
  orderNo: string;
  clientName: string;
  issuedAt: string;
  dueDate: string | null;
  status: InvoiceStatus;
  amount: number;
  paid: number;
  balance: number;
}

/** What every invoice server action returns. `error` is always safe to show. */
export type InvoiceResult<T = undefined> = T extends undefined
  ? { ok: true } | { ok: false; error: string }
  : { ok: true; data: T } | { ok: false; error: string };
