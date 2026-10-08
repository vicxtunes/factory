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
  type DocumentToBook,
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

  /** The bookings a day and its times (none: all day) would clash with, earliest first, leaving out `exceptId` (the one being changed). */
  async clashesWith(scope: TenantScope, when: Pick<Booking, "date" | "startTime" | "endTime">, exceptId: string | null): Promise<Booking[]> {
    const candidate = { ...when, id: exceptId ?? "", status: "tentative" as const };
    const sameDay = await this.store.list(scope, { from: when.date, to: when.date });
    return sameDay.filter((b) => clashes(candidate, b)).sort(byTime);
  }

  async idForInvoice(scope: TenantScope, invoiceId: string): Promise<string | null> {
    return this.store.idForInvoice(scope, invoiceId);
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

  /**
   * A quotation the customer accepted, with a shoot day: booked tentative
   * (confirmed when its invoice is made). Without a shoot day, or booked
   * already, nothing new. Returns its booking, if any.
   */
  async bookAcceptedQuotation(scope: TenantScope, quotationId: string, doc: DocumentToBook): Promise<string | null> {
    const existing = await this.store.idForQuotation(scope, quotationId);
    if (existing || !doc.shoot) return existing;
    return this.store.create(scope, { ...(await this.fromDocument(scope, doc, doc.shoot)), quotationId });
  }

  /**
   * An invoice saved: its booking kept in step, automatically.
   * - Booked already: moved to the invoice's shoot day and times, at its total (while it can change).
   * - Made from a quotation that was booked: that booking, now the invoice's, confirmed.
   * - Otherwise, with a shoot day: booked, confirmed.
   * Returns its booking, if any.
   */
  async bookInvoice(scope: TenantScope, invoiceId: string, doc: DocumentToBook & { quotationId: string | null }): Promise<string | null> {
    const own = await this.store.idForInvoice(scope, invoiceId);
    const fromQuotation = own ? null : doc.quotationId ? await this.store.idForQuotation(scope, doc.quotationId) : null;
    const id = own ?? fromQuotation;
    if (!id) return doc.shoot ? this.store.create(scope, { ...(await this.fromDocument(scope, doc, doc.shoot)), quotationId: null }, { invoiceId }) : null;

    const current = await this.store.get(scope, id);
    if (!current) throw new BookingError(GONE);
    if (fromQuotation && !(await this.store.setInvoice(scope, id, invoiceId))) throw new BookingError(GONE);
    if (canEditBooking(current.status)) {
      const { customerId, title, date, startTime, endTime, location, packageName, notes } = current;
      await this.store.update(scope, id, { customerId, title, date, startTime, endTime, location, packageName, notes, ...doc.shoot, amount: doc.total });
    }
    if (current.status === "tentative") await this.store.setStatus(scope, id, "tentative", "confirmed");
    return id;
  }

  /** A voided invoice's booking is cancelled (unless it's completed or cancelled already). */
  async cancelForInvoice(scope: TenantScope, invoiceId: string): Promise<void> {
    const id = await this.store.idForInvoice(scope, invoiceId);
    const current = id ? await this.store.get(scope, id) : null;
    if (current && canMoveBooking(current.status, "cancelled")) await this.store.setStatus(scope, current.id, current.status, "cancelled");
  }

  /** A booking's details from a quotation or invoice: its client, "Client: first line", that line as the package, its total. */
  private async fromDocument(scope: TenantScope, doc: DocumentToBook, shoot: NonNullable<DocumentToBook["shoot"]>): Promise<Omit<BookingInput, "quotationId">> {
    const customer = await this.directory.customer(scope, doc.customerId);
    if (!customer) throw new BookingError("That client no longer exists.");
    return {
      customerId: doc.customerId,
      title: (doc.firstLine ? `${customer.name}: ${doc.firstLine}` : customer.name).slice(0, 120),
      ...shoot,
      location: null,
      packageName: doc.firstLine?.slice(0, 200) ?? null,
      amount: doc.total,
      notes: null,
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

  /** The requests clients made online that the business hasn't answered, soonest first. */
  async requests(scope: TenantScope): Promise<Booking[]> {
    return (await this.store.list(scope, { status: "requested" })).sort(byTime);
  }

  /** A client's online request for a package: "requested", for the business to confirm or decline. */
  async request(scope: TenantScope, input: Omit<BookingInput, "quotationId"> & { offeringId: string }): Promise<string> {
    const customer = await this.directory.customer(scope, input.customerId);
    if (!customer) throw new BookingError("That client no longer exists.");
    return this.store.createRequest(scope, input);
  }

  /** Confirms a client's request (requested → confirmed). The caller makes its invoice and project (packages/lib/booking-requests). */
  async confirmRequest(scope: TenantScope, id: string): Promise<Booking> {
    const current = await this.store.get(scope, id);
    if (!current) throw new BookingError(GONE);
    if (current.status !== "requested") throw new BookingError("This request has already been answered.");
    if (!(await this.store.setStatus(scope, id, "requested", "confirmed"))) throw new BookingError("This booking just changed. Reload and try again.");
    return { ...current, status: "confirmed" };
  }

  /** Links the invoice made when a request was confirmed. */
  async setInvoice(scope: TenantScope, id: string, invoiceId: string): Promise<void> {
    if (!(await this.store.setInvoice(scope, id, invoiceId))) throw new BookingError(GONE);
  }

  /** Changes the details while it's requested, tentative or confirmed. */
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
