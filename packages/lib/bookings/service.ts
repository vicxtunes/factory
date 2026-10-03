// Booking use cases over a BookingStore and a BookingDirectory. No database or
// framework code, so it runs on any store (./service.test.ts). Callers find
// the tenant from the session and parse the input first.

import type { TenantScope } from "@repo/lib/tenancy/types";

import {
  byTime,
  canEditBooking,
  canMoveBooking,
  clashes,
  BOOKING_STATUS_LABELS,
  type Booking,
  type BookingDraft,
  type BookingInput,
  type BookingStatus,
  type BookingView,
} from "./core";
import { BookingError, type BookingDirectory, type BookingStore } from "./ports";

const GONE = "That booking no longer exists.";

export class BookingService {
  constructor(
    private readonly store: BookingStore,
    private readonly directory: BookingDirectory,
  ) {}

  /** Bookings on days `from`..`to`, earliest first. */
  async between(scope: TenantScope, from: string, to: string): Promise<Booking[]> {
    return (await this.store.list(scope, { from, to })).sort(byTime);
  }

  /** The next bookings from `today` that are still going ahead. */
  async upcoming(scope: TenantScope, today: string, limit = 5): Promise<Booking[]> {
    const ahead = await this.store.list(scope, { from: today });
    return ahead.filter((b) => b.status === "tentative" || b.status === "confirmed").sort(byTime).slice(0, limit);
  }

  /** One customer's bookings, newest day first. */
  async forCustomer(scope: TenantScope, customerId: string): Promise<Booking[]> {
    return (await this.store.list(scope, { customerId })).sort((a, b) => byTime(b, a));
  }

  /** A booking and the bookings it clashes with that day. */
  async get(scope: TenantScope, id: string): Promise<BookingView | null> {
    const booking = await this.store.get(scope, id);
    if (!booking) return null;
    const sameDay = await this.store.list(scope, { from: booking.date, to: booking.date });
    return { booking, clashes: sameDay.filter((b) => clashes(booking, b)).sort(byTime) };
  }

  async idForQuotation(scope: TenantScope, quotationId: string): Promise<string | null> {
    return this.store.idForQuotation(scope, quotationId);
  }

  /** A booking form pre-filled from an accepted quotation: client, package, amount. */
  async draftFromQuotation(scope: TenantScope, quotationId: string): Promise<BookingDraft | null> {
    const q = await this.directory.acceptedQuotation(scope, quotationId);
    if (!q) return null;
    return {
      customerId: q.customerId,
      title: q.firstLine ? `${q.customerName}: ${q.firstLine}` : q.customerName,
      packageName: q.firstLine,
      amount: q.total,
      quotationId,
    };
  }

  /** Books it. Clashes don't block: the booking's page shows them. */
  async create(scope: TenantScope, input: BookingInput): Promise<string> {
    const customer = await this.directory.customer(scope, input.customerId);
    if (!customer) throw new BookingError("That client no longer exists.");
    if (customer.archived) throw new BookingError("That client is archived. Restore them first.");
    if (input.quotationId) {
      const q = await this.directory.acceptedQuotation(scope, input.quotationId);
      if (!q) throw new BookingError("Only an accepted quotation can be booked.");
      if (q.customerId !== input.customerId) throw new BookingError("The booking's client must be the quotation's client.");
      if (await this.store.idForQuotation(scope, input.quotationId)) throw new BookingError("This quotation is already booked.");
    }
    return this.store.create(scope, input);
  }

  /** Changes the details while it's tentative or confirmed. */
  async update(scope: TenantScope, id: string, input: Omit<BookingInput, "quotationId">): Promise<void> {
    const current = await this.store.get(scope, id);
    if (!current) throw new BookingError(GONE);
    if (!canEditBooking(current.status)) throw new BookingError(`This booking is ${BOOKING_STATUS_LABELS[current.status].toLowerCase()}, so it can't be changed.`);
    if (input.customerId !== current.customerId) {
      if (current.quotationId) throw new BookingError("This booking came from a quotation, so its client can't change.");
      const customer = await this.directory.customer(scope, input.customerId);
      if (!customer || customer.archived) throw new BookingError("Choose an active client.");
    }
    if (!(await this.store.update(scope, id, input))) throw new BookingError(GONE);
  }

  /** Confirm, complete, cancel or reopen. */
  async setStatus(scope: TenantScope, id: string, to: BookingStatus): Promise<void> {
    const current = await this.store.get(scope, id);
    if (!current) throw new BookingError(GONE);
    if (!canMoveBooking(current.status, to)) {
      throw new BookingError(`A ${BOOKING_STATUS_LABELS[current.status].toLowerCase()} booking can't become ${BOOKING_STATUS_LABELS[to].toLowerCase()}.`);
    }
    if (!(await this.store.setStatus(scope, id, current.status, to))) throw new BookingError("This booking just changed. Reload and try again.");
  }
}
