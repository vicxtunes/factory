// What a host app must provide for bookings. This app's implementations are
// in ./adapters/supabase.
//
// Every method takes the tenant's scope and must only ever see that tenant's
// bookings: an id from another tenant behaves like one that doesn't exist.

import { AppError } from "@repo/lib/kernel/core";
import type { TenantScope } from "@repo/lib/tenancy/types";

import type { Booking, BookingInput, BookingStatus } from "./core/model";

export interface BookingStore {
  /** Bookings on days `from`..`to` inclusive, or all of one customer's, or all in one status. */
  list(scope: TenantScope, filter: { from?: string; to?: string; customerId?: string; status?: BookingStatus }): Promise<Booking[]>;
  get(scope: TenantScope, id: string): Promise<Booking | null>;
  /** The booking made from a quotation, if any. */
  idForQuotation(scope: TenantScope, quotationId: string): Promise<string | null>;
  /** The booking an invoice is for, if any. */
  idForInvoice(scope: TenantScope, invoiceId: string): Promise<string | null>;
  /**
   * Tentative, unless `confirmed` with its invoice (booked from one). Throws
   * BookingError when the client, quotation or invoice isn't this tenant's,
   * or either is already booked.
   */
  create(scope: TenantScope, input: BookingInput, confirmed?: { invoiceId: string }): Promise<string>;
  /** A client's online request for a package (status "requested"). Throws BookingError when the client or package isn't this tenant's. */
  createRequest(scope: TenantScope, input: Omit<BookingInput, "quotationId"> & { offeringId: string }): Promise<string>;
  /** Links the invoice made when it was confirmed. False when there's no such booking in this tenant. */
  setInvoice(scope: TenantScope, id: string, invoiceId: string): Promise<boolean>;
  /** Changes the details (never the quotation). False when there's no such booking in this tenant. */
  update(scope: TenantScope, id: string, input: Omit<BookingInput, "quotationId">): Promise<boolean>;
  /** Moves `from` → `to` only if it's still `from`. False otherwise. */
  setStatus(scope: TenantScope, id: string, from: BookingStatus, to: BookingStatus): Promise<boolean>;
}

/** What bookings need to know from outside: customers and quotations. */
export interface BookingDirectory {
  customer(scope: TenantScope, id: string): Promise<{ name: string; archived: boolean } | null>;
  /** An accepted quotation as a booking can start from; null if there's no accepted one with this id. */
  acceptedQuotation(
    scope: TenantScope,
    id: string,
  ): Promise<{ customerId: string; customerName: string; firstLine: string | null; total: number } | null>;
}

/** A problem the person should see (the message is safe to show). */
export class BookingError extends AppError {}
