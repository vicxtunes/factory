import "server-only";

// The booking-request service wired to the app's modules, and the cookie
// that lets a device follow the requests it sent while it isn't signed in
// to the client's page (a returning client on a new device).

import { localDate } from "@repo/lib/accounting/core/period";
import { invoices, quotations } from "@repo/lib/billing/server";
import type { Booking } from "@repo/lib/bookings/core";
import { bookings } from "@repo/lib/bookings/server";
import { customers } from "@repo/lib/customers/server";
import { offerings } from "@repo/lib/offerings/server";
import { projects } from "@repo/lib/projects/server";
import { notifyActor } from "@repo/lib/push/send";
import { rememberedOnDevice } from "@repo/lib/studio-portal/remembered";
import { portal } from "@repo/lib/studio-portal/server";
import { studios } from "@repo/lib/studios/server";
import type { TenantScope } from "@repo/lib/tenancy/types";

import { BookingRequestService } from "./service";

export const bookingRequests = new BookingRequestService({
  service: (scope, slug) => offerings.publicService(scope, slug, "service"),
  package: (scope, id) => offerings.package(scope, id),
  client: async (scope, { name, phone }) => {
    const outcome = await customers.create(scope, { name, phone, email: null, notes: null });
    return "saved" in outcome ? { id: outcome.saved.id, isNew: true } : { id: outcome.duplicateOf.id, isNew: false };
  },
  openRequests: async (scope, customerId) => (await bookings.forCustomer(scope, customerId)).filter((b) => b.status === "requested").length,
  booking: async (scope, id) => (await bookings.get(scope, id))?.booking ?? null,
  createRequest: (scope, input) => bookings.request(scope, input),
  confirm: async (scope, id) => void (await bookings.confirmRequest(scope, id)),
  decline: (scope, id) => bookings.setStatus(scope, id, "cancelled"),
  bookedDays: (scope, from) => bookedDays(scope, from),
  createQuotation: (scope, input) => quotations.create(scope, input),
  linkQuotation: (scope, bookingId, quotationId) => bookings.setQuotation(scope, bookingId, quotationId),
  invoiceFromQuotation: async (scope, quotationId) => {
    await quotations.answer(scope, quotationId, "accepted");
    return invoices.fromQuotation(scope, quotationId);
  },
  declineQuotation: (scope, quotationId) => quotations.answer(scope, quotationId, "declined", "The business couldn't take this booking."),
  createInvoice: (scope, input) => invoices.create(scope, input),
  linkInvoice: (scope, bookingId, invoiceId) => bookings.setInvoice(scope, bookingId, invoiceId),
  startProject: (scope, bookingId, actorName) => projects.startFromBooking(scope, bookingId, { name: actorName }),
  openDevice: (tenantId, customerId) => portal.openDevice(tenantId, customerId),
  notifyOwner: async (scope, { title, body }) => {
    const studio = await studios.get(scope.tenantId);
    if (studio) await notifyActor({ type: "client", id: studio.ownerClientId }, { title, body, url: "/studio/bookings" }).catch(() => {});
  },
  today: (scope) => localDate(new Date(), scope.timeZone),
});

/** How far ahead a client can see which days are taken. */
const BOOKED_DAYS_AHEAD = 365;

/** The days from `from` on (a year ahead) that already have a confirmed booking: all a client sees is the date. */
export async function bookedDays(scope: TenantScope, from: string): Promise<string[]> {
  const to = new Date(Date.parse(`${from}T00:00:00Z`) + BOOKED_DAYS_AHEAD * 86_400_000).toISOString().slice(0, 10);
  const days = (await bookings.between(scope, from, to)).filter((b) => b.status === "confirmed").map((b) => b.date);
  return [...new Set(days)].sort();
}

// --- Requests sent from a device that isn't signed in -------------------------

const remembered = rememberedOnDevice("sbr");

/** Remembers on this device a request it sent, so the studio's page can show how it's going. */
export async function rememberRequest(tenantId: string, bookingId: string): Promise<void> {
  await remembered.add(tenantId, bookingId);
}

/** Whether this device sent this request (so it may pay for it without being signed in). */
export async function isRememberedRequest(tenantId: string, bookingId: string): Promise<boolean> {
  return (await remembered.ids(tenantId)).includes(bookingId);
}

/** The requests this device sent to the studio, newest first, as they stand now. */
export async function rememberedRequests(scope: TenantScope): Promise<Booking[]> {
  const found = await Promise.all((await remembered.ids(scope.tenantId)).map((id) => bookings.get(scope, id)));
  return found.flatMap((view) => (view && view.booking.source === "online" ? [view.booking] : []));
}
