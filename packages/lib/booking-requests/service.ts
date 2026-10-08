// Booking a studio's package online, and the studio answering. This module
// only orchestrates: the work is the other modules' (offerings, customers,
// bookings, billing, projects, studio-portal), reached through the narrow
// BookingRequestDeps so the rules can be tested with fakes
// (./service.test.ts). See ./README.md.

import type { Booking } from "@repo/lib/bookings/core";
import type { InvoiceInput } from "@repo/lib/billing/core";
import { AppError } from "@repo/lib/kernel/core";
import { offeringLabel, type Offering, type ServiceWithPackages } from "@repo/lib/offerings/core";
import type { PortalSession } from "@repo/lib/studio-portal/core";
import type { TenantScope } from "@repo/lib/tenancy/types";

import { MAX_OPEN_REQUESTS, type BookNowInput, type BookNowOutcome } from "./core";

/** A problem the person should see (the message is safe to show). */
export class BookingRequestError extends AppError {}

export interface BookingRequestDeps {
  /** A service on sale by its address, with its packages on sale. */
  service(scope: TenantScope, slug: string): Promise<ServiceWithPackages | null>;
  package(scope: TenantScope, id: string): Promise<Offering | null>;
  /** Adds a client, or finds the one who already has this phone number. */
  client(scope: TenantScope, input: { name: string; phone: string }): Promise<{ id: string; isNew: boolean }>;
  /** The client's requests still waiting for an answer. */
  openRequests(scope: TenantScope, customerId: string): Promise<number>;
  booking(scope: TenantScope, id: string): Promise<Booking | null>;
  createRequest(
    scope: TenantScope,
    input: Omit<Booking, "id" | "customerName" | "status" | "source" | "quotationId" | "offeringId" | "invoiceId" | "createdAt"> & { offeringId: string },
  ): Promise<string>;
  /** requested → confirmed, once. */
  confirm(scope: TenantScope, id: string): Promise<void>;
  decline(scope: TenantScope, id: string): Promise<void>;
  createInvoice(scope: TenantScope, input: InvoiceInput): Promise<string>;
  linkInvoice(scope: TenantScope, bookingId: string, invoiceId: string): Promise<void>;
  /** The booking's project: started now, or the one it already has. */
  startProject(scope: TenantScope, bookingId: string, actorName: string): Promise<string>;
  /** Signs this device in to the client's page, no PIN. */
  openDevice(tenantId: string, customerId: string): Promise<PortalSession>;
  /** Tells the studio's owner (a push notification). Best effort. */
  notifyOwner(scope: TenantScope, message: { title: string; body: string }): Promise<void>;
  today(scope: TenantScope): string;
}

export class BookingRequestService {
  constructor(private readonly deps: BookingRequestDeps) {}

  /**
   * A client books a package from a service's page. Signed in at the studio:
   * as themselves. Otherwise by name and phone: a new client is added and
   * this device is signed in to their page for good (`session`); a number
   * the studio already knows still books, but signs nothing in (anyone could
   * type a client's number): the studio sends that client the link to their
   * page when it confirms.
   */
  async request(
    scope: TenantScope,
    input: BookNowInput,
    signedInAs: string | null,
  ): Promise<BookNowOutcome & { session: PortalSession | null }> {
    const service = await this.deps.service(scope, input.serviceSlug);
    if (!service) throw new BookingRequestError("This service is no longer offered.");
    const pkg = service.packages.find((p) => p.id === input.packageId);
    if (!pkg) throw new BookingRequestError("That package is no longer offered. Choose another.");
    if (input.date < this.deps.today(scope)) throw new BookingRequestError("Choose a day from today on.");

    let customerId = signedInAs;
    let isNew = false;
    if (!customerId) {
      if (!input.name) throw new BookingRequestError("Enter your name.");
      if (!input.phone) throw new BookingRequestError("Enter your phone number.");
      ({ id: customerId, isNew } = await this.deps.client(scope, { name: input.name, phone: input.phone }));
    }
    if ((await this.deps.openRequests(scope, customerId)) >= MAX_OPEN_REQUESTS) {
      throw new BookingRequestError("You already have requests waiting for this business's answer. They'll be in touch soon.");
    }

    const label = offeringLabel(pkg);
    const bookingId = await this.deps.createRequest(scope, {
      customerId,
      title: label,
      date: input.date,
      startTime: input.startTime,
      endTime: input.endTime,
      location: null,
      packageName: label,
      amount: pkg.price,
      notes: null,
      offeringId: pkg.id,
    });
    await this.deps.notifyOwner(scope, { title: "New booking request", body: `${label} on ${input.date}, ${input.startTime}–${input.endTime}` });
    const session = isNew ? await this.deps.openDevice(scope.tenantId, customerId) : null;
    return { bookingId, signedIn: !!signedInAs || !!session, session };
  }

  /**
   * The studio confirms a client's request: the booking is confirmed, the
   * invoice for its package is made (none for a package priced 0: it's priced
   * on request) and its project started. Safe to repeat: a request confirmed
   * before gets whatever it's still missing.
   */
  async confirm(scope: TenantScope, bookingId: string, actorName: string): Promise<{ invoiceId: string | null; projectId: string }> {
    const booking = await this.deps.booking(scope, bookingId);
    if (!booking) throw new BookingRequestError("That booking no longer exists.");
    if (booking.source !== "online") throw new BookingRequestError("Only a client's online request is confirmed here.");
    if (booking.status === "requested") await this.deps.confirm(scope, bookingId);
    else if (booking.status !== "confirmed") throw new BookingRequestError("This request has already been answered.");

    let invoiceId = booking.invoiceId;
    if (!invoiceId && booking.amount) {
      const pkg = booking.offeringId ? await this.deps.package(scope, booking.offeringId) : null;
      invoiceId = await this.deps.createInvoice(scope, {
        customerId: booking.customerId,
        dueDate: booking.date,
        // Already booked: the invoice just says when.
        shoot: { date: booking.date, startTime: booking.startTime, endTime: booking.endTime },
        notes: `Booking for ${booking.date}.`,
        lines: [
          {
            offeringId: booking.offeringId,
            description: booking.packageName ?? booking.title,
            inclusions: pkg?.inclusions ?? [],
            quantity: 1,
            unitPrice: booking.amount,
            discount: null,
          },
        ],
      });
      await this.deps.linkInvoice(scope, bookingId, invoiceId);
    }
    const projectId = await this.deps.startProject(scope, bookingId, actorName);
    return { invoiceId, projectId };
  }

  /** The studio declines a client's request (it's cancelled). */
  async decline(scope: TenantScope, bookingId: string): Promise<void> {
    const booking = await this.deps.booking(scope, bookingId);
    if (!booking) throw new BookingRequestError("That booking no longer exists.");
    if (booking.status !== "requested") throw new BookingRequestError("This request has already been answered.");
    await this.deps.decline(scope, bookingId);
  }
}
