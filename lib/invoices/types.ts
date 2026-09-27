// Invoice view models — what the browser receives. Pure; safe on client and
// server. Amounts are whole shillings.

import type { OrderPaymentRecord, PaymentMethod } from "@/lib/wallet/types";

export type { OrderPaymentRecord, PaymentMethod };

/** Worked out from the order's price and the payments on it; never stored. */
export type InvoiceStatus = "unpaid" | "partially_paid" | "paid" | "cancelled";

export interface InvoiceLine {
  description: string;
  /** Size, cover, finish… */
  detail: string | null;
  qty: number;
  /** Only when the total is exactly catalog price × quantity; a quoted total isn't split per line. */
  unitPrice: number | null;
  lineTotal: number | null;
  /** Where this item is, in the client's words ("Production", "Ready for delivery"…). */
  progress: string;
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
  lines: InvoiceLine[];
  /** Oldest first. */
  payments: OrderPaymentRecord[];
}

/** The staff version adds the share link and the client's wallet balance. */
export interface StaffInvoiceView extends InvoiceView {
  shareUrl: string;
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
