// What a host app must provide for billing. This app's implementations are
// in ./adapters/supabase.
//
// Store methods that take a scope must only ever see that tenant's documents:
// an id from another tenant behaves like one that doesn't exist. The token
// lookups are the only way in without a scope: holding the link is the
// permission, and they return just that one document.

import { AppError } from "@repo/lib/kernel/core";
import type { TenantScope } from "@repo/lib/tenancy/types";

import type { BillTo, Issuer, LineInput, QuotationInput, QuotationResponse } from "./core/model";

/** A quotation as stored: lines as entered, status as answered. */
export interface QuotationRecord {
  id: string;
  number: string;
  customerId: string;
  billTo: BillTo;
  issuedAt: string;
  validUntil: string | null;
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

/** What billing needs to know from outside: customers and the issuing business. */
export interface BillingDirectory {
  /** Null when the tenant has no such customer. */
  customer(scope: TenantScope, id: string): Promise<{ archived: boolean } | null>;
  /** The business behind a tenant, as printed on its documents, with its scope. */
  issuer(tenantId: string): Promise<{ issuer: Issuer; scope: TenantScope } | null>;
}

/** A problem the person should see (the message is safe to show). */
export class BillingError extends AppError {}
