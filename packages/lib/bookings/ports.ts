// What a host app must provide for bookings. This app's implementations are
// in ./adapters/supabase.
//
// Every method takes the tenant's scope and must only ever see that tenant's
// bookings: an id from another tenant behaves like one that doesn't exist.

import { AppError } from "@repo/lib/kernel/core";
import type { TenantScope } from "@repo/lib/tenancy/types";

import type { Booking, BookingInput, BookingStatus } from "./core/model";

export interface BookingStore {
  /** Bookings on days `from`..`to` inclusive, or all of one customer's. */
  list(scope: TenantScope, filter: { from?: string; to?: string; customerId?: string }): Promise<Booking[]>;
  get(scope: TenantScope, id: string): Promise<Booking | null>;
  /** The booking made from a quotation, if any. */
  idForQuotation(scope: TenantScope, quotationId: string): Promise<string | null>;
  /** Throws BookingError when the client or quotation isn't this tenant's, or the quotation is already booked. */
  create(scope: TenantScope, input: BookingInput): Promise<string>;
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
