// What a host app must provide for billing. This app's implementations are
// in ./adapters/supabase.
//
// Store methods that take a scope must only ever see that tenant's documents:
// an id from another tenant behaves like one that doesn't exist. The token
// lookups are the only way in without a scope: holding the link is the
// permission, and they return just that one document.

import { AppError } from "@repo/lib/kernel/core";
import type { TenantScope } from "@repo/lib/tenancy/types";

import type { BillTo, InvoiceInput, Issuer, LineInput, Payment, PaymentInput, QuotationInput, QuotationResponse, Shoot } from "./core/model";

/** A quotation as stored: lines as entered, status as answered. */
export interface QuotationRecord {
  id: string;
  number: string;
  customerId: string;
  billTo: BillTo;
  issuedAt: string;
  validUntil: string | null;
  shoot: Shoot | null;
  response: QuotationResponse;
  respondedAt: string | null;
  declineReason: string | null;
  notes: string | null;
  total: number;
  shareToken: string;
}

export interface QuotationStore {
  /** Newest first, without lines. */
  list(scope: TenantScope, filter: { customerId?: string }): Promise<QuotationRecord[]>;
  get(scope: TenantScope, id: string): Promise<(QuotationRecord & { lines: LineInput[] }) | null>;
  byToken(token: string): Promise<{ tenantId: string; quotation: QuotationRecord & { lines: LineInput[] } } | null>;
  /**
   * Creates (id null) or replaces an open quotation with its lines, in one
   * transaction, numbering new ones. `total` is the server's. Throws
   * BillingError when the customer isn't this tenant's or it's been answered.
   */
  save(scope: TenantScope, id: string | null, input: QuotationInput, total: number, token: string): Promise<string>;
  /** Records the customer's answer, only if still unanswered. False when it wasn't. */
  respond(tenantId: string, id: string, answer: "accepted" | "declined", reason: string | null): Promise<boolean>;
  /** Replaces the share token. False when there's no such quotation in this tenant. */
  resetToken(scope: TenantScope, id: string, token: string): Promise<boolean>;
}

/** An invoice as stored: lines as entered, payments as recorded (void ones too). */
export interface InvoiceRecord {
  id: string;
  number: string;
  customerId: string;
  billTo: BillTo;
  issuedAt: string;
  dueDate: string | null;
  shoot: Shoot | null;
  notes: string | null;
  total: number;
  sourceId: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  shareToken: string;
  payments: Payment[];
}

export interface InvoiceStore {
  /** Newest first, with payments and lines (the money reports need the lines' discounts). */
  list(scope: TenantScope, filter: { customerId?: string }): Promise<(InvoiceRecord & { lines: LineInput[] })[]>;
  get(scope: TenantScope, id: string): Promise<(InvoiceRecord & { lines: LineInput[] }) | null>;
  byToken(token: string): Promise<{ tenantId: string; invoice: InvoiceRecord & { lines: LineInput[] } } | null>;
  /** The invoice made from a quotation, if any. */
  idForQuotation(scope: TenantScope, quotationId: string): Promise<string | null>;
  /**
   * Creates (id null) or replaces an invoice with its lines, in one
   * transaction, numbering new ones. `sourceId`: the accepted quotation it's
   * made from. Throws BillingError when the customer isn't this tenant's, the
   * invoice has payments or is void, or the source isn't an accepted quotation.
   */
  save(scope: TenantScope, id: string | null, input: InvoiceInput, total: number, token: string, sourceId: string | null): Promise<string>;
  /** Records a payment and numbers its receipt. Throws BillingError when it's more than the balance or the invoice is void. */
  recordPayment(scope: TenantScope, invoiceId: string, input: PaymentInput, token: string): Promise<string>;
  /** False when there's no such live payment in this tenant. */
  voidPayment(scope: TenantScope, paymentId: string, reason: string): Promise<boolean>;
  /** Throws BillingError when it has payments, is already void, or isn't this tenant's. */
  voidInvoice(scope: TenantScope, id: string, reason: string): Promise<void>;
  resetToken(scope: TenantScope, id: string, token: string): Promise<boolean>;
  /** A receipt by its own link: the payment and its invoice. */
  receiptByToken(token: string): Promise<{ tenantId: string; payment: Payment; invoice: InvoiceRecord } | null>;
}

/** What billing needs to know from outside: customers and the issuing business. */
export interface BillingDirectory {
  /** Null when the tenant has no such customer. */
  customer(scope: TenantScope, id: string): Promise<{ archived: boolean } | null>;
  /** The business behind a tenant, as printed on its documents, with its scope. */
  issuer(tenantId: string): Promise<{ issuer: Issuer; scope: TenantScope } | null>;
}

/** A problem the person should see (the message is safe to show). */
export class BillingError extends AppError {}
